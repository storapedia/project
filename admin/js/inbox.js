window.handleReviewReply = async function(e, locationId, reviewId, userId) {
    const user = allUsers[userId];
    if (!user) return Swal.fire('Error', 'User not found for this review.', 'error');
    
    const { value: replyText } = await Swal.fire({
        title: `Reply to Review from ${user.name}`,
        input: 'textarea',
        inputPlaceholder: 'Type your reply here...',
        showCancelButton: true,
        confirmButtonText: 'Send Reply',
        customClass: {
            popup: 'swal2-popup-custom-width'
        }
    });

    if (replyText) {
        try {
            const adminId = auth.currentUser ? auth.currentUser.uid : 'admin_default_id'; 
            const adminName = auth.currentUser ? (allUsers[adminId]?.name || 'Admin') : 'Admin'; 

            const replyRef = db.ref(`reviews/${locationId}/${reviewId}/replies`).push(); 
            await replyRef.set({
                userId: adminId,
                name: adminName,
                text: replyText,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
            Swal.fire('Success', 'Reply sent successfully!', 'success');
        } catch (error) {
            Swal.fire('Error', 'Failed to send reply.', 'error');
        }
    }
};

window.viewBookingDetails = async function(bookingId) {
    const booking = allBookings.find(b => b.id === bookingId);
    if (!booking) return Swal.fire('Error', 'Booking not found.', 'error');
    const user = allUsers[booking.userId];
    const sealPhotoHtml = booking.sealPhotoUrl ? `<img src="${booking.sealPhotoUrl}" class="w-full h-auto max-w-sm mx-auto rounded-lg shadow-md border my-4">` : '<p class="text-center text-gray-500 bg-gray-100 p-4 rounded-lg my-4">No seal photo uploaded.</p>';
    
    Swal.fire({
        title: 'Booking Details',
        html: `
            <div class="text-left space-y-4">
                <div>
                    <h3 class="font-bold text-lg">${user?.name || 'Unknown User'}</h3>
                    <p class="text-sm text-gray-500">${user?.email || 'N/A'} | ${user?.phone || 'N/A'}</p>
                </div>
                <div class="border-t pt-4">
                    <p><strong class="w-32 inline-block">Booking ID:</strong> ${booking.id}</p>
                    <p><strong class="w-32 inline-block">Location:</strong> ${booking.locationName || 'N/A'}</p>
                    <p><strong class="w-32 inline-block">Unit Type:</strong> ${booking.storageType || 'N/A'}</p>
                    <p><strong class="w-32 inline-block">Period:</strong> ${booking.startDate ? new Date(booking.startDate).toLocaleDateString('en-US') : 'N/A'} - ${booking.endDate ? new Date(booking.endDate).toLocaleDateString('en-US') : 'N/A'}</p>
                    <p><strong class="w-32 inline-block">Total Price:</strong> ${currencyFormatter.format(booking.totalPrice || 0)}</p>
                    <p><strong class="w-32 inline-block">Payment Method:</strong> ${booking.paymentMethod?.replace(/_/g, ' ') || 'N/A'}</p>
                    <p><strong class="w-32 inline-block">Payment Status:</strong> ${booking.paymentStatus?.replace(/_/g, ' ') || 'N/A'}</p>
                    <p><strong class="w-32 inline-block">Service Type:</strong> ${booking.serviceType?.replace(/_/g, ' ') || 'N/A'}</p>
                </div>
                <div class="border-t pt-4">
                    <h4 class="font-semibold mb-2">Seal Details:</h4>
                    <p><strong class="w-32 inline-block">Seal Number:</strong> ${booking.sealNumber || 'Not set'}</p>
                    <div class="mt-2">
                        <h5 class="font-medium text-sm">Seal Photo:</h5>
                        ${sealPhotoHtml}
                    </div>
                </div>
            </div>
        `,
        width: '600px',
        showCloseButton: true,
        showConfirmButton: false
    });
};

window.openDirectMessageModal = function(userId) {
    showPage('inbox');
    openChatWindow(userId);
};

function fetchAndRenderConversations(forceRender = false) {
    allConversations = [];
    let totalUnread = 0;
    db.ref('chats').once('value', snapshot => {
        snapshot.forEach(convoSnapshot => {
            const userId = convoSnapshot.key;
            if (!allUsers[userId]) return; 
            
            const messagesNode = convoSnapshot.child('messages');
            if (!messagesNode.exists()) return;

            const messages = Object.values(messagesNode.val());
            const lastMessage = messages[messages.length - 1];
            const unreadCount = messages.filter(m => m.sender === 'user' && !m.read).length;
            
            if (unreadCount > 0) totalUnread++;

            allConversations.push({
                userId,
                userName: allUsers[userId]?.name || 'Unknown User',
                lastMessage: lastMessage.text,
                timestamp: lastMessage.timestamp,
                unreadCount
            });
        });

        allConversations.sort((a, b) => b.timestamp - a.timestamp);
        renderConversationsList(); 

        const inboxBadge = document.getElementById('inbox-badge');
        if (totalUnread > 0) {
            inboxBadge.textContent = totalUnread;
            inboxBadge.classList.remove('hidden');
            if (totalUnread > lastKnownUnreadCount && hasInteracted) {
                notificationSound.play().catch(e => console.warn("Admin sound play failed:", e));
            }
        } else {
            inboxBadge.classList.add('hidden');
        }
        lastKnownUnreadCount = totalUnread;

        if (forceRender && currentChatUserId) {
            openChatWindow(currentChatUserId);
        }
    });
}

function renderConversationsList() {
    const listEl = document.getElementById('conversations-list');
    const searchTerm = document.getElementById('conversation-search').value.toLowerCase();
    const activeFilter = document.querySelector('.inbox-filter-btn[data-filter="unread"]').classList.contains('bg-primary-600');

    const filtered = allConversations.filter(convo => {
        const matchesSearch = convo.userName.toLowerCase().includes(searchTerm);
        const matchesFilter = !activeFilter || convo.unreadCount > 0;
        return matchesSearch && matchesFilter;
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<p class="p-4 text-center text-gray-500">No conversations found.</p>`;
        return;
    }

    listEl.innerHTML = '';
    filtered.forEach(convo => {
        const convoEl = document.createElement('div');
        convoEl.className = `conversation-item p-4 border-b cursor-pointer hover:bg-gray-50 flex justify-between items-center ${convo.userId === currentChatUserId ? 'active' : ''}`;
        convoEl.dataset.userid = convo.userId;
        convoEl.innerHTML = `
            <div>
                <h5 class="font-bold">${convo.userName}</h5>
                <p class="text-sm text-gray-500 truncate">${convo.lastMessage}</p>
            </div>
            ${convo.unreadCount > 0 ? `<span class="unread-badge">${convo.unreadCount}</span>` : ''}
        `;
        convoEl.addEventListener('click', () => openChatWindow(convo.userId));
        listEl.appendChild(convoEl);
    });
}

function openChatWindow(userId) {
    currentChatUserId = userId;
    document.getElementById('chat-window-placeholder').classList.add('hidden');
    const chatWindow = document.getElementById('chat-window');
    chatWindow.classList.remove('hidden');
    chatWindow.classList.add('flex');
    document.getElementById('chat-user-name').textContent = allUsers[userId]?.name || 'Unknown User';
    document.getElementById('chat-user-email').textContent = allUsers[userId]?.email || '';

    const messagesRef = db.ref(`chats/${userId}/messages`);
    
    messagesRef.once('value', snapshot => {
        const updates = {};
        snapshot.forEach(child => {
            if (child.val().sender === 'user' && !child.val().read) {
                updates[child.key + '/read'] = true;
            }
        });
        if (Object.keys(updates).length > 0) messagesRef.update(updates);
    });

    if (conversationListeners[userId]) {
        conversationListeners[userId].off();
        delete conversationListeners[userId];
    }
    
    const chatMessagesEl = document.getElementById('chat-messages');
    conversationListeners[userId] = messagesRef.orderByChild('timestamp');
    conversationListeners[userId].on('value', snapshot => {
        chatMessagesEl.innerHTML = '';
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const msg = child.val();
                const bubble = document.createElement('div');
                bubble.textContent = msg.text;
                bubble.className = `p-3 rounded-lg max-w-xs ${msg.sender === 'admin' ? 'chat-bubble-sent self-end' : 'chat-bubble-received self-start'}`;
                chatMessagesEl.appendChild(bubble);
            });
        }
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight; 
    });

    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
    const activeConvoEl = document.querySelector(`.conversation-item[data-userid='${userId}']`);
    if (activeConvoEl) activeConvoEl.classList.add('active');
}

function handleSendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !currentChatUserId) return;
    
    const messageData = {
        sender: 'admin',
        text: text,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        read: false 
    };

    db.ref(`chats/${currentChatUserId}/messages`).push(messageData)
        .then(() => {
            db.ref(`chats/${currentChatUserId}/lastMessage`).set({
                text: text,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                read: false 
            });
            input.value = '';
        })
        .catch(err => Swal.fire('Error', err.message, 'error'));
}

function openDirectMessageModal(userId) {
    showPage('inbox');
    openChatWindow(userId);
}

function openNewMessageModal() {
    Swal.fire({
        title: 'Start New Conversation',
        html: `<input id="swal-user-search" class="swal2-input" placeholder="Search users by name or email..."><div id="swal-user-suggestions" class="max-h-48 overflow-y-auto border rounded mt-2 text-left"></div>`,
        didOpen: () => {
            const searchInput = document.getElementById('swal-user-search');
            const suggestionsContainer = document.getElementById('swal-user-suggestions');
            searchInput.addEventListener('input', () => {
                const searchTerm = searchInput.value.toLowerCase();
                if (searchTerm.length < 2) { suggestionsContainer.innerHTML = ''; return; }
                const suggestions = Object.entries(allUsers)
                    .filter(([id, user]) => user.name?.toLowerCase().includes(searchTerm) || user.email?.toLowerCase().includes(searchTerm))
                    .map(([id, user]) => `<div class="p-2 hover:bg-gray-100 cursor-pointer user-suggestion" data-userid="${id}">${user.name} (${user.email})</div>`).join('');
                suggestionsContainer.innerHTML = suggestions;
                suggestionsContainer.querySelectorAll('.user-suggestion').forEach(el => {
                    el.addEventListener('click', () => { Swal.close(); openDirectMessageModal(el.dataset.userid); });
                });
            });
        },
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: 'Close'
    });
}

function openBroadcastModal() {
    Swal.fire({
        title: 'Send Broadcast Message',
        input: 'textarea',
        inputLabel: 'Your message will be sent to all users as a notification.',
        inputPlaceholder: 'Type your message here...',
        showCancelButton: true,
        confirmButtonText: 'Send Broadcast',
    }).then(result => {
        if (result.isConfirmed && result.value) {
            const messageData = {
                title: 'Admin Broadcast',
                body: result.value,
                type: 'broadcast',
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                read: false
            };
            Object.keys(allUsers).forEach(uid => {
                db.ref(`notifications/users/${uid}`).push(messageData);
            });
            Swal.fire('Success', 'Broadcast message has been sent.', 'success');
        }
    });
}