// ============================
// Auth Module - Firebase Authentication
// ============================
const Auth = (() => {
    const FIREBASE_DB = 'https://almnhag-f48fd-default-rtdb.firebaseio.com';
    const LOGIN_KEY = 'almnhaj_login';

    // Generate a unique client ID for this device/session
    function generateClientId() {
        const stored = localStorage.getItem('almnhaj_client_id');
        if (stored) return stored;
        const id = 'c_' + Math.random().toString(36).substr(2, 15);
        localStorage.setItem('almnhaj_client_id', id);
        return id;
    }

    function isLoggedIn() {
        const data = localStorage.getItem(LOGIN_KEY);
        if (!data) return false;
        try {
            const parsed = JSON.parse(data);
            return parsed.logged_in === true;
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

    function logout() {
        const user = getUser();
        if (user?.user_info?.password) {
            const pw = user.user_info.password;
            const encodedPw = encodeURIComponent(pw).replace(/\./g, '%2E');
            fetch(`${FIREBASE_DB}/active_passwords/${pw}.json`, { method: 'DELETE' }).catch(() => {});
            // Remove from active_sessions on logout
            fetch(`${FIREBASE_DB}/active_sessions/${encodedPw}.json`, { method: 'DELETE' }).catch(() => {});
        }
        localStorage.removeItem(LOGIN_KEY);
    }

    async function login(password) {
        if (!password || password.trim() === '') {
            throw new Error('أدخل كلمة المرور');
        }

        // 1. Check if password was already used (one-time password like native app)
        const usedCheckUrl = `${FIREBASE_DB}/used_passwords/${password}.json`;
        try {
            const usedResp = await fetch(usedCheckUrl);
            if (usedResp.ok) {
                const usedData = await usedResp.json();
                if (usedData !== null) {
                    throw new Error('كلمة المرور مستخدمة بالفعل ولا يمكن استخدامها مرة أخرى');
                }
            }
        } catch (err) {
            if (err.message === 'كلمة المرور مستخدمة بالفعل ولا يمكن استخدامها مرة أخرى') {
                throw err;
            }
            // Network error, continue with login attempt
        }

        // 2. Check lock
        const lockUrl = `${FIREBASE_DB}/lock/${password}.json`;
        const activeUrl = `${FIREBASE_DB}/active_passwords/${password}.json`;

        const lockResp = await fetch(lockUrl);
        if (lockResp.ok && (await lockResp.json()) !== null) {
            throw new Error('كلمة المرور قيد الاستخدام حالياً');
        }

        // 3. Set lock
        await fetch(lockUrl, {
            method: 'PUT',
            body: JSON.stringify({ timestamp: Date.now() / 1000 }),
            headers: { 'Content-Type': 'application/json' }
        });

        // 4. Check active
        const activeResp = await fetch(activeUrl);
        if (activeResp.ok && (await activeResp.json()) !== null) {
            await fetch(lockUrl, { method: 'DELETE' });
            throw new Error('كلمة المرور قيد الاستخدام حالياً');
        }

        // 5. Set active
        await fetch(activeUrl, {
            method: 'PUT',
            body: JSON.stringify({ timestamp: Date.now() / 1000 }),
            headers: { 'Content-Type': 'application/json' }
        });

        try {
            // 6. Verify password exists in the passwords node
            const passwordStr = String(password).trim();
            const resp = await fetch(`${FIREBASE_DB}/passwords/${passwordStr}.json`);
            if (!resp.ok) {
                throw new Error('لا يمكن الوصول إلى قاعدة البيانات');
            }
            const passwordData = await resp.json();
            
            if (passwordData === null) {
                throw new Error('كلمة المرور غير صحيحة');
            }

            // 7. Check if user was kicked in active_sessions
            const encodedPw = encodeURIComponent(passwordStr).replace(/\./g, '%2E');
            try {
                const sessionResp = await fetch(`${FIREBASE_DB}/active_sessions/${encodedPw}/status.json`);
                if (sessionResp.ok) {
                    const status = await sessionResp.json();
                    if (status === 'kicked') {
                        throw new Error('تم إيقاف هذا الكرت نهائياً ولا يمكن استخدامه');
                    }
                }
            } catch (kickErr) {
                if (kickErr.message === 'تم إيقاف هذا الكرت نهائياً ولا يمكن استخدامه') {
                    throw kickErr;
                }
            }

            // 8. Get or create user ID
            const userId = await getOrCreateUserId(password);
            await uploadUsedPassword(password, userId);

            // 9. Register active session (for admin panel tracking)
            const clientId = generateClientId();
            try {
                await fetch(`${FIREBASE_DB}/active_sessions/${encodedPw}.json`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        client_id: clientId,
                        last_active: Date.now() / 1000,
                        status: 'active',
                        user_id: userId
                    }),
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch {}

            // 10. Save login state
            localStorage.setItem(LOGIN_KEY, JSON.stringify({
                logged_in: true,
                user_info: { user_id: userId, password }
            }));

            return { success: true, userId };
        } finally {
            // Cleanup
            fetch(activeUrl, { method: 'DELETE' }).catch(() => {});
            fetch(lockUrl, { method: 'DELETE' }).catch(() => {});
        }
    }

    async function getOrCreateUserId(password) {
        try {
            const usedResp = await fetch(`${FIREBASE_DB}/used_passwords/${password}.json`);
            if (usedResp.ok) {
                const data = await usedResp.json();
                if (data?.user_id) return data.user_id;
            }
        } catch {}

        try {
            const counterUrl = `${FIREBASE_DB}/user_counter.json`;
            const resp = await fetch(counterUrl);
            let count = 0;
            if (resp.ok) {
                count = (await resp.json()) || 0;
            }
            const newCount = count + 1;
            await fetch(counterUrl, {
                method: 'PUT',
                body: JSON.stringify(newCount),
                headers: { 'Content-Type': 'application/json' }
            });
            return newCount;
        } catch {
            return 'Unknown';
        }
    }

    async function uploadUsedPassword(password, userId) {
        try {
            await fetch(`${FIREBASE_DB}/used_passwords/${password}.json`, {
                method: 'PUT',
                body: JSON.stringify({ user_id: userId, timestamp: Date.now() / 1000 }),
                headers: { 'Content-Type': 'application/json' }
            });
        } catch {}
    }

    async function verifyCurrentPassword() {
        if (!isLoggedIn()) return;
        const user = getUser();
        if (!user || !user.user_info || !user.user_info.password) return;
        const password = user.user_info.password;
        
        try {
            const passwordStr = String(password).trim();
            const encodedPw = encodeURIComponent(passwordStr).replace(/\./g, '%2E');

            // Check if user was kicked
            const sessionResp = await fetch(`${FIREBASE_DB}/active_sessions/${encodedPw}/status.json`);
            if (sessionResp.ok) {
                const status = await sessionResp.json();
                if (status === 'kicked') {
                    logout();
                    window.location.reload();
                    return;
                }
            }

            // Check if password still exists in DB
            const resp = await fetch(`${FIREBASE_DB}/passwords/${passwordStr}.json`);
            if (resp.ok) {
                const passwordData = await resp.json();
                if (passwordData === null) {
                    // Password removed from DB, log user out
                    logout();
                    window.location.reload();
                    return;
                }
            }

            // Update last_active timestamp
            try {
                await fetch(`${FIREBASE_DB}/active_sessions/${encodedPw}/last_active.json`, {
                    method: 'PUT',
                    body: JSON.stringify(Date.now() / 1000),
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch {}
        } catch (e) {
            // Network issue, do nothing
        }
    }

    return { isLoggedIn, getUser, getUserId, login, verifyCurrentPassword };
})();
