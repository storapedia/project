// storapedia/assets/js/pages/notifications.js
import { db } from '../firebase-init.js';
import { getCurrentUser } from '../services/auth.js';
import { showLoader, showToast } from '../ui/ui-helpers.js';

let notificationListener = null; // To hold the Firebase listener

export default {
    render: async () => `
        <div class="page-header">
            <h2 class="page-title">Notifications</h2>
        </div>
        <div style="padding: 1.5rem;">
            <div class="flex justify-end mb-4">
                <button id="mark-all-read-btn" class="btn btn-secondary text-sm">Mark all as read</button>
            </div>
            <div id="notifications-list-container" class="space-y-3">
                <p class="text-gray-500 text-center p-4">Loading notifications...</p>
            </div>
        </div>
    `,
    afterRender: async () => {
        const user = getCurrentUser();
        if (!user) {
            location.hash = '#/auth'; // Redirect to auth if no user
            return;
        }

        const notificationsListContainer = document.getElementById('notifications-list-container');
        const markAllReadBtn = document.getElementById('mark-all-read-btn');

        // Detach previous listener if it exists
        if (notificationListener) {
            notificationListener.off();
        }

        // Set up new listener for the current user's notifications
        notificationListener = db.ref(`notifications/users/${user.uid}`).orderByChild('timestamp');

        notificationListener.on('value', (snapshot) => {
            const notifications = [];
            snapshot.forEach((childSnapshot) => {
                notifications.push({ id: childSnapshot.key, ...childSnapshot.val() });
            });
            notifications.reverse(); // Display newest first

            if (notifications.length === 0) {
                notificationsListContainer.innerHTML = '<p class="text-gray-500 text-center p-4">You have no notifications.</p>';
                markAllReadBtn.classList.add('hidden');
            } else {
                notificationsListContainer.innerHTML = notifications.map(notif => `
                    <div class="notification-item p-3 rounded-lg border border-gray-200 cursor-pointer ${!notif.read ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white hover:bg-gray-50'}"
                         data-notif-id="${notif.id}">
                        <h3 class="font-semibold text-lg">${notif.title || 'No Title'}</h3>
                        <p class="text-sm text-gray-700 mt-1">${notif.body || notif.message || 'No content.'}</p>
                        <p class="text-right text-xs text-gray-500 mt-2">${notif.timestamp ? new Date(notif.timestamp).toLocaleString() : ''}</p>
                    </div>
                `).join('');
                markAllReadBtn.classList.remove('hidden');
            }

            // Add click listeners to individual notification items
            notificationsListContainer.querySelectorAll('.notification-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const notifId = item.dataset.notifId;
                    if (notifId && !item.classList.contains('bg-white')) { // Only mark as read if it's currently unread (blue background)
                        try {
                            await db.ref(`notifications/users/${user.uid}/${notifId}`).update({ read: true });
                            // The UI will automatically update due to the Firebase listener
                        } catch (error) {
                            console.error("Failed to mark notification as read:", error);
                            showToast('Failed to mark notification as read.', 'error');
                        }
                    }
                });
            });

        }, (error) => {
            console.error("Error fetching user notifications:", error);
            notificationsListContainer.innerHTML = '<p class="text-red-500 text-center p-4">Failed to load notifications.</p>';
            markAllReadBtn.classList.add('hidden');
        });

        // Event listener for "Mark all as read" button
        markAllReadBtn.addEventListener('click', async () => {
            showLoader(true, 'Marking all as read...');
            try {
                const unreadSnapshot = await db.ref(`notifications/users/${user.uid}`).orderByChild('read').equalTo(false).once('value');
                const updates = {};
                unreadSnapshot.forEach(child => {
                    updates[`${child.key}/read`] = true;
                });
                if (Object.keys(updates).length > 0) {
                    await db.ref(`notifications/users/${user.uid}`).update(updates);
                    showToast('All notifications marked as read!', 'success');
                } else {
                    showToast('No unread notifications.', 'info');
                }
            } catch (error) {
                console.error("Failed to mark all notifications as read:", error);
                showToast('Failed to mark all notifications as read.', 'error');
            } finally {
                showLoader(false);
            }
        });
    }
};