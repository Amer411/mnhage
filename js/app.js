// ============================
// App Module - Main SPA Router & Logic
// ============================
const App = (() => {
    let history = [];
    let currentScreen = 'login';
    let currentZoom = 100;

    function normalizePhone(phone) {
        if (!phone) return '';
        const arabicDigits = /[٠١٢٣٤٥٦٧٨٩]/g;
        let normalized = String(phone).replace(arabicDigits, function (d) {
            return d.charCodeAt(0) - 1632;
        });
        normalized = normalized.replace(/\D/g, '');
        if (normalized.startsWith('00967')) {
            normalized = normalized.slice(5);
        } else if (normalized.startsWith('967')) {
            normalized = normalized.slice(3);
        } else if (normalized.startsWith('0')) {
            normalized = normalized.slice(1);
        }
        if (normalized.length > 9) {
            normalized = normalized.slice(-9);
        }
        return normalized;
    }

    // ===== Zoom & Pan Manager =====
    const ZoomManager = (() => {
        let el = null, container = null;
        let scale = 1, posX = 0, posY = 0;
        let startX = 0, startY = 0, startPosX = 0, startPosY = 0;
        let startDist = 0, startScale = 1;
        let isPanning = false, isPinching = false;
        let lastTapTime = 0;
        let listenersAttached = false;

        const getDist = (t) => Math.hypot(
            t[0].clientX - t[1].clientX,
            t[0].clientY - t[1].clientY
        );

        function init(targetId, containerId) {
            el = document.getElementById(targetId);
            container = document.getElementById(containerId);
            if (!el || !container) return;

            scale = 1; posX = 0; posY = 0;
            applyTransform();
            updateTouchAction();

            if (listenersAttached) return;
            listenersAttached = true;

            // --- Touch Start ---
            container.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) {
                    // Pinch: always intercept
                    e.preventDefault();
                    isPinching = true;
                    isPanning = false;
                    startDist = getDist(e.touches);
                    startScale = scale;
                    startPosX = posX;
                    startPosY = posY;
                } else if (e.touches.length === 1 && !isPinching) {
                    if (scale > 1) {
                        // Zoomed in: intercept for panning
                        e.preventDefault();
                        isPanning = true;
                    }
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                    startPosX = posX;
                    startPosY = posY;
                }
                // At scale=1 with 1 finger: do NOT preventDefault → normal scroll works
            }, { passive: false });

            // --- Touch Move ---
            container.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2 && isPinching) {
                    e.preventDefault();
                    const dist = getDist(e.touches);
                    const newScale = Math.max(1, Math.min(5, startScale * (dist / startDist)));
                    scale = newScale;
                    applyTransform();
                } else if (e.touches.length === 1 && scale > 1) {
                    e.preventDefault();
                    const dx = e.touches[0].clientX - startX;
                    const dy = e.touches[0].clientY - startY;
                    posX = startPosX + dx;
                    posY = startPosY + dy;
                    applyTransform();
                }
                // At scale=1 with 1 finger: do NOT preventDefault → normal scroll works
            }, { passive: false });

            // --- Touch End ---
            container.addEventListener('touchend', (e) => {
                if (isPinching && e.touches.length < 2) {
                    isPinching = false;
                    if (scale < 1.1) {
                        scale = 1; posX = 0; posY = 0;
                        applyTransform();
                    }
                    updateTouchAction();
                }
                if (e.touches.length === 0) {
                    isPanning = false;

                    // Double-tap detection
                    const now = Date.now();
                    if (now - lastTapTime < 300) {
                        if (scale > 1.1) {
                            scale = 1; posX = 0; posY = 0;
                            currentZoom = 100;
                        } else {
                            scale = 2.5;
                            currentZoom = 250;
                            const rect = container.getBoundingClientRect();
                            const tapX = e.changedTouches[0].clientX - rect.left;
                            const tapY = e.changedTouches[0].clientY - rect.top;
                            posX = (rect.width / 2 - tapX) * (scale - 1);
                            posY = (rect.height / 2 - tapY) * (scale - 1);
                        }
                        applyTransform();
                        updateTouchAction();
                        lastTapTime = 0;
                        e.preventDefault();
                    } else {
                        lastTapTime = now;
                    }
                }
            }, { passive: false });
        }

        function updateTouchAction() {
            if (!container) return;
            // At normal zoom: allow native scroll. Zoomed in: we handle everything.
            container.style.touchAction = scale > 1 ? 'none' : 'pan-y';
            container.style.overflow = scale > 1 ? 'hidden' : 'auto';
        }

        function applyTransform() {
            if (!el) return;
            if (scale <= 1) { scale = 1; posX = 0; posY = 0; }
            el.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
        }

        function reset() {
            scale = 1; posX = 0; posY = 0;
            applyTransform();
            updateTouchAction();
        }

        function setScale(s) {
            scale = Math.max(1, s / 100);
            if (scale <= 1) { posX = 0; posY = 0; }
            applyTransform();
            updateTouchAction();
        }

        return { init, reset, setScale };
    })();

    function init() {
        // Check login status
        if (Auth.isLoggedIn()) {
            navigate('main');
            if (Auth.verifyCurrentPassword) {
                Auth.verifyCurrentPassword();
            }
        } else {
            navigate('login');
        }

        // Event listeners
        setupLoginForm();
        setupPasswordRequest();
        setupNavigation();
        setupBackButton();
        setupViewerZoom();
        setupRefreshButton();

        // Browser back button
        window.addEventListener('popstate', () => {
            if (history.length > 1) {
                history.pop();
                const prev = history[history.length - 1];
                showScreen(prev.screen, false);
            }
        });
    }

    function setupLoginForm() {
        const form = document.getElementById('login-form');
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('password-input');
            const btn = document.getElementById('login-btn');
            const error = document.getElementById('login-error');
            const btnText = btn?.querySelector('.btn-text');
            const btnLoader = btn?.querySelector('.btn-loader');

            error?.classList.add('hidden');
            if (btnText) btnText.textContent = 'جاري الدخول...';
            if (btnLoader) btnLoader.classList.remove('hidden');
            btn.disabled = true;

            try {
                await Auth.login(input.value);
                navigate('main');
            } catch (err) {
                error.textContent = err.message || 'حدث خطأ';
                error.classList.remove('hidden');
                input.value = '';
            } finally {
                if (btnText) btnText.textContent = 'تسجيل الدخول';
                if (btnLoader) btnLoader.classList.add('hidden');
                btn.disabled = false;
            }
        });
    }

    function setupPasswordRequest() {
        const btn = document.getElementById('request-password-btn');
        if (!btn) return;

        btn.addEventListener('click', () => {
            Swal.fire({
                title: 'طلب كلمة مرور للطالب',
                html: `
                    <style>
                        #swal-student-school::placeholder {
                            font-size: 0.8rem;
                        }
                    </style>
                    <input type="text" id="swal-student-name" class="swal2-input" placeholder="اسم الطالب" style="direction: rtl; font-family: 'Tajawal', sans-serif; margin-bottom: 10px;">
                    <input type="text" id="swal-student-school" class="swal2-input" placeholder="اسم الثانوية التي تدرس فيها" style="direction: rtl; font-family: 'Tajawal', sans-serif; margin-bottom: 10px;">
                    <input type="tel" id="swal-student-phone" class="swal2-input" placeholder="رقم الهاتف" style="direction: rtl; font-family: 'Tajawal', sans-serif;">
                `,
                confirmButtonText: 'إرسال الطلب',
                showCancelButton: true,
                cancelButtonText: 'إلغاء',
                focusConfirm: false,
                preConfirm: () => {
                    const name = document.getElementById('swal-student-name').value.trim();
                    const school = document.getElementById('swal-student-school').value.trim();
                    const rawPhone = document.getElementById('swal-student-phone').value.trim();
                    const phone = normalizePhone(rawPhone);
                    if (!name || !school || !rawPhone) {
                        Swal.showValidationMessage('يرجى إدخال الاسم، اسم الثانوية ورقم الهاتف');
                        return false;
                    }
                    if (phone.length < 9) {
                        Swal.showValidationMessage('يرجى إدخال رقم هاتف صحيح (على الأقل 9 أرقام)');
                        return false;
                    }
                    return { name, school, phone };
                }
            }).then(async (result) => {
                if (result.isConfirmed) {
                    const { name, school, phone } = result.value;
                    
                    Swal.fire({
                        title: 'جاري الإرسال...',
                        allowOutsideClick: false,
                        didOpen: () => {
                            Swal.showLoading();
                        }
                    });

                    try {
                        const FIREBASE_DB = 'https://almnhag-f48fd-default-rtdb.firebaseio.com';
                        await fetch(`${FIREBASE_DB}/password_requests.json`, {
                            method: 'POST',
                            body: JSON.stringify({
                                name: name,
                                school: school,
                                phone: phone,
                                timestamp: Date.now() / 1000,
                                status: 'pending'
                            }),
                            headers: { 'Content-Type': 'application/json' }
                        });

                        Swal.fire({
                            icon: 'success', 
                            title: 'تم بنجاح!',
                            html: 'تم إرسال طلبك للإدارة.<br><br>سيتم تحويلك إلى واتساب لإكمال الطلب.',
                            confirmButtonText: 'فتح الواتساب', 
                            showCancelButton: false, 
                            allowOutsideClick: false
                        }).then((result2) => {
                            if (result2.isConfirmed) {
                                const msg = `📚 *طلب كلمة مرور جديدة للطالب*\n\n👤 *الاسم:* ${name}\n🏫 *الثانوية:* ${school}\n📱 *رقم الهاتف:* ${phone}`;
                                window.open(`https://wa.me/967776964284?text=${encodeURIComponent(msg)}`, '_blank');
                            }
                        });
                    } catch (error) {
                        Swal.fire({
                            icon: 'error',
                            title: 'خطأ',
                            text: 'حدث خطأ في الإتصال بالخادم، يرجى المحاولة مرة أخرى'
                        });
                    }
                }
            });
        });
    }

    function setupNavigation() {
        // Main cards
        document.querySelectorAll('[data-navigate]').forEach(el => {
            el.addEventListener('click', () => navigate(el.dataset.navigate));
        });
    }

    function setupBackButton() {
        document.addEventListener('click', (e) => {
            const backBtn = e.target.closest('[data-back]');
            if (backBtn) goBack();
        });
    }

    function navigate(screen, data) {
        showScreen(screen, true, data);
    }

    function showScreen(screenId, addToHistory = true, data) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

        // Build screen content if needed
        buildScreen(screenId, data);

        // Show target screen
        const target = document.getElementById(`screen-${screenId}`);
        if (target) {
            target.classList.add('active');
            currentScreen = screenId;

            // Scroll to top
            target.querySelector('.screen-content')?.scrollTo(0, 0);
        }



        // Manage watermark
        const watermark = document.getElementById('watermark-overlay');
        if (screenId === 'viewer') {
            watermark?.classList.add('active');
            addWatermarks();
        } else {
            watermark?.classList.remove('active');
            if (watermark) watermark.innerHTML = '';
            ZoomManager.reset();
        }

        // History
        if (addToHistory) {
            history.push({ screen: screenId, data });
            window.history.pushState({ screen: screenId }, '', '');
        }
    }

    function goBack() {
        if (history.length > 1) {
            history.pop();
            const prev = history[history.length - 1];
            showScreen(prev.screen, false, prev.data);
        }
    }

    function buildScreen(screenId, data) {
        switch (screenId) {
            case 'answers':
                buildAnswersScreen(data);
                break;
            case 'summaries':
                buildSummariesScreen(data);
                break;
            case 'models':
                buildModelsScreen(data);
                break;
            case 'subject':
                buildSubjectScreen(data);
                break;
            case 'viewer':
                buildViewerScreen(data);
                break;
            case 'model-detail':
                buildModelDetailScreen(data);
                break;
        }
    }

    // ===== Build Answers Screen =====
    function buildAnswersScreen(data) {
        const container = document.getElementById('answers-list');
        const headerTitle = document.querySelector('#screen-answers .header-title');
        if (!container) return;
        container.innerHTML = '';

        if (!ContentData.answers || ContentData.answers.length === 0) {
            container.innerHTML = `<div class="coming-soon glass-card">
                <div class="coming-soon-icon">🔜</div>
                <h2>قريباً</h2>
                <p>سيتم إضافة الإجابات قريباً</p>
            </div>`;
            return;
        }

        // Case 1: Main Categories (Top Level)
        if (!data || (!data.catId && data.catId !== 0)) {
            if (headerTitle) headerTitle.textContent = "إجابات التقاويم";
            ContentData.answers.forEach((cat, idx) => {
                const div = document.createElement('div');
                div.className = 'category-card';
                div.innerHTML = `<div class="category-icon">📚</div><h3>${cat.name}</h3>`;
                div.addEventListener('click', () => {
                    if (cat.type === 'category') {
                        navigate('answers', { catId: idx, catName: cat.name });
                    } else {
                        // Direct subject, show buttons
                        navigate('answers', { catId: idx, subId: -1, catName: cat.name });
                    }
                });
                container.appendChild(div);
            });
            return;
        }

        // Case 2: Sub-categories (Level 2)
        if (data.catId !== undefined && data.subId === undefined) {
            const cat = ContentData.answers[data.catId];
            if (headerTitle) headerTitle.textContent = cat.name;

            cat.subs.forEach((sub, sIdx) => {
                const div = document.createElement('div');
                div.className = 'category-card';
                div.innerHTML = `<div class="category-icon">📂</div><h3>${sub.name}</h3>`;
                div.addEventListener('click', () => {
                    navigate('answers', { catId: data.catId, subId: sIdx, catName: cat.name, subName: sub.name });
                });
                container.appendChild(div);
            });
            return;
        }

        // Case 3: Lesson Buttons (Level 3)
        if (data.catId !== undefined && data.subId !== undefined) {
            const cat = ContentData.answers[data.catId];
            let buttons = [];
            let titlePrefix = "";

            if (data.subId === -1) {
                // Direct subject
                buttons = cat.buttons;
                titlePrefix = cat.name;
            } else {
                const sub = cat.subs[data.subId];
                buttons = sub.buttons;
                titlePrefix = sub.name;
            }

            if (headerTitle) headerTitle.textContent = titlePrefix;

            const row = document.createElement('div');
            row.className = 'years-row';
            row.style.gridTemplateColumns = 'repeat(auto-fit, minmax(130px, 1fr))';

            buttons.forEach(btnInfo => {
                const btn = document.createElement('button');
                btn.className = 'year-btn';
                btn.textContent = btnInfo.title;
                btn.style.whiteSpace = 'normal';
                btn.style.height = 'auto';
                btn.style.minHeight = '3.5rem';
                btn.style.lineHeight = '1.3';

                if (btnInfo.urls && btnInfo.urls.length > 0 && !btnInfo.comingSoon) {
                    btn.addEventListener('click', () => {
                        navigate('viewer', { title: `${titlePrefix} - ${btnInfo.title}`, urls: btnInfo.urls });
                    });
                } else {
                    btn.classList.add('disabled');
                    btn.title = "قريباً";
                }
                row.appendChild(btn);
            });
            container.appendChild(row);
        }
    }

    // ===== Build Models Screen =====
    function buildModelsScreen() {
        const container = document.getElementById('models-list');
        if (!container) return;
        container.innerHTML = '';

        for (const [key, data] of Object.entries(ContentData.models)) {
            container.appendChild(createCategoryCard(key, data.label, '📝', true));
        }
    }

    // ===== Build Summaries Screen =====
    function buildSummariesScreen() {
        const container = document.getElementById('summaries-list');
        if (!container) return;
        container.innerHTML = '';

        if (!ContentData.summaries || ContentData.summaries.length === 0) {
            container.innerHTML = `<div class="coming-soon glass-card">
                <div class="coming-soon-icon">🔜</div>
                <h2>قريباً</h2>
                <p>سيتم إضافة الملخصات قريباً</p>
            </div>`;
            return;
        }

        ContentData.summaries.forEach(subj => {
            const label = document.createElement('div');
            label.className = 'subject-label';
            label.textContent = subj.name;
            container.appendChild(label);

            const row = document.createElement('div');
            row.className = 'years-row'; // reusing this class for styling
            // Adjust the grid for longer summary button texts
            row.style.gridTemplateColumns = 'repeat(auto-fit, minmax(130px, 1fr))';

            subj.buttons.forEach(btnInfo => {
                const btn = document.createElement('button');
                btn.className = 'year-btn';
                btn.textContent = btnInfo.title;
                // Add inline styling to support multi-line long titles gracefully
                btn.style.whiteSpace = 'normal';
                btn.style.height = 'auto';
                btn.style.minHeight = '3.5rem';
                btn.style.lineHeight = '1.3';

                if (btnInfo.urls && btnInfo.urls.length > 0 && !btnInfo.comingSoon) {
                    btn.addEventListener('click', () => {
                        navigate('viewer', { title: `${subj.name} - ${btnInfo.title}`, urls: btnInfo.urls });
                    });
                } else {
                    btn.classList.add('disabled');
                    btn.title = "قريباً";
                }
                row.appendChild(btn);
            });
            container.appendChild(row);
        });
    }

    function createCategoryCard(id, name, icon, isModel = false) {
        const div = document.createElement('div');
        div.className = 'category-card';
        div.innerHTML = `<div class="category-icon">${icon}</div><h3>${name}</h3>`;
        div.addEventListener('click', () => {
            if (isModel) {
                navigate('model-detail', { id, name });
            } else {
                navigate('subject', { id, name });
            }
        });
        return div;
    }

    // ===== Build Subject Screen (Lessons List) =====
    function buildSubjectScreen(data) {
        if (!data) return;
        const title = document.getElementById('subject-title');
        const list = document.getElementById('lessons-list');
        if (title) title.textContent = data.name;
        if (!list) return;
        list.innerHTML = '';

        const lessons = ContentData.lessons[data.id];
        if (!lessons || !Array.isArray(lessons)) {
            list.innerHTML = `<div class="coming-soon glass-card">
                <div class="coming-soon-icon">🔜</div>
                <h2>قريباً</h2>
                <p>سيتم إضافة المحتوى قريباً إن شاء الله</p>
            </div>`;
            return;
        }

        lessons.forEach((lesson, i) => {
            const card = document.createElement('div');
            card.className = `lesson-card${lesson.comingSoon ? ' disabled' : ''}`;
            card.style.animationDelay = `${i * 0.04}s`;
            card.innerHTML = `
                <div class="lesson-num">${i + 1}</div>
                <div class="lesson-title">${lesson.title}</div>
                <span class="lesson-arrow">←</span>
            `;
            if (!lesson.comingSoon && lesson.urls?.length > 0) {
                card.addEventListener('click', () => {
                    navigate('viewer', { title: lesson.title, urls: lesson.urls });
                });
            }
            list.appendChild(card);
        });
    }

    // ===== Build Model Detail Screen =====
    function buildModelDetailScreen(data) {
        if (!data) return;
        const title = document.getElementById('model-detail-title');
        const list = document.getElementById('model-years-list');
        if (title) title.textContent = data.name;
        if (!list) return;
        list.innerHTML = '';

        const modelData = ContentData.models[data.id];
        if (!modelData) {
            list.innerHTML = `<div class="coming-soon glass-card">
                <div class="coming-soon-icon">🔜</div>
                <h2>قريباً</h2>
                <p>سيتم إضافة النماذج قريباً</p>
            </div>`;
            return;
        }

        // Show subjects with years 
        if (modelData.subjects?.length > 0) {
            modelData.subjects.forEach(subj => {
                const label = document.createElement('div');
                label.className = 'subject-label';
                label.textContent = subj.name;
                list.appendChild(label);

                const row = document.createElement('div');
                row.className = 'years-row';
                subj.years.forEach(yr => {
                    const btn = document.createElement('button');
                    btn.className = 'year-btn';
                    btn.textContent = yr.year;
                    if (yr.urls && yr.urls.length > 0 && yr.urls[0] !== '') {
                        btn.addEventListener('click', () => {
                            navigate('viewer', { title: `${subj.name} - ${yr.year}`, urls: yr.urls });
                        });
                    } else {
                        btn.classList.add('disabled');
                        btn.title = "قريباً";
                    }
                    row.appendChild(btn);
                });
                list.appendChild(row);
            });
        } else {
            list.innerHTML = `<div class="coming-soon glass-card">
                <div class="coming-soon-icon">🔜</div>
                <h2>قريباً</h2>
                <p>سيتم إضافة النماذج قريباً</p>
            </div>`;
        }
    }

    // ===== Build Viewer Screen =====
    function buildViewerScreen(data) {
        if (!data) return;
        const title = document.getElementById('viewer-title');
        const counter = document.getElementById('image-counter');
        const zoomContent = document.getElementById('zoom-content');

        if (title) title.textContent = data.title;
        if (counter) counter.textContent = `${data.urls.length} صورة`;
        if (!zoomContent) return;

        zoomContent.innerHTML = '';
        currentZoom = 100;
        ZoomManager.init('zoom-content', 'viewer-container');

        // First: create all wrappers in order and append to container
        const wrappers = data.urls.map((url, i) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'img-loading';

            const loadingText = document.createElement('div');
            loadingText.textContent = `جاري التحميل... (صورة ${i + 1})`;
            loadingText.style.position = 'absolute';
            loadingText.style.zIndex = '2';
            wrapper.appendChild(loadingText);

            const img = document.createElement('img');
            img.alt = `${data.title} - صورة ${i + 1}`;
            img.style.opacity = '0';
            img.style.transition = 'opacity 0.3s ease';
            img.style.zIndex = '1';
            img.draggable = false;

            img.onload = () => {
                loadingText.remove();
                img.style.opacity = '1';
                wrapper.style.minHeight = 'auto';
            };

            wrapper.appendChild(img);
            zoomContent.appendChild(wrapper);

            return { img, loadingText, url, index: i };
        });

        // Second: load images asynchronously
        wrappers.forEach(({ img, loadingText, url, index }) => {
            loadImageWithProgress(img, loadingText, url, index);
        });
    }

    // Load image with progress bar using XMLHttpRequest (works with CORS unlike fetch streaming)
    function loadImageWithProgress(img, loadingText, url, index) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';

        xhr.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                loadingText.textContent = `جاري التحميل... %${percent} (صورة ${index + 1})`;
            } else {
                // No content-length, show loaded size
                const kb = Math.round(e.loaded / 1024);
                loadingText.textContent = `جاري التحميل... ${kb}KB (صورة ${index + 1})`;
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                const blob = xhr.response;
                const blobUrl = URL.createObjectURL(blob);
                img.src = blobUrl;
            } else {
                // Fallback to direct src
                img.src = url;
            }
        };

        xhr.onerror = () => {
            console.warn(`XHR failed for image ${index + 1}, falling back to direct src`);
            // Fallback: direct img.src load
            img.src = url;
            img.onerror = () => {
                loadingText.textContent = `⚠️ فشل تحميل الصورة ${index + 1}`;
                loadingText.style.color = '#ef4444';
            };
        };

        xhr.send();
    }

    // ===== Watermark =====
    function addWatermarks() {
        const overlay = document.getElementById('watermark-overlay');
        if (!overlay) return;
        overlay.innerHTML = '';

        const userId = Auth.getUserId();
        // Fixed positions across the screen - always visible regardless of zoom/pan
        const positions = [
            { x: 5, y: 8 }, { x: 45, y: 5 }, { x: 85, y: 12 },
            { x: 20, y: 25 }, { x: 60, y: 22 },
            { x: 10, y: 40 }, { x: 50, y: 38 }, { x: 80, y: 42 },
            { x: 25, y: 55 }, { x: 65, y: 52 },
            { x: 8, y: 68 }, { x: 48, y: 65 }, { x: 82, y: 70 },
            { x: 30, y: 82 }, { x: 70, y: 78 },
            { x: 15, y: 92 }, { x: 55, y: 90 }
        ];

        positions.forEach(pos => {
            const span = document.createElement('span');
            span.className = 'watermark-text';
            span.textContent = userId;
            span.style.left = `${pos.x}%`;
            span.style.top = `${pos.y}%`;
            overlay.appendChild(span);
        });
    }

    // ===== Zoom Logic =====
    function setupViewerZoom() {
        const zoomIn = document.getElementById('zoom-in');
        const zoomOut = document.getElementById('zoom-out');

        if (zoomIn) {
            zoomIn.addEventListener('click', () => {
                currentZoom = Math.min(currentZoom + 50, 400);
                updateZoom();
            });
        }
        if (zoomOut) {
            zoomOut.addEventListener('click', () => {
                currentZoom = Math.max(currentZoom - 50, 100);
                updateZoom();
            });
        }
    }

    function updateZoom() {
        ZoomManager.setScale(currentZoom);
    }

    function setupRefreshButton() {
        const btn = document.getElementById('main-refresh-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                btn.style.transform = 'rotate(360deg)';
                btn.style.transition = 'transform 0.5s ease';
                setTimeout(() => {
                    window.location.reload();
                }, 300);
            });
        }
    }

    // ===== iOS Install Prompt =====
    function checkIOSInstallPrompt() {
        // Check if iOS
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        // Check if already in standalone mode (installed as PWA)
        const isStandalone = window.navigator.standalone === true ||
            window.matchMedia('(display-mode: standalone)').matches;

        // Check if user previously dismissed
        const dismissed = localStorage.getItem('ios_install_dismissed');

        if (isIOS && !isStandalone && !dismissed) {
            // Show banner after a short delay
            setTimeout(() => {
                const banner = document.getElementById('ios-install-banner');
                if (banner) {
                    banner.classList.remove('hidden');
                }
            }, 2000);

            // Close button handler
            document.getElementById('ios-banner-close')?.addEventListener('click', () => {
                const banner = document.getElementById('ios-install-banner');
                if (banner) {
                    banner.classList.add('hidden');
                    localStorage.setItem('ios_install_dismissed', 'true');
                }
            });
        }
    }

    // Start app
    document.addEventListener('DOMContentLoaded', () => {
        init();
        checkIOSInstallPrompt();
    });

    return { navigate, goBack };
})();
