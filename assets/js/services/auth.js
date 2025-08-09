import { auth, googleAuthProvider, db } from '../firebase-init.js';
import { showToast } from '../ui/ui-helpers.js';

let currentUser = null;

export function getCurrentUser() {
    return currentUser;
}

export function onAuthStateChanged(callback) {
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
        return user;
    } catch (error) {
        showToast(`Google login failed: ${error.message}`, 'error');
        throw error;
    }
}

export async function signOut() {
    try {
        await auth.signOut();
        showToast('You have been logged out.', 'info');
    } catch (error) {
        showToast(`Logout failed: ${error.message}`, 'error');
        throw error;
    }
}