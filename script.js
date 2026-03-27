// ==================== KONFIGURASI ====================
const SUPABASE_URL = 'https://gqlxktuqmtgpixmbcefp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxbHhrdHVxbXRncGl4bWJjZWZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1OTk2MTksImV4cCI6MjA5MDE3NTYxOX0.SEbaQaYFRIMhrTGK--XY-YEHG5v5LUdU6__gv8Qi8rE';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Variabel Global
let currentUser = null;
let currentUserLang = 'id';

// ==================== FUNGSI BANTUAN ====================
function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== FUNGSI TERJEMAHAN ====================
// Fungsi ini yang paling penting. Dia akan mendeteksi bahasa sumber dan menerjemahkan ke bahasa target.
async function translateText(text, targetLang) {
    if (!text || !targetLang) return text;

    // 1. Deteksi bahasa sumber dari teks
    let sourceLang = 'id'; // default
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text)) sourceLang = 'ja';
    else if (/^[a-zA-Z\s\.,!?0-9]+$/.test(text)) sourceLang = 'en';

    // Jika bahasa sumber dan target sama, tidak usah terjemah
    if (sourceLang === targetLang) return text;

    try {
        // 2. Panggil API MyMemory
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
        const response = await fetch(url);
        const data = await response.json();

        // 3. Ambil hasil terjemahan
        if (data.responseData && data.responseData.translatedText) {
            let translated = data.responseData.translatedText;
            // Hindari menampilkan pesan error dari API
            if (translated.includes('INVALID') || translated.includes('NO CONTENT')) return text;
            return translated;
        }
        return text;
    } catch (error) {
        console.error("Terjemahan gagal:", error);
        return text;
    }
}

// ==================== FUNGSI RENDER PESAN (INTI) ====================
async function renderMessage(message) {
    const container = document.getElementById('messages-container');
    if (!container) return;

    const isOwnMessage = message.user_id === currentUser?.id;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isOwnMessage ? 'message-own' : 'message-other'}`;
    msgDiv.setAttribute('data-message-id', message.id);

    let displayText = message.original_message;
    let showOriginal = false;

    // *** INI ATURAN UTAMA: ***
    // Hanya pesan dari orang lain yang akan diproses
    if (!isOwnMessage) {
        // Terjemahkan pesan orang lain ke bahasa user yang sedang login
        const translated = await translateText(message.original_message, currentUserLang);
        if (translated !== message.original_message) {
            displayText = translated;
            showOriginal = true; // Tampilkan pesan asli
        }
    }

    // Tampilkan di HTML
    msgDiv.innerHTML = `
        <div class="message-bubble">
            <div class="message-header">
                <span class="username">${escapeHtml(message.username)}</span>
                <span class="time">${formatTime(message.created_at)}</span>
            </div>
            <div class="message-content">${escapeHtml(displayText)}</div>
            ${showOriginal ? `<div class="original-message">📝 ${escapeHtml(message.original_message)}</div>` : ''}
        </div>
    `;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

// ==================== AMBIL PESAN LAMA ====================
async function loadMessages() {
    const container = document.getElementById('messages-container');
    if (!container) return;
    container.innerHTML = '<div class="loading-messages">Memuat pesan...</div>';

    const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100);

    if (error) {
        container.innerHTML = '<div class="loading-messages">Gagal memuat pesan</div>';
        return;
    }

    container.innerHTML = '';
    for (const msg of messages) {
        await renderMessage(msg);
    }
}

// ==================== KIRIM PESAN ====================
async function sendMessage(text) {
    if (!text.trim() || !currentUser) return;

    const { error } = await supabase.from('messages').insert({
        user_id: currentUser.id,
        username: currentUser.user_metadata?.display_name || currentUser.email.split('@')[0],
        original_message: text.trim()
    });

    if (error) alert('Gagal kirim pesan: ' + error.message);
}

// ==================== REAL-TIME ====================
let messageSubscription = null;
function subscribeToMessages() {
    if (messageSubscription) messageSubscription.unsubscribe();
    messageSubscription = supabase
        .channel('messages-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
            await renderMessage(payload.new);
        })
        .subscribe();
}

// ==================== AUTH ====================
async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert('Login gagal: ' + error.message);
}

async function register(username, email, password, language) {
    const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { display_name: username, preferred_language: language } }
    });
    if (error) return alert('Registrasi gagal: ' + error.message);
    alert('Registrasi berhasil! Silakan login.');
}

async function logout() {
    await supabase.auth.signOut();
    location.reload(); // Refresh halaman setelah logout
}

// ==================== EVENT LISTENER & INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    // Event untuk tombol di UI
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await login(
            document.getElementById('login-email').value,
            document.getElementById('login-password').value
        );
    });

    document.getElementById('register-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pass = document.getElementById('register-password').value;
        if (pass.length < 6) return alert('Password minimal 6 karakter');
        await register(
            document.getElementById('register-username').value,
            document.getElementById('register-email').value,
            pass,
            document.getElementById('register-language').value
        );
    });

    document.getElementById('send-btn')?.addEventListener('click', () => {
        const input = document.getElementById('message-input');
        sendMessage(input.value);
        input.value = '';
    });

    document.getElementById('message-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const input = document.getElementById('message-input');
            sendMessage(input.value);
            input.value = '';
        }
    });

    document.getElementById('logout-btn')?.addEventListener('click', logout);

    document.getElementById('user-language')?.addEventListener('change', async (e) => {
        currentUserLang = e.target.value;
        if (currentUser) {
            await supabase.auth.updateUser({ data: { preferred_language: currentUserLang } });
            loadMessages(); // Refresh pesan dengan bahasa baru
        }
    });

    // Cek apakah user sudah login
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            currentUser = session.user;
            currentUserLang = currentUser.user_metadata?.preferred_language || 'id';
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('chat-container').style.display = 'flex';
            document.getElementById('current-username').innerText = currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
            document.getElementById('user-language').value = currentUserLang;
            loadMessages();
            subscribeToMessages();
        } else {
            document.getElementById('auth-container').style.display = 'flex';
            document.getElementById('chat-container').style.display = 'none';
        }
    });
});