// ============ KONFIGURASI SUPABASE ============
const SUPABASE_URL = 'https://gqlxktuqmtgpixmbcefp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxbHhrdHVxbXRncGl4bWJjZWZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1OTk2MTksImV4cCI6MjA5MDE3NTYxOX0.SEbaQaYFRIMhrTGK--XY-YEHG5v5LUdU6__gv8Qi8rE';

// Inisialisasi Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentUserLanguage = 'id';
let soundEnabled = true;
let activeAction = null; // 'delete' atau 'revoke'

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
        if (japaneseVoice) {
            utterance.voice = japaneseVoice;
        }
        
        window.speechSynthesis.speak(utterance);
    }
}

function showNotificationToast(message) {
    const oldToast = document.querySelector('.notification-toast');
    if (oldToast) oldToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.innerHTML = `
        <i class="fas fa-bell" style="margin-right: 10px; color: #3b82f6;"></i>
        <span>📩 ${message}</span>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast && toast.remove) toast.remove();
    }, 3000);
}

// ============ FUNGSI TERJEMAHAN ============
async function translateText(text, targetLang) {
    if (!text || !targetLang || targetLang === 'id') return text;
    
    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=id|${targetLang}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.responseData && data.responseData.translatedText) {
            return data.responseData.translatedText;
        }
        return text;
    } catch (error) {
        console.error('Translation error:', error);
        return text;
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ EMOJI PICKER FUNCTION ============
function createEmojiPicker() {
    const emojis = ['😀', '😂', '😍', '🥰', '😊', '❤️', '👍', '🔥', '🎉', '😭', '😱', '🤔', '🙏', '💪', '👋', '😎', '🥺', '😡', '🤣', '😘', '😁', '🤗', '😇', '🥳', '🤩', '😤', '😴', '💀', '👻', '🎃', '💯', '✨', '⭐', '🌟', '💥', '💨', '💦', '💤', '🎵', '🎶', '💖', '💗', '💓', '💕', '💞', '💘', '💝', '💟'];
    
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
            if (input) {
                input.value += emoji;
                input.focus();
            }
            container.style.display = 'none';
        };
        list.appendChild(span);
    });
}

// ============ SELECT MODE FUNCTIONS ============
function exitSelectMode() {
    selectMode = false;
    selectedMessages.clear();
    activeAction = null;
    
    const header = document.getElementById('select-mode-header');
    if (header) header.remove();
    
    const messages = document.querySelectorAll('.message');
    messages.forEach(msg => {
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
    
    // Update counter di modal
    const selectedCountSpan = document.getElementById('selected-count');
    const revokeSelectedSpan = document.getElementById('revoke-selected-count');
    if (selectedCountSpan) selectedCountSpan.textContent = selectedMessages.size;
    if (revokeSelectedSpan) revokeSelectedSpan.textContent = selectedMessages.size;
}

async function deleteSelectedMessages() {
    if (selectedMessages.size === 0) {
        alert('Tidak ada pesan yang dipilih');
        return;
    }
    
    const messageIds = Array.from(selectedMessages);
    
    const { error } = await supabaseClient
        .from('messages')
        .delete()
        .in('id', messageIds)
        .eq('user_id', currentUser.id);
    
    if (error) {
        alert('Gagal menghapus pesan: ' + error.message);
    } else {
        exitSelectMode();
        loadMessages();
    }
}

async function revokeSelectedMessages() {
    if (selectedMessages.size === 0) {
        alert('撤回するメッセージがありません');
        return;
    }
    
    const messageIds = Array.from(selectedMessages);
    
    const { error } = await supabaseClient
        .from('messages')
        .delete()
        .in('id', messageIds)
        .eq('user_id', currentUser.id);
    
    if (error) {
        alert('撤回に失敗しました: ' + error.message);
    } else {
        exitSelectMode();
        loadMessages();
    }
}

// ============ UPDATE ALL MESSAGES USERNAME ============
async function updateAllMessagesUsername() {
    if (!currentUser) return;
    
    const newUsername = currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
    
    const { error } = await supabaseClient
        .from('messages')
        .update({ username: newUsername })
        .eq('user_id', currentUser.id);
    
    if (error) {
        console.error('Gagal update username di pesan:', error);
    } else {
        console.log('Username updated in all messages to:', newUsername);
        loadMessages();
    }
}

// ============ RENDER MESSAGE ============
async function renderMessage(message) {
    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    const isOwnMessage = message.user_id === currentUser?.id;
    messageDiv.className = `message ${isOwnMessage ? 'message-own' : 'message-other'}`;
    messageDiv.setAttribute('data-message-id', message.id);
    
    let displayText = message.original_message;
    let showOriginal = false;
    
    if (message.user_id !== currentUser?.id && currentUserLanguage !== 'id') {
        const translated = await translateText(message.original_message, currentUserLanguage);
        displayText = translated;
        showOriginal = true;
    }
    
    messageDiv.innerHTML = `
        <div class="message-bubble">
            <div class="message-header">
                <span class="username">${escapeHtml(message.username)}</span>
                <span class="time">${formatTime(message.created_at)}</span>
            </div>
            <div class="message-content">${escapeHtml(displayText)}</div>
            ${showOriginal && displayText !== message.original_message ? 
                `<div class="original-message">📝 ${escapeHtml(message.original_message)}</div>` : ''}
        </div>
    `;
    
    // Event click untuk select mode
    messageDiv.addEventListener('click', (e) => {
        if (selectMode) {
            e.stopPropagation();
            toggleMessageSelection(message.id, messageDiv);
        }
    });
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function loadMessages() {
    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return;
    
    messagesContainer.innerHTML = '<div class="loading-messages">Loading messages...</div>';
    
    const { data: messages, error } = await supabaseClient
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100);
    
    if (error) {
        console.error('Error loading messages:', error);
        messagesContainer.innerHTML = '<div class="loading-messages">Error loading messages</div>';
        return;
    }
    
    messagesContainer.innerHTML = '';
    for (const message of messages) {
        await renderMessage(message);
    }
}

// ============ SEND MESSAGE (DENGAN USERNAME TERBARU) ============
async function sendMessage(messageText) {
    if (!messageText.trim() || !currentUser) return;
    
    // Ambil username terbaru langsung dari user_metadata
    const latestUsername = currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
    
    const messageData = {
        user_id: currentUser.id,
        username: latestUsername,
        original_message: messageText.trim()
    };
    
    const { error } = await supabaseClient.from('messages').insert([messageData]);
    if (error) {
        console.error('Error sending message:', error);
        alert('Gagal mengirim pesan: ' + error.message);
    }
}

let messagesSubscription = null;

// ============ REALTIME SUBSCRIPTION ============
function setupRealtimeSubscription() {
    if (messagesSubscription) {
        messagesSubscription.unsubscribe();
    }
    
    messagesSubscription = supabaseClient
        .channel('messages-channel')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'messages' },
            async (payload) => {
                if (payload.new.user_id !== currentUser?.id) {
                    playNotificationSound();
                    const senderName = payload.new.username || 'seseorang';
                    showNotificationToast(`Pesan baru dari ${senderName}`);
                }
                await renderMessage(payload.new);
            }
        )
        .subscribe();
}

// ============ SELECT MODE START FUNCTIONS (DENGAN TOMBOL SELESAI) ============
function startSelectMode(action) {
    selectMode = true;
    selectedMessages.clear();
    activeAction = action;
    
    // Tambah header select mode dengan tombol SELESAI
    const header = document.createElement('div');
    header.id = 'select-mode-header';
    header.className = 'select-mode-header';
    header.innerHTML = `
        <span><i class="fas fa-check-circle"></i> Klik pesan untuk memilih</span>
        <div>
            <button id="done-select-mode" style="background: #10b981; padding: 6px 16px; border-radius: 20px; border: none; color: white; cursor: pointer; margin-right: 8px;">Selesai</button>
            <button id="close-select-mode" style="background: none; border: none; color: white; font-size: 18px; cursor: pointer;"><i class="fas fa-times"></i></button>
        </div>
    `;
    const container = document.getElementById('messages-container');
    if (container) {
        container.prepend(header);
    }
    
    // Tambah class select-mode ke semua pesan
    const messages = document.querySelectorAll('.message');
    messages.forEach(msg => {
        msg.classList.add('select-mode');
        msg.style.cursor = 'pointer';
    });
    
    // Tombol close (X)
    const closeBtn = document.getElementById('close-select-mode');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            exitSelectMode();
        });
    }
    
    // TOMBOL SELESAI - munculkan modal
    const doneBtn = document.getElementById('done-select-mode');
    if (doneBtn) {
        doneBtn.addEventListener('click', () => {
            if (selectedMessages.size > 0) {
                if (activeAction === 'delete') {
                    document.getElementById('delete-modal').style.display = 'flex';
                } else if (activeAction === 'revoke') {
                    document.getElementById('revoke-modal').style.display = 'flex';
                }
            } else {
                alert(activeAction === 'delete' ? 'Pilih pesan terlebih dahulu' : 'メッセージを選択してください');
            }
        });
    }
}

// ============ EDIT PROFIL ============
const editProfileModal = document.getElementById('edit-profile-modal');
const editUsernameInput = document.getElementById('edit-username');
const saveProfileBtn = document.getElementById('save-profile-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const editProfileMessage = document.getElementById('edit-profile-message');

// Buka modal edit profil
function openEditProfileModal() {
    if (!currentUser) return;
    
    // Isi input dengan username saat ini
    const currentUsername = currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
    if (editUsernameInput) editUsernameInput.value = currentUsername;
    if (editProfileMessage) editProfileMessage.textContent = '';
    if (editProfileModal) editProfileModal.style.display = 'flex';
}

// Simpan perubahan username
async function saveProfileChanges() {
    const newUsername = editUsernameInput?.value.trim();
    
    if (!newUsername) {
        if (editProfileMessage) editProfileMessage.textContent = 'Username tidak boleh kosong';
        return;
    }
    
    if (newUsername.length < 3) {
        if (editProfileMessage) editProfileMessage.textContent = 'Username minimal 3 karakter';
        return;
    }
    
    // Update di Supabase Auth
    const { error } = await supabaseClient.auth.updateUser({
        data: {
            display_name: newUsername
        }
    });
    
    if (error) {
        if (editProfileMessage) editProfileMessage.textContent = 'Gagal: ' + error.message;
        return;
    }
    
    // Update tampilan username di header
    const currentUsernameSpan = document.getElementById('current-username');
    if (currentUsernameSpan) currentUsernameSpan.textContent = newUsername;
    
    // UPDATE SEMUA PESAN LAMA DENGAN USERNAME BARU
    await updateAllMessagesUsername();
    
    if (editProfileMessage) {
        editProfileMessage.textContent = '✅ Username berhasil diubah!';
        editProfileMessage.style.color = '#10b981';
    }
    
    // Tutup modal setelah 1.5 detik
    setTimeout(() => {
        if (editProfileModal) editProfileModal.style.display = 'none';
    }, 1500);
}

// Tutup modal
function closeEditProfileModal() {
    if (editProfileModal) editProfileModal.style.display = 'none';
    if (editProfileMessage) editProfileMessage.textContent = '';
}

// ============ AUTH FUNCTIONS ============
async function handleLogin(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });
    
    if (error) {
        alert('Login gagal: ' + error.message);
        return false;
    }
    
    currentUser = data.user;
    currentUserLanguage = currentUser.user_metadata?.preferred_language || 'id';
    
    const userLanguageSelect = document.getElementById('user-language');
    if (userLanguageSelect) userLanguageSelect.value = currentUserLanguage;
    
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    const currentUsername = document.getElementById('current-username');
    
    if (authContainer) authContainer.style.display = 'none';
    if (chatContainer) chatContainer.style.display = 'flex';
    if (currentUsername) {
        currentUsername.textContent = currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
    }
    
    await loadMessages();
    // Update semua pesan lama dengan username terbaru (jika ada perubahan)
    await updateAllMessagesUsername();
    setupRealtimeSubscription();
    return true;
}

async function handleRegister(username, email, password, language) {
    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: {
            data: {
                display_name: username,
                preferred_language: language
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
    await supabaseClient.auth.signOut();
    currentUser = null;
    if (messagesSubscription) {
        messagesSubscription.unsubscribe();
    }
    
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    
    if (authContainer) authContainer.style.display = 'flex';
    if (chatContainer) chatContainer.style.display = 'none';
}

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, setting up event listeners...');
    
    // Load voices untuk Web Speech API
    if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
    }
    
    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    if (tabBtns.length > 0) {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                if (btn.dataset.tab === 'login') {
                    if (loginForm) loginForm.classList.add('active');
                    if (registerForm) registerForm.classList.remove('active');
                } else {
                    if (loginForm) loginForm.classList.remove('active');
                    if (registerForm) registerForm.classList.add('active');
                }
            });
        });
    }
    
    // Login form
    const loginSubmitBtn = document.getElementById('login-form');
    if (loginSubmitBtn) {
        loginSubmitBtn.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            await handleLogin(email, password);
        });
    }
    
    // Register form
    const registerSubmitBtn = document.getElementById('register-form');
    if (registerSubmitBtn) {
        registerSubmitBtn.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('register-username').value;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            const language = document.getElementById('register-language').value;
            
            if (password.length < 6) {
                alert('Password minimal 6 karakter');
                return;
            }
            
            await handleRegister(username, email, password, language);
        });
    }
    
    // Send message
    const sendBtn = document.getElementById('send-btn');
    const messageInput = document.getElementById('message-input');
    
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            if (messageInput) {
                sendMessage(messageInput.value);
                messageInput.value = '';
            }
        });
    }
    
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(messageInput.value);
                messageInput.value = '';
            }
        });
    }
    
    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // ============ TOMBOL MUTE/UNMUTE SUARA ============
    const soundToggleBtn = document.getElementById('sound-toggle-btn');
    if (soundToggleBtn) {
        soundToggleBtn.addEventListener('click', () => {
            soundEnabled = !soundEnabled;
            const icon = soundToggleBtn.querySelector('i');
            if (soundEnabled) {
                icon.className = 'fas fa-volume-up';
                soundToggleBtn.title = 'Matikan suara';
                if ('speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance('音声オン');
                    utterance.lang = 'ja-JP';
                    window.speechSynthesis.speak(utterance);
                }
            } else {
                icon.className = 'fas fa-volume-mute';
                soundToggleBtn.title = 'Nyalakan suara';
                if ('speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                }
            }
        });
    }
    
    // ============ TOMBOL EDIT PROFIL ============
    const editProfileBtn = document.getElementById('edit-profile-btn');
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', openEditProfileModal);
    }
    
    // Modal edit profil buttons
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', saveProfileChanges);
    }
    
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', closeEditProfileModal);
    }
    
    // Tutup modal edit profil klik overlay
    if (editProfileModal) {
        editProfileModal.addEventListener('click', (e) => {
            if (e.target === editProfileModal) {
                closeEditProfileModal();
            }
        });
    }
    
    // Language change
    const userLanguage = document.getElementById('user-language');
    if (userLanguage) {
        userLanguage.addEventListener('change', async (e) => {
            currentUserLanguage = e.target.value;
            if (currentUser) {
                await supabaseClient.auth.updateUser({
                    data: { preferred_language: currentUserLanguage }
                });
                loadMessages();
            }
        });
    }
    
    // ============ EMOJI PICKER EVENT ============
    const emojiBtn = document.getElementById('emoji-btn');
    const emojiPicker = document.getElementById('emoji-picker-container');
    
    if (emojiBtn && emojiPicker) {
        emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (emojiPicker.style.display === 'none' || !emojiPicker.style.display) {
                createEmojiPicker();
                emojiPicker.style.display = 'block';
            } else {
                emojiPicker.style.display = 'none';
            }
        });
        
        document.addEventListener('click', (e) => {
            if (emojiPicker && !emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
                emojiPicker.style.display = 'none';
            }
        });
    }
    
    // ============ FAB BUTTON EVENTS (DELETE & REVOKE) ============
    const fabBtn = document.getElementById('fab-btn');
    const fabMenu = document.getElementById('fab-menu');
    const fabDelete = document.getElementById('fab-delete');
    const fabRevoke = document.getElementById('fab-revoke');
    const deleteModal = document.getElementById('delete-modal');
    const revokeModal = document.getElementById('revoke-modal');
    const confirmDelete = document.getElementById('confirm-delete');
    const confirmRevoke = document.getElementById('confirm-revoke');
    const cancelDelete = document.getElementById('cancel-delete');
    const cancelRevoke = document.getElementById('cancel-revoke');
    
    // Toggle menu
    if (fabBtn && fabMenu) {
        fabBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fabMenu.classList.toggle('show');
        });
        
        document.addEventListener('click', (e) => {
            if (fabMenu && fabBtn && !fabMenu.contains(e.target) && !fabBtn.contains(e.target)) {
                fabMenu.classList.remove('show');
            }
        });
    }
    
    // Delete option
    if (fabDelete) {
        fabDelete.addEventListener('click', () => {
            if (fabMenu) fabMenu.classList.remove('show');
            startSelectMode('delete');
        });
    }
    
    // Revoke option
    if (fabRevoke) {
        fabRevoke.addEventListener('click', () => {
            if (fabMenu) fabMenu.classList.remove('show');
            startSelectMode('revoke');
        });
    }
    
    // Confirm Delete
    if (confirmDelete) {
        confirmDelete.addEventListener('click', async () => {
            if (deleteModal) deleteModal.style.display = 'none';
            await deleteSelectedMessages();
        });
    }
    
    // Confirm Revoke
    if (confirmRevoke) {
        confirmRevoke.addEventListener('click', async () => {
            if (revokeModal) revokeModal.style.display = 'none';
            await revokeSelectedMessages();
        });
    }
    
    // Cancel buttons
    if (cancelDelete) {
        cancelDelete.addEventListener('click', () => {
            if (deleteModal) deleteModal.style.display = 'none';
            exitSelectMode();
        });
    }
    
    if (cancelRevoke) {
        cancelRevoke.addEventListener('click', () => {
            if (revokeModal) revokeModal.style.display = 'none';
            exitSelectMode();
        });
    }
    
    // Close modal klik overlay
    if (deleteModal) {
        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) {
                deleteModal.style.display = 'none';
                exitSelectMode();
            }
        });
    }
    
    if (revokeModal) {
        revokeModal.addEventListener('click', (e) => {
            if (e.target === revokeModal) {
                revokeModal.style.display = 'none';
                exitSelectMode();
            }
        });
    }
    
    // Cek session yang ada
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            currentUser = session.user;
            currentUserLanguage = currentUser.user_metadata?.preferred_language || 'id';
            const authContainer = document.getElementById('auth-container');
            const chatContainer = document.getElementById('chat-container');
            const currentUsername = document.getElementById('current-username');
            const userLanguageSelect = document.getElementById('user-language');
            
            if (authContainer) authContainer.style.display = 'none';
            if (chatContainer) chatContainer.style.display = 'flex';
            if (currentUsername) {
                currentUsername.textContent = currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
            }
            if (userLanguageSelect) userLanguageSelect.value = currentUserLanguage;
            
            loadMessages();
            updateAllMessagesUsername(); // Update pesan lama dengan username terbaru
            setupRealtimeSubscription();
        }
    });
});