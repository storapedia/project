window.showNotificationDetails = function(notificationId) {
    const notification = allNotifications.admin[notificationId];
    if (!notification) {
        return Swal.fire('Error', 'Notification not found.', 'error');
    }
    Swal.fire({
        title: notification.title,
        html: `<p class="text-sm">${notification.body}</p>`,
        icon: 'info'
    });
};

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
    // Implementation for this function is required.
};

window.fetchAndRenderDashboard = function() {
    let totalRevenue = 0;
    let activeBookingsCount = 0;
    const now = Date.now();
    const sevenDaysFromNow = now + (7 * 24 * 60 * 60 * 1000);
    let expiringSoonHtml = '';
    let overdueCheckoutHtml = '';

    (allBookings || []).forEach(booking => {
        if (booking.paymentStatus === 'paid' && typeof booking.totalPrice === 'number') {
            totalRevenue += booking.totalPrice;
        }

        if (['active', 'checked_in'].includes(booking.bookingStatus)) {
            activeBookingsCount++;
            const userName = allUsers[booking.userId]?.name || 'Unknown User';

            if (booking.endDate < sevenDaysFromNow && booking.endDate > now) {
                expiringSoonHtml += `<div class="p-2 bg-orange-50 rounded-md flex justify-between items-center"><span><strong>${userName}</strong> at ${booking.locationName || 'N/A'}</span> <button class="text-blue-500 text-xs font-semibold" onclick="viewBookingDetails('${booking.id}')">View</button></div>`;
            } else if (booking.endDate < now && booking.bookingStatus === 'checked_in') {
                overdueCheckoutHtml += `<div class="p-2 bg-red-50 rounded-md flex justify-between items-center"><span><strong>${userName}</strong> at ${booking.locationName || 'N/A'}</span> <button class="text-blue-500 text-xs font-semibold" onclick="followUpOverdue('${booking.id}')">Follow Up</button></div>`;
            }
        }
    });

    document.getElementById('stat-revenue').textContent = currencyFormatter.format(totalRevenue);
    document.getElementById('stat-active-bookings').textContent = activeBookingsCount;
    document.getElementById('expiring-soon-list').innerHTML = expiringSoonHtml || '<p class="text-gray-500 text-center p-2">No bookings expiring soon.</p>';
    document.getElementById('overdue-checkout-list').innerHTML = overdueCheckoutHtml || '<p class="text-gray-500 text-center p-2">No overdue check-outs.</p>';

    renderRevenueChart(allBookings);

    db.ref('users').once('value', snapshot => document.getElementById('stat-total-users').textContent = snapshot.numChildren());
    db.ref('storageLocations').once('value', snapshot => {
        let total = 0;
        snapshot.forEach(child => total += (Number(child.val().totalCapacity) || 0));
        document.getElementById('stat-total-capacity').textContent = `${total} Units`;
    });
}

function renderRevenueChart(bookings) {
    const ctx = document.getElementById('revenue-chart').getContext('2d');
    const monthlyRevenue = {};
    (bookings || []).forEach(b => {
        if (b.paymentStatus === 'paid' && b.createdAt && typeof b.totalPrice === 'number') {
            const month = new Date(b.createdAt).toLocaleString('default', { month: 'short', year: 'numeric' });
            monthlyRevenue[month] = (monthlyRevenue[month] || 0) + b.totalPrice;
        }
    });
    const labels = Object.keys(monthlyRevenue).sort((a, b) => new Date(a) - new Date(b));
    const data = labels.map(label => monthlyRevenue[label]);

    if (window.revenueChart) window.revenueChart.destroy();
    window.revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Revenue (USD)',
                data,
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            scales: { y: { beginAtZero: true } },
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function showRevenueDetails() {
    const tableBody = allBookings.filter(b => b.paymentStatus === 'paid').map(b => `
        <tr class="border-b">
            <td class="p-2">${allUsers[b.userId]?.name || 'N/A'}</td>
            <td class="p-2">${b.locationName}</td>
            <td class="p-2">${currencyFormatter.format(b.totalPrice)}</td>
        </tr>
    `).join('');
    Swal.fire({
        title: 'Revenue Details',
        html: `<div class="max-h-96 overflow-y-auto"><table class="w-full text-sm text-left"><thead class="bg-gray-100"><tr><th class="p-2">User</th><th class="p-2">Location</th><th class="p-2">Amount</th></tr></thead><tbody>${tableBody}</tbody></table></div>`,
        width: '600px'
    });
}

function showActiveBookingsDetails() {
    const tableBody = allBookings.filter(b => ['active', 'checked_in'].includes(b.bookingStatus)).map(b => `
        <tr class="border-b">
            <td class="p-2">${allUsers[b.userId]?.name || 'N/A'}</td>
            <td class="p-2">${b.locationName}</td>
            <td class="p-2">${b.endDate ? new Date(b.endDate).toLocaleDateString('en-US') : 'N/A'}</td>
        </tr>
    `).join('');
    Swal.fire({
        title: 'Active Booking Details',
        html: `<div class="max-h-96 overflow-y-auto"><table class="w-full text-sm text-left"><thead class="bg-gray-100"><tr><th class="p-2">User</th><th class="p-2">Location</th><th class="p-2">End Date</th></tr></thead><tbody>${tableBody}</tbody></table></div>`,
        width: '600px'
    });
}

function showCapacityDetails() {
    const tableBody = allLocations.map(loc => `
        <tr class="border-b">
            <td class="p-2">${loc.name}</td>
            <td class="p-2">${loc.totalCapacity} units available</td>
        </tr>
    `).join('');
    Swal.fire({
        title: 'Capacity per Location',
        html: `<div class="max-h-96 overflow-y-auto"><table class="w-full text-sm text-left"><thead class="bg-gray-100"><tr><th class="p-2">Location</th><th class="p-2">Available Capacity</th></tr></thead><tbody>${tableBody}</tbody></table></div>`,
        width: '600px'
    });
}

window.handlePickupRequest = async function(bookingId) {
    const booking = allBookings.find(b => b.id === bookingId);
    const user = allUsers[booking.userId];

    if (!booking || !user) {
        return Swal.fire('Error', 'Booking or user data not found.', 'error');
    }

    const courierOptionsHtml = Object.entries(allCouriers || {}).map(([id, courier]) =>
        `<option value="${id}">${courier.name} (${courier.assignedLocationId || 'Any'})</option>`
    ).join('');

    const locationData = allLocations.find(loc => loc.id === booking.locationId);
    const geolocation = booking.geolocation || locationData?.geolocation;
    
    const directionsUrl = geolocation ?
        `https://www.google.com/maps/dir/?api=1&destination=${geolocation.latitude},${geolocation.longitude}` : '#';

    await Swal.fire({
        title: 'Assign Courier for Pickup',
        width: '800px',
        html: `
            <div class="text-left p-4 space-y-4">
                <div>
                    <h3 class="font-bold text-lg border-b pb-2 mb-2">Booking Details</h3>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <p><strong>Booking ID:</strong> ${booking.id}</p>
                        <p><strong>Customer:</strong> ${user.name}</p>
                        <p><strong>Service:</strong> ${booking.storageType}</p>
                        <p><strong>Location:</strong> ${booking.locationName}</p>
                    </div>
                </div>
                <div>
                    <h3 class="font-bold text-lg border-b pb-2 mb-2">Pickup Details</h3>
                    <div class="text-sm space-y-1">
                        <p><strong>Address:</strong> ${booking.pickupAddress}</p>
                        <p><strong>Time:</strong> ${booking.pickupTime}</p>
                        ${geolocation ? `<a href="${directionsUrl}" target="_blank" class="text-blue-600 hover:underline"><i class="fas fa-map-marker-alt mr-1"></i> Get Directions</a>` : '<p>No location data available.</p>'}
                    </div>
                </div>
                <div>
                    <h3 class="font-bold text-lg border-b pb-2 mb-2">Assign Courier</h3>
                    <div class="flex items-center space-x-2">
                        <input type="text" id="courier-search" class="swal2-input flex-grow" placeholder="Search courier by name...">
                        <select id="swal-courier-select" class="swal2-input flex-grow">
                            <option value="" disabled selected>-- Select a Courier --</option>
                            ${courierOptionsHtml}
                        </select>
                    </div>
                </div>
            </div>`,
        didOpen: () => {
            const searchInput = document.getElementById('courier-search');
            const selectInput = document.getElementById('swal-courier-select');
            const options = Array.from(selectInput.options);
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                selectInput.innerHTML = '';
                options.forEach(opt => {
                    if (opt.text.toLowerCase().includes(searchTerm)) {
                        selectInput.add(opt.cloneNode(true));
                    }
                });
            });
        },
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Assign & Notify Courier',
        confirmButtonColor: '#3B82F6',
        preConfirm: () => {
            const selectedCourierId = document.getElementById('swal-courier-select').value;
            if (!selectedCourierId) {
                Swal.showValidationMessage('You must select a courier.');
                return false;
            }
            return selectedCourierId;
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const courierId = result.value;
            const courier = allCouriers[courierId];
            Swal.fire({ title: 'Processing...', text: `Assigning ${courier.name}...`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                await db.ref(`bookings/${bookingId}`).update({
                    bookingStatus: 'processing_by_courier',
                    courierId: courierId,
                    courierName: courier.name
                });

                const pickupSnapshot = await db.ref(`pickupRequests/${booking.locationId}`).orderByChild('bookingId').equalTo(bookingId).once('value');
                if (pickupSnapshot.exists()) {
                    const pickupRequestId = Object.keys(pickupSnapshot.val())[0];
                    await db.ref(`pickupRequests/${booking.locationId}/${pickupRequestId}`).update({
                        status: 'processing_by_courier',
                        courierId: courierId
                    });
                }
                const chatMessage = `New pickup assigned! Booking ID: ${booking.id}, Customer: ${user.name}, Address: ${booking.pickupAddress}, Time: ${booking.pickupTime}. Directions: ${directionsUrl}`;
                console.log(`(Simulated) Chat sent to ${courier.name}: ${chatMessage}`);
                Swal.fire('Assigned!', `${courier.name} has been assigned and notified.`, 'success');
            } catch (error) {
                console.error("Failed to assign courier:", error);
                Swal.fire('Error!', `Failed to assign courier: ${error.message}`, 'error');
            }
        }
    });
};

function startQrScanner() {
    if(html5QrCode && html5QrCode.isScanning) { html5QrCode.stop(); }
    document.getElementById('qr-scanner-modal').classList.remove('hidden');

    html5QrCode = new Html5Qrcode("qr-reader");
    const successCb = async (decodedText, decodedResult) => {
        document.getElementById('qr-scanner-modal').classList.add('hidden');
        if (html5QrCode && html5QrCode.isScanning) html5QrCode.stop();
        const booking = allBookings.find(b => b.id === decodedText);
        if(booking) {
            if (['active', 'processing_by_courier'].includes(booking.bookingStatus)) {
                handleBookingVerification(booking);
            } else {
                Swal.fire('Info', `Booking status is ${booking.bookingStatus}.`, 'info');
            }
        } else {
            Swal.fire('Error', `Booking ID ${decodedText} not found.`, 'error');
        }
    };
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, successCb).catch(err => {
        Swal.fire('Camera Error', 'Could not start camera. Please ensure camera permissions are granted and no other app is using it.', 'error');
    });
}

// Fungsi baru untuk menangani alur verifikasi pembayaran dan check-in
async function handleBookingVerification(booking) {
    const showCheckInFlow = async (currentBooking) => {
        const swalResult = await Swal.fire({
            title: 'Finalize Check-in',
            html: `
                <div class="text-left space-y-4 p-2">
                    <div>
                        <label for="seal-code" class="font-semibold block mb-1">Seal Code</label>
                        <input type="text" id="seal-code" class="swal2-input" placeholder="Enter seal code...">
                    </div>
                    <div>
                        <label class="font-semibold block mb-1">Seal Photo</label>
                        <div id="camera-container" class="relative">
                            <video id="camera-feed" class="w-full h-48 bg-gray-200 rounded" autoplay playsinline></video>
                            <canvas id="photo-canvas" class="hidden"></canvas>
                            <img id="photo-preview" class="hidden w-full h-48 object-cover rounded"/>
                        </div>
                        <button id="take-photo-btn" class="w-full mt-2 p-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                            <i class="fas fa-camera"></i> Take Photo
                        </button>
                    </div>
                </div>`,
            showCancelButton: true,
            confirmButtonText: 'Submit Check-in',
            didOpen: () => {
                const video = document.getElementById('camera-feed');
                const canvas = document.getElementById('photo-canvas');
                const takePhotoBtn = document.getElementById('take-photo-btn');
                const photoPreview = document.getElementById('photo-preview');
                navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
                    video.srcObject = stream;
                }).catch(err => Swal.showValidationMessage(`Camera error: ${err.message}`));
                takePhotoBtn.addEventListener('click', () => {
                    if (video.classList.contains('hidden')) {
                        video.classList.remove('hidden');
                        photoPreview.classList.add('hidden');
                        takePhotoBtn.innerHTML = '<i class="fas fa-camera"></i> Take Photo';
                        return;
                    }
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    canvas.getContext('2d').drawImage(video, 0, 0);
                    photoPreview.src = canvas.toDataURL('image/jpeg');
                    photoPreview.classList.remove('hidden');
                    video.classList.add('hidden');
                    takePhotoBtn.innerHTML = '<i class="fas fa-redo"></i> Retake Photo';
                });
            },
            preConfirm: () => {
                const sealCode = document.getElementById('seal-code').value;
                const photoPreview = document.getElementById('photo-preview');
                if (!sealCode.trim()) return Swal.showValidationMessage('Seal code is required.');
                if (photoPreview.classList.contains('hidden') || !photoPreview.src) return Swal.showValidationMessage('Seal photo is required.');
                return { sealCode: sealCode.trim(), photoDataUrl: photoPreview.src };
            }
        });

        if (swalResult.isConfirmed) {
            const { sealCode, photoDataUrl } = swalResult.value;
            Swal.fire({ title: 'Uploading...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                const storageRef = firebase.storage().ref(`seal_photos/${currentBooking.id}-${Date.now()}.jpg`);
                const snapshot = await storageRef.putString(photoDataUrl, 'data_url');
                const photoURL = await snapshot.ref.getDownloadURL();
                await db.ref(`bookings/${currentBooking.id}`).update({
                    bookingStatus: 'checked_in',
                    checkInTime: firebase.database.ServerValue.TIMESTAMP,
                    sealNumber: sealCode,
                    sealPhotoUrl: photoURL
                });
                Swal.fire('Checked In!', 'The booking has been successfully checked in.', 'success');
            } catch (error) {
                Swal.fire('Error', `Failed to complete check-in: ${error.message}`, 'error');
            }
        }
    };

    const showVerificationPopup = async (currentBooking) => {
        let paymentSectionHtml = currentBooking.paymentStatus === 'paid' ?
            `<p class="text-green-600 font-semibold">Status: Already Paid</p><button id="proceed-checkin-btn" class="swal2-confirm swal2-styled mt-2" style="background-color: #10B981;">Proceed to Check-in</button>` :
            `<p class="text-red-600 font-semibold">Status: Payment Required</p><button id="confirm-payment-btn" class="swal2-confirm swal2-styled mt-2">Confirm Payment</button>`;

        await Swal.fire({
            title: 'Booking Verification',
            html: `
                <div id="booking-details-content" class="text-left p-4 space-y-2">
                    <p><strong>Booking ID:</strong> ${currentBooking.id}</p>
                    <p><strong>Customer:</strong> ${allUsers[currentBooking.userId]?.name || 'N/A'}</p>
                    <p><strong>Storage:</strong> ${currentBooking.storageType} at ${currentBooking.locationName}</p>
                    <p><strong>Total Price:</strong> ${currencyFormatter.format(currentBooking.totalPrice)}</p>
                    <div class="mt-4 pt-4 border-t">${paymentSectionHtml}</div>
                </div>`,
            showCancelButton: true,
            showConfirmButton: false,
            didOpen: () => {
                const popup = Swal.getPopup();
                popup.querySelector('#confirm-payment-btn')?.addEventListener('click', async () => {
                    await db.ref(`bookings/${currentBooking.id}`).update({ paymentStatus: 'paid' });
                    currentBooking.paymentStatus = 'paid';
                    Swal.close();
                    showVerificationPopup(currentBooking);
                });
                popup.querySelector('#proceed-checkin-btn')?.addEventListener('click', () => {
                    Swal.close();
                    showCheckInFlow(currentBooking);
                });
            }
        });
    };

    await showVerificationPopup(booking);
};