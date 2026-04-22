// ============================
// Auth Module - Firebase Authentication
// ============================
console.log("Auth Script Loaded - Version 25 (Python Match Mode)");
const Auth = (() => {
    const FIREBASE_DB = 'https://almnhag-f48fd-default-rtdb.firebaseio.com';
    const LOGIN_KEY = 'almnhaj_login';
    const CLIENT_ID_KEY = 'almnhaj_client_id';
    const SESSION_ID_KEY = 'almnhaj_session_id';
    let heartbeatInterval = null;

    // Firebase keys cannot contain: . $ # [ ] /
    function sanitizeKey(key) {
        return encodeURIComponent(key).replace(/\./g, '%2E');
    }

    // Generate a simple persistent client fingerprint
    function getClientId() {
        let id = localStorage.getItem(CLIENT_ID_KEY);
        if (!id) {
            id = 'c_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
            localStorage.setItem(CLIENT_ID_KEY, id);
        }
        return id;
    }

    function isLoggedIn() {
        const data = localStorage.getItem(LOGIN_KEY);
        if (!data) return false;
        try {
            const parsed = JSON.parse(data);
            return parsed.logged_in === true && parsed.user_info?.password;
        } catch { return false; }
    }

    function getUser() {
        try {
            return JSON.parse(localStorage.getItem(LOGIN_KEY));
        } catch { return null; }
    }

    function getUserId() {
        const user = getUser();
        return user?.user_info?.user_id || 'مستخدم';
    }

    async function logout() {
        // We do NOT delete the active_sessions node here to keep the card "used"
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        localStorage.removeItem(LOGIN_KEY);
        localStorage.removeItem(SESSION_ID_KEY);
        window.location.reload();
    }

    async function login(password) {
        if (!password || password.trim() === '') {
            throw new Error('أدخل كلمة المرور');
        }
        password = password.trim();
        const sanitizedPw = sanitizeKey(password);
        const clientId = getClientId();

        const activeUrl = `${FIREBASE_DB}/active_sessions/${sanitizedPw}.json`;

        try {
            console.log("=== بدء تسجيل الدخول ===");
            console.log("كلمة المرور:", password);
            console.log("معرف الجهاز:", clientId);

            // 1. Check if card exists in active_sessions
            console.log("الخطوة 1: فحص الجلسات النشطة...");
            const checkResp = await fetch(activeUrl);
            console.log("حالة الاستجابة:", checkResp.status);

            if (checkResp.status === 401 || checkResp.status === 403) {
                alert("⚠️ خطأ في تصاريح قاعدة البيانات (Rules).\nيرجى فتح Firebase Console وتعديل Rules إلى:\n{\"rules\":{\".read\":true,\".write\":true}}");
                throw new Error('خطأ في إعدادات الخادم - تصاريح');
            }

            const activeData = await checkResp.json();
            console.log("بيانات الجلسة:", activeData);

            let userIdToSave;

            if (activeData !== null && typeof activeData === 'object' && !activeData.error) {
                if (activeData.status === 'kicked') {
                    throw new Error('عذراً، هذه الكلمة تم إيقافها نهائياً');
                }
                if (activeData.client_id && activeData.client_id !== clientId) {
                    throw new Error('هذه الكلمة تم استخدامها مسبقاً على جهاز آخر');
                }
                // Re-login from same device: keep existing ID
                userIdToSave = activeData.user_id || 'مستخدم';
            }

            // 2. Verify password exists in DB
            console.log("الخطوة 2: البحث عن كلمة المرور في قاعدة البيانات...");
            const mainResp = await fetch(`${FIREBASE_DB}/.json`);
            if (!mainResp.ok) throw new Error('تعذر الاتصال بقاعدة البيانات: ' + mainResp.status);
            const mainData = await mainResp.json() || {};
            console.log("مفاتيح قاعدة البيانات:", Object.keys(mainData));

            // Search for password in: root values, root keys, and nested values
            let found = false;
            const skipNodes = ['active_sessions', 'lock', 'active_passwords', 'used_passwords', 'user_counter'];
            
            for (const [key, val] of Object.entries(mainData)) {
                if (skipNodes.includes(key)) continue;
                // Check if value is the password (direct match)
                if (val === password) { found = true; break; }
                // Check if key is the password
                if (key === password) { found = true; break; }
                // Check nested values (e.g. if passwords are inside a folder)
                if (typeof val === 'object' && val !== null) {
                    for (const innerVal of Object.values(val)) {
                        if (innerVal === password) { found = true; break; }
                    }
                    if (found) break;
                    for (const innerKey of Object.keys(val)) {
                        if (innerKey === password) { found = true; break; }
                    }
                    if (found) break;
                }
            }

            console.log("نتيجة البحث:", found ? "✅ موجودة" : "❌ غير موجودة");
            
            if (!found) {
                console.log("القيم الجذرية:", Object.entries(mainData).filter(([k]) => !skipNodes.includes(k)).map(([k,v]) => `${k}: ${typeof v === 'object' ? '[Object]' : v}`));
                throw new Error('كلمة المرور غير صحيحة');
            }

            // 3. Success - Register Session
            console.log("الخطوة 3: تسجيل الجلسة...");
            
            // If it's a new registration, increment and assign a sequential ID
            if (!userIdToSave) {
                let sequentialId = 1;
                try {
                    const counterResp = await fetch(`${FIREBASE_DB}/user_counter.json`);
                    if (counterResp.ok) {
                        const counterData = await counterResp.json();
                        if (counterData !== null && typeof counterData === 'number') {
                            sequentialId = counterData + 1;
                        }
                    }
                    await fetch(`${FIREBASE_DB}/user_counter.json`, {
                        method: 'PUT',
                        body: JSON.stringify(sequentialId)
                    });
                } catch(e) {
                    console.error("فشل في تحديث عداد المستخدمين", e);
                }
                userIdToSave = sequentialId;
            }

            const registerResp = await fetch(activeUrl, {
                method: 'PUT',
                body: JSON.stringify({ 
                    user_id: userIdToSave,
                    client_id: clientId,
                    last_active: Date.now() / 1000,
                    status: 'active'
                }),
                headers: { 'Content-Type': 'application/json' }
            });

            if (!registerResp.ok) {
                const errTxt = await registerResp.text();
                console.error("فشل التسجيل:", registerResp.status, errTxt);
                alert("فشل تسجيل الجلسة: " + registerResp.status + "\n" + errTxt);
                throw new Error('فشل تسجيل الدخول في قاعدة البيانات: ' + registerResp.status);
            }

            console.log("✅ تم تسجيل الجلسة بنجاح!");

            localStorage.setItem(LOGIN_KEY, JSON.stringify({
                logged_in: true,
                user_info: { password, user_id: userIdToSave }
            }));

            startHeartbeat();
            return { success: true };

        } catch (err) {
            console.error("❌ Login Error:", err.message);
            throw err;
        }
    }

    function startHeartbeat() {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        
        const update = async () => {
            if (!isLoggedIn()) return;
            const user = getUser();
            const password = user.user_info.password;
            const sanitizedPw = sanitizeKey(password);
            const clientId = getClientId();

            try {
                const checkResp = await fetch(`${FIREBASE_DB}/active_sessions/${sanitizedPw}.json`);
                const activeData = await checkResp.json();

                // If node deleted (Reset) OR status is kicked OR client_id mismatch
                if (activeData === null || activeData.status === 'kicked' || activeData.client_id !== clientId) {
                    console.warn("Session invalid or kicked.");
                    logout();
                    window.location.reload();
                    return;
                }

                // Update last active
                await fetch(`${FIREBASE_DB}/active_sessions/${sanitizedPw}/last_active.json`, {
                    method: 'PUT',
                    body: JSON.stringify(Date.now() / 1000)
                });
            } catch (e) {}
        };

        update();
        heartbeatInterval = setInterval(update, 25000); // Every 25 seconds
    }

    // Helper to cleanup unused code
    async function getOrCreateUserId() { return 'U' + Math.floor(1000 + Math.random() * 9000); }
    async function uploadUsedPassword() {}

    async function verifyCurrentPassword() {
        if (!isLoggedIn()) return;
        const user = getUser();
        if (!user || !user.user_info || !user.user_info.password) return;
        const password = user.user_info.password;
        
        try {
            const resp = await fetch(`${FIREBASE_DB}/.json`);
            if (resp.ok) {
                const data = await resp.json() || {};
                const found = Object.values(data).some(v => v === password);
                if (!found) {
                    logout();
                }
            }
        } catch (e) {}
    }

    return { isLoggedIn, getUser, getUserId, login, logout, startHeartbeat, verifyCurrentPassword };
})();
