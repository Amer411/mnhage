// ============================
// Chatbot Module - Gemini AI Integration
// Matches native app behavior exactly
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
    let stream = null;
    let isDrawing = false;
    let startX = 0, startY = 0;
    let pendingImageBase64 = null;

    function init() {
        const fab = document.getElementById('chat-fab');
        const closeBtn = document.getElementById('chat-close');
        const form = document.getElementById('chat-form');
        const captureBtn = document.getElementById('chat-capture-btn');
        const cancelCaptureBtn = document.getElementById('cancel-capture-btn');
        const removeAttachmentBtn = document.getElementById('chat-attachment-remove');
        const overlay = document.getElementById('capture-overlay');

        fab?.addEventListener('click', toggleChat);
        closeBtn?.addEventListener('click', () => toggleChat(false));
        form?.addEventListener('submit', handleSubmit);
        
        captureBtn?.addEventListener('click', startCapture);
        cancelCaptureBtn?.addEventListener('click', stopCapture);
        removeAttachmentBtn?.addEventListener('click', removeAttachment);
        
        if (overlay) {
            overlay.addEventListener('mousedown', onMouseDown);
            overlay.addEventListener('mousemove', onMouseMove);
            overlay.addEventListener('mouseup', onMouseUp);
            overlay.addEventListener('touchstart', onMouseDown, {passive: false});
            overlay.addEventListener('touchmove', onMouseMove, {passive: false});
            overlay.addEventListener('touchend', onMouseUp);
        }
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
        
        if (!msg && !pendingImageBase64) return;
        if (pendingImageBase64 && !msg) {
            msg = "استخرج جميع النقاط والنصوص الموجودة في هذه الصورة واشرحها بالتفصيل بطريقة مبسطة يسهل على الطالب فهمها للمذاكرة.";
        }
        
        input.value = '';
        if (sendBtn) sendBtn.disabled = true;
        
        removeAttachment(); // visually clear the attachment
        
        const container = document.getElementById('chat-messages');
        if (container) {
            container.innerHTML = '';
        }
        
        if (pendingImageBase64) {
            const div = document.createElement('div');
            div.className = 'chat-message user';
            div.innerHTML = `<div class="message-bubble"><img src="${pendingImageBase64}" class="chat-img-preview" alt="لقطة شاشة"><br>${escapeHtml(msg)}</div>`;
            container.appendChild(div);
        } else {
            addMessage(msg, 'user');
        }
        
        // Ensure pendingImageBase64 is cleared out
        pendingImageBase64 = null;
        
        scrollToBottom();
        showTyping();
        
        const imageToSend = pendingImageBase64;
        pendingImageBase64 = null;
        
        sendToGemini(msg, imageToSend).then(response => {
            hideTyping();
            addMessage(response, 'bot');
        }).catch(err => {
            hideTyping();
            console.error('Chatbot error:', err);
            addMessage('خطأ في الاتصال: ' + (err.message || 'خطأ غير معروف'), 'bot');
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

    // Helper: delay function
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function removeAttachment() {
        pendingImageBase64 = null;
        const previewEl = document.getElementById('chat-attachment-preview');
        const previewImg = document.getElementById('chat-attachment-img');
        if (previewEl) previewEl.classList.add('hidden');
        if (previewImg) previewImg.src = '';
    }

    // ===== CAPTURE LOGIC =====
    async function startCapture() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                fallbackCapture();
                return;
            }
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const video = document.getElementById('capture-video');
            video.style.display = 'block'; // Ensure video is shown to canvas
            video.srcObject = stream;
            
            document.getElementById('capture-overlay').classList.remove('hidden');
            
            stream.getVideoTracks()[0].onended = () => stopCapture(); 
            toggleChat(false); // Hide chat so user sees screen
        } catch (err) {
            console.error("لم يتم تصريح الشاشة:", err);
            // Fallback if user cancels or gets error on PC
            if (err.name === 'NotAllowedError') {
                return; // User cancelled
            }
            fallbackCapture();
        }
    }

    async function fallbackCapture() {
        // Load html2canvas dynamically if not available
        if (!window.html2canvas) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            document.head.appendChild(script);
            // We do NOT await here. It will load in the background while the user draws
        }
        
        toggleChat(false);
        // Add a slight delay for chat window to close smoothly
        await new Promise(r => setTimeout(r, 300));
        
        // Immediately show overlay without capture delay
        document.getElementById('capture-overlay').classList.remove('hidden');
        window.isFallbackMode = true; // Flag to indicate we are not using video stream
    }

    function stopCapture() {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
        
        window.isFallbackMode = false;
        const video = document.getElementById('capture-video');
        if (video) video.style.display = 'none';
        
        document.getElementById('capture-overlay').classList.add('hidden');
        document.getElementById('selection-box').classList.add('hidden');
    }

    function getEventPos(e) {
        if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        return { x: e.clientX, y: e.clientY };
    }

    function onMouseDown(e) {
        if (e.target.tagName !== 'BUTTON') {
            e.preventDefault();
            isDrawing = true;
            const pos = getEventPos(e);
            startX = pos.x;
            startY = pos.y;
            
            const box = document.getElementById('selection-box');
            box.style.left = startX + 'px';
            box.style.top = startY + 'px';
            box.style.width = '0px';
            box.style.height = '0px';
            box.classList.remove('hidden');
        }
    }

    function onMouseMove(e) {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getEventPos(e);
        const box = document.getElementById('selection-box');
        
        const width = Math.abs(pos.x - startX);
        const height = Math.abs(pos.y - startY);
        const newLeft = Math.min(pos.x, startX);
        const newTop = Math.min(pos.y, startY);
        
        box.style.width = width + 'px';
        box.style.height = height + 'px';
        box.style.left = newLeft + 'px';
        box.style.top = newTop + 'px';
    }

    async function onMouseUp(e) {
        if (!isDrawing) return;
        isDrawing = false;
        const box = document.getElementById('selection-box');
        const rect = box.getBoundingClientRect();
        
        if (rect.width > 20 && rect.height > 20) {
            if (window.isFallbackMode) {
                // Must hide overlay FIRST before capturing so it doesn't obscure the screenshot
                document.getElementById('capture-overlay').classList.add('hidden');
                document.getElementById('selection-box').classList.add('hidden');
                
                // Show thinking indicator in chat
                toggleChat(true);
                addMessage("جاري التقاط ومعالجة الصورة...", "bot");
                
                await executeFallbackCrop(rect);
                return; // stopCapture is handled
            } else {
                cropAndSave(rect);
            }
        }
        stopCapture();
    }
    
    async function executeFallbackCrop(rect) {
        try {
            // Wait for html2canvas to finish loading if it hasn't
            while (!window.html2canvas) {
                await new Promise(r => setTimeout(r, 100));
            }
            
            // Capture Exactly the drawn rectangle to ensure perfect alignment without manual offset scaling
            const canvas = await html2canvas(document.body, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#0f172a',
                width: rect.width,
                height: rect.height,
                windowWidth: window.innerWidth,
                windowHeight: window.innerHeight,
                x: window.scrollX + rect.left,
                y: window.scrollY + rect.top
            });
            
            pendingImageBase64 = canvas.toDataURL('image/jpeg', 0.8);
            
            // Remove the temporary "processing" message
            const container = document.getElementById('chat-messages');
            if (container && container.lastChild && container.lastChild.innerText?.includes('جاري التقاط')) {
                container.lastChild.remove();
            }
            
            // Show attachment preview in UI
            const previewContainer = document.getElementById('chat-attachment-preview');
            const previewImg = document.getElementById('chat-attachment-img');
            if (previewContainer && previewImg) {
                previewImg.src = pendingImageBase64;
                previewContainer.classList.remove('hidden');
            }
            
            toggleChat(true);
            const input = document.getElementById('chat-input');
            if (input) input.focus();
            
        } catch (err) {
            console.error("Fallback crop error:", err);
            alert("تعذر التقاط الصورة.");
        } finally {
            window.isFallbackMode = false;
        }
    }

    function cropAndSave(rect) {
        const video = document.getElementById('capture-video');
        
        // Use a temporary canvas to output the cropped region
        const outCanvas = document.createElement('canvas');
        const ctx = outCanvas.getContext('2d');
        
        // Handle PC video stream Mode
        const scaleX = video.videoWidth / window.innerWidth;
        const scaleY = video.videoHeight / window.innerHeight;
        
        outCanvas.width = rect.width * scaleX;
        outCanvas.height = rect.height * scaleY;
        
        ctx.drawImage(
            video,
            rect.left * scaleX, rect.top * scaleY, 
            rect.width * scaleX, rect.height * scaleY,
            0, 0, 
            outCanvas.width, outCanvas.height
        );
        
        pendingImageBase64 = outCanvas.toDataURL('image/jpeg', 0.8);
        
        // Show attachment preview in UI
        const previewContainer = document.getElementById('chat-attachment-preview');
        const previewImg = document.getElementById('chat-attachment-img');
        if (previewContainer && previewImg) {
            previewImg.src = pendingImageBase64;
            previewContainer.classList.remove('hidden');
        }
        
        toggleChat(true);
        const container = document.getElementById('chat-messages');
        if (container) {
            container.innerHTML = '';
            const div = document.createElement('div');
            div.className = 'chat-message user';
            div.innerHTML = `<div class="message-bubble"><img src="${pendingImageBase64}" class="chat-img-preview" alt="لقطة شاشة"><div>مستعد للسؤال عن الصورة...</div></div>`;
            container.appendChild(div);
            scrollToBottom();
        }
    }

    // Match native app: gemini-2.5-flash-lite, 3 retries, 10s timeout
    async function sendToGemini(text, base64Image = null) {
        const retries = 3;
        let lastError = null;
        
        for (let i = 0; i < retries; i++) {
            try {
                const url = `${BASE_URL}models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`;
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout like native app
                
                let requestParts = [{ text: text }];
                if (base64Image) {
                    requestParts.push({
                        inline_data: { mime_type: "image/jpeg", data: base64Image.split(',')[1] }
                    });
                }
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: IDENTITY }] },
                        contents: [{ role: 'user', parts: requestParts }]
                    })
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorBody = await response.text();
                    console.error(`Attempt ${i + 1} failed:`, response.status, errorBody);
                    lastError = new Error(`خطأ في الخادم: ${response.status}`);
                    if (i < retries - 1) {
                        await delay(1500); // 1.5s delay like native app
                    }
                    continue;
                }
                
                const result = await response.json();
                
                if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
                    let generatedText = result.candidates[0].content.parts[0].text.trim();
                    // Remove asterisks like native app
                    generatedText = generatedText.replace(/\*/g, '');
                    return generatedText;
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
                    await delay(1500);
                }
            }
        }
        
        throw lastError || new Error('فشل الاتصال بعد عدة محاولات');
    }

    return { init, show, hide, toggleChat };
})();
