import { signInWithGoogle } from '../services/auth.js';
import { showLoader, showToast } from '../ui/ui-helpers.js';

function addAuthListeners() {
    const googleBtn = document.getElementById('login-google-btn');
    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            showLoader(true, 'Signing in...');
            try {
                await signInWithGoogle();
                // Logic is now handled by the onAuthStateChanged listener in main.js
                // This page will be replaced automatically.
            } catch (error) {
                console.error("Auth page sign in failed", error);
                showToast('Sign in failed. Please try again.', 'error');
                showLoader(false);
            }
        });
    }
}

export default {
    render: async () => `
        <div class="page-header">
            <h2 class="page-title">Login or Register</h2>
        </div>
        <div style="padding: 1.5rem; text-align: center;">
            <div class="location-card" style="padding: 2rem;">
                <h3 style="margin-bottom: 0.5rem; font-size: 1.2rem;">Complete Your Booking</h3>
                <p style="color: var(--neutral-500); margin-bottom: 2rem;">Please sign in with your Google account to continue.</p>
                <button id="login-google-btn" class="btn btn-primary btn-full">
                    <i class="fab fa-google" style="margin-right: 0.75rem;"></i>
                    Sign In with Google
                </button>
            </div>
        </div>
    `,
    afterRender: async () => {
        addAuthListeners();
    }
};