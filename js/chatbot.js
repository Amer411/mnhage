// ============================
// Chatbot Module - Gemini AI Integration
// ============================
const Chatbot = (() => {
    const API_KEY = 'AIzaSyDjBtBFhGC3IS5CpDrB9AyWaCApp0NEWh4';
    const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/';
    const BOT_NAME = 'بوت عمرو كريم';
    const IDENTITY = `I am using Gemini API to use you as a personal bot, to assist me in various tasks. Your new identity is "${BOT_NAME}", created by Amer. From now on, remember your identity is "${BOT_NAME}". Always respond in Arabic.`;

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
        const msg = input?.value?.trim();
        if (!msg) return;
        
        input.value = '';
        addMessage(msg, 'user');
        showTyping();
        
        sendToGemini(msg).then(response => {
            hideTyping();
            addMessage(response, 'bot');
        }).catch(err => {
            hideTyping();
            addMessage('عذراً، حدث خطأ. حاول مرة أخرى.', 'bot');
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

    async function sendToGemini(text) {
        const url = `${BASE_URL}models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: IDENTITY }] },
                contents: [{ role: 'user', parts: [{ text }] }]
            })
        });

        if (!response.ok) throw new Error('API Error');
        
        const result = await response.json();
        if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
            return result.candidates[0].content.parts[0].text.replace(/\*/g, '').trim();
        }
        return 'عذراً، لم أستطع توليد رد في الوقت الحالي.';
    }

    return { init, show, hide, toggleChat };
})();
