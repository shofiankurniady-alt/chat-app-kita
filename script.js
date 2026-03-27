// ============ KONFIGURASI SUPABASE ============
// GANTI DENGAN CREDENTIALS ANDA!
const SUPABASE_URL = 'https://gqlxktuqmtgpixmbcefp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxbHhrdHVxbXRncGl4bWJjZWZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1OTk2MTksImV4cCI6MjA5MDE3NTYxOX0.SEbaQaYFRIMhrTGK--XY-YEHG5v5LUdU6__gv8Qi8rE';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentUserLanguage = 'id';

// Fungsi terjemahan
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

async function renderMessage(message) {
    const messagesContainer = document.getElementById('messages-container');
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
    messagesContainer.innerHTML = '<div class="loading-messages">Loading messages...</div>';
    
    const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
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

async function sendMessage(messageText) {
    if (!messageText.trim() || !currentUser) return;
    
    const messageData = {
        user_id: currentUser.id,
        username: currentUser.user_metadata?.display_name || currentUser.email.split('@')[0],
        original_message: messageText.trim()
    };
    
    const { error } = await supabase.from('messages').insert([messageData]);
    if (error) console.error('Error sending message:', error);
}

let messagesSubscription = null;

function setupRealtimeSubscription() {
    if (messagesSubscription) messagesSubscription.unsubscribe();
    
    messagesSubscription = supabase
        .channel('messages-channel')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'messages' },
            async (payload) => {
                await renderMessage(payload.new);
            }
        )
        .subscribe();
}

async function handleLogin(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });
    
    if (error) {
        alert('Login gagal: ' + error.message);
        return false;
    }
    
    currentUser = data.user;
    currentUserLanguage = currentUser.user_metadata?.preferred_language || 'id';
    
    document.getElementById('user-language').value = currentUserLanguage;
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
    document.getElementById('current-username').textContent = 
        currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
    
    await loadMessages();
    setupRealtimeSubscription();
    return true;
}

async function handleRegister(username, email, password, language) {
    const { data, error } = await supabase.auth.signUp({
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
    await supabase.auth.signOut();
    currentUser = null;
    if (messagesSubscription) messagesSubscription.unsubscribe();
    
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('chat-container').style.display = 'none';
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (btn.dataset.tab === 'login') {
                loginForm.classList.add('active');
                registerForm.classList.remove('active');
            } else {
                loginForm.classList.remove('active');
                registerForm.classList.add('active');
            }
        });
    });
    
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        await handleLogin(email, password);
    });
    
    document.getElementById('register-form').addEventListener('submit', async (e) => {
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
    
    document.getElementById('send-btn').addEventListener('click', () => {
        sendMessage(document.getElementById('message-input').value);
        document.getElementById('message-input').value = '';
    });
    
    document.getElementById('message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(document.getElementById('message-input').value);
            document.getElementById('message-input').value = '';
        }
    });
    
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    document.getElementById('user-language').addEventListener('change', async (e) => {
        currentUserLanguage = e.target.value;
        if (currentUser) {
            await supabase.auth.updateUser({
                data: { preferred_language: currentUserLanguage }
            });
            // Refresh messages untuk terjemahan baru
            const messagesContainer = document.getElementById('messages-container');
            const messages = messagesContainer.children;
            for (let i = 0; i < messages.length; i++) {
                const msgDiv = messages[i];
                const msgId = msgDiv.getAttribute('data-message-id');
                if (msgId) {
                    const { data: msg } = await supabase.from('messages').select('*').eq('id', msgId).single();
                    if (msg) {
                        const newDiv = document.createElement('div');
                        msgDiv.parentNode.replaceChild(newDiv, msgDiv);
                        await renderMessage(msg);
                    }
                }
            }
        }
    });
    
    // Cek session yang ada
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            currentUser = session.user;
            currentUserLanguage = currentUser.user_metadata?.preferred_language || 'id';
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('chat-container').style.display = 'flex';
            document.getElementById('current-username').textContent = 
                currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
            document.getElementById('user-language').value = currentUserLanguage;
            loadMessages();
            setupRealtimeSubscription();
        }
    });
});