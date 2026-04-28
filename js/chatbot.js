// ============================
// Chatbot Module - Gemini AI | Multi-Key Rotation
// 3 keys × 1,500 req/day = 4,500 req/day FREE
// 3 keys × 15 req/min  = 45  req/min  FREE
// Strategy: Round-robin + 429 fallback + Cache + Dedup
// ============================
const Chatbot = (() => {
    // ─── 3 مفاتيح Gemini ───────────────────────────────────────────
    const API_KEYS = [
        'AIzaSyCGOMOUAq14MTx0FbG8mXD94qxI-R8-CZo',   // Key 1 (القديم)
        'AIzaSyBsWPKdqJwCDO3wUumO42SkDYQ9zPwxAEk',   // Key 2 (جديد)
        'AIzaSyCr0d9cYccAvwNtgJIQ3UkbFSO-CuuGJL0'    // Key 3 (جديد)
    ];
    const BASE_URL  = 'https://generativelanguage.googleapis.com/v1beta/';
    const MODEL     = 'gemini-2.0-flash-lite'; // الأسرع + الأرخص + مجاني

    const BOT_NAME = 'بوت عمرو كريم';
    const IDENTITY = `أنت مساعد ذكي ولطيف لمساعدة الطلاب. اسمك "${BOT_NAME}" وتم برمجتك بواسطة عامر. 
    مهمتك الإجابة بشكل مباشر وواضح والمساعدة في المذاكرة.
    قاعدة هامة: لا تكرر أبداً التعريف بنفسك أو بمن برمجك في إجاباتك إلا إذا سألك المستخدم عن ذلك بالتحديد.
    اجعل إجاباتك مختصرة وواضحة قدر الإمكان.`;

    let isOpen      = false;
    let isProcessing = false;

    // ─── Key Rotation System ──────────────────────────────────────────
    // يتناوب على المفاتيح الثلاثة - إذا كُسر أحدهم ينتقل للتالي فوراً
    const KEY_QUOTA_KEY = 'chatbot_key_quota_v2'; // v2 لمسح البيانات القديمة المحجوبة
    const DAILY_LIMIT   = 1400; // هامش أمان من 1500

    function getKeyQuotas() {
        try {
            const stored = JSON.parse(localStorage.getItem(KEY_QUOTA_KEY));
            const todayStr = new Date().toDateString();
            if (stored?.date === todayStr) return stored;
            // يوم جديد - إعادة التعيين
            return { date: todayStr, counts: [0, 0, 0], blocked: [false, false, false] };
        } catch {
            return { date: new Date().toDateString(), counts: [0, 0, 0], blocked: [false, false, false] };
        }
    }

    function saveKeyQuotas(q) {
        try { localStorage.setItem(KEY_QUOTA_KEY, JSON.stringify(q)); } catch {}
    }

    // الحالة الدائرية للمفتاح الحالي
    let currentKeyIndex = 0;

    function getNextAvailableKey() {
        const q = getKeyQuotas();
        // ابحث عن مفتاح غير محجوب وغير مستنفد (يبدأ من currentKeyIndex)
        for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
            const idx = (currentKeyIndex + attempt) % API_KEYS.length;
            if (!q.blocked[idx] && q.counts[idx] < DAILY_LIMIT) {
                currentKeyIndex = idx;
                return { key: API_KEYS[idx], index: idx };
            }
        }
        return null; // جميع المفاتيح مستنفدة
    }

    function markKeyUsed(index) {
        const q = getKeyQuotas();
        q.counts[index]++;
        saveKeyQuotas(q);
        // التحضير للمفتاح التالي (round-robin)
        currentKeyIndex = (index + 1) % API_KEYS.length;
    }

    function markKeyBlocked(index) {
        const q = getKeyQuotas();
        q.blocked[index] = true;
        saveKeyQuotas(q);
        currentKeyIndex = (index + 1) % API_KEYS.length;
    }

    // ─── Response Cache (7 أيام) ──────────────────────────────────────
    const CACHE_KEY = 'chatbot_cache_v1';
    const CACHE_MAX = 200;
    const CACHE_TTL = 86400000 * 7;

    function normalizeQuestion(text) {
        return text.trim().toLowerCase().replace(/\s+/g, ' ');
    }
    function getCache() {
        try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
    }
    function setCache(cache) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
    }
    function cacheGet(question) {
        const cache = getCache();
        const key   = normalizeQuestion(question);
        const entry = cache[key];
        if (!entry) return null;
        if (Date.now() - entry.ts > CACHE_TTL) { delete cache[key]; setCache(cache); return null; }
        return entry.answer;
    }
    function cachePut(question, answer) {
        const cache = getCache();
        const keys  = Object.keys(cache);
        if (keys.length >= CACHE_MAX) {
            const oldest = keys.sort((a, b) => cache[a].ts - cache[b].ts)[0];
            delete cache[oldest];
        }
        cache[normalizeQuestion(question)] = { answer, ts: Date.now() };
        setCache(cache);
    }

    // ─── Per-minute Rate Limit (عام لجميع المفاتيح) ──────────────────
    const RATE_LIMIT  = 40; // أقل من 45 كهامش أمان
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

    // ─── Deduplication ───────────────────────────────────────────────
    const pendingRequests = new Map();

    // ─── UI ──────────────────────────────────────────────────────────
    function init() {
        document.getElementById('chat-fab')?.addEventListener('click', toggleChat);
        document.getElementById('chat-close')?.addEventListener('click', () => toggleChat(false));
        document.getElementById('chat-form')?.addEventListener('submit', handleSubmit);
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

        // ─ 1. كاش: إجابة فورية ───────────────────────────────────────
        const cached = cacheGet(msg);
        if (cached) {
            input.value = '';
            addMessage(msg, 'user');
            scrollToBottom();
            setTimeout(() => addMessage(cached, 'bot'), 300);
            return;
        }

        // ─ 2. منع التزامن ────────────────────────────────────────────
        if (isProcessing) { addMessage('⏳ انتظر حتى تنتهي الإجابة الحالية...', 'bot'); return; }

        // ─ 3. Rate limit ──────────────────────────────────────────────
        const rateCheck = checkRateLimit();
        if (!rateCheck.allowed) {
            addMessage(`⏳ أرسلت رسائل كثيرة. انتظر ${rateCheck.waitTime} ثانية.`, 'bot');
            return;
        }

        // ─ 4. تحقق من توفر مفتاح ────────────────────────────────────
        if (!getNextAvailableKey()) {
            addMessage('⚠️ تم استهلاك الحصة اليومية لجميع المفاتيح. حاول غداً.', 'bot');
            return;
        }

        // ─ 5. إرسال ──────────────────────────────────────────────────
        input.value = '';
        if (sendBtn) sendBtn.disabled = true;
        isProcessing = true;
        addMessage(msg, 'user');
        scrollToBottom();
        showTyping();

        const normMsg = normalizeQuestion(msg);
        if (pendingRequests.has(normMsg)) {
            pendingRequests.get(normMsg).then(r => { hideTyping(); addMessage(r, 'bot'); })
                .catch(err => { hideTyping(); addMessage('خطأ: ' + (err.message || 'خطأ غير معروف'), 'bot'); })
                .finally(() => { if (sendBtn) sendBtn.disabled = false; isProcessing = false; });
            return;
        }

        const promise = sendToGemini(msg);
        pendingRequests.set(normMsg, promise);

        promise.then(response => {
            cachePut(msg, response);
            hideTyping();
            addMessage(response, 'bot');
        }).catch(err => {
            hideTyping();
            let errorMsg = 'خطأ: ';
            if (err.message?.includes('مهلة'))     errorMsg += 'انتهت مهلة الاتصال. حاول مجدداً.';
            else if (err.message?.includes('429')) errorMsg += 'الحصة المجانية نفدت مؤقتاً. حاول بعد دقيقة.';
            else if (err.message?.includes('403')) errorMsg += 'مشكلة في المفاتيح. راجع الإعدادات.';
            else                                    errorMsg += err.message || 'تأكد من الإنترنت.';
            addMessage(errorMsg, 'bot');
        }).finally(() => {
            pendingRequests.delete(normMsg);
            if (sendBtn) sendBtn.disabled = false;
            isProcessing = false;
        });
    }

    // ─── Gemini API مع تدوير المفاتيح تلقائياً ────────────────────────
    async function sendToGemini(text) {
        const maxAttempts = API_KEYS.length * 2; // حاول كل مفتاح مرتين
        let lastError     = null;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const keyInfo = getNextAvailableKey();
            if (!keyInfo) throw new Error('جميع المفاتيح مستنفدة اليوم');

            const { key, index } = keyInfo;

            try {
                const url        = `${BASE_URL}models/${MODEL}:generateContent?key=${key}`;
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
                    const errBody = await response.text();
                    console.warn(`Key[${index}] attempt ${attempt + 1} failed: ${response.status}`);

                    if (response.status === 429) {
                        // هذا المفتاح وصل لحده - جرب التالي فوراً
                        markKeyBlocked(index);
                        lastError = new Error('429');
                        await delay(1000);
                        continue;
                    }
                    if (response.status === 403) {
                        markKeyBlocked(index);
                        lastError = new Error('403');
                        continue;
                    }
                    lastError = new Error(`خطأ في الخادم: ${response.status}`);
                    await delay(2000);
                    continue;
                }

                // ─ نجاح ─
                markKeyUsed(index);
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
                if (err.name === 'AbortError') {
                    lastError = new Error('انتهت مهلة الاتصال');
                } else {
                    lastError = err;
                }
                console.error(`Key[${index}] error:`, err.message);
                await delay(2000);
            }
        }

        throw lastError || new Error('فشل الاتصال بعد عدة محاولات');
    }

    // ─── Helpers ─────────────────────────────────────────────────────
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

    return { init, show, hide, toggleChat };
})();
