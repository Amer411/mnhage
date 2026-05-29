// ============================
// Auth Module - Firebase Authentication
// ============================
const Auth = (() => {
    const FIREBASE_DB = 'https://almnhag-f48fd-default-rtdb.firebaseio.com';
    const LOGIN_KEY = 'almnhaj_login';

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
        if (!password || String(password).trim() === '') {
            throw new Error('أدخل كلمة المرور');
        }

        const passwordInput = String(password).trim();
        let resolvedPw = passwordInput;

        // Try to fetch exact password first, if null try normalized
        try {
            const checkResp = await fetch(`${FIREBASE_DB}/passwords/${passwordInput}.json`);
            if (checkResp.ok) {
                const checkData = await checkResp.json();
                if (checkData === null) {
                    const normPw = normalizePhone(passwordInput);
                    if (normPw && normPw !== passwordInput) {
                        const normCheck = await fetch(`${FIREBASE_DB}/passwords/${normPw}.json`);
                        if (normCheck.ok && (await normCheck.json()) !== null) {
                            resolvedPw = normPw;
                        }
                    }
                }
            }
        } catch (e) {}

        const encodedPw = encodeURIComponent(resolvedPw).replace(/\./g, '%2E');
        const clientId = generateClientId();

        // 1. Check if password was already used (strict: block all re-use)
        // Check both key formats for backward compatibility with old entries
        try {
            // Check new format (encodedPw)
            const usedResp1 = await fetch(`${FIREBASE_DB}/used_passwords/${encodedPw}.json`);
            if (usedResp1.ok) {
                const usedData1 = await usedResp1.json();
                if (usedData1 !== null) {
                    throw new Error('كلمة المرور مستخدمة بالفعل ولا يمكن استخدامها مرة أخرى');
                }
            } else {
                throw new Error('لا يمكن التحقق من كلمة المرور، حاول مرة أخرى');
            }

            // Check old format (resolvedPw) for users who logged in with older code
            if (encodedPw !== resolvedPw) {
                const usedResp2 = await fetch(`${FIREBASE_DB}/used_passwords/${resolvedPw}.json`);
                if (usedResp2.ok) {
                    const usedData2 = await usedResp2.json();
                    if (usedData2 !== null) {
                        throw new Error('كلمة المرور مستخدمة بالفعل ولا يمكن استخدامها مرة أخرى');
                    }
                }
            }
        } catch (err) {
            if (err.message.includes('مستخدمة بالفعل') || err.message.includes('التحقق')) throw err;
            throw new Error('لا يمكن الاتصال بالخادم، تأكد من اتصالك بالإنترنت');
        }

        // 2. Check if there is ANY active session (block all re-use)
        try {
            const sessionResp = await fetch(`${FIREBASE_DB}/active_sessions/${encodedPw}.json`);
            if (sessionResp.ok) {
                const sessionData = await sessionResp.json();
                if (sessionData !== null) {
                    if (sessionData.status === 'kicked') {
                        throw new Error('تم إيقاف هذا الكرت نهائياً ولا يمكن استخدامه');
                    }
                    // Block if ANY other device has ever used this password
                    if (sessionData.client_id && sessionData.client_id !== clientId) {
                        throw new Error('كلمة المرور مستخدمة بالفعل على جهاز آخر');
                    }
                }
            }
        } catch (err) {
            if (err.message.includes('مستخدمة') || err.message.includes('إيقاف')) throw err;
        }

        // 3. Check and set login lock (short-term concurrency protection)
        const lockUrl = `${FIREBASE_DB}/lock/${resolvedPw}.json`;
        const activeUrl = `${FIREBASE_DB}/active_passwords/${resolvedPw}.json`;

        try {
            const lockResp = await fetch(lockUrl);
            if (lockResp.ok && (await lockResp.json()) !== null) {
                throw new Error('جاري معالجة دخول آخر حالياً.. انتظر لحظة');
            }

            await fetch(lockUrl, {
                method: 'PUT',
                body: JSON.stringify({ timestamp: Date.now() / 1000 }),
                headers: { 'Content-Type': 'application/json' }
            });

            const activeResp = await fetch(activeUrl);
            if (activeResp.ok && (await activeResp.json()) !== null) {
                await fetch(lockUrl, { method: 'DELETE' });
                throw new Error('جاري معالجة دخول آخر حالياً.. انتظر لحظة');
            }

            await fetch(activeUrl, {
                method: 'PUT',
                body: JSON.stringify({ timestamp: Date.now() / 1000 }),
                headers: { 'Content-Type': 'application/json' }
            });

            // 4. Verify password exists in master list
            const resp = await fetch(`${FIREBASE_DB}/passwords/${resolvedPw}.json`);
            if (!resp.ok) throw new Error('لا يمكن الوصول إلى قاعدة البيانات');
            const passwordData = await resp.json();
            
            if (passwordData === null) {
                throw new Error('كلمة المرور غير صحيحة');
            }

            // 5. Success! Get/Create User ID and mark as used
            const userId = await getOrCreateUserId(encodedPw);
            await uploadUsedPassword(encodedPw, userId, clientId);

            // 6. Register active session
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

            // 7. Save to local storage
            localStorage.setItem(LOGIN_KEY, JSON.stringify({
                logged_in: true,
                user_info: { user_id: userId, password: resolvedPw }
            }));

            return { success: true, userId };

        } finally {
            fetch(activeUrl, { method: 'DELETE' }).catch(() => {});
            fetch(lockUrl, { method: 'DELETE' }).catch(() => {});
        }
    }

    async function getOrCreateUserId(encodedPw) {
        try {
            const usedResp = await fetch(`${FIREBASE_DB}/used_passwords/${encodedPw}.json`);
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

    async function uploadUsedPassword(encodedPw, userId, clientId) {
        try {
            await fetch(`${FIREBASE_DB}/used_passwords/${encodedPw}.json`, {
                method: 'PUT',
                body: JSON.stringify({ 
                    user_id: userId, 
                    client_id: clientId,
                    timestamp: Date.now() / 1000 
                }),
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
