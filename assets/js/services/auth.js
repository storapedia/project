import { auth, googleAuthProvider, db } from '../firebase-init.js';
import { showToast } from '../ui/ui-helpers.js';

let currentUser = null;
let authStatePromise = null;

// Fungsi untuk mendapatkan status auth awal sebagai promise
const initializeAuth = () => {
    if (!authStatePromise) {
        authStatePromise = new Promise((resolve) => {
            const unsubscribe = auth.onAuthStateChanged(user => {
                currentUser = user;
                resolve(user);
                unsubscribe(); // Hentikan listener setelah mendapatkan status awal
            });
        });
    }
    return authStatePromise;
};

export function getCurrentUser() {
    return currentUser;
}

export function onAuthStateChanged(callback) {
    // Listener ini akan terus aktif untuk memantau perubahan (login/logout)
    auth.onAuthStateChanged(user => {
        currentUser = user;
        callback(user);
    });
}

export async function signInWithGoogle() {
    try {
        const result = await auth.signInWithPopup(googleAuthProvider);
        const user = result.user;
        const userRef = db.ref(`users/${user.uid}`);
        const snapshot = await userRef.once('value');
        if (!snapshot.exists()) {
            await userRef.set({
                name: user.displayName,
                email: user.email,
                phone: user.phoneNumber || '',
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                emailVerified: user.emailVerified
            });
        }
        showToast('Logged in successfully with Google!', 'success');
        // Reset promise agar bisa diinisialisasi ulang jika perlu
        authStatePromise = null;
        return user;
    } catch (error) {
        showToast(`Google login failed: ${error.message}`, 'error');
        throw error;
    }
}

export async function signOut() {
    try {
        await auth.signOut();
        authStatePromise = null; // Reset saat logout
        showToast('You have been logged out.', 'info');
    } catch (error) {
        showToast(`Logout failed: ${error.message}`, 'error');
        throw error;
    }
}

// Ekspor fungsi inisialisasi
export { initializeAuth };