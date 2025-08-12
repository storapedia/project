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

function renderUsersTable(users) {
    const tbody = document.getElementById('users-table-body');
    const cardView = document.getElementById('users-card-view'); 
    const searchTerm = document.getElementById('user-search').value.toLowerCase();
    
    tbody.innerHTML = '';
    cardView.innerHTML = '';

    const filtered = (users || []).filter(u => u && ((u.name?.toLowerCase() || '').includes(searchTerm) || (u.email?.toLowerCase() || '').includes(searchTerm)));

    if (filtered.length === 0) {
        const noResultsHtml = `<tr><td colspan="5" class="text-center p-8">No users found.</td></tr>`;
        tbody.innerHTML = noResultsHtml;
        cardView.innerHTML = `<p class="text-center text-gray-500 p-4">No users found.</p>`;
        return;
    }

    filtered.forEach(u => {
        if (!u || !u.id) return;

        const row = document.createElement('tr');
        row.className = 'bg-white border-b hover:bg-gray-50';
        row.innerHTML = `
            <td class="px-6 py-4 font-semibold">${u.name || 'N/A'}</td>
            <td class="px-6 py-4">${u.email || 'N/A'}</td>
            <td class="px-6 py-4">${u.phone || 'N/A'}</td>
            <td class="px-6 py-4">${u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US') : 'N/A'}</td>
            <td class="px-6 py-4 space-x-2">
                <button class="text-blue-600 hover:text-blue-900" title="Edit User" onclick="openUserEditModal('${u.id}')"><i class="fas fa-edit"></i></button>
                <button class="text-purple-600 hover:text-purple-900" title="Send Message" onclick="openDirectMessageModal('${u.id}')"><i class="fas fa-comment-dots"></i></button>
            </td>
        `;
        tbody.appendChild(row);

        const card = document.createElement('div');
        card.className = 'data-card';
        card.innerHTML = `
            <div class="card-row">
                <span class="card-label">Name:</span>
                <span class="card-value font-semibold">${u.name || 'N/A'}</span>
            </div>
            <div class="card-row">
                <span class="card-label">Email:</span>
                <span class="card-value">${u.email || 'N/A'}</span>
            </div>
            <div class="card-row">
                <span class="card-label">Phone:</span>
                <span class="card-value">${u.phone || 'N/A'}</span>
            </div>
            <div class="card-row">
                <span class="card-label">Joined On:</span>
                <span class="card-value">${u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US') : 'N/A'}</span>
            </div>
            <div class="card-actions">
                <button class="text-blue-600 hover:text-blue-900" onclick="openUserEditModal('${u.id}')"><i class="fas fa-edit"></i> Edit</button>
                <button class="text-purple-600 hover:text-purple-900" onclick="openDirectMessageModal('${u.id}')"><i class="fas fa-comment-dots"></i> Message</button>
            </div>
        `;
        cardView.appendChild(card);
    });
}

async function openUserEditModal(userId) {
    const user = allUsers[userId];
    if (!user) return;
    Swal.fire({
        title: `Edit User: ${user.name}`,
        html: `
            <input id="swal-user-name" class="swal2-input" placeholder="Full Name" value="${user.name || ''}">
            <input id="swal-user-email" class="swal2-input" placeholder="Email" value="${user.email || ''}" disabled>
            <input id="swal-user-phone" class="swal2-input" placeholder="Phone Number" value="${user.phone || ''}">
            <button id="swal-reset-password-btn" class="swal2-confirm swal2-styled mt-4">Send Password Reset</button>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Save Changes',
        didOpen: () => {
            document.getElementById('swal-reset-password-btn').addEventListener('click', () => sendPasswordReset(user.email));
        },
        preConfirm: () => ({
            name: document.getElementById('swal-user-name').value,
            phone: document.getElementById('swal-user-phone').value
        })
    }).then(result => {
        if (result.isConfirmed) {
            db.ref(`users/${userId}`).update(result.value)
                .then(() => Swal.fire('Success', 'User details updated.', 'success'))
                .catch(err => Swal.fire('Error', err.message, 'error'));
        }
    });
}