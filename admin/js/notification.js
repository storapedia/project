const adminNotificationSound = new Audio('/admin/assets/sounds/notification.wav');
let lastAdminUnreadCount = 0;

function initNotificationSystem() {
    const notificationsRef = firebase.database().ref('notifications/admin').orderByChild('timestamp').limitToLast(50);
    const badge = document.getElementById('notification-count');
    const popup = document.getElementById('notification-popup');
    const list = document.getElementById('notification-list');
    if (!badge || !popup || !list) {
        console.warn('Notification elements not found in DOM. Check your HTML.');
        return;
    }
    notificationsRef.on('value', snapshot => {
        const notifications = [];
        snapshot.forEach(childSnapshot => {
            notifications.push({ id: childSnapshot.key, ...childSnapshot.val() });
        });
        notifications.reverse();
        updateNotificationUI(notifications, badge, list);
    });
    const bellBtn = document.getElementById('notification-button');
    if (bellBtn) {
        bellBtn.onclick = e => {
            e.stopPropagation();
            popup.classList.toggle('hidden');
            if (!popup.classList.contains('hidden')) {
                markVisibleNotificationsAsRead();
                setTimeout(() => {
                    list.scrollTop = 0;
                }, 100);
            }
        };
    }
    document.body.addEventListener('click', e => {
        if (!popup.classList.contains('hidden')) {
            if (!popup.contains(e.target) && !bellBtn.contains(e.target)) {
                popup.classList.add('hidden');
            }
        }
    });
    const markAllBtn = document.getElementById('mark-all-read-btn');
    if (markAllBtn) {
        markAllBtn.onclick = async () => {
            const snapshot = await firebase.database().ref('notifications/admin').orderByChild('read').equalTo(false).once('value');
            const updates = {};
            snapshot.forEach(child => {
                updates[`${child.key}/read`] = true;
            });
            await firebase.database().ref('notifications/admin').update(updates);
            popup.classList.add('hidden');
        };
    }
}

async function markVisibleNotificationsAsRead() {
    const snapshot = await firebase.database().ref('notifications/admin').orderByChild('read').equalTo(false).once('value');
    const updates = {};
    snapshot.forEach(child => {
        if (!child.val().read) {
            updates[`${child.key}/read`] = true;
        }
    });
    if (Object.keys(updates).length > 0) {
        await firebase.database().ref('notifications/admin').update(updates);
    }
}

function updateNotificationUI(notifications, badge, list) {
    if (!list) return;
    if (notifications.length === 0) {
        list.innerHTML = '<p class="text-gray-500 text-sm p-4 text-center">No notifications.</p>';
    } else {
        list.innerHTML = notifications.map(notification => {
            const bookingIdMatch = notification.body?.match(/Booking ID: (.*?) /);
            const bookingId = (bookingIdMatch && bookingIdMatch[1] !== 'undefined') ? bookingIdMatch[1].trim() : (notification.bookingId || '');
            const userIdMatch = notification.body?.match(/User (.*)$/);
            const userId = userIdMatch ? userIdMatch[1].trim() : (notification.userId || '');
            return `
                <div class="notification-item p-2 rounded-md cursor-pointer hover:bg-gray-100 ${!notification.read ? 'bg-blue-50' : ''}"
                     data-notif-id="${notification.id}"
                     data-notif-type="${notification.type || 'general'}"
                     data-booking-id="${bookingId}"
                     data-user-id="${userId}"
                     data-location-id="${notification.locationId || ''}"
                     data-review-id="${notification.reviewId || ''}">
                    <p class="font-bold text-sm">${notification.title || ''}</p>
                    <p class="text-xs text-gray-600">${notification.body || notification.message || ''}</p>
                    <p class="text-right text-xs text-gray-400 mt-1">${notification.timestamp ? new Date(notification.timestamp).toLocaleString() : ''}</p>
                </div>
            `;
        }).join('');
        list.querySelectorAll('.notification-item').forEach(item => {
            item.onclick = async (e) => {
                const notifId = item.getAttribute('data-notif-id');
                const notifType = item.getAttribute('data-notif-type');
                let bookingId = item.getAttribute('data-booking-id');
                const userId = item.getAttribute('data-user-id');
                const locationId = item.getAttribute('data-location-id');
                const reviewId = item.getAttribute('data-review-id');

                if (item.classList.contains('bg-blue-50')) {
                    await firebase.database().ref('notifications/admin/' + notifId).update({ read: true });
                    item.classList.remove('bg-blue-50');
                }
                
                 if (notifType === 'pickupRequest' && !bookingId) {
                    const bodyText = item.querySelector('.text-xs').textContent;
                    const idFromBody = bodyText.match(/Booking ID:\s*(-[A-Za-z0-9_-]+)/);
                    if (idFromBody && idFromBody[1]) {
                        bookingId = idFromBody[1];
                    }
                }
                
                switch (notifType) {
                    case 'booking':
                    case 'booking_new':
                    case 'booking_check_in':
                    case 'booking_check_out':
                    case 'booking_extend':
                        if (typeof window.viewBookingDetails === 'function' && bookingId) {
                            window.viewBookingDetails(bookingId);
                        } else {
                            console.warn('Function viewBookingDetails not found or bookingId is empty.', { notifId, notifType, bookingId });
                            Swal.fire('Notification Details', `Information about booking (${notifType}): Booking ID ${bookingId}`, 'info');
                        }
                        break;
                    case 'pickupRequest':
                        if (typeof window.handlePickupRequest === 'function' && bookingId && bookingId.length > 0) {
                            window.handlePickupRequest(bookingId);
                        } else {
                            console.warn('Function handlePickupRequest not found or bookingId is empty.', { notifId, notifType, bookingId });
                            Swal.fire('Notification Details', `New Pickup Request: Booking ID ${bookingId}`, 'info');
                        }
                        break;
                    case 'chat':
                        if (typeof window.openDirectMessageModal === 'function' && userId) {
                            window.openDirectMessageModal(userId);
                        } else {
                            console.warn('Function openDirectMessageModal not found or userId is empty.', { notifId, notifType, userId });
                            Swal.fire('Notification Details', `New message from user: ${userId}`, 'info');
                        }
                        break;
                    case 'review':
                    case 'review_new':
                        if (typeof window.handleReviewReply === 'function' && reviewId && locationId && userId) {
                            window.handleReviewReply(e, locationId, reviewId, userId);
                        } else if (typeof window.renderReviews === 'function') {
                            window.renderReviews();
                            Swal.fire('Notification Details', `New review: ${reviewId}`, 'info');
                        } else {
                            console.warn('Function handleReviewReply or renderReviews not found.', { notifId, notifType, reviewId, locationId, userId });
                            Swal.fire('Notification Details', `New review for location: ${locationId}`, 'info');
                        }
                        break;
                    case 'general':
                    default:
                        Swal.fire('Notification Details', `General notification: ${notification.title || ''}`, 'info');
                        break;
                }
            };
        });
    }
    const currentUnreadCount = notifications.filter(n => !n.read).length;
    if (currentUnreadCount > lastAdminUnreadCount && window.hasInteracted) {
        adminNotificationSound.play().catch(e => console.warn("Admin notification sound failed to play:", e));
    }
    lastAdminUnreadCount = currentUnreadCount;
    if (currentUnreadCount > 0) {
        badge.textContent = currentUnreadCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', initNotificationSystem);