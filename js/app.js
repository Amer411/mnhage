// ============================
// App Module - Main SPA Router & Logic
// ============================
const App = (() => {
    let history = [];
    let currentScreen = 'login';

    function init() {
        // Check login status
        if (Auth.isLoggedIn()) {
            navigate('main');
            Auth.startHeartbeat();
        } else {
            navigate('login');
        }

        // Event listeners
        setupLoginForm();
        setupNavigation();
        setupBackButton();
        Chatbot.init();
        fetchNews();

        // Browser back button
        window.addEventListener('popstate', () => {
            if (history.length > 1) {
                history.pop();
                const prev = history[history.length - 1];
                showScreen(prev.screen, false);
            }
        });
    }

    async function fetchNews() {
        const section = document.getElementById('news-section');
        const content = document.getElementById('news-content');
        if (!section || !content) return;

        try {
            const FIREBASE_DB = 'https://almnhag-f48fd-default-rtdb.firebaseio.com';
            const resp = await fetch(`${FIREBASE_DB}/app_news.json`);
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.text) {
                    content.textContent = data.text;
                    section.classList.remove('hidden');
                } else {
                    section.classList.add('hidden');
                }
            }
        } catch (err) {
            console.error("Failed to fetch news:", err);
            section.classList.add('hidden');
        }
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

        // Manage chatbot FAB & Install Banner
        if (screenId === 'login') {
            Chatbot.hide();
            showInstallBanner();
        } else {
            Chatbot.show();
            // Hide install banner if navigating away from login
            document.getElementById('pwa-install-banner')?.classList.add('hidden');
        }

        // Manage watermark
        const watermark = document.getElementById('watermark-overlay');
        if (screenId === 'viewer') {
            watermark?.classList.add('active');
            addWatermarks();
        } else {
            watermark?.classList.remove('active');
            watermark.innerHTML = '';
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
        const container = document.getElementById('viewer-container');

        if (title) title.textContent = data.title;
        if (counter) counter.textContent = `${data.urls.length} صورة`;
        if (!container) return;
        container.innerHTML = '';

        // First: create all wrappers in order and append to container
        const wrappers = data.urls.map((url, i) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'img-loading';
            wrapper.style.position = 'relative';
            wrapper.style.minHeight = '300px'; 
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.justifyContent = 'center';
            
            const loadingText = document.createElement('div');
            loadingText.textContent = `جاري التحميل... (صورة ${i + 1})`;
            loadingText.style.position = 'absolute';
            wrapper.appendChild(loadingText);

            const img = document.createElement('img');
            img.alt = `${data.title} - صورة ${i + 1}`;
            img.style.opacity = '0';
            img.style.transition = 'opacity 0.3s ease';
            img.style.width = '100%';
            img.style.height = 'auto';
            img.style.zIndex = '1';
            img.style.position = 'relative';
            img.draggable = false;

            // Prevent long-press context menu and download
            img.addEventListener('contextmenu', (e) => e.preventDefault());
            img.addEventListener('dragstart', (e) => e.preventDefault());
            img.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    e.target.style.webkitTouchCallout = 'none';
                }
            }, { passive: true });

            img.onload = () => {
                loadingText.remove();
                img.style.opacity = '1';
                wrapper.style.minHeight = 'auto';
            };

            wrapper.appendChild(img);
            container.appendChild(wrapper);

            return { wrapper, img, loadingText, url, index: i };
        });

        // Second: load images asynchronously (order is preserved because wrappers are already in DOM)
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
        // More positions for better coverage
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

    // ===== PWA Install Prompts (Android & iOS) =====
    let deferredPrompt;

    function isStandalone() {
        return window.navigator.standalone === true || 
               window.matchMedia('(display-mode: standalone)').matches;
    }

    function setupInstallPrompts() {
        const banner = document.getElementById('pwa-install-banner');
        const installBtn = document.getElementById('android-install-btn');
        const closeBtn = document.getElementById('pwa-banner-close');

        if (!banner) return;

        // Capture the event silently - don't show anything yet
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
        });

        // Install button click (Android)
        installBtn?.addEventListener('click', async () => {
            if (!deferredPrompt) {
                alert("يرجى الضغط على القائمة في المتصفح واختيار 'تثبيت التطبيق'");
                return;
            }
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
            banner.classList.add('hidden');
        });

        // Close button handler
        closeBtn?.addEventListener('click', () => {
            banner.classList.add('hidden');
            localStorage.setItem('pwa_install_dismissed', 'true');
        });
    }

    // Show install banner on login screen
    function showInstallBanner() {
        // Don't show if: already installed OR already dismissed
        if (isStandalone() || localStorage.getItem('pwa_install_dismissed')) return;

        const banner = document.getElementById('pwa-install-banner');
        const androidUI = document.getElementById('android-install-ui');
        const iosUI = document.getElementById('ios-install-ui');
        if (!banner) return;

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        // Show install banner immediately if on login screen
        if (currentScreen !== 'login') return;
        banner.classList.remove('hidden');
        if (isIOS) {
            iosUI?.classList.remove('hidden');
            androidUI?.classList.add('hidden');
        } else {
            androidUI?.classList.remove('hidden');
            iosUI?.classList.add('hidden');
        }
    }

    // Start app
    document.addEventListener('DOMContentLoaded', () => {
        init();
        setupInstallPrompts();
    });


    return { navigate, goBack };
})();
