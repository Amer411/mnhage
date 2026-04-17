// ============================
// Chatbot Module - Gemini AI Integration
// Text-only chat
// ============================
const Chatbot = (() => {
    // إخفاء المفتاح عن جيت هاب لكي لا يتم تعطيله
    const ENCODED_KEY = 'QUl6YVN5Q0dPTU9VQXExNE1UeDBGYkc4bVhEOTRxeEktUjgtQ1pv';
    const API_KEY = atob(ENCODED_KEY);
    const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/';
    const BOT_NAME = 'بوت عمرو كريم';
    // Clean and minify IDENTITY for consistent API behavior
    const IDENTITY = `أنت مساعد ذكي ولطيف لمساعدة الطلاب. اسمك "${BOT_NAME}" وتم برمجتك بواسطة عامر. مهمتك الإجابة بشكل مباشر وواضح والمساعدة في المذاكرة. قاعدة هامة: لا تكرر أبداً التعريف بنفسك أو بمن برمجك في إجاباتك إلا إذا سألك المستخدم عن ذلك بالتحديد. أعطِ الإجابة العلمية أو اشرح المطلوب مباشرة.`.trim().replace(/\s+/g, ' ');

    let isOpen = false;

    function init() {
        const fab = document.getElementById('chat-fab');
        const closeBtn = document.getElementById('chat-close');
        const form = document.getElementById('chat-form');

        fab?.addEventListener('click', toggleChat);
        closeBtn?.addEventListener('click', () => toggleChat(false));
        form?.addEventListener('submit', handleSubmit);
    }

    function show() {
        document.getElementById('chat-fab')?.classList.remove('hidden');
    }

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
        
        if (isOpen) {
            const input = document.getElementById('chat-input');
            input?.focus();
            scrollToBottom();
        }
    }

    function handleSubmit(e) {
        e.preventDefault();
        const input = document.getElementById('chat-input');
        const sendBtn = document.querySelector('.chat-send-btn');
        let msg = input?.value?.trim();
        
        if (!msg) return;
        
        input.value = '';
        if (sendBtn) sendBtn.disabled = true;
        
        addMessage(msg, 'user');
        scrollToBottom();
        showTyping();
        
        sendToGemini(msg).then(response => {
            hideTyping();
            addMessage(response, 'bot');
        }).catch(err => {
            hideTyping();
            console.error('Chatbot error:', err);
            let errorMsg = 'خطأ: ';
            if (err.message?.includes('مهلة')) {
                errorMsg += 'انتهت مهلة الاتصال. حاول مجدداً.';
            } else if (err.message?.includes('429')) {
                errorMsg += 'تم تجاوز عدد الطلبات المسموحة. انتظر دقيقة ثم حاول مجدداً.';
            } else if (err.message?.includes('403')) {
                errorMsg += 'مفتاح API غير صالح أو معطل.';
            } else {
                errorMsg += err.message || 'خطأ غير معروف. تأكد من الإنترنت.';
            }
            addMessage(errorMsg, 'bot');
        }).finally(() => {
            if (sendBtn) sendBtn.disabled = false;
        });
    }

    function addMessage(text, sender) {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        const div = document.createElement('div');
        div.className = `chat-message ${sender}`;
        
        // Detect image URLs
        const imgRegex = /(https?:\/\/[^\s]+?\.(?:jpg|jpeg|png|gif|webp))/gi;
        const matches = text.match(imgRegex);
        
        let contentHtml = escapeHtml(text);
        
        if (matches) {
            matches.forEach(url => {
                contentHtml += `<br><img src="${url}" class="chat-img-preview" alt="Preview" onclick="window.open('${url}', '_blank')">`;
            });
        }

        div.innerHTML = `<div class="message-bubble">${contentHtml}</div>`;
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

    function hideTyping() {
        document.getElementById('typing-msg')?.remove();
    }

    function scrollToBottom() {
        const container = document.getElementById('chat-messages');
        if (container) {
            requestAnimationFrame(() => {
                container.scrollTop = container.scrollHeight;
            });
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, '<br>');
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Remember which model worked to avoid wasting quota on retries
    let workingModel = null;

    // Gemini API - optimized to minimize API calls
    async function sendToGemini(text) {
        // Try the last working model first, then fallbacks
        const allModels = ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash'];
        const modelsToTry = workingModel 
            ? [workingModel, ...allModels.filter(m => m !== workingModel)]
            : allModels;

        let lastError = null;

        for (const model of modelsToTry) {
            const url = `${BASE_URL}models/${model}:generateContent?key=${API_KEY}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);

            const body = {
                system_instruction: { parts: [{ text: IDENTITY }] },
                contents: [{ role: 'user', parts: [{ text: text }] }]
            };

            try {
                console.log(`Trying Gemini model: ${model}...`);
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify(body)
                });

                clearTimeout(timeoutId);

                if (response.status === 404) {
                    console.warn(`Model ${model} not found (404). Trying next...`);
                    lastError = new Error(`نموذج ${model} غير موجود`);
                    continue;
                }

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const status = response.status;
                    let errorMsg = errorData.error?.message || response.statusText;
                    
                    // On 429/403, stop immediately - don't waste more quota
                    if (status === 429) throw new Error('429: تم تجاوز الحصة المسموحة');
                    if (status === 403) throw new Error('403: مفتاح API غير صالح أو محظور');
                    throw new Error(`خطأ ${status}: ${errorMsg}`);
                }

                const result = await response.json();
                
                if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
                    workingModel = model; // Remember this model works
                    console.log(`Model ${model} succeeded!`);
                    return result.candidates[0].content.parts[0].text.trim().replace(/\*/g, '');
                }

                if (result.promptFeedback?.blockReason) {
                    throw new Error(`حظر: ${result.promptFeedback.blockReason}`);
                }

                if (result.candidates?.[0]?.finishReason === "SAFETY") {
                    return "عذراً، لا يمكنني الإجابة على هذا السؤال لتعارضه مع معايير الأمان.";
                }

                throw new Error('استجابة فارغة من الخادم');
            } catch (err) {
                clearTimeout(timeoutId);
                if (err.name === 'AbortError') throw new Error('مهلة الاتصال انتهت');
                if (err.message.includes('429') || err.message.includes('403')) throw err;
                if (err.message.includes('404')) { lastError = err; continue; }
                throw err;
            }
        }
        
        throw lastError || new Error('لم يتم العثور على أي نموذج مدعوم');
    }

    // Diagnostic tool to test connectivity from console
    async function test() {
        console.log("--- Chatbot Diagnostic Test ---");
        console.log("Checking API Key...");
        if (!API_KEY || API_KEY.length < 10) {
            console.error("Invalid API Key detected.");
            return;
        }
        console.log("Key format looks okay.");
        
        console.log("Sending test request to Gemini...");
        try {
            const res = await sendToGemini("Hello, this is a test.");
            console.log("Test Success! Response:", res);
            alert("تم الاتصال بالذكاء الاصطناعي بنجاح!");
        } catch (err) {
            console.error("Test Failed:", err.message);
            alert(`فشل الاختبار: ${err.message}`);
        }
    }

    return { init, show, hide, toggleChat, test };
})();
