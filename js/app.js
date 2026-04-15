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
        } else {
            navigate('login');
        }

        // Event listeners
        setupLoginForm();
        setupNavigation();
        setupBackButton();
        Chatbot.init();

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

    function setupNavigation() {
        // Main cards
        document.querySelectorAll('[data-navigate]').forEach(el => {
            el.addEventListener('click', () => navigate(el.dataset.navigate));
        });

        // Logout
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            Auth.logout();
            navigate('login');
            history = [];
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

        // Manage chatbot FAB
        if (screenId === 'login') {
            Chatbot.hide();
        } else {
            Chatbot.show();
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

        data.urls.forEach(async (url, i) => {
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

            img.onload = () => {
                loadingText.remove();
                img.style.opacity = '1';
                wrapper.style.minHeight = 'auto';
            };
            
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error('Network response was not ok');
                
                const contentLength = response.headers.get('content-length');
                const total = parseInt(contentLength, 10);
                
                let loaded = 0;
                const reader = response.body.getReader();
                const chunks = [];
                
                while(true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    
                    chunks.push(value);
                    loaded += value.length;
                    
                    if (total) {
                        const percent = Math.round((loaded / total) * 100);
                        loadingText.textContent = `جاري التحميل... %${percent} (صورة ${i + 1})`;
                    }
                }
                
                const blob = new Blob(chunks);
                const blobUrl = URL.createObjectURL(blob);
                img.src = blobUrl;
                
            } catch (err) {
                console.error("Fetch failed, falling back to direct img src", err);
                // Fallback to direct load if fetch fails (CORS or other)
                img.src = url;
                img.onerror = () => {
                    loadingText.textContent = `⚠️ فشل تحميل الصورة ${i + 1}`;
                    loadingText.style.color = '#ef4444';
                };
            }

            wrapper.appendChild(img);
            container.appendChild(wrapper);
        });
    }

    // ===== Watermark =====
    function addWatermarks() {
        const overlay = document.getElementById('watermark-overlay');
        if (!overlay) return;
        overlay.innerHTML = '';
        
        const userId = Auth.getUserId();
        const positions = [
            { x: 10, y: 15 }, { x: 55, y: 10 }, { x: 30, y: 35 },
            { x: 70, y: 30 }, { x: 15, y: 55 }, { x: 60, y: 50 },
            { x: 40, y: 70 }, { x: 80, y: 65 }, { x: 20, y: 85 },
            { x: 65, y: 80 }
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

    // Start app
    document.addEventListener('DOMContentLoaded', init);

    return { navigate, goBack };
})();
