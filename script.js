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
let emojiPickerActive = false;

// PLACEHOLDER AVATAR
const DEFAULT_AVATAR = 'https://ui-avatars.com/api/?background=667eea&color=fff&bold=true&size=40';

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

// ============ FUNGSI BANTUAN ============
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function playNotificationSound() {
    const audio = document.getElementById('notification-sound');
    if (audio) {
        audio.play().catch(e => console.log('Audio play failed:', e));
    }
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
    
    const avatarUrl = message.avatar_url || DEFAULT_AVATAR;
    
    messageDiv.innerHTML = `
        <img class="message-avatar" src="${avatarUrl}" alt="avatar" onerror="this.src='${DEFAULT_AVATAR}'">
        <div class="message-content-wrapper">
            <div class="message-bubble">
                <div class="message-header">
                    <span class="username">${escapeHtml(message.username)}</span>
                    <span class="time">${formatTime(message.created_at)}</span>
                    ${!isOwnMessage ? '' : `
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
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    if (!isOwnMessage) {
        await markMessageAsRead(message.id);
    }
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
    
    const messageData = {
        user_id: currentUser.id,
        username: currentUser.user_metadata?.display_name || currentUser.email.split('@')[0],
        original_message: messageText.trim() || '',
        room_id: currentRoomId,
        image_url: imageUrl,
        avatar_url: currentUser.user_metadata?.avatar_url || DEFAULT_AVATAR
    };
    
    const { error } = await supabaseClient.from('messages').insert([messageData]);
    if (error) alert('Gagal mengirim pesan: ' + error.message);
}

// ============ EDIT MESSAGE ============
async function editMessage(messageId, newText) {
    const { error } = await supabaseClient
        .from('messages')
        .update({ original_message: newText, edited_at: new Date() })
        .eq('id', messageId)
        .eq('user_id', currentUser.id);
    
    if (error) alert('Gagal edit pesan: ' + error.message);
    else loadMessages();
}

// ============ DELETE MESSAGE ============
async function deleteMessage(messageId) {
    if (!confirm('Hapus pesan ini?')) return;
    const { error } = await supabaseClient
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('user_id', currentUser.id);
    
    if (error) alert('Gagal hapus pesan: ' + error.message);
    else loadMessages();
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
        alert('Gagal upload gambar: ' + error.message);
        return null;
    }
    
    const { data } = supabaseClient.storage
        .from('chat-images')
        .getPublicUrl(filePath);
    
    return data.publicUrl;
}

// ============ UPLOAD AVATAR ============
async function uploadAvatar(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;
    
    const { error } = await supabaseClient.storage
        .from('avatars')
        .upload(filePath, file);
    
    if (error) {
        alert('Gagal upload avatar: ' + error.message);
        return null;
    }
    
    const { data } = supabaseClient.storage
        .from('avatars')
        .getPublicUrl(filePath);
    
    const avatarUrl = data.publicUrl;
    
    // Update di auth user metadata
    await supabaseClient.auth.updateUser({
        data: { avatar_url: avatarUrl }
    });
    
    // Update di tabel profiles
    await supabaseClient
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', currentUser.id);
    
    document.getElementById('current-avatar').src = avatarUrl;
    return avatarUrl;
}

// ============ TYPING INDICATOR ============
async function sendTypingIndicator() {
    if (!currentUser) return;
    
    await supabaseClient
        .channel('typing-channel')
        .send({
            type: 'broadcast',
            event: 'typing',
            payload: {
                user_id: currentUser.id,
                username: currentUser.user_metadata?.display_name,
                room_id: currentRoomId,
                is_typing: true
            }
        });
}

function showTypingIndicator(username) {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.innerHTML = `<span>${username} sedang mengetik...</span>`;
        indicator.style.display = 'flex';
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            indicator.style.display = 'none';
        }, 2000);
    }
}

// ============ ONLINE STATUS (Pakai tabel profiles) ============
async function updateOnlineStatus() {
    if (!currentUser) return;
    await supabaseClient
        .from('profiles')
        .update({ 
            online: true, 
            last_seen: new Date().toISOString() 
        })
        .eq('id', currentUser.id);
}

async function setUserOffline() {
    if (!currentUser) return;
    await supabaseClient
        .from('profiles')
        .update({ online: false })
        .eq('id', currentUser.id);
}

function startOnlineStatusTracking() {
    updateOnlineStatus();
    onlineStatusInterval = setInterval(updateOnlineStatus, 30000);
}

// ============ PRIVATE CHAT ============
async function startPrivateChat(targetUserId) {
    const roomId = [currentUser.id, targetUserId].sort().join('_');
    currentRoomId = `private_${roomId}`;
    document.getElementById('chat-room-name').innerText = 'Private Chat';
    await loadMessages();
}

// ============ LOAD USER LIST (Dari tabel profiles) ============
async function loadUserList() {
    const userList = document.getElementById('user-list');
    if (!userList) return;
    
    const { data: profiles, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .neq('id', currentUser?.id);
    
    if (error) {
        console.error('Error loading users:', error);
        return;
    }
    
    userList.innerHTML = '';
    profiles.forEach(profile => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        userDiv.onclick = () => startPrivateChat(profile.id);
        userDiv.innerHTML = `
            <img class="user-avatar-small" src="${profile.avatar_url || DEFAULT_AVATAR}" alt="avatar" onerror="this.src='${DEFAULT_AVATAR}'">
            <div class="user-info-sidebar">
                <div class="user-name">${escapeHtml(profile.username)}</div>
                <div class="user-status ${profile.online ? 'online' : 'offline'}">${profile.online ? 'Online' : 'Offline'}</div>
            </div>
        `;
        userList.appendChild(userDiv);
    });
}

// ============ REALTIME SUBSCRIPTIONS ============
function setupRealtimeSubscriptions() {
    if (messagesSubscription) messagesSubscription.unsubscribe();
    if (typingSubscription) typingSubscription.unsubscribe();
    
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
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'messages' },
            () => loadMessages()
        )
        .on('postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'messages' },
            () => loadMessages()
        )
        .subscribe();
    
    typingSubscription = supabaseClient
        .channel('typing-channel')
        .on('broadcast', { event: 'typing' }, (payload) => {
            if (payload.payload.user_id !== currentUser?.id && payload.payload.room_id === currentRoomId) {
                showTypingIndicator(payload.payload.username);
            }
        })
        .subscribe();
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

// ============ AUTH FUNCTIONS ============
async function handleLogin(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        alert('Login gagal: ' + error.message);
        return false;
    }
    
    currentUser = data.user;
    const profile = await getProfile(currentUser.id);
    currentUserLanguage = profile?.preferred_language || currentUser.user_metadata?.preferred_language || 'id';
    
    document.getElementById('user-language').value = currentUserLanguage;
    document.getElementById('current-username').textContent = profile?.username || currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
    document.getElementById('current-avatar').src = profile?.avatar_url || currentUser.user_metadata?.avatar_url || DEFAULT_AVATAR;
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
    
    await loadUserList();
    await loadMessages();
    setupRealtimeSubscriptions();
    startOnlineStatusTracking();
    return true;
}

async function handleRegister(username, email, password, language, avatarFile) {
    let avatarUrl = DEFAULT_AVATAR;
    
    if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `avatars/${fileName}`;
        
        const { error: uploadError } = await supabaseClient.storage
            .from('avatars')
            .upload(filePath, avatarFile);
        
        if (!uploadError) {
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
    await setUserOffline();
    await supabaseClient.auth.signOut();
    if (onlineStatusInterval) clearInterval(onlineStatusInterval);
    if (messagesSubscription) messagesSubscription.unsubscribe();
    if (typingSubscription) typingSubscription.unsubscribe();
    currentUser = null;
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('chat-container').style.display = 'none';
}

// ============ CREATE EMOJI PICKER ============
function createEmojiPicker() {
    const picker = document.createElement('div');
    picker.id = 'emoji-picker';
    picker.className = 'emoji-picker';
    const emojis = ['😀', '😂', '😍', '🥰', '😊', '❤️', '👍', '🔥', '🎉', '😭', '😱', '🤔', '🙏', '💪', '👋', '😎', '🥺', '😡', '🤣', '😘'];
    emojis.forEach(emoji => {
        const span = document.createElement('span');
        span.className = 'emoji-item';
        span.textContent = emoji;
        span.onclick = () => {
            const input = document.getElementById('message-input');
            input.value += emoji;
            picker.classList.remove('active');
        };
        picker.appendChild(span);
    });
    document.querySelector('.message-input-container').appendChild(picker);
    return picker;
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
    
    // Register with avatar
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
    
    // Typing indicator
    let typingTimer;
    document.getElementById('message-input').addEventListener('input', () => {
        clearTimeout(typingTimer);
        sendTypingIndicator();
        typingTimer = setTimeout(() => {}, 1000);
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
            await supabaseClient.auth.updateUser({ data: { preferred_language: currentUserLanguage } });
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
    
    // Change avatar
    document.getElementById('change-avatar-btn').addEventListener('click', () => {
        document.getElementById('avatar-upload').click();
    });
    
    document.getElementById('avatar-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) await uploadAvatar(file);
        e.target.value = '';
    });
    
    // Emoji picker
    document.getElementById('emoji-btn').addEventListener('click', () => {
        const picker = document.getElementById('emoji-picker') || createEmojiPicker();
        picker.classList.toggle('active');
    });
    
    // Edit/Delete via event delegation
    document.getElementById('messages-container').addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-msg');
        const deleteBtn = e.target.closest('.delete-msg');
        
        if (editBtn) {
            const messageId = editBtn.dataset.id;
            const newText = prompt('Edit pesan:');
            if (newText) await editMessage(messageId, newText);
        }
        
        if (deleteBtn) {
            const messageId = deleteBtn.dataset.id;
            await deleteMessage(messageId);
        }
    });
    
    // New public chat
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
            currentUserLanguage = profile?.preferred_language || currentUser.user_metadata?.preferred_language || 'id';
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('chat-container').style.display = 'flex';
            document.getElementById('current-username').textContent = profile?.username || currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
            document.getElementById('current-avatar').src = profile?.avatar_url || currentUser.user_metadata?.avatar_url || DEFAULT_AVATAR;
            document.getElementById('user-language').value = currentUserLanguage;
            await loadUserList();
            await loadMessages();
            setupRealtimeSubscriptions();
            startOnlineStatusTracking();
        }
    });
});