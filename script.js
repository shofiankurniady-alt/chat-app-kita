// ============ KONFIGURASI SUPABASE ============
const SUPABASE_URL = 'https://gqlxktuqmtgpixmbcefp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxbHhrdHVxbXRncGl4bWJjZWZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1OTk2MTksImV4cCI6MjA5MDE3NTYxOX0.SEbaQaYFRIMhrTGK--XY-YEHG5v5LUdU6__gv8Qi8rE';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ VARIABEL GLOBAL ============
let currentUser = null;
let currentUserLanguage = 'id';
let currentRoomId = 'public';
let typingTimeout = null;
let messagesSubscription = null;
let typingSubscription = null;
let onlineStatusInterval = null;

// AVATAR DEFAULT (URL ONLINE - TIDAK PERLU FILE)
const AVATAR_DEFAULT = 'https://ui-avatars.com/api/?background=667eea&color=fff&bold=true&size=40';

// ============ FUNGSI DETEKSI BAHASA ============
function detectLanguage(text) {
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text)) return 'ja';
    if (/^[a-zA-Z\s\.,!?0-9]+$/.test(text)) return 'en';
    return 'id';
}

// ============ FUNGSI TERJEMAHAN ============
async function translateText(text, targetLang) {
    if (!text || !targetLang) return text;
    const sourceLang = detectLanguage(text);
    if (sourceLang === targetLang) return text;
    
    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.responseData && data.responseData.translatedText) {
            let translated = data.responseData.translatedText;
            if (translated.includes('INVALID') || translated.includes('NO CONTENT')) return text;
            return translated;
        }
        return text;
    } catch (error) {
        return text;
    }
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function playNotificationSound() {
    const audio = document.getElementById('notification-sound');
    if (audio) audio.play().catch(() => {});
}

// ============ READ RECEIPT ============
async function markMessageAsRead(messageId) {
    if (!currentUser) return;
    await supabaseClient
        .from('messages')
        .update({ is_read: true })
        .eq('id', messageId)
        .neq('user_id', currentUser.id);
}

// ============ GET PROFILE ============
async function getProfile(userId) {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    if (error) return null;
    return data;
}

// ============ RENDER PESAN ============
async function renderMessage(message) {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    const isOwn = message.user_id === currentUser?.id;
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'message-own' : 'message-other'}`;
    div.setAttribute('data-message-id', message.id);
    
    let displayText = message.original_message;
    let showOriginal = false;
    
    if (!isOwn) {
        const translated = await translateText(message.original_message, currentUserLanguage);
        if (translated !== message.original_message) {
            displayText = translated;
            showOriginal = true;
        }
    }
    
    const avatarUrl = message.avatar_url || AVATAR_DEFAULT;
    
    div.innerHTML = `
        <img class="message-avatar" src="${avatarUrl}" alt="avatar" onerror="this.src='${AVATAR_DEFAULT}'">
        <div class="message-content-wrapper">
            <div class="message-bubble">
                <div class="message-header">
                    <span class="username">${escapeHtml(message.username)}</span>
                    <span class="time">${formatTime(message.created_at)}</span>
                    ${!isOwn ? '' : `
                        <div class="read-receipt">
                            ${message.is_read ? '<i class="fas fa-check-double"></i>' : '<i class="fas fa-check"></i>'}
                        </div>
                    `}
                    <div class="message-actions">
                        <button class="edit-msg" data-id="${message.id}"><i class="fas fa-edit"></i></button>
                        <button class="delete-msg" data-id="${message.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div class="message-content">${escapeHtml(displayText)}</div>
                ${message.image_url ? `<img class="message-image" src="${message.image_url}" alt="image">` : ''}
                ${showOriginal ? `<div class="original-message">📝 ${escapeHtml(message.original_message)}</div>` : ''}
            </div>
        </div>
    `;
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    
    if (!isOwn) await markMessageAsRead(message.id);
}

// ============ LOAD MESSAGES ============
async function loadMessages() {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-messages">Loading messages...</div>';
    
    const { data, error } = await supabaseClient
        .from('messages')
        .select('*')
        .eq('room_id', currentRoomId)
        .order('created_at', { ascending: true })
        .limit(100);
    
    if (error) {
        container.innerHTML = '<div class="loading-messages">Error loading messages</div>';
        return;
    }
    
    container.innerHTML = '';
    for (const msg of data) await renderMessage(msg);
}

// ============ SEND MESSAGE ============
async function sendMessage(text, imageUrl = null) {
    if ((!text.trim() && !imageUrl) || !currentUser) return;
    
    const profile = await getProfile(currentUser.id);
    const avatar = profile?.avatar_url || AVATAR_DEFAULT;
    const username = profile?.username || currentUser.email.split('@')[0];
    
    const data = {
        user_id: currentUser.id,
        username: username,
        original_message: text.trim() || '',
        room_id: currentRoomId,
        image_url: imageUrl,
        avatar_url: avatar
    };
    
    const { error } = await supabaseClient.from('messages').insert([data]);
    if (error) alert('Gagal kirim: ' + error.message);
}

// ============ EDIT MESSAGE ============
async function editMessage(id, newText) {
    const { error } = await supabaseClient
        .from('messages')
        .update({ original_message: newText, edited_at: new Date() })
        .eq('id', id)
        .eq('user_id', currentUser.id);
    if (error) alert('Gagal edit: ' + error.message);
    else loadMessages();
}

// ============ DELETE MESSAGE ============
async function deleteMessage(id) {
    if (!confirm('Hapus pesan?')) return;
    const { error } = await supabaseClient
        .from('messages')
        .delete()
        .eq('id', id)
        .eq('user_id', currentUser.id);
    if (error) alert('Gagal hapus: ' + error.message);
    else loadMessages();
}

// ============ UPLOAD GAMBAR ============
async function uploadImage(file) {
    const name = `${Date.now()}.${file.name.split('.').pop()}`;
    const path = `chat-images/${name}`;
    const { error } = await supabaseClient.storage.from('chat-images').upload(path, file);
    if (error) {
        alert('Gagal upload: ' + error.message);
        return null;
    }
    const { data } = supabaseClient.storage.from('chat-images').getPublicUrl(path);
    return data.publicUrl;
}

// ============ UPLOAD AVATAR ============
async function uploadAvatar(file) {
    const name = `${currentUser.id}-${Date.now()}.${file.name.split('.').pop()}`;
    const path = `avatars/${name}`;
    const { error } = await supabaseClient.storage.from('avatars').upload(path, file);
    if (error) {
        alert('Gagal upload avatar: ' + error.message);
        return null;
    }
    const { data } = supabaseClient.storage.from('avatars').getPublicUrl(path);
    const url = data.publicUrl;
    
    await supabaseClient.auth.updateUser({ data: { avatar_url: url } });
    await supabaseClient.from('profiles').update({ avatar_url: url }).eq('id', currentUser.id);
    
    document.getElementById('current-avatar').src = url;
    return url;
}

// ============ TYPING INDICATOR ============
async function sendTyping() {
    if (!currentUser) return;
    const profile = await getProfile(currentUser.id);
    await supabaseClient.channel('typing-channel').send({
        type: 'broadcast',
        event: 'typing',
        payload: {
            user_id: currentUser.id,
            username: profile?.username || currentUser.email.split('@')[0],
            room_id: currentRoomId
        }
    });
}

function showTyping(username) {
    const el = document.getElementById('typing-indicator');
    if (el) {
        el.innerHTML = `<span>${username} mengetik...</span>`;
        el.style.display = 'flex';
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => el.style.display = 'none', 2000);
    }
}

// ============ ONLINE STATUS ============
async function updateOnlineStatus() {
    if (!currentUser) return;
    await supabaseClient
        .from('profiles')
        .update({ online: true, last_seen: new Date().toISOString() })
        .eq('id', currentUser.id);
}

async function setOffline() {
    if (!currentUser) return;
    await supabaseClient.from('profiles').update({ online: false }).eq('id', currentUser.id);
}

// ============ LOAD USER LIST ============
async function loadUserList() {
    const el = document.getElementById('user-list');
    if (!el) return;
    
    const { data: profiles, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .neq('id', currentUser?.id);
    
    if (error) return;
    
    el.innerHTML = '';
    profiles.forEach(p => {
        const div = document.createElement('div');
        div.className = 'user-item';
        div.onclick = () => {
            const roomId = [currentUser.id, p.id].sort().join('_');
            currentRoomId = `private_${roomId}`;
            document.getElementById('chat-room-name').innerText = `Chat with ${p.username}`;
            loadMessages();
        };
        div.innerHTML = `
            <img class="user-avatar-small" src="${p.avatar_url || AVATAR_DEFAULT}" onerror="this.src='${AVATAR_DEFAULT}'">
            <div class="user-info-sidebar">
                <div class="user-name">${escapeHtml(p.username)}</div>
                <div class="user-status ${p.online ? 'online' : 'offline'}">${p.online ? 'Online' : 'Offline'}</div>
            </div>
        `;
        el.appendChild(div);
    });
}

// ============ REALTIME ============
function setupRealtime() {
    if (messagesSubscription) messagesSubscription.unsubscribe();
    if (typingSubscription) typingSubscription.unsubscribe();
    
    messagesSubscription = supabaseClient
        .channel('messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
            if (payload.new.user_id !== currentUser?.id && payload.new.room_id === currentRoomId) playNotificationSound();
            if (payload.new.room_id === currentRoomId) await renderMessage(payload.new);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => loadMessages())
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, () => loadMessages())
        .subscribe();
    
    typingSubscription = supabaseClient
        .channel('typing')
        .on('broadcast', { event: 'typing' }, (p) => {
            if (p.payload.user_id !== currentUser?.id && p.payload.room_id === currentRoomId) {
                showTyping(p.payload.username);
            }
        })
        .subscribe();
}

// ============ AUTH ============
async function handleLogin(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        alert('Login gagal: ' + error.message);
        return false;
    }
    
    currentUser = data.user;
    const profile = await getProfile(currentUser.id);
    currentUserLanguage = profile?.preferred_language || 'id';
    
    document.getElementById('user-language').value = currentUserLanguage;
    document.getElementById('current-username').innerText = profile?.username || currentUser.email.split('@')[0];
    document.getElementById('current-avatar').src = profile?.avatar_url || AVATAR_DEFAULT;
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
    
    await loadUserList();
    await loadMessages();
    setupRealtime();
    updateOnlineStatus();
    onlineStatusInterval = setInterval(updateOnlineStatus, 30000);
    return true;
}

async function handleRegister(username, email, password, language, avatarFile) {
    let avatarUrl = AVATAR_DEFAULT;
    
    if (avatarFile) {
        const name = `${Date.now()}.${avatarFile.name.split('.').pop()}`;
        const path = `avatars/${name}`;
        const { error } = await supabaseClient.storage.from('avatars').upload(path, avatarFile);
        if (!error) {
            const { data } = supabaseClient.storage.from('avatars').getPublicUrl(path);
            avatarUrl = data.publicUrl;
        }
    }
    
    const { error } = await supabaseClient.auth.signUp({
        email, password,
        options: {
            data: {
                display_name: username,
                preferred_language: language,
                avatar_url: avatarUrl
            }
        }
    });
    
    if (error) {
        alert('Registrasi gagal: ' + error.message);
        return false;
    }
    
    alert('Registrasi berhasil! Silakan login.');
    return true;
}

async function handleLogout() {
    await setOffline();
    await supabaseClient.auth.signOut();
    if (onlineStatusInterval) clearInterval(onlineStatusInterval);
    if (messagesSubscription) messagesSubscription.unsubscribe();
    if (typingSubscription) typingSubscription.unsubscribe();
    currentUser = null;
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('chat-container').style.display = 'none';
}

// ============ EMOJI PICKER ============
function createEmojiPicker() {
    const picker = document.createElement('div');
    picker.id = 'emoji-picker';
    picker.className = 'emoji-picker';
    const emojis = ['😀','😂','😍','🥰','😊','❤️','👍','🔥','🎉','😭','😱','🤔','🙏','💪','👋','😎','🥺','😡','🤣','😘'];
    emojis.forEach(e => {
        const span = document.createElement('span');
        span.className = 'emoji-item';
        span.textContent = e;
        span.onclick = () => {
            const input = document.getElementById('message-input');
            input.value += e;
            picker.classList.remove('active');
        };
        picker.appendChild(span);
    });
    document.querySelector('.message-input-container').appendChild(picker);
    return picker;
}

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', () => {
    // Tab
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('login-form').classList.toggle('active', btn.dataset.tab === 'login');
            document.getElementById('register-form').classList.toggle('active', btn.dataset.tab === 'register');
        });
    });
    
    // Login
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleLogin(
            document.getElementById('login-email').value,
            document.getElementById('login-password').value
        );
    });
    
    // Register
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pass = document.getElementById('register-password').value;
        if (pass.length < 6) return alert('Password minimal 6 karakter');
        await handleRegister(
            document.getElementById('register-username').value,
            document.getElementById('register-email').value,
            pass,
            document.getElementById('register-language').value,
            document.getElementById('register-avatar').files[0]
        );
    });
    
    // Send
    document.getElementById('send-btn').addEventListener('click', async () => {
        const input = document.getElementById('message-input');
        await sendMessage(input.value);
        input.value = '';
    });
    
    // Typing
    let timer;
    document.getElementById('message-input').addEventListener('input', () => {
        clearTimeout(timer);
        sendTyping();
        timer = setTimeout(() => {}, 1000);
    });
    
    document.getElementById('message-input').addEventListener('keypress', async (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const input = document.getElementById('message-input');
            await sendMessage(input.value);
            input.value = '';
        }
    });
    
    // Logout
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // Language
    document.getElementById('user-language').addEventListener('change', async (e) => {
        currentUserLanguage = e.target.value;
        if (currentUser) {
            await supabaseClient.from('profiles').update({ preferred_language: currentUserLanguage }).eq('id', currentUser.id);
            loadMessages();
        }
    });
    
    // Image upload
    document.getElementById('attach-btn').addEventListener('click', () => document.getElementById('image-upload').click());
    document.getElementById('image-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = await uploadImage(file);
            if (url) await sendMessage('', url);
        }
        e.target.value = '';
    });
    
    // Avatar upload
    document.getElementById('change-avatar-btn').addEventListener('click', () => document.getElementById('avatar-upload').click());
    document.getElementById('avatar-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) await uploadAvatar(file);
        e.target.value = '';
    });
    
    // Emoji
    document.getElementById('emoji-btn').addEventListener('click', () => {
        const picker = document.getElementById('emoji-picker') || createEmojiPicker();
        picker.classList.toggle('active');
    });
    
    // Edit/Delete
    document.getElementById('messages-container').addEventListener('click', async (e) => {
        const edit = e.target.closest('.edit-msg');
        const del = e.target.closest('.delete-msg');
        if (edit) {
            const id = edit.dataset.id;
            const newText = prompt('Edit pesan:');
            if (newText) await editMessage(id, newText);
        }
        if (del) {
            const id = del.dataset.id;
            await deleteMessage(id);
        }
    });
    
    // Public chat
    document.getElementById('new-chat-btn').addEventListener('click', () => {
        currentRoomId = 'public';
        document.getElementById('chat-room-name').innerText = 'Public Chat';
        loadMessages();
    });
    
    // Check session
    supabaseClient.auth.getSession().then(async ({ data: { session } }) => {
        if (session) {
            currentUser = session.user;
            const profile = await getProfile(currentUser.id);
            currentUserLanguage = profile?.preferred_language || 'id';
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('chat-container').style.display = 'flex';
            document.getElementById('current-username').innerText = profile?.username || currentUser.email.split('@')[0];
            document.getElementById('current-avatar').src = profile?.avatar_url || AVATAR_DEFAULT;
            document.getElementById('user-language').value = currentUserLanguage;
            await loadUserList();
            await loadMessages();
            setupRealtime();
            updateOnlineStatus();
            onlineStatusInterval = setInterval(updateOnlineStatus, 30000);
        }
    });
});