// ============ KONFIGURASI SUPABASE ============
const SUPABASE_URL = 'https://gqlxktuqmtgpixmbcefp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxbHhrdHVxbXRncGl4bWJjZWZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1OTk2MTksImV4cCI6MjA5MDE3NTYxOX0.SEbaQaYFRIMhrTGK--XY-YEHG5v5LUdU6__gv8Qi8rE';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentUserLanguage = 'id';
let currentRoomId = 'public';
let typingTimeout = null;
let messagesSubscription = null;
let onlineStatusInterval = null;

// ============ FUNGSI BANTUAN ============
function detectLanguage(text) {
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text)) return 'ja';
    if (/^[a-zA-Z\s\.,!?0-9]+$/.test(text)) return 'en';
    return 'id';
}

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
    if (audio) audio.play().catch(e => console.log('Audio play failed'));
}

// ============ AMBIL PROFIL USER ============
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
    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return;
    
    const isOwnMessage = message.user_id === currentUser?.id;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwnMessage ? 'message-own' : 'message-other'}`;
    messageDiv.setAttribute('data-message-id', message.id);
    
    let displayText = message.original_message;
    let showOriginal = false;
    
    if (!isOwnMessage) {
        const translated = await translateText(message.original_message, currentUserLanguage);
        if (translated !== message.original_message) {
            displayText = translated;
            showOriginal = true;
        }
    }
    
    const avatarUrl = message.avatar_url || 'https://ui-avatars.com/api/?background=667eea&color=fff&size=40';
    
    messageDiv.innerHTML = `
        <img class="message-avatar" src="${avatarUrl}" alt="avatar" onerror="this.src='https://ui-avatars.com/api/?background=667eea&color=fff&size=40'">
        <div class="message-content-wrapper">
            <div class="message-bubble">
                <div class="message-header">
                    <span class="username">${escapeHtml(message.username)}</span>
                    <span class="time">${formatTime(message.created_at)}</span>
                </div>
                <div class="message-content">${escapeHtml(displayText)}</div>
                ${message.image_url ? `<img class="message-image" src="${message.image_url}" alt="image">` : ''}
                ${showOriginal ? `<div class="original-message">📝 ${escapeHtml(message.original_message)}</div>` : ''}
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ============ LOAD MESSAGES ============
async function loadMessages() {
    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return;
    
    messagesContainer.innerHTML = '<div class="loading-messages">Loading messages...</div>';
    
    const { data: messages, error } = await supabaseClient
        .from('messages')
        .select('*')
        .eq('room_id', currentRoomId)
        .order('created_at', { ascending: true })
        .limit(100);
    
    if (error) {
        messagesContainer.innerHTML = '<div class="loading-messages">Error loading messages</div>';
        return;
    }
    
    messagesContainer.innerHTML = '';
    for (const message of messages) {
        await renderMessage(message);
    }
}

// ============ SEND MESSAGE ============
async function sendMessage(messageText, imageUrl = null) {
    if ((!messageText.trim() && !imageUrl) || !currentUser) return;
    
    const profile = await getProfile(currentUser.id);
    
    const messageData = {
        user_id: currentUser.id,
        username: profile?.username || currentUser.email.split('@')[0],
        original_message: messageText.trim() || '',
        room_id: currentRoomId,
        image_url: imageUrl,
        avatar_url: profile?.avatar_url || 'https://ui-avatars.com/api/?background=667eea&color=fff&size=40'
    };
    
    const { error } = await supabaseClient.from('messages').insert([messageData]);
    if (error) alert('Gagal mengirim pesan: ' + error.message);
}

// ============ UPLOAD GAMBAR ============
async function uploadImage(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `chat-images/${fileName}`;
    
    const { error } = await supabaseClient.storage
        .from('chat-images')
        .upload(filePath, file);
    
    if (error) {
        alert('Gagal upload: ' + error.message);
        return null;
    }
    
    const { data } = supabaseClient.storage.from('chat-images').getPublicUrl(filePath);
    return data.publicUrl;
}

// ============ LOAD USER LIST (DARI PROFILES) ============
async function loadUserList() {
    const userList = document.getElementById('user-list');
    if (!userList) return;
    
    const { data: profiles, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .neq('id', currentUser?.id);
    
    if (error) {
        console.error('Error:', error);
        return;
    }
    
    userList.innerHTML = '';
    profiles.forEach(profile => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        userDiv.onclick = () => {
            currentRoomId = `private_${[currentUser.id, profile.id].sort().join('_')}`;
            document.getElementById('chat-room-name').innerText = `Chat with ${profile.username}`;
            loadMessages();
        };
        userDiv.innerHTML = `
            <img class="user-avatar-small" src="${profile.avatar_url}" alt="avatar" onerror="this.src='https://ui-avatars.com/api/?background=667eea&color=fff&size=40'">
            <div class="user-info-sidebar">
                <div class="user-name">${escapeHtml(profile.username)}</div>
                <div class="user-status ${profile.online ? 'online' : 'offline'}">${profile.online ? 'Online' : 'Offline'}</div>
            </div>
        `;
        userList.appendChild(userDiv);
    });
}

// ============ UPDATE ONLINE STATUS ============
async function updateOnlineStatus() {
    if (!currentUser) return;
    await supabaseClient
        .from('profiles')
        .update({ online: true, last_seen: new Date().toISOString() })
        .eq('id', currentUser.id);
}

// ============ REALTIME SUBSCRIPTION ============
function setupRealtimeSubscription() {
    if (messagesSubscription) messagesSubscription.unsubscribe();
    
    messagesSubscription = supabaseClient
        .channel('messages-channel')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'messages' },
            async (payload) => {
                if (payload.new.user_id !== currentUser?.id && payload.new.room_id === currentRoomId) {
                    playNotificationSound();
                }
                if (payload.new.room_id === currentRoomId) {
                    await renderMessage(payload.new);
                }
            }
        )
        .subscribe();
}

// ============ AUTH FUNCTIONS ============
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
    document.getElementById('current-username').textContent = profile?.username || currentUser.email.split('@')[0];
    document.getElementById('current-avatar').src = profile?.avatar_url || 'https://ui-avatars.com/api/?background=667eea&color=fff&size=40';
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
    
    await loadUserList();
    await loadMessages();
    setupRealtimeSubscription();
    updateOnlineStatus();
    setInterval(updateOnlineStatus, 30000);
    return true;
}

async function handleRegister(username, email, password, language, avatarFile) {
    let avatarUrl = 'https://ui-avatars.com/api/?background=667eea&color=fff&size=40';
    
    if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `avatars/${fileName}`;
        
        const { error } = await supabaseClient.storage
            .from('avatars')
            .upload(filePath, avatarFile);
        
        if (!error) {
            const { data } = supabaseClient.storage.from('avatars').getPublicUrl(filePath);
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
    await supabaseClient
        .from('profiles')
        .update({ online: false })
        .eq('id', currentUser.id);
    
    await supabaseClient.auth.signOut();
    currentUser = null;
    if (messagesSubscription) messagesSubscription.unsubscribe();
    
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('chat-container').style.display = 'none';
}

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
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
        const password = document.getElementById('register-password').value;
        if (password.length < 6) {
            alert('Password minimal 6 karakter');
            return;
        }
        await handleRegister(
            document.getElementById('register-username').value,
            document.getElementById('register-email').value,
            password,
            document.getElementById('register-language').value,
            document.getElementById('register-avatar').files[0]
        );
    });
    
    // Send message
    document.getElementById('send-btn').addEventListener('click', async () => {
        const input = document.getElementById('message-input');
        await sendMessage(input.value);
        input.value = '';
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
    
    // Language change
    document.getElementById('user-language').addEventListener('change', async (e) => {
        currentUserLanguage = e.target.value;
        if (currentUser) {
            await supabaseClient
                .from('profiles')
                .update({ preferred_language: currentUserLanguage })
                .eq('id', currentUser.id);
            loadMessages();
        }
    });
    
    // Upload image
    document.getElementById('attach-btn').addEventListener('click', () => {
        document.getElementById('image-upload').click();
    });
    
    document.getElementById('image-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const imageUrl = await uploadImage(file);
            if (imageUrl) await sendMessage('', imageUrl);
        }
        e.target.value = '';
    });
    
    // Back to public chat
    document.getElementById('new-chat-btn').addEventListener('click', () => {
        currentRoomId = 'public';
        document.getElementById('chat-room-name').innerText = 'Public Chat';
        loadMessages();
    });
    
    // Check existing session
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            handleLogin(session.user.email, '');
        }
    });
});