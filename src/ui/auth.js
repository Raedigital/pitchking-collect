import { signIn, signUp } from '../services/auth.js';

export function initAuth(onSuccess) {
    const form = document.getElementById('authForm');
    const toggle = document.getElementById('authToggle');
    const errorEl = document.getElementById('authError');
    const submitBtn = document.getElementById('authSubmit');
    const titleEl = document.getElementById('authTitle');
    let isSignUp = false;

    toggle.addEventListener('click', () => {
        isSignUp = !isSignUp;
        titleEl.textContent = isSignUp ? 'Create Account' : 'Sign In';
        submitBtn.textContent = isSignUp ? 'Create Account' : 'Sign In';
        toggle.textContent = isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up";
        errorEl.textContent = '';
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPassword').value;
        if (!email || !password) { errorEl.textContent = 'Email and password required'; return; }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Loading...';
        errorEl.textContent = '';

        try {
            if (isSignUp) {
                await signUp(email, password);
            } else {
                await signIn(email, password);
            }
            onSuccess();
        } catch (err) {
            errorEl.textContent = err.message || 'Authentication failed';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = isSignUp ? 'Create Account' : 'Sign In';
        }
    });
}
