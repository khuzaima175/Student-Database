// ============================================================
//  login.js  –  Login & Signup logic
// ============================================================

// If already logged in, redirect to app
if (localStorage.getItem('sb_token')) {
    window.location.href = '/';
}

let currentMode = 'login'; // 'login' or 'signup'

const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authMessage = document.getElementById('authMessage');
const authBtnText = document.getElementById('authBtnText');
const authBtnLoader = document.getElementById('authBtnLoader');
const loginSubtitle = document.getElementById('loginSubtitle');
const authFooterText = document.getElementById('authFooterText');

// ── Tab Switching ────────────────────────────────────────────
function switchTab(mode) {
    currentMode = mode;
    document.getElementById('loginTab').classList.toggle('active', mode === 'login');
    document.getElementById('signupTab').classList.toggle('active', mode === 'signup');

    if (mode === 'login') {
        authBtnText.textContent = 'Sign In';
        loginSubtitle.textContent = 'Sign in to manage your records';
        authFooterText.innerHTML = 'Don\'t have an account? <a href="#" onclick="switchTab(\'signup\'); return false;">Sign Up</a>';
    } else {
        authBtnText.textContent = 'Create Account';
        loginSubtitle.textContent = 'Create an account to get started';
        authFooterText.innerHTML = 'Already have an account? <a href="#" onclick="switchTab(\'login\'); return false;">Sign In</a>';
    }

    // Clear message
    authMessage.className = 'form-message';
}

// ── Form Submit ──────────────────────────────────────────────
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = authEmail.value.trim();
    const password = authPassword.value;

    // Show loader
    authBtnText.style.display = 'none';
    authBtnLoader.style.display = 'inline-flex';
    authMessage.className = 'form-message';

    const endpoint = currentMode === 'login' ? '/api/auth/login' : '/api/auth/signup';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const result = await response.json();

        if (response.ok) {
            showMessage(result.message, 'success');

            // Save tokens
            if (result.session) {
                localStorage.setItem('sb_token', result.session.access_token);
                localStorage.setItem('sb_refresh', result.session.refresh_token);
                localStorage.setItem('sb_user_email', email);
            }

            // Redirect after short delay
            setTimeout(() => {
                window.location.href = '/';
            }, 500);
        } else {
            showMessage(result.error, 'error');
        }
    } catch (err) {
        showMessage('Could not connect to server.', 'error');
        console.error('Auth error:', err);
    } finally {
        authBtnText.style.display = 'inline';
        authBtnLoader.style.display = 'none';
    }
});

// ── Show Message ─────────────────────────────────────────────
function showMessage(text, type) {
    authMessage.textContent = text;
    authMessage.className = 'form-message ' + type;
}

// ── Floating Particles ───────────────────────────────────────
function createParticles() {
    const container = document.getElementById('particles');
    const colors = ['#0ea5e9', '#3b82f6', '#06b6d4', '#22d3ee'];
    for (let i = 0; i < 25; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDuration = (Math.random() * 18 + 12) + 's';
        particle.style.animationDelay = (Math.random() * 10) + 's';
        particle.style.width = particle.style.height = (Math.random() * 3 + 1.5) + 'px';
        particle.style.opacity = Math.random() * 0.35 + 0.05;
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        container.appendChild(particle);
    }
}

createParticles();
