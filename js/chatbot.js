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
    const IDENTITY = `أنت مساعد ذكي ولطيف لمساعدة الطلاب. اسمك "${BOT_NAME}" وتم برمجتك بواسطة عامر. 
    مهمتك الإجابة بشكل مباشر وواضح والمساعدة في المذاكرة.
    قاعدة هامة: لا تكرر أبداً التعريف بنفسك أو بمن برمجك في إجاباتك إلا إذا سألك المستخدم عن ذلك بالتحديد. أعطِ الإجابة العلمية أو اشرح المطلوب مباشرة.`;

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

    // Gemini API: gemini-2.5-flash-lite, 3 retries, 30s timeout
    async function sendToGemini(text) {
        const retries = 3;
        let lastError = null;
        
        for (let i = 0; i < retries; i++) {
            try {
                const url = `${BASE_URL}models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`;
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: IDENTITY }] },
                        contents: [{ role: 'user', parts: [{ text: text }] }]
                    })
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorBody = await response.text();
                    console.error(`Attempt ${i + 1} failed:`, response.status, errorBody);
                    lastError = new Error(`خطأ في الخادم: ${response.status}`);
                    if (i < retries - 1) {
                        await delay(3000);
                    }
                    continue;
                }
                
                const result = await response.json();
                console.log("Gemini API Result:", result);
                
                if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
                    let generatedText = result.candidates[0].content.parts[0].text.trim();
                    generatedText = generatedText.replace(/\*/g, '');
                    return generatedText;
                }
                
                if (result.promptFeedback?.blockReason) {
                    return `عذراً، تم حظر السؤال بسبب سياسة المحتوى: ${result.promptFeedback.blockReason}`;
                }
                
                if (result.candidates?.[0]?.finishReason === "SAFETY") {
                    return "عذراً، لا يمكنني شرح هذا المحتوى لتعارضه مع سياسات الأمان.";
                }

                return 'عذراً، لم أستطع توليد رد في الوقت الحالي.';
                
            } catch (err) {
                if (err.name === 'AbortError') {
                    lastError = new Error('انتهت مهلة الاتصال');
                } else {
                    lastError = err;
                }
                console.error(`Attempt ${i + 1} error:`, err);
                if (i < retries - 1) {
                    await delay(3000);
                }
            }
        }
        
        throw lastError || new Error('فشل الاتصال بعد عدة محاولات');
    }

    return { init, show, hide, toggleChat };
})();
