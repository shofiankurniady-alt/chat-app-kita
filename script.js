// ============ KONFIGURASI SUPABASE ============
const SUPABASE_URL = 'https://gqlxktuqmtgpixmbcefp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxbHhrdHVxbXRncGl4bWJjZWZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1OTk2MTksImV4cCI6MjA5MDE3NTYxOX0.SEbaQaYFRIMhrTGK--XY-YEHG5v5LUdU6__gv8Qi8rE';

// Inisialisasi Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentUserLanguage = 'id';
let soundEnabled = true; // Status suara ON/OFF

// ============ NOTIFIKASI SUARA ============
function playNotificationSound() {
    if (!soundEnabled) return;
    
    // Gunakan Web Speech API untuk mengucapkan pesan dalam bahasa Jepang
    if ('speechSynthesis' in window) {
        // Hentikan suara yang sedang berlangsung
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance('新しいメッセージがあります');
        utterance.lang = 'ja-JP'; // Bahasa Jepang
        utterance.rate = 0.9; // Kecepatan bicara sedikit lebih lambat
        utterance.pitch = 1.0;
        
        // Cari suara Jepang jika ada
        const voices = window.speechSynthesis.getVoices();
        const japaneseVoice = voices.find(voice => voice.lang.includes('ja'));
        if (japaneseVoice) {
            utterance.voice = japaneseVoice;
        }
        
        window.speechSynthesis.speak(utterance);
    } else {
        console.log('Web Speech API not supported');
    }
}

// Fungsi untuk menampilkan notifikasi visual (opsional)
function showNotificationToast(message) {
    // Hapus toast lama
    const oldToast = document.querySelector('.notification-toast');
    if (oldToast) oldToast.remove();
    
    // Buat toast baru
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.innerHTML = `
        <i class="fas fa-bell" style="margin-right: 10px; color: #3b82f6;"></i>
        <span>📩 ${message}</span>
    `;
    document.body.appendChild(toast);
    
    // Hapus setelah 3 detik
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

// ============ RENDER MESSAGE ============
async function renderMessage(message) {
    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.user_id === currentUser?.id ? 'message-own' : 'message-other'}`;
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

async function sendMessage(messageText) {
    if (!messageText.trim() || !currentUser) return;
    
    const messageData = {
        user_id: currentUser.id,
        username: currentUser.user_metadata?.display_name || currentUser.email.split('@')[0],
        original_message: messageText.trim()
    };
    
    const { error } = await supabaseClient.from('messages').insert([messageData]);
    if (error) {
        console.error('Error sending message:', error);
        alert('Gagal mengirim pesan: ' + error.message);
    }
}

let messagesSubscription = null;

// ============ REALTIME SUBSCRIPTION DENGAN NOTIFIKASI SUARA ============
function setupRealtimeSubscription() {
    if (messagesSubscription) {
        messagesSubscription.unsubscribe();
    }
    
    messagesSubscription = supabaseClient
        .channel('messages-channel')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'messages' },
            async (payload) => {
                // MAINAN: hanya bunyi jika pesan dari orang lain
                if (payload.new.user_id !== currentUser?.id) {
                    // Suara: "新しいメッセージがあります" (Ada pesan baru)
                    playNotificationSound();
                    
                    // Notifikasi visual (opsional)
                    const senderName = payload.new.username || 'seseorang';
                    showNotificationToast(`Pesan baru dari ${senderName}`);
                }
                await renderMessage(payload.new);
            }
        )
        .subscribe();
}

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
    
    // ============ LOAD VOICES (untuk Web Speech API) ============
    // Memuat daftar suara agar siap digunakan
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
            console.log('Login form submitted');
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
            console.log('Register form submitted');
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
    } else {
        console.error('Register form not found!');
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
                // Ucapkan pesan singkat sebagai konfirmasi suara ON
                if ('speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance('音声オン');
                    utterance.lang = 'ja-JP';
                    window.speechSynthesis.speak(utterance);
                }
            } else {
                icon.className = 'fas fa-volume-mute';
                soundToggleBtn.title = 'Nyalakan suara';
                // Hentikan suara yang sedang berlangsung
                if ('speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                }
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
                // Refresh messages
                const messagesContainer = document.getElementById('messages-container');
                if (messagesContainer) {
                    const messages = messagesContainer.children;
                    for (let i = 0; i < messages.length; i++) {
                        const msgDiv = messages[i];
                        const msgId = msgDiv.getAttribute('data-message-id');
                        if (msgId) {
                            const { data: msg } = await supabaseClient.from('messages').select('*').eq('id', msgId).single();
                            if (msg) {
                                const newDiv = document.createElement('div');
                                msgDiv.parentNode.replaceChild(newDiv, msgDiv);
                                await renderMessage(msg);
                            }
                        }
                    }
                }
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
                createEmojiPicker(); // refresh emoji setiap dibuka
                emojiPicker.style.display = 'block';
            } else {
                emojiPicker.style.display = 'none';
            }
        });
        
        // Tutup emoji picker jika klik di luar
        document.addEventListener('click', (e) => {
            if (emojiPicker && !emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
                emojiPicker.style.display = 'none';
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
            setupRealtimeSubscription();
        }
    });
});