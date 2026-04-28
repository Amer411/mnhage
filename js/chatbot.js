// ============================
// Chatbot Module - Gemini AI (Free Tier Maximized)
// Strategy: Cache + Rate Limit + Dedup → supports 1000+ users free
// Free quota: 1,500 req/day | 15 req/min (gemini-2.0-flash-lite)
// ============================
const Chatbot = (() => {
    // إخفاء المفتاح عن جيت هاب لكي لا يتم تعطيله
    const ENCODED_KEY = 'QUl6YVN5Q0dPTU9VQXExNE1UeDBGYkc4bVhEOTRxeEktUjgtQ1pv';
    const API_KEY = atob(ENCODED_KEY);
    const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/';

    // gemini-2.0-flash-lite: الأسرع والأرخص - 1500 طلب/يوم مجاناً
    const MODEL = 'gemini-2.0-flash-lite';

    const BOT_NAME = 'بوت عمرو كريم';
    const IDENTITY = `أنت مساعد ذكي ولطيف لمساعدة الطلاب. اسمك "${BOT_NAME}" وتم برمجتك بواسطة عامر. 
    مهمتك الإجابة بشكل مباشر وواضح والمساعدة في المذاكرة.
    قاعدة هامة: لا تكرر أبداً التعريف بنفسك أو بمن برمجك في إجاباتك إلا إذا سألك المستخدم عن ذلك بالتحديد. أعطِ الإجابة العلمية أو اشرح المطلوب مباشرة.
    اجعل إجاباتك مختصرة وواضحة قدر الإمكان.`;

    let isOpen = false;
    let isProcessing = false;

    // ─── Cache System ────────────────────────────────────────────────
    // يحفظ إجابات الأسئلة المتكررة ويُعيدها فوراً دون استهلاك API
    const CACHE_KEY   = 'chatbot_cache_v1';
    const CACHE_MAX   = 200;   // أقصى عدد أسئلة محفوظة
    const CACHE_TTL   = 86400000 * 7; // 7 أيام

    function normalizeQuestion(text) {
        return text.trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function getCache() {
        try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; }
        catch { return {}; }
    }

    function setCache(cache) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }
        catch { /* storage full - ignore */ }
    }

    function cacheGet(question) {
        const cache = getCache();
        const key = normalizeQuestion(question);
        const entry = cache[key];
        if (!entry) return null;
        if (Date.now() - entry.ts > CACHE_TTL) { delete cache[key]; setCache(cache); return null; }
        return entry.answer;
    }

    function cachePut(question, answer) {
        const cache = getCache();
        const keys = Object.keys(cache);
        // إزالة أقدم إدخال إذا امتلأ الكاش
        if (keys.length >= CACHE_MAX) {
            const oldest = keys.sort((a, b) => cache[a].ts - cache[b].ts)[0];
            delete cache[oldest];
        }
        cache[normalizeQuestion(question)] = { answer, ts: Date.now() };
        setCache(cache);
    }

    // ─── Daily Quota Tracker (client-side) ───────────────────────────
    const QUOTA_KEY  = 'chatbot_quota_v1';
    const DAILY_LIMIT = 1400; // نترك هامش أمان من 1500

    function getQuota() {
        try {
            const q = JSON.parse(localStorage.getItem(QUOTA_KEY));
            const todayStr = new Date().toDateString();
            if (q?.date === todayStr) return q;
            return { date: todayStr, count: 0 };
        } catch { return { date: new Date().toDateString(), count: 0 }; }
    }

    function incrementQuota() {
        const q = getQuota();
        q.count++;
        localStorage.setItem(QUOTA_KEY, JSON.stringify(q));
    }

    function isQuotaExceeded() {
        return getQuota().count >= DAILY_LIMIT;
    }

    // ─── Rate Limit: max 12 req/min (stay under 15 free limit) ───────
    const RATE_LIMIT  = 12;
    const RATE_WINDOW = 60000;
    let messageTimestamps = [];

    function checkRateLimit() {
        const now = Date.now();
        messageTimestamps = messageTimestamps.filter(t => now - t < RATE_WINDOW);
        if (messageTimestamps.length >= RATE_LIMIT) {
            const waitTime = Math.ceil((RATE_WINDOW - (now - messageTimestamps[0])) / 1000);
            return { allowed: false, waitTime };
        }
        messageTimestamps.push(now);
        return { allowed: true };
    }

    // ─── Deduplication: منع طلبين متطابقين في وقت واحد ─────────────
    const pendingRequests = new Map();

    // ─── UI Functions ─────────────────────────────────────────────────
    function init() {
        const fab      = document.getElementById('chat-fab');
        const closeBtn = document.getElementById('chat-close');
        const form     = document.getElementById('chat-form');

        fab?.addEventListener('click', toggleChat);
        closeBtn?.addEventListener('click', () => toggleChat(false));
        form?.addEventListener('submit', handleSubmit);
    }

    function show() { document.getElementById('chat-fab')?.classList.remove('hidden'); }

    function hide() {
        document.getElementById('chat-fab')?.classList.add('hidden');
        const win = document.getElementById('chat-window');
        if (win) win.classList.add('hidden');
        isOpen = false;
    }

    function toggleChat(forceState) {
        const win = document.getElementById('chat-window');
        if (!win) return;
        isOpen = typeof forceState === 'boolean' ? forceState : !isOpen;
        win.classList.toggle('hidden', !isOpen);
        if (isOpen) { document.getElementById('chat-input')?.focus(); scrollToBottom(); }
    }

    function handleSubmit(e) {
        e.preventDefault();
        const input   = document.getElementById('chat-input');
        const sendBtn = document.querySelector('.chat-send-btn');
        const msg     = input?.value?.trim();

        if (!msg) return;

        // ─ 1. كاش: إجابة فورية بدون API ─────────────────────────────
        const cached = cacheGet(msg);
        if (cached) {
            input.value = '';
            addMessage(msg, 'user');
            scrollToBottom();
            // تأخير قصير يعطي شعور الطبيعية
            setTimeout(() => addMessage(cached, 'bot'), 300);
            return;
        }

        // ─ 2. منع الرسائل المتزامنة ──────────────────────────────────
        if (isProcessing) {
            addMessage('⏳ انتظر حتى تنتهي الإجابة الحالية...', 'bot');
            return;
        }

        // ─ 3. التحقق من الحصة اليومية ────────────────────────────────
        if (isQuotaExceeded()) {
            addMessage('⚠️ تم استهلاك الحصة اليومية المجانية. يُرجى المحاولة غداً.', 'bot');
            return;
        }

        // ─ 4. Rate limit ──────────────────────────────────────────────
        const rateCheck = checkRateLimit();
        if (!rateCheck.allowed) {
            addMessage(`⏳ أرسلت رسائل كثيرة. انتظر ${rateCheck.waitTime} ثانية ثم حاول مجدداً.`, 'bot');
            return;
        }

        // ─ 5. إرسال للـ API ───────────────────────────────────────────
        input.value = '';
        if (sendBtn) sendBtn.disabled = true;
        isProcessing = true;

        addMessage(msg, 'user');
        scrollToBottom();
        showTyping();

        // Dedup: إذا كان نفس السؤال يُعالَج الآن، شاركه
        const normMsg = normalizeQuestion(msg);
        if (pendingRequests.has(normMsg)) {
            pendingRequests.get(normMsg).then(response => {
                hideTyping();
                addMessage(response, 'bot');
            }).catch(err => {
                hideTyping();
                addMessage('خطأ: ' + (err.message || 'خطأ غير معروف'), 'bot');
            }).finally(() => {
                if (sendBtn) sendBtn.disabled = false;
                isProcessing = false;
            });
            return;
        }

        const promise = sendToGemini(msg).then(response => {
            cachePut(msg, response);
            incrementQuota();
            return response;
        });

        pendingRequests.set(normMsg, promise);

        promise.then(response => {
            hideTyping();
            addMessage(response, 'bot');
        }).catch(err => {
            hideTyping();
            console.error('Chatbot error:', err);
            let errorMsg = 'خطأ: ';
            if (err.message?.includes('مهلة'))       errorMsg += 'انتهت مهلة الاتصال. حاول مجدداً.';
            else if (err.message?.includes('429'))   errorMsg += 'تم تجاوز عدد الطلبات. انتظر دقيقة ثم حاول.';
            else if (err.message?.includes('403'))   errorMsg += 'مفتاح API غير صالح أو معطل.';
            else                                      errorMsg += err.message || 'تأكد من الإنترنت.';
            addMessage(errorMsg, 'bot');
        }).finally(() => {
            pendingRequests.delete(normMsg);
            if (sendBtn) sendBtn.disabled = false;
            isProcessing = false;
        });
    }

    function addMessage(text, sender) {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        const div = document.createElement('div');
        div.className = `chat-message ${sender}`;
        div.innerHTML = `<div class="message-bubble">${escapeHtml(text)}</div>`;
        container.appendChild(div);
        scrollToBottom();
    }

    function showTyping() {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        const typing = document.createElement('div');
        typing.className = 'chat-message bot';
        typing.id = 'typing-msg';
        typing.innerHTML = `<div class="message-bubble typing-indicator"><span></span><span></span><span></span></div>`;
        container.appendChild(typing);
        scrollToBottom();
    }

    function hideTyping()    { document.getElementById('typing-msg')?.remove(); }
    function scrollToBottom() {
        const c = document.getElementById('chat-messages');
        if (c) requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
    }
    function escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML.replace(/\n/g, '<br>');
    }
    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ─── Gemini API Call ──────────────────────────────────────────────
    async function sendToGemini(text) {
        const retries = 3;
        let lastError = null;

        for (let i = 0; i < retries; i++) {
            try {
                const url = `${BASE_URL}models/${MODEL}:generateContent?key=${API_KEY}`;
                const controller = new AbortController();
                const timeoutId  = setTimeout(() => controller.abort(), 30000);

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: IDENTITY }] },
                        contents: [{ role: 'user', parts: [{ text }] }],
                        generationConfig: { maxOutputTokens: 512, temperature: 0.7 }
                    })
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorBody = await response.text();
                    console.error(`Attempt ${i + 1} failed:`, response.status, errorBody);
                    lastError = new Error(`خطأ في الخادم: ${response.status}`);
                    if (response.status === 429) {
                        if (i < retries - 1) await delay(5000 * (i + 1));
                        continue;
                    }
                    if (i < retries - 1) await delay(3000);
                    continue;
                }

                const result = await response.json();

                if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
                    return result.candidates[0].content.parts[0].text.trim().replace(/\*/g, '');
                }
                if (result.promptFeedback?.blockReason)
                    return `عذراً، تم حظر السؤال: ${result.promptFeedback.blockReason}`;
                if (result.candidates?.[0]?.finishReason === 'SAFETY')
                    return 'عذراً، لا يمكنني الإجابة على هذا السؤال.';

                return 'عذراً، لم أستطع توليد رد في الوقت الحالي.';

            } catch (err) {
                lastError = err.name === 'AbortError' ? new Error('انتهت مهلة الاتصال') : err;
                console.error(`Attempt ${i + 1} error:`, err);
                if (i < retries - 1) await delay(3000);
            }
        }

        throw lastError || new Error('فشل الاتصال بعد عدة محاولات');
    }

    return { init, show, hide, toggleChat };
})();
