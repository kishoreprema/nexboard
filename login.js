/**
 * NEXBOARD - LOGIN LOGIC (Multi-User)
 * Authenticates against Node.js backend
 */

const API_URL = 'http://localhost:3000/api';

// ==========================================
// View Elements
// ==========================================
const loginView = document.getElementById('login-view');
const forgotView = document.getElementById('forgot-view');
const signupView = document.getElementById('signup-view');

const showForgotBtn = document.getElementById('show-forgot');
const showSignupBtn = document.getElementById('show-signup');
const backToLoginFromForgotBtn = document.getElementById('back-to-login-from-forgot');
const backToLoginBtn = document.getElementById('back-to-login');

// ==========================================
// View Switching Logic
// ==========================================
if (showForgotBtn) {
    showForgotBtn.addEventListener('click', (e) => {
        e.preventDefault();
        loginView.classList.add('hidden');
        forgotView.classList.remove('hidden');
    });
}

if (showSignupBtn) {
    showSignupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        loginView.classList.add('hidden');
        signupView.classList.remove('hidden');
    });
}

if (backToLoginFromForgotBtn) {
    backToLoginFromForgotBtn.addEventListener('click', (e) => {
        e.preventDefault();
        forgotView.classList.add('hidden');
        loginView.classList.remove('hidden');
    });
}

if (backToLoginBtn) {
    backToLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        signupView.classList.add('hidden');
        loginView.classList.remove('hidden');
    });
}

// ==========================================
// Login Flow
// ==========================================
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const errorMsg = document.getElementById('error-msg');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();

        if (!username || !password) return;

        // Simulate loading state
        const originalText = loginBtn.textContent;
        loginBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Logging in...';
        loginBtn.disabled = true;
        errorMsg.textContent = ''; // Clear old errors

        try {
            const res = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (res.ok) {
                const user = await res.json();
                // Save user data to localStorage
                localStorage.setItem('nexboard_currentUser', JSON.stringify(user));
                localStorage.setItem('nexboard_my_status', user.status || 'available');

                // Redirect based on role
                if (user.role === 'admin') {
                    window.location.href = 'admin-dashboard.html';
                } else if (user.role === 'pm') {
                    window.location.href = 'pm-dashboard.html';
                } else {
                    window.location.href = 'index.html'; // Employee dashboard
                }
            } else {
                const errorData = await res.json();
                errorMsg.textContent = errorData.error || 'Login failed.';
                loginBtn.innerHTML = originalText;
                loginBtn.disabled = false;
            }
        } catch (err) {
            console.error('Login error:', err);
            errorMsg.textContent = 'Could not connect to server.';
            loginBtn.innerHTML = originalText;
            loginBtn.disabled = false;
        }
    });
}

// ==========================================
// Signup Logic
// ==========================================
const signupForm = document.getElementById('signup-form');
const signupBtn = document.getElementById('signup-btn');
const signupErrorMsg = document.getElementById('signup-error-msg');

function getInitials(name) {
    if (!name) return '';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
}

function getRandomColor() {
    const avatarColors = ['#DE350B', '#00875A', '#FF991F', '#6554C0', '#0052CC', '#00A3BF', '#403294', '#0747A6'];
    return avatarColors[Math.floor(Math.random() * avatarColors.length)];
}

if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value.trim();

        if (!name || !email || !password) return;

        const originalText = signupBtn.textContent;
        signupBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Signing up...';
        signupBtn.disabled = true;
        signupErrorMsg.textContent = '';

        const newUser = {
            id: 'usr-' + Date.now(),
            name,
            email,
            phone: '',
            initials: getInitials(name),
            color: getRandomColor(),
            password,
            role: 'employee' // default to employee
        };

        try {
            const res = await fetch(`${API_URL}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser)
            });

            if (res.ok) {
                // Send back to login and auto-fill
                signupView.classList.add('hidden');
                loginView.classList.remove('hidden');
                document.getElementById('username').value = email; // Prefill with email
                document.getElementById('password').value = password;
                alert("Account created successfully! You can now log in.");
            } else {
                const errorData = await res.json();
                signupErrorMsg.textContent = errorData.error || 'Signup failed. Username/Email might exist.';
            }
        } catch (err) {
            console.error('Signup error:', err);
            signupErrorMsg.textContent = 'Could not connect to server.';
        } finally {
            signupBtn.innerHTML = originalText;
            signupBtn.disabled = false;
        }
    });
}

// ==========================================
// Forgot Password Logic
// ==========================================
const forgotForm = document.getElementById('forgot-form');

if (forgotForm) {
    forgotForm.addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Recovery link sent! (Mocked)');
        forgotView.classList.add('hidden');
        loginView.classList.remove('hidden');
        forgotForm.reset();
    });
}
