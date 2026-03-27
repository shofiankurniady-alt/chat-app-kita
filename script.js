// ============ KONFIGURASI SUPABASE ============
const SUPABASE_URL = 'https://gqlxktuqmtgpixmbcefp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxbHhrdHVxbXRncGl4bWJjZWZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1OTk2MTksImV4cCI6MjA5MDE3NTYxOX0.SEbaQaYFRIMhrTGK--XY-YEHG5v5LUdU6__gv8Qi8rE';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentUserLanguage = 'id';
let soundEnabled = true;
let activeAction = null;
let typingTimeout = null;
let currentReplyTo = null; // Untuk menyimpan pesan yang akan di-reply

// ============ SELECT MODE VARIABLES ============
let selectMode = false;
let selectedMessages = new Set();

// ============ NOTIFIKASI SUARA ============
function playNotificationSound() {
    if (!soundEnabled) return;
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance('新しいメッセージがあります');
        utterance.lang = 'ja-JP';
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const japaneseVoice = voices.find(voice => voice.lang.includes('ja'));
        if (japaneseVoice) utterance.voice = japaneseVoice;
        window.speechSynthesis.speak(utterance);
    }
}

function showNotificationToast(message) {
    const oldToast = document.querySelector('.notification-toast');
    if (oldToast) oldToast.remove();
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.innerHTML = `<i class="fas fa-bell" style="margin-right: 10px; color: #3b82f6;"></i><span>📩 ${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ============ FUNGSI TERJEMAHAN ============
async function translateText(text, targetLang) {
    if (!text || !targetLang || targetLang === 'id') return text;
    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=id|${targetLang}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.responseData && data.responseData.translatedText) return data.responseData.translatedText;
        return text;
    } catch (error) { return text; }
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ EMOJI PICKER ============
function createEmojiPicker() {
    const emojis = ['😀', '😂', '😍', '🥰', '😊', '❤️', '👍', '🔥', '🎉', '😭', '😱', '🤔', '🙏', '💪', '👋', '😎', '🥺', '😡', '🤣', '😘'];
    const container = document.getElementById('emoji-picker-container');
    if (!container) return;
    const list = container.querySelector('.emoji-list');
    if (!list) return;
    list.innerHTML = '';
    emojis.forEach(emoji => {
        const span = document.createElement('span');
        span.className = 'emoji-item';
        span.textContent = emoji;
        span.onclick = () => {
            const input = document.getElementById('message-input');
            if (input) input.value += emoji;
            container.style.display = 'none';
        };
        list.appendChild(span);
    });
}

// ============ SCROLL TO BOTTOM ============
function scrollToBottom() {
    const container = document.getElementById('messages-container');
    if (container) container.scrollTop = container.scrollHeight;
}

// ============ UPDATE READ RECEIPT ============
async function markMessageAsRead(messageId) {
    if (!currentUser) return;
    await supabaseClient
        .from('messages')
        .update({ is_read: true })
        .eq('id', messageId)
        .neq('user_id', currentUser.id);
}

// ============ RENDER MESSAGE (DENGAN REPLY & READ RECEIPT) ============
async function renderMessage(message) {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    const isOwn = message.user_id === currentUser?.id;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'message-own' : 'message-other'}`;
    messageDiv.setAttribute('data-message-id', message.id);
    
    let displayText = message.original_message;
    let showOriginal = false;
    
    if (!isOwn && currentUserLanguage !== 'id') {
        const translated = await translateText(message.original_message, currentUserLanguage);
        if (translated !== message.original_message) {
            displayText = translated;
            showOriginal = true;
        }
    }
    
    // Render reply jika ada
    let replyHtml = '';
    if (message.reply_to_message) {
        const replyData = typeof message.reply_to_message === 'string' ? JSON.parse(message.reply_to_message) : message.reply_to_message;
        replyHtml = `
            <div class="replied-message">
                <span class="replied-sender">↩️ ${escapeHtml(replyData.sender || 'Pesan')}</span>
                <div>${escapeHtml(replyData.text.substring(0, 100))}${replyData.text.length > 100 ? '...' : ''}</div>
            </div>
        `;
    }
    
    const readReceiptHtml = isOwn ? `
        <div class="read-receipt">
            ${message.is_read ? '<i class="fas fa-check-double"></i>' : '<i class="fas fa-check"></i>'}
        </div>
    ` : '';
    
    messageDiv.innerHTML = `
        <div class="message-bubble">
            <div class="message-header">
                <span class="username">${escapeHtml(message.username)}</span>
                <span class="time">${formatTime(message.created_at)}</span>
                ${readReceiptHtml}
                <button class="reply-btn" data-id="${message.id}" data-username="${escapeHtml(message.username)}" data-text="${escapeHtml(displayText.substring(0, 50))}">
                    <i class="fas fa-reply"></i>
                </button>
            </div>
            ${replyHtml}
            <div class="message-content">${escapeHtml(displayText)}</div>
            ${showOriginal ? `<div class="original-message">📝 ${escapeHtml(message.original_message)}</div>` : ''}
        </div>
    `;
    
    // Event untuk reply button
    const replyBtn = messageDiv.querySelector('.reply-btn');
    if (replyBtn) {
        replyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentReplyTo = {
                id: message.id,
                username: message.username,
                text: message.original_message.substring(0, 100)
            };
            showReplyPreview();
        });
    }
    
    // Event click untuk select mode
    messageDiv.addEventListener('click', (e) => {
        if (selectMode && !e.target.closest('.reply-btn')) {
            toggleMessageSelection(message.id, messageDiv);
        }
    });
    
    container.appendChild(messageDiv);
    scrollToBottom();
    
    // Mark as read jika pesan dari orang lain
    if (!isOwn) {
        await markMessageAsRead(message.id);
    }
}

function showReplyPreview() {
    const previewDiv = document.getElementById('reply-preview');
    const previewText = document.getElementById('reply-preview-text');
    if (previewDiv && previewText && currentReplyTo) {
        previewText.innerHTML = `<i class="fas fa-reply"></i> Membalas ${escapeHtml(currentReplyTo.username)}: ${escapeHtml(currentReplyTo.text)}`;
        previewDiv.style.display = 'block';
    }
}

function cancelReply() {
    currentReplyTo = null;
    const previewDiv = document.getElementById('reply-preview');
    if (previewDiv) previewDiv.style.display = 'none';
}

// ============ SEND MESSAGE (DENGAN REPLY) ============
async function sendMessage(messageText) {
    if (!messageText.trim() || !currentUser) return;
    
    const latestUsername = currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
    
    const messageData = {
        user_id: currentUser.id,
        username: latestUsername,
        original_message: messageText.trim(),
        is_delivered: true
    };
    
    // Tambah data reply jika ada
    if (currentReplyTo) {
        messageData.reply_to_id = currentReplyTo.id;
        messageData.reply_to_message = JSON.stringify({
            id: currentReplyTo.id,
            sender: currentReplyTo.username,
            text: currentReplyTo.text
        });
        cancelReply();
    }
    
    const { error } = await supabaseClient.from('messages').insert([messageData]);
    if (error) alert('Gagal mengirim: ' + error.message);
}

// ============ TYPING INDICATOR ============
let typingChannel = null;

async function sendTypingIndicator() {
    if (!currentUser || !typingChannel) return;
    
    const latestUsername = currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
    
    await typingChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
            user_id: currentUser.id,
            username: latestUsername,
            is_typing: true
        }
    });
}

function showTypingIndicator(username) {
    const container = document.getElementById('typing-indicator-container');
    const userNameSpan = document.getElementById('typing-user-name');
    if (container && userNameSpan) {
        userNameSpan.textContent = username;
        container.style.display = 'flex';
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            container.style.display = 'none';
        }, 2000);
    }
}

// ============ LOAD MESSAGES ============
async function loadMessages() {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-messages">Loading messages...</div>';
    
    const { data: messages, error } = await supabaseClient
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100);
    
    if (error) {
        container.innerHTML = '<div class="loading-messages">Error loading messages</div>';
        return;
    }
    
    container.innerHTML = '';
    for (const message of messages) {
        await renderMessage(message);
    }
    scrollToBottom();
}

// ============ UPDATE ALL MESSAGES USERNAME ============
async function updateAllMessagesUsername() {
    if (!currentUser) return;
    const newUsername = currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
    await supabaseClient
        .from('messages')
        .update({ username: newUsername })
        .eq('user_id', currentUser.id);
    loadMessages();
}

// ============ SELECT MODE FUNCTIONS ============
function exitSelectMode() {
    selectMode = false;
    selectedMessages.clear();
    activeAction = null;
    const header = document.getElementById('select-mode-header');
    if (header) header.remove();
    document.querySelectorAll('.message').forEach(msg => {
        msg.classList.remove('select-mode', 'selected');
        msg.style.cursor = '';
    });
}

function toggleMessageSelection(messageId, element) {
    if (!selectMode) return;
    if (selectedMessages.has(messageId)) {
        selectedMessages.delete(messageId);
        element.classList.remove('selected');
    } else {
        selectedMessages.add(messageId);
        element.classList.add('selected');
    }
    document.getElementById('selected-count').textContent = selectedMessages.size;
    document.getElementById('revoke-selected-count').textContent = selectedMessages.size;
}

async function deleteSelectedMessages() {
    if (selectedMessages.size === 0) return alert('Tidak ada pesan yang dipilih');
    const messageIds = Array.from(selectedMessages);
    const { error } = await supabaseClient.from('messages').delete().in('id', messageIds).eq('user_id', currentUser.id);
    if (error) alert('Gagal menghapus: ' + error.message);
    else { exitSelectMode(); loadMessages(); }
}

async function revokeSelectedMessages() {
    if (selectedMessages.size === 0) return alert('撤回するメッセージがありません');
    const messageIds = Array.from(selectedMessages);
    const { error } = await supabaseClient.from('messages').delete().in('id', messageIds).eq('user_id', currentUser.id);
    if (error) alert('撤回に失敗しました: ' + error.message);
    else { exitSelectMode(); loadMessages(); }
}

function startSelectMode(action) {
    selectMode = true;
    selectedMessages.clear();
    activeAction = action;
    
    const header = document.createElement('div');
    header.id = 'select-mode-header';
    header.className = 'select-mode-header';
    header.innerHTML = `
        <span><i class="fas fa-check-circle"></i> Klik pesan untuk memilih</span>
        <div>
            <button id="done-select-mode" style="background: #10b981; padding: 6px 16px; border-radius: 20px; border: none; color: white; cursor: pointer;">Selesai</button>
            <button id="close-select-mode" style="background: none; border: none; color: white; font-size: 18px; cursor: pointer;"><i class="fas fa-times"></i></button>
        </div>
    `;
    document.getElementById('messages-container')?.prepend(header);
    
    document.querySelectorAll('.message').forEach(msg => {
        msg.classList.add('select-mode');
        msg.style.cursor = 'pointer';
    });
    
    document.getElementById('close-select-mode')?.addEventListener('click', exitSelectMode);
    document.getElementById('done-select-mode')?.addEventListener('click', () => {
        if (selectedMessages.size > 0) {
            document.getElementById(activeAction === 'delete' ? 'delete-modal' : 'revoke-modal').style.display = 'flex';
        } else alert(activeAction === 'delete' ? 'Pilih pesan' : 'メッセージを選択してください');
    });
}

// ============ REALTIME SUBSCRIPTION ============
let messagesSubscription = null;

function setupRealtimeSubscriptions() {
    if (messagesSubscription) messagesSubscription.unsubscribe();
    
    messagesSubscription = supabaseClient
        .channel('messages-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
            if (payload.new.user_id !== currentUser?.id) {
                playNotificationSound();
                showNotificationToast(`Pesan baru dari ${payload.new.username}`);
            }
            await renderMessage(payload.new);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => loadMessages())
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, () => loadMessages())
        .subscribe();
    
    // Typing channel
    if (typingChannel) typingChannel.unsubscribe();
    typingChannel = supabaseClient.channel('typing-channel');
    typingChannel
        .on('broadcast', { event: 'typing' }, (payload) => {
            if (payload.payload.user_id !== currentUser?.id) {
                showTypingIndicator(payload.payload.username);
            }
        })
        .subscribe();
}

// ============ EDIT PROFIL ============
const editProfileModal = document.getElementById('edit-profile-modal');
const editUsernameInput = document.getElementById('edit-username');
const saveProfileBtn = document.getElementById('save-profile-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const editProfileMessage = document.getElementById('edit-profile-message');

function openEditProfileModal() {
    if (!currentUser) return;
    editUsernameInput.value = currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
    editProfileMessage.textContent = '';
    editProfileModal.style.display = 'flex';
}

async function saveProfileChanges() {
    const newUsername = editUsernameInput?.value.trim();
    if (!newUsername) return editProfileMessage.textContent = 'Username tidak boleh kosong';
    if (newUsername.length < 3) return editProfileMessage.textContent = 'Username minimal 3 karakter';
    
    const { error } = await supabaseClient.auth.updateUser({ data: { display_name: newUsername } });
    if (error) return editProfileMessage.textContent = 'Gagal: ' + error.message;
    
    document.getElementById('current-username').textContent = newUsername;
    await updateAllMessagesUsername();
    editProfileMessage.textContent = '✅ Berhasil!';
    editProfileMessage.style.color = '#10b981';
    setTimeout(() => editProfileModal.style.display = 'none', 1500);
}

function closeEditProfileModal() {
    editProfileModal.style.display = 'none';
    editProfileMessage.textContent = '';
}

// ============ AUTH FUNCTIONS ============
async function handleLogin(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return alert('Login gagal: ' + error.message);
    
    currentUser = data.user;
    currentUserLanguage = currentUser.user_metadata?.preferred_language || 'id';
    document.getElementById('user-language').value = currentUserLanguage;
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
    document.getElementById('current-username').textContent = currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
    
    await loadMessages();
    await updateAllMessagesUsername();
    setupRealtimeSubscriptions();
    return true;
}

async function handleRegister(username, email, password, language) {
    const { error } = await supabaseClient.auth.signUp({
        email, password,
        options: { data: { display_name: username, preferred_language: language } }
    });
    if (error) return alert('Registrasi gagal: ' + error.message);
    alert('Registrasi berhasil! Silakan login.');
    return true;
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    currentUser = null;
    if (messagesSubscription) messagesSubscription.unsubscribe();
    if (typingChannel) typingChannel.unsubscribe();
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('chat-container').style.display = 'none';
}

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', () => {
    // Load voices untuk Web Speech API
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('login-form').classList.toggle('active', btn.dataset.tab === 'login');
            document.getElementById('register-form').classList.toggle('active', btn.dataset.tab === 'register');
        });
    });
    
    // Login/Register
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleLogin(
            document.getElementById('login-email').value,
            document.getElementById('login-password').value
        );
    });
    
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pass = document.getElementById('register-password').value;
        if (pass.length < 6) return alert('Password minimal 6 karakter');
        await handleRegister(
            document.getElementById('register-username').value,
            document.getElementById('register-email').value,
            pass,
            document.getElementById('register-language').value
        );
    });
    
    // Send message
    document.getElementById('send-btn').addEventListener('click', () => {
        const input = document.getElementById('message-input');
        sendMessage(input.value);
        input.value = '';
    });
    
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
            sendMessage(input.value);
            input.value = '';
        }
    });
    
    // Cancel reply
    document.getElementById('cancel-reply')?.addEventListener('click', cancelReply);
    
    // Logout
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // Language change
    document.getElementById('user-language').addEventListener('change', async (e) => {
        currentUserLanguage = e.target.value;
        if (currentUser) {
            await supabaseClient.auth.updateUser({ data: { preferred_language: currentUserLanguage } });
            loadMessages();
        }
    });
    
    // Sound toggle
    const soundToggleBtn = document.getElementById('sound-toggle-btn');
    if (soundToggleBtn) {
        soundToggleBtn.addEventListener('click', () => {
            soundEnabled = !soundEnabled;
            const icon = soundToggleBtn.querySelector('i');
            if (soundEnabled) {
                icon.className = 'fas fa-volume-up';
                if ('speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance('音声オン');
                    utterance.lang = 'ja-JP';
                    window.speechSynthesis.speak(utterance);
                }
            } else {
                icon.className = 'fas fa-volume-mute';
                if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            }
        });
    }
    
    // Edit profile
    document.getElementById('edit-profile-btn')?.addEventListener('click', openEditProfileModal);
    saveProfileBtn?.addEventListener('click', saveProfileChanges);
    cancelEditBtn?.addEventListener('click', closeEditProfileModal);
    editProfileModal?.addEventListener('click', (e) => { if (e.target === editProfileModal) closeEditProfileModal(); });
    
    // Emoji
    const emojiBtn = document.getElementById('emoji-btn');
    const emojiPicker = document.getElementById('emoji-picker-container');
    if (emojiBtn && emojiPicker) {
        emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (emojiPicker.style.display === 'none') {
                createEmojiPicker();
                emojiPicker.style.display = 'block';
            } else emojiPicker.style.display = 'none';
        });
        document.addEventListener('click', (e) => {
            if (!emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) emojiPicker.style.display = 'none';
        });
    }
    
    // FAB buttons
    const fabBtn = document.getElementById('fab-btn');
    const fabMenu = document.getElementById('fab-menu');
    fabBtn?.addEventListener('click', (e) => { e.stopPropagation(); fabMenu.classList.toggle('show'); });
    document.addEventListener('click', () => fabMenu?.classList.remove('show'));
    document.getElementById('fab-delete')?.addEventListener('click', () => startSelectMode('delete'));
    document.getElementById('fab-revoke')?.addEventListener('click', () => startSelectMode('revoke'));
    
    // Modals
    document.getElementById('confirm-delete')?.addEventListener('click', async () => {
        document.getElementById('delete-modal').style.display = 'none';
        await deleteSelectedMessages();
    });
    document.getElementById('confirm-revoke')?.addEventListener('click', async () => {
        document.getElementById('revoke-modal').style.display = 'none';
        await revokeSelectedMessages();
    });
    document.getElementById('cancel-delete')?.addEventListener('click', () => {
        document.getElementById('delete-modal').style.display = 'none';
        exitSelectMode();
    });
    document.getElementById('cancel-revoke')?.addEventListener('click', () => {
        document.getElementById('revoke-modal').style.display = 'none';
        exitSelectMode();
    });
    
    // Check session
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            currentUser = session.user;
            currentUserLanguage = currentUser.user_metadata?.preferred_language || 'id';
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('chat-container').style.display = 'flex';
            document.getElementById('current-username').textContent = currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
            document.getElementById('user-language').value = currentUserLanguage;
            loadMessages();
            updateAllMessagesUsername();
            setupRealtimeSubscriptions();
        }
    });
});