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

        let matchesStatus = !statusFilter;
        if (statusFilter) {
            if (statusFilter === 'picked_up') {
                matchesStatus = b.bookingStatus === 'processing_by_courier';
            } else {
                matchesStatus = b.bookingStatus === statusFilter;
            }
        }

        const matchesLocation = !locationFilter || b.locationId === locationFilter;
        const matchesServiceType = !serviceTypeFilter || b.serviceType === serviceTypeFilter;

        return matchesSearch && matchesStatus && matchesLocation && matchesServiceType;
    });

    if (filtered.length === 0) {
        const noResultsHtml = `<tr><td colspan="5" class="text-center p-8 text-gray-500">No bookings found.</td></tr>`;
        tbody.innerHTML = noResultsHtml;
        cardView.innerHTML = `<p class="text-center text-gray-500 p-4">No bookings found.</p>`;
        return;
    }

    filtered.forEach(b => {
        const user = allUsers[b.userId];
        const userNameDisplay = user?.name || `<span class="text-red-500">Unknown User</span>`;
        const userEmailDisplay = user?.email || `<span class="text-red-500">ID: ${b.userId}</span>`;
        const startDate = b.startDate ? new Date(b.startDate).toLocaleDateString('en-US') : 'N/A';
        const endDate = b.endDate ? new Date(b.endDate).toLocaleDateString('en-US') : 'N/A';

        let statusClass = 'bg-gray-100 text-gray-800';
        let statusText = (b.bookingStatus || 'unknown').replace(/_/g, ' ');

        if (b.bookingStatus === 'completed') {
            statusClass = 'bg-purple-100 text-purple-800';
        } else if (b.bookingStatus === 'cancelled') {
            statusClass = 'bg-red-100 text-red-800';
        } else if (b.bookingStatus === 'checked_in') {
            statusClass = 'bg-green-100 text-green-800';
            statusText = 'Checked In';
        } else if (b.bookingStatus === 'processing_by_courier' || b.pickupStatus === 'picked_up') {
            statusClass = 'bg-blue-100 text-blue-800';
            statusText = 'Picked Up';
        } else if (b.paymentStatus === 'pending') {
            statusClass = 'bg-yellow-100 text-yellow-800';
        }

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
            <td class="px-6 py-4"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs capitalize ${statusClass}">${statusText}</span></td>
            <td class="px-6 py-4 space-x-2">
                <button class="text-blue-600 hover:text-blue-900" title="View Details" onclick="viewBookingDetails('${b.id}')"><i class="fas fa-eye"></i></button>
                <button class="text-primary-600 hover:text-primary-800" title="Edit Booking" onclick="openEditBookingModal('${b.id}')"><i class="fas fa-edit"></i></button>
                ${b.serviceType === 'pickup' && b.bookingStatus !== 'completed' && b.bookingStatus !== 'cancelled' ? `<button class="text-purple-600 hover:text-purple-900" title="Assign Courier" onclick="handlePickupRequest('${b.id}')"><i class="fas fa-truck-fast"></i></button>` : ''}
                ${b.bookingStatus === 'active' || b.bookingStatus === 'processing_by_courier' ? `<button class="text-green-600 hover:text-green-900" title="Check In" onclick="handleCheckIn('${b.id}')"><i class="fas fa-sign-in-alt"></i></button>` : ''}
                ${b.bookingStatus === 'checked_in' ? `<button class="text-red-600 hover:text-red-900" title="Check Out" onclick="handleCheckOut('${b.id}', '${b.locationId}')"><i class="fas fa-sign-out-alt"></i></button>` : ''}
            </td>
        `;
        tbody.appendChild(row);

        const card = document.createElement('div');
        card.className = 'data-card';
        card.innerHTML = `
            <div class="card-row"><span class="card-label">User:</span><span class="card-value">${userNameDisplay}</span></div>
            <div class="card-row"><span class="card-label">Booking ID:</span><span class="card-value">${b.id}</span></div>
            <div class="card-row"><span class="card-label">Location:</span><span class="card-value">${b.locationName || 'N/A'}</span></div>
            <div class="card-row"><span class="card-label">Dates:</span><span class="card-value">${startDate} - ${endDate}</span></div>
            <div class="card-row"><span class="card-label">Status:</span><span class="card-value"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs capitalize ${statusClass}">${statusText}</span></span></div>
            <div class="card-actions">
                <button class="text-blue-600 hover:text-blue-900" onclick="viewBookingDetails('${b.id}')"><i class="fas fa-eye"></i> View</button>
                <button class="text-primary-600 hover:text-primary-800" onclick="openEditBookingModal('${b.id}')"><i class="fas fa-edit"></i> Edit</button>
                ${b.serviceType === 'pickup' && b.bookingStatus !== 'completed' && b.bookingStatus !== 'cancelled' ? `<button class="text-purple-600 hover:text-purple-900" title="Assign Courier" onclick="handlePickupRequest('${b.id}')"><i class="fas fa-truck-fast"></i> Assign</button>` : ''}
                ${b.bookingStatus === 'active' || b.bookingStatus === 'processing_by_courier' ? `<button class="text-green-600 hover:text-green-900" onclick="handleCheckIn('${b.id}')"><i class="fas fa-sign-in-alt"></i> Check In</button>` : ''}
                ${b.bookingStatus === 'checked_in' ? `<button class="text-red-600 hover:text-red-900" onclick="handleCheckOut('${b.id}', '${b.locationId}')"><i class="fas fa-sign-out-alt"></i> Check Out</button>` : ''}
            </div>
        `;
        cardView.appendChild(card);
    });
}

async function viewBookingDetails(bookingId) {
    const booking = allBookings.find(b => b.id === bookingId);
    if (!booking) return Swal.fire('Error', 'Booking not found.', 'error');
    const user = allUsers[booking.userId];
    const sealPhotoHtml = booking.sealPhotoUrl ? `<img src="${booking.sealPhotoUrl}" class="w-full h-auto max-w-sm mx-auto rounded-lg shadow-md border my-4">` : '<p class="text-center text-gray-500 bg-gray-100 p-4 rounded-lg my-4">No seal photo uploaded.</p>';
    
    let warehousePhotosHtml = '<p class="text-center text-gray-500 bg-gray-100 p-4 rounded-lg my-4">No warehouse photos uploaded.</p>';
    if (booking.warehousePhotoUrls && booking.warehousePhotoUrls.length > 0) {
        const slides = booking.warehousePhotoUrls.map(url => `<div class="swiper-slide"><img src="${url}" class="w-full h-auto object-cover rounded-lg"></div>`).join('');
        warehousePhotosHtml = `
            <div class="swiper-container warehouse-slider relative">
                <div class="swiper-wrapper">${slides}</div>
                <div class="swiper-button-next text-white"></div>
                <div class="swiper-button-prev text-white"></div>
            </div>
        `;
    }

    let suppliesHtml = '';
    if (booking.supplies && booking.supplies.length > 0) {
        const suppliesList = booking.supplies.map(item => `
            <div class="flex justify-between items-center text-sm py-1">
                <span>- ${item.name} (x${item.quantity})</span>
                <strong>${currencyFormatter.format(item.price * item.quantity)}</strong>
            </div>
        `).join('');
        suppliesHtml = `
            <div class="border-t pt-4">
                <h4 class="font-semibold mb-2">Supplies & Extras</h4>
                ${suppliesList}
            </div>
        `;
    }
    
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
                            <p><strong>Address:</strong> ${booking.pickupAddress}</p>
                            <p><strong>Time:</strong> ${booking.pickupTime}</p>
                        </div>
                    ` : ''}
                </div>
                ${suppliesHtml}
                <div class="border-t pt-4">
                    <h4 class="font-semibold mb-2">Seal Details:</h4>
                    <p><strong class="w-32 inline-block">Seal Number:</strong> ${booking.sealNumber || 'Not set'}</p>
                    <div class="mt-2">
                        <h5 class="font-medium text-sm">Seal Photo:</h5>
                        ${sealPhotoHtml}
                    </div>
                </div>
                <div class="border-t pt-4">
                     <h4 class="font-semibold mb-2">Warehouse Photos:</h4>
                     ${warehousePhotosHtml}
                </div>
            </div>
        `,
        width: '600px',
        showCloseButton: true,
        showConfirmButton: false,
        didOpen: () => {
            if (booking.warehousePhotoUrls && booking.warehousePhotoUrls.length > 0) {
                 new Swiper('.warehouse-slider', {
                    navigation: {
                        nextEl: '.swiper-button-next',
                        prevEl: '.swiper-button-prev',
                    },
                    loop: true,
                });
            }
        }
    });
}

function handleCheckIn(bookingId) {
    const booking = allBookings.find(b => b.id === bookingId);
    if (!booking) {
        return Swal.fire('Error', 'Booking not found', 'error');
    }
    openCheckInModal(booking);
}

function handleCheckOut(bookingId) {
    Swal.fire({
        title: 'Confirm Check-Out?',
        text: "This will mark the booking as completed.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, Check Out'
    }).then(result => {
        if (result.isConfirmed) {
            const updates = { bookingStatus: 'completed', checkOutTime: firebase.database.ServerValue.TIMESTAMP };
            db.ref(`bookings/${bookingId}`).update(updates)
                .then(() => {
                    const bookingIndex = allBookings.findIndex(b => b.id === bookingId);
                    if (bookingIndex > -1) {
                        allBookings[bookingIndex].bookingStatus = 'completed';
                    }
                    renderBookingsTable();
                    Swal.fire('Success', 'Booking has been checked-out.', 'success');
                })
                .catch(err => Swal.fire('Error', err.message, 'error'));
        }
    });
}

async function openEditBookingModal(bookingId) {
    const { uploadImage } = await import('./uploader.js');
    
    const booking = allBookings.find(b => b.id === bookingId);
    if (!booking) return Swal.fire('Error', 'Booking not found.', 'error');
    
    const user = allUsers[booking.userId];
    if (!user) return Swal.fire('Error', 'User data not found for this booking.', 'error');

    const modal = document.getElementById('edit-booking-modal');
    modal.classList.remove('hidden');

    document.getElementById('edit-booking-id').value = booking.id;
    document.getElementById('edit-booking-user-name').value = user.name || 'N/A';
    document.getElementById('edit-booking-location-name').value = booking.locationName || 'N/A';
    document.getElementById('edit-booking-storage-type').value = booking.storageType || 'N/A';
    document.getElementById('edit-booking-start-date').value = booking.startDate ? new Date(booking.startDate).toISOString().split('T')[0] : '';
    document.getElementById('edit-booking-end-date').value = booking.endDate ? new Date(booking.endDate).toISOString().split('T')[0] : '';
    
    const totalPriceInput = document.getElementById('edit-booking-total-price');
    totalPriceInput.value = booking.totalPrice ? String(booking.totalPrice) : '0';
    totalPriceInput.readOnly = true;
    totalPriceInput.classList.add('disabled-field');

    document.getElementById('edit-booking-payment-status').value = booking.paymentStatus || 'unpaid_on_site';
    
    const statusSelect = document.getElementById('edit-booking-status');
    statusSelect.innerHTML = ''; 

    const statuses = {
        'active': 'Active',
        'processing_by_courier': 'Picked Up',
        'checked_in': 'Checked-In',
        'completed': 'Completed',
        'cancelled': 'Cancelled'
    };

    for (const [value, text] of Object.entries(statuses)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        statusSelect.appendChild(option);
    }
    
    statusSelect.value = booking.bookingStatus || 'active';

    document.getElementById('edit-booking-seal-number').value = booking.sealNumber || '';

    const sealPhotoPreviewImg = document.getElementById('seal-photo-preview-img');
    const sealPhotoPreviewIcon = document.getElementById('seal-photo-preview-icon');
    const removeSealPhotoBtn = document.getElementById('remove-seal-photo-btn');
    const uploadSealPhotoBtn = document.getElementById('upload-seal-photo-btn');
    const sealPhotoInput = document.getElementById('edit-booking-seal-photo-input');
    
    let selectedSealImageFile = null;

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

    sealPhotoInput.onchange = (event) => {
        const file = event.target.files[0];
        if (file) {
            selectedSealImageFile = file;
            const reader = new FileReader();
            reader.onload = (e) => updateSealPhotoDisplay(e.target.result);
            reader.readAsDataURL(file);
        }
    };

    removeSealPhotoBtn.onclick = () => {
        selectedSealImageFile = null;
        updateSealPhotoDisplay('');
    };
    
    // --- PENAMBAHAN BARU: LOGIKA UNTUK WAREHOUSE PHOTOS ---
    const warehousePhotoContainer = document.getElementById('warehouse-photos-container');
    const warehousePhotoInput = document.getElementById('edit-booking-warehouse-photo-input');
    let selectedWarehouseFiles = [];
    let existingWarehouseUrls = [...(booking.warehousePhotoUrls || [])];

    const renderWarehousePreviews = () => {
        warehousePhotoContainer.innerHTML = '';
        existingWarehouseUrls.forEach((url, index) => {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'relative w-24 h-24';
            imgContainer.innerHTML = `
                <img src="${url}" class="w-full h-full object-cover rounded-md border">
                <button type="button" data-index="${index}" class="absolute top-0 right-0 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs remove-existing-wh-photo">&times;</button>
            `;
            warehousePhotoContainer.appendChild(imgContainer);
        });
        selectedWarehouseFiles.forEach(file => {
             const reader = new FileReader();
             reader.onload = e => {
                const imgContainer = document.createElement('div');
                imgContainer.className = 'relative w-24 h-24';
                imgContainer.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover rounded-md border">`;
                warehousePhotoContainer.appendChild(imgContainer);
             };
             reader.readAsDataURL(file);
        });
    };

    warehousePhotoInput.onchange = (event) => {
        const files = Array.from(event.target.files);
        const totalPhotos = existingWarehouseUrls.length + files.length;
        if (totalPhotos > 2) {
            Swal.fire('Error', 'You can upload a maximum of 2 warehouse photos.', 'error');
            return;
        }
        selectedWarehouseFiles = files;
        renderWarehousePreviews();
    };

    warehousePhotoContainer.addEventListener('click', (e) => {
        if (e.target.closest('.remove-existing-wh-photo')) {
            const indexToRemove = parseInt(e.target.closest('button').dataset.index, 10);
            existingWarehouseUrls.splice(indexToRemove, 1);
            renderWarehousePreviews();
        }
    });

    renderWarehousePreviews();
    // --- AKHIR PENAMBAHAN BARU ---

    document.getElementById('edit-booking-form').onsubmit = async (e) => {
        e.preventDefault();
        
        let newSealImageUrl = booking.sealPhotoUrl;
        if (selectedSealImageFile) {
            Swal.fire({ title: 'Uploading seal photo...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                newSealImageUrl = await uploadImage(selectedSealImageFile);
            } catch (error) {
                Swal.fire('Upload Failed', error.message, 'error');
                return;
            }
        } else if (sealPhotoPreviewImg.src === '') {
            newSealImageUrl = '';
        }

        let finalWarehouseUrls = [...existingWarehouseUrls];
        if (selectedWarehouseFiles.length > 0) {
            Swal.fire({ title: 'Uploading warehouse photos...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                const uploadedUrls = await Promise.all(selectedWarehouseFiles.map(file => uploadImage(file)));
                finalWarehouseUrls.push(...uploadedUrls);
            } catch (error) {
                Swal.fire('Upload Failed', error.message, 'error');
                return;
            }
        }

        Swal.fire({ title: 'Saving changes...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const updatedBookingData = {
            startDate: new Date(document.getElementById('edit-booking-start-date').value).getTime(),
            endDate: new Date(document.getElementById('edit-booking-end-date').value).getTime(),
            paymentStatus: document.getElementById('edit-booking-payment-status').value,
            bookingStatus: document.getElementById('edit-booking-status').value,
            sealNumber: document.getElementById('edit-booking-seal-number').value,
            sealPhotoUrl: newSealImageUrl,
            warehousePhotoUrls: finalWarehouseUrls
        };

        try {
            await db.ref(`bookings/${bookingId}`).update(updatedBookingData);
            Swal.fire('Success', 'Booking updated successfully!', 'success');
            modal.classList.add('hidden');
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    };
}


async function handlePickupRequest(bookingId) {
    const booking = allBookings.find(b => b.id === bookingId);
    if (!booking) return Swal.fire('Error', 'Booking not found.', 'error');
    const user = allUsers[booking.userId];
    if (!user) return Swal.fire('Error', 'User data not found.', 'error');

    const courierOptionsHtml = Object.entries(allCouriers || {}).map(([id, courier]) =>
        `<option value="${id}" ${booking.courierId === id ? 'selected' : ''}>${courier.name} (${courier.assignedLocationId || 'Any'})</option>`
    ).join('');

    const geolocation = booking.pickupGeolocation;
    const directionsUrl = geolocation ? `https://www.google.com/maps/dir/?api=1&destination=${geolocation.latitude},${geolocation.longitude}` : '#';

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
                        <input type="text" id="courier-search" class="swal2-input flex-grow" placeholder="Search courier...">
                        <select id="swal-courier-select" class="swal2-input flex-grow">
                            <option value="" disabled selected>-- Select Courier --</option>
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
                    if (opt.value === "" || opt.text.toLowerCase().includes(searchTerm)) {
                        selectInput.add(opt.cloneNode(true));
                    }
                });
            });
        },
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Assign & Notify',
        preConfirm: () => {
            const selectedCourierId = document.getElementById('swal-courier-select').value;
            if (!selectedCourierId) {
                Swal.showValidationMessage('Please select a courier.');
                return false;
            }
            return selectedCourierId;
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const courierId = result.value;
            const courier = allCouriers[courierId];
            Swal.fire({ title: 'Processing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                const bookingUpdates = {
                    pickupStatus: 'processing_by_courier',
                    bookingStatus: 'processing_by_courier',
                    courierId: courierId,
                    courierName: courier.name
                };
                await db.ref(`bookings/${bookingId}`).update(bookingUpdates);

                const bookingIndex = allBookings.findIndex(b => b.id === bookingId);
                if (bookingIndex > -1) {
                    Object.assign(allBookings[bookingIndex], bookingUpdates);
                }
                renderBookingsTable();
                
                await sendUserNotification(booking.userId, 'pickup_assigned', { ...booking, courierName: courier.name });
                
                Swal.fire('Assigned!', `${courier.name} has been assigned.`, 'success');
            } catch (error) {
                Swal.fire('Error!', `Failed to assign courier: ${error.message}`, 'error');
            }
        }
    });
}