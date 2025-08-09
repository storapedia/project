// =====================================================================
// BOOKINGS LOGIC
// =====================================================================

/**
 * Merender tabel dan tampilan kartu untuk semua pemesanan.
 * Mendukung filter berdasarkan pencarian, status, layanan, dan lokasi.
 */
function renderBookingsTable() {
    const tbody = document.getElementById('bookings-table-body');
    const cardView = document.getElementById('bookings-card-view');
    const searchTerm = document.getElementById('booking-search').value.toLowerCase();
    const statusFilter = document.getElementById('booking-status-filter').value;
    const locationFilter = document.getElementById('booking-location-filter').value;
    const serviceTypeFilter = document.getElementById('booking-service-type-filter').value;

    tbody.innerHTML = '';
    cardView.innerHTML = '';

    const filtered = (allBookings || []).filter(b => {
        if (!b || !b.id) return false;

        const user = allUsers[b.userId];
        const userName = user?.name || '';
        const userEmail = user?.email || '';

        const searchCorpus = `${userName} ${userEmail} ${b.id} ${b.locationName || ''} ${b.storageType || ''} ${b.courierName || ''}`.toLowerCase();

        const matchesSearch = !searchTerm || searchCorpus.includes(searchTerm);
        const matchesStatus = !statusFilter || b.bookingStatus === statusFilter;
        const matchesLocation = !locationFilter || b.locationId === locationFilter;
        const matchesServiceType = !serviceTypeFilter || b.serviceType === serviceTypeFilter;

        return matchesSearch && matchesStatus && matchesLocation && matchesServiceType;
    });

    if (filtered.length === 0) {
        const noResultsHtml = `<tr><td colspan="5" class="text-center p-8 text-gray-500">No bookings found matching your criteria.</td></tr>`;
        tbody.innerHTML = noResultsHtml;
        cardView.innerHTML = `<p class="text-center text-gray-500 p-4">No bookings found matching your criteria.</p>`;
        return;
    }

    filtered.forEach(b => {
        const user = allUsers[b.userId];
        const userNameDisplay = user?.name || `<span class="text-red-500">Unknown User</span>`;
        const userEmailDisplay = user?.email || `<span class="text-red-500">ID: ${b.userId}</span>`;
        const startDate = b.startDate ? new Date(b.startDate).toLocaleDateString('en-US') : 'N/A';
        const endDate = b.endDate ? new Date(b.endDate).toLocaleDateString('en-US') : 'N/A';
        
        let statusClass = 'bg-gray-100 text-gray-800';
        if (b.bookingStatus === 'active' || b.bookingStatus === 'processing_by_courier') statusClass = 'bg-blue-100 text-blue-800';
        if (b.bookingStatus === 'checked_in') statusClass = 'bg-green-100 text-green-800';
        if (b.bookingStatus === 'completed') statusClass = 'bg-purple-100 text-purple-800';
        if (b.bookingStatus === 'cancelled') statusClass = 'bg-red-100 text-red-800';
        if (b.paymentStatus === 'pending') statusClass = 'bg-yellow-100 text-yellow-800';

        // Table Row for Desktop
        const row = document.createElement('tr');
        row.className = 'bg-white border-b hover:bg-gray-50';
        row.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-semibold">${userNameDisplay}</div>
                <div class="text-gray-500 text-xs">${userEmailDisplay}</div>
            </td>
            <td class="px-6 py-4">
                <div class="font-semibold">${b.locationName || 'N/A'} (${b.storageType || 'N/A'})</div>
                <div class="text-gray-500 text-xs">ID: ${b.id}</div>
            </td>
            <td class="px-6 py-4">${startDate} - ${endDate}</td>
            <td class="px-6 py-4"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs capitalize ${statusClass}">${(b.bookingStatus || 'unknown').replace(/_/g, ' ')}</span></td>
            <td class="px-6 py-4 space-x-2">
                <button class="text-blue-600 hover:text-blue-900" title="View Details" onclick="viewBookingDetails('${b.id}')"><i class="fas fa-eye"></i></button>
                <button class="text-primary-600 hover:text-primary-800" title="Edit Booking" onclick="openEditBookingModal('${b.id}')"><i class="fas fa-edit"></i></button>
                ${b.serviceType === 'pickup' && (b.bookingStatus === 'active' || b.bookingStatus === 'requested') ? `<button class="text-purple-600 hover:text-purple-900" title="Assign Courier" onclick="handlePickupRequest('${b.id}')"><i class="fas fa-truck-fast"></i></button>` : ''}
                ${b.bookingStatus === 'active' || b.bookingStatus === 'processing_by_courier' ? `<button class="text-green-600 hover:text-green-900" title="Check In" onclick="handleCheckIn('${b.id}')"><i class="fas fa-sign-in-alt"></i></button>` : ''}
                ${b.bookingStatus === 'checked_in' ? `<button class="text-red-600 hover:text-red-900" title="Check Out" onclick="handleCheckOut('${b.id}', '${b.locationId}')"><i class="fas fa-sign-out-alt"></i></button>` : ''}
            </td>
        `;
        tbody.appendChild(row);

        // Card View for Mobile
        const card = document.createElement('div');
        card.className = 'data-card';
        card.innerHTML = `
            <div class="card-row">
                <span class="card-label">User:</span>
                <span class="card-value">${userNameDisplay}</span>
            </div>
            <div class="card-row">
                <span class="card-label">Booking ID:</span>
                <span class="card-value">${b.id}</span>
            </div>
            <div class="card-row">
                <span class="card-label">Location:</span>
                <span class="card-value">${b.locationName || 'N/A'}</span>
            </div>
            <div class="card-row">
                <span class="card-label">Storage Type:</span>
                <span class="card-value">${b.storageType || 'N/A'}</span>
            </div>
            <div class="card-row">
                <span class="card-label">Dates:</span>
                <span class="card-value">${startDate} - ${endDate}</span>
            </div>
            <div class="card-row">
                <span class="card-label">Status:</span>
                <span class="card-value"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs capitalize ${statusClass}">${(b.bookingStatus || 'unknown').replace(/_/g, ' ')}</span></span>
            </div>
            <div class="card-actions">
                <button class="text-blue-600 hover:text-blue-900" onclick="viewBookingDetails('${b.id}')"><i class="fas fa-eye"></i> View</button>
                <button class="text-primary-600 hover:text-primary-800" onclick="openEditBookingModal('${b.id}')"><i class="fas fa-edit"></i> Edit</button>
                ${b.serviceType === 'pickup' && (b.bookingStatus === 'active' || b.bookingStatus === 'requested') ? `<button class="text-purple-600 hover:text-purple-900" title="Assign Courier" onclick="handlePickupRequest('${b.id}')"><i class="fas fa-truck-fast"></i> Assign</button>` : ''}
                ${b.bookingStatus === 'active' || b.bookingStatus === 'processing_by_courier' ? `<button class="text-green-600 hover:text-green-900" onclick="handleCheckIn('${b.id}')"><i class="fas fa-sign-in-alt"></i> Check In</button>` : ''}
                ${b.bookingStatus === 'checked_in' ? `<button class="text-red-600 hover:text-red-900" onclick="handleCheckOut('${b.id}', '${b.locationId}')"><i class="fas fa-sign-out-alt"></i> Check Out</button>` : ''}
            </div>
        `;
        cardView.appendChild(card);
    });
}


/**
 * Membuka modal non-editable untuk melihat detail pemesanan.
 * @param {string} bookingId ID pemesanan.
 */
async function viewBookingDetails(bookingId) {
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
                    ${booking.serviceType === 'pickup' ? `
                        <div class="mt-4 pt-4 border-t">
                            <h4 class="font-semibold">Pickup Details:</h4>
                            <p><strong>Courier:</strong> ${booking.courierName || 'Not Assigned'}</p>
                            <p><strong>Address:</strong> ${booking.pickupAddress || 'N/A'}</p>
                            <p><strong>Time:</strong> ${booking.pickupTime || 'N/A'}</p>
                        </div>
                    ` : ''}
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
}

/**
 * Menangani proses check-in untuk pemesanan.
 * @param {string} bookingId ID pemesanan.
 */
function handleCheckIn(bookingId) {
    Swal.fire({
        title: 'Confirm Check-In?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        confirmButtonText: 'Yes, Check In'
    }).then(result => {
        if (result.isConfirmed) {
            db.ref(`bookings/${bookingId}`).update({ bookingStatus: 'checked_in', checkInTime: firebase.database.ServerValue.TIMESTAMP })
                .then(() => Swal.fire('Success', 'Booking has been checked-in.', 'success'))
                .catch(err => Swal.fire('Error', err.message, 'error'));
        }
    });
}

/**
 * Menangani proses check-out untuk pemesanan.
 * @param {string} bookingId ID pemesanan.
 * @param {string} locationId ID lokasi penyimpanan.
 */
function handleCheckOut(bookingId, locationId) {
    Swal.fire({
        title: 'Confirm Check-Out?',
        text: "This will free up the unit.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, Check Out'
    }).then(result => {
        if (result.isConfirmed) {
            db.ref(`bookings/${bookingId}`).update({ bookingStatus: 'completed', checkOutTime: firebase.database.ServerValue.TIMESTAMP })
                .then(() => {
                    if(locationId && allLocations.find(loc => loc.id === locationId)) {
                        // Logika untuk mengembalikan kapasitas penyimpanan tidak disertakan karena struktur data yang tidak jelas.
                        // Akan lebih baik jika kapasitas disimpan per tipe unit, bukan total.
                        // db.ref(`storageLocations/${locationId}/capacity`).transaction(currentCapacity => {
                        //     return (currentCapacity || 0) + 1; // Contoh: Tambah kapasitas
                        // });
                    }
                    Swal.fire('Success', 'Booking has been checked-out.', 'success');
                })
                .catch(err => Swal.fire('Error', err.message, 'error'));
        }
    });
}


/**
 * Membuka modal untuk mengedit detail pemesanan.
 * @param {string} bookingId ID pemesanan.
 */
async function openEditBookingModal(bookingId) {
    const booking = allBookings.find(b => b.id === bookingId);
    if (!booking) {
        return Swal.fire('Error', 'Booking not found.', 'error');
    }
    const user = allUsers[booking.userId];

    const modal = document.getElementById('edit-booking-modal');
    modal.classList.remove('hidden');

    document.getElementById('edit-booking-id').value = booking.id;
    document.getElementById('edit-booking-user-name').value = user?.name || 'N/A';
    document.getElementById('edit-booking-location-name').value = booking.locationName || 'N/A';
    document.getElementById('edit-booking-storage-type').value = booking.storageType || 'N/A';
    document.getElementById('edit-booking-start-date').value = booking.startDate ? new Date(booking.startDate).toISOString().split('T')[0] : '';
    document.getElementById('edit-booking-end-date').value = booking.endDate ? new Date(booking.endDate).toISOString().split('T')[0] : '';
    document.getElementById('edit-booking-total-price').value = booking.totalPrice ? String(booking.totalPrice).replace('.', ',') : '0';
    document.getElementById('edit-booking-payment-status').value = booking.paymentStatus || 'unpaid_on_site';
    document.getElementById('edit-booking-status').value = booking.bookingStatus || 'active';
    document.getElementById('edit-booking-seal-number').value = booking.sealNumber || '';

    const sealPhotoPreviewImg = document.getElementById('seal-photo-preview-img');
    const sealPhotoPreviewIcon = document.getElementById('seal-photo-preview-icon');
    const removeSealPhotoBtn = document.getElementById('remove-seal-photo-btn');
    const uploadSealPhotoBtn = document.getElementById('upload-seal-photo-btn');
    const sealPhotoInput = document.getElementById('edit-booking-seal-photo-input');

    sealPhotoPreviewImg.dataset.uploadedUrl = booking.sealPhotoUrl || ''; 

    const updateSealPhotoDisplay = (url) => {
        if (url) {
            sealPhotoPreviewImg.src = url;
            sealPhotoPreviewImg.classList.remove('hidden');
            sealPhotoPreviewIcon.classList.add('hidden');
            removeSealPhotoBtn.classList.remove('hidden');
            uploadSealPhotoBtn.textContent = 'Change Photo';
        } else {
            sealPhotoPreviewImg.classList.add('hidden');
            sealPhotoPreviewIcon.classList.remove('hidden');
            removeSealPhotoBtn.classList.add('hidden');
            sealPhotoPreviewImg.src = '';
            uploadSealPhotoBtn.textContent = 'Upload Photo';
        }
    };

    updateSealPhotoDisplay(booking.sealPhotoUrl);

    uploadSealPhotoBtn.onclick = () => sealPhotoInput.click(); 

    sealPhotoInput.onchange = async (event) => {
        const file = event.target.files[0];
        if (file) {
            Swal.fire({
                title: 'Uploading image...',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });
            try {
                const filePath = `seal_photos/${bookingId}-${Date.now()}-${file.name}`;
                const snapshot = await storage.ref(filePath).put(file);
                const downloadURL = await snapshot.ref.getDownloadURL();
                
                updateSealPhotoDisplay(downloadURL);
                sealPhotoPreviewImg.dataset.uploadedUrl = downloadURL; 
                
                Swal.close();
                Swal.fire('Success', 'Image uploaded successfully!', 'success');
            } catch (error) {
                console.error("Seal photo upload failed:", error);
                Swal.fire('Upload Failed', error.message, 'error');
            }
        }
        sealPhotoInput.value = '';
    };

    removeSealPhotoBtn.onclick = () => {
        updateSealPhotoDisplay('');
        sealPhotoPreviewImg.dataset.uploadedUrl = '';
    };

    document.getElementById('edit-booking-form').onsubmit = async (e) => {
        e.preventDefault();
        Swal.fire({
            title: 'Saving changes...',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        const updatedBookingData = {
            startDate: new Date(document.getElementById('edit-booking-start-date').value).getTime(),
            endDate: new Date(document.getElementById('edit-booking-end-date').value).getTime(),
            totalPrice: parseFloat(document.getElementById('edit-booking-total-price').value.replace(',', '.')),
            paymentStatus: document.getElementById('edit-booking-payment-status').value,
            bookingStatus: document.getElementById('edit-booking-status').value,
            sealNumber: document.getElementById('edit-booking-seal-number').value,
            sealPhotoUrl: sealPhotoPreviewImg.dataset.uploadedUrl || '' 
        };

        try {
            await db.ref(`bookings/${bookingId}`).update(updatedBookingData);
            Swal.fire('Success', 'Booking updated successfully!', 'success');
            modal.classList.add('hidden');
        } catch (error) {
            console.error("Booking update failed:", error);
            Swal.fire('Error', error.message, 'error');
        }
    };
}


/**
 * Menangani permintaan penjemputan untuk pemesanan (assign courier).
 * @param {string} bookingId ID pemesanan.
 */
async function handlePickupRequest(bookingId) {
    const booking = allBookings.find(b => b.id === bookingId);
    const user = allUsers[booking.userId];

    if (!booking || !user) {
        return Swal.fire('Error', 'Booking or user data not found.', 'error');
    }

    const courierOptionsHtml = Object.entries(allCouriers || {}).map(([id, courier]) =>
        `<option value="${id}" ${booking.courierId === id ? 'selected' : ''}>${courier.name} (${courier.assignedLocationId || 'Any'})</option>`
    ).join('');

    const locationData = allLocations.find(loc => loc.id === booking.locationId);
    const geolocation = booking.geolocation || locationData?.geolocation;
    
    // Ganti URL Google Maps dengan URL yang valid.
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
}