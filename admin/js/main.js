let allBookings = [];
let allUsers = {};
let allLocations = [];
let allVouchers = [];
let allConversations = [];
let allFaqs = [];
let allReviews = [];
let allTestimonials = [];
let allCouriers = {};
let allShopProducts = [];
window.allStorageTypes = {}; // Menjadikan variabel ini global

let revenueChart = null;
let html5QrCode = null;
let locationMap, locationMarker, locationAutocomplete;
let currentChatUserId = null;
let conversationListeners = {};
let lastKnownUnreadCount = 0;
let hasInteracted = false;

const notificationSound = new Audio('/admin/assets/sounds/notification.wav');

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const faIcons = ["fas fa-shield-alt", "fas fa-video", "fas fa-fire-extinguisher", "fas fa-key", "fas fa-snowflake", "fas fa-box-open", "fas fa-car", "fas fa-motorcycle", "fas fa-wifi", "fas fa-plug", "fas fa-user-shield", "fas fa-clock", "fas fa-thermometer-half", "fas fa-wind", "fas fa-lightbulb", "fas fa-lock", "fas fa-water", "fas fa-person-shelter", "fas fa-truck-moving", "fas fa-temperature-high"];

async function sendUserNotification(userId, type, booking) {
    if (!userId || !booking || !type) return;

    let title_en, body_en;

    switch (type) {
        case 'pickup_assigned':
            title_en = 'Courier Assigned!';
            body_en = `Good news! Courier ${booking.courierName} has been assigned to your booking ${booking.id} and is on the way.`;
            break;
        case 'item_checked_in':
            title_en = 'Your Item is Securely Stored!';
            body_en = `Your item for booking ${booking.id} has been successfully checked in at our ${booking.locationName} facility.`;
            break;
        default:
            return;
    }

    const notificationData = {
        title: title_en,
        body: body_en,
        bookingId: booking.id,
        type: type,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        read: false
    };

    try {
        await db.ref(`notifications/users/${userId}`).push(notificationData);
    } catch (error) {
        console.error("Failed to send notification:", error);
    }
}


function initializeFirebase() {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.database();
    storage = firebase.storage();

    auth.onAuthStateChanged(user => {
        const loginScreen = document.getElementById('login-screen');
        const adminLayout = document.getElementById('admin-layout');

        if (user) {
            const isAdmin = user.email.endsWith('@storapedia.com') || user.email === 'admin@storapedia.com' || user.email === 'jamal.rc2@gmail.com';
            if (isAdmin) {
                loginScreen.style.display = 'none';
                adminLayout.style.display = 'block';

                document.getElementById('admin-user-info').innerHTML = `<p class="font-semibold">${user.email}</p>`;
                initializeApp();
            } else {
                loginScreen.style.display = 'flex';
                adminLayout.style.display = 'none';
                auth.signOut();
            }
        } else {
            loginScreen.style.display = 'flex';
            adminLayout.style.display = 'none';
        }
    });
}

window.initAdminMap = function() {};

document.addEventListener('DOMContentLoaded', async () => {
    initializeFirebase();

    document.body.addEventListener('click', () => { hasInteracted = true; }, { once: true });

    document.getElementById('login-form').addEventListener('submit', handleAdminLogin);
    document.getElementById('admin-logout-btn').addEventListener('click', handleAdminLogout);

    document.getElementById('mobile-menu-btn').addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('hidden');
        sidebar.classList.toggle('active');
    });
});

async function initializeApp() {
    setupEventListeners();
    attachDataListeners();
    showPage('dashboard');
}

function attachDataListeners() {
    db.ref('users').on('value', snapshot => {
        allUsers = snapshot.val() || {};
        if (document.getElementById('page-users').classList.contains('active')) renderUsersTable(Object.values(allUsers).map((user, i) => ({...user, id: Object.keys(allUsers)[i]})));
    });

    db.ref('bookings').on('value', snapshot => {
        allBookings = [];
        snapshot.forEach(child => { allBookings.push({ id: child.key, ...child.val() }); });
        allBookings.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (document.getElementById('page-bookings').classList.contains('active')) renderBookingsTable();
        fetchAndRenderDashboard();
    });
    
    db.ref('couriers').on('value', snapshot => {
        allCouriers = snapshot.val() || {};
    });

    db.ref('faqs').on('value', snapshot => {
        allFaqs = [];
        snapshot.forEach(child => { allFaqs.push({ id: child.key, ...child.val() }); });
        if (document.getElementById('page-faqs').classList.contains('active')) renderFaqsTable(allFaqs);
    });

    db.ref('chats').on('value', snapshot => {
        if (document.getElementById('page-inbox').classList.contains('active')) fetchAndRenderConversations(true);
    });

    db.ref('storageLocations').on('value', snapshot => {
        allLocations = [];
        const locFilter = document.getElementById('booking-location-filter');
        locFilter.innerHTML = '<option value="">All Locations</option>';
        snapshot.forEach(child => {
            const loc = { id: child.key, ...child.val() };
            allLocations.push(loc);
            const opt = document.createElement('option');
            opt.value = loc.id;
            opt.textContent = loc.name;
            locFilter.appendChild(opt);
        });
        if (document.getElementById('page-locations').classList.contains('active')) renderLocationsTable(allLocations);
    });

    db.ref('vouchers').on('value', snapshot => {
        allVouchers = snapshot.val() ? Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] })) : [];
        if (document.getElementById('page-vouchers').classList.contains('active')) renderVouchersTable(allVouchers);
    });
    
    db.ref('testimonials').on('value', snapshot => {
        allTestimonials = snapshot.val() ? Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] })) : [];
        if (document.getElementById('page-reviews').classList.contains('active')) window.renderTestimonials();
    });

    db.ref('reviews').on('value', snapshot => {
        allReviews = [];
        snapshot.forEach(locationSnapshot => {
            locationSnapshot.forEach(reviewSnapshot => {
                allReviews.push({
                    id: reviewSnapshot.key,
                    locationId: locationSnapshot.key,
                    ...reviewSnapshot.val()
                });
            });
        });
        if (document.getElementById('page-reviews').classList.contains('active')) window.renderReviews();
    });
    
    db.ref('shopProducts').on('value', snapshot => {
        allShopProducts = [];
        snapshot.forEach(child => {
            allShopProducts.push({ id: child.key, ...child.val() });
        });
        if (document.getElementById('page-shop').classList.contains('active')) {
            window.renderShopProductsTable();
        }
    });

    db.ref('settings/storageTypes').on('value', snapshot => {
        window.allStorageTypes = snapshot.val() || {};
        if (document.getElementById('page-locations').classList.contains('active')) {
            renderLocationsTable(allLocations);
        }
    });
}

function setupEventListeners() {
    document.querySelectorAll('.sidebar-link').forEach(link => link.addEventListener('click', e => {
        e.preventDefault();
        showPage(e.currentTarget.dataset.page);
        if (window.innerWidth < 768) {
            document.getElementById('sidebar').classList.add('hidden');
        }
    }));

    document.getElementById('booking-search').addEventListener('input', renderBookingsTable);
    document.getElementById('booking-status-filter').addEventListener('change', renderBookingsTable);
    document.getElementById('booking-location-filter').addEventListener('change', renderBookingsTable);
    document.getElementById('user-search').addEventListener('input', () => renderUsersTable(Object.values(allUsers).map((user, i) => ({...user, id: Object.keys(allUsers)[i]}))));
    document.getElementById('conversation-search').addEventListener('input', renderConversationsList);
    document.querySelectorAll('.inbox-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.inbox-filter-btn').forEach(b => b.classList.remove('bg-primary-600', 'text-white'));
            e.currentTarget.classList.add('bg-primary-600', 'text-white');
            renderConversationsList();
        });
    });

    document.getElementById('scan-qr-btn').addEventListener('click', startQrScanner);
    document.getElementById('add-location-btn').addEventListener('click', () => showPage('edit-location', { locationId: null }));
    document.getElementById('add-product-btn').addEventListener('click', () => window.openShopProductModal(null));
    document.getElementById('add-voucher-btn').addEventListener('click', () => window.openVoucherModal(null));
    document.getElementById('new-message-btn').addEventListener('click', openNewMessageModal);
    document.getElementById('broadcast-message-btn').addEventListener('click', openBroadcastModal);
    document.getElementById('chat-form').addEventListener('submit', handleSendMessage);
    
    document.getElementById('close-qr-scanner-btn').addEventListener('click', () => {
        document.getElementById('qr-scanner-modal').classList.add('hidden');
        if (html5QrCode && html5QrCode.isScanning) html5QrCode.stop();
    });
    document.getElementById('close-edit-booking-modal').addEventListener('click', () => {
        document.getElementById('edit-booking-modal').classList.add('hidden');
    });

    document.getElementById('manage-storage-types-btn').addEventListener('click', () => {
        if (window.openManageStorageTypesModal) {
            window.openManageStorageTypesModal();
        } else {
            console.error('openManageStorageTypesModal function not found on window object.');
            Swal.fire('Error', 'Could not open the storage type manager.', 'error');
        }
    });
}

function showPage(pageId, context = {}) {
    if (!pageId) return;

    document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
    const pageElement = document.getElementById(`page-${pageId}`);
    if (pageElement) pageElement.classList.add('active');

    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    const linkPageId = pageId.startsWith('edit-') ? pageId.split('-')[1] + 's' : pageId;
    const activeLink = document.querySelector(`.sidebar-link[data-page="${linkPageId}"]`);
    if (activeLink) activeLink.classList.add('active');

    let title = pageId.charAt(0).toUpperCase() + pageId.slice(1).replace(/-/g, ' ');
    if (pageId.startsWith('edit-')) {
        const resource = pageId.split('-')[1];
        title = context.locationId || context.voucherId ? `Edit ${resource}` : `Add New ${resource}`;
    }
    document.getElementById('page-title').textContent = title === 'Faqs' ? 'FAQs' : title;

    switch(pageId) {
        case 'dashboard': fetchAndRenderDashboard(); break;
        case 'bookings': renderBookingsTable(); break;
        case 'users': renderUsersTable(Object.values(allUsers).map((user, i) => ({...user, id: Object.keys(allUsers)[i]}))); break;
        case 'inbox': fetchAndRenderConversations(true); break;
        case 'locations': renderLocationsTable(allLocations); break;
        case 'edit-location': 
            renderLocationEditor(pageElement, context.locationId); 
            break;
        case 'shop':
            window.renderShopProductsTable();
            break;
        case 'vouchers': 
            renderVouchersTable(allVouchers); 
            break;
        case 'reviews':
            window.renderReviews();
            window.renderTestimonials();
            break;
        case 'settings': fetchAndRenderSettings(); break;
    }
}

function deleteItem(path, id, itemName) {
    Swal.fire({
        title: `Delete this ${itemName}?`,
        text: "This action cannot be undone.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'Yes, delete it!'
    }).then(result => {
        if (result.isConfirmed) {
            db.ref(`${path}/${id}`).remove()
                .then(() => Swal.fire('Deleted!', `${itemName} has been deleted.`, 'success'))
                .catch(err => Swal.fire('Error', err.message, 'error'));
        }
    });
}

function generateStarsHtml(rating) {
    const roundedRating = Math.round(rating);
    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
        starsHtml += `<i class="fa-solid fa-star ${i <= roundedRating ? 'text-yellow-500' : 'text-gray-300'}"></i>`;
    }
    return starsHtml;
}

async function openCheckInModal(booking) {
    const { uploadImage } = await import('./uploader.js');
    let selectedSealImageFile = null;
    let selectedWarehouseImageFiles = [];

    const isCOD = booking.paymentStatus === 'unpaid_on_site';

    const paymentSectionHTML = isCOD ? `
        <div id="payment-section" class="mb-4 p-4 border rounded-lg bg-yellow-50 text-left">
            <h4 class="font-bold text-yellow-800 flex items-center"><i class="fas fa-money-bill-wave mr-2"></i>Payment Confirmation (COD)</h4>
            <p class="mt-2">Total amount due: <strong class="text-lg">${currencyFormatter.format(booking.totalPrice || 0)}</strong></p>
            <button id="confirm-payment-btn" class="mt-3 w-full bg-green-500 text-white font-bold py-2 px-4 rounded-full shadow-md hover:bg-green-600 transition">
                <i class="fas fa-check-circle mr-2"></i>Confirm Payment Received
            </button>
        </div>` : '';

    const sealSectionHTML = `
        <div id="seal-section" class="${isCOD ? 'hidden' : ''} text-left">
            <h4 class="font-bold mb-2"><i class="fas fa-key mr-2"></i>Seal Information</h4>
            <input id="swal-seal-number" class="swal2-input" placeholder="Enter Seal Number">
            <div class="mt-4 text-center">
                <label for="swal-seal-photo" class="cursor-pointer bg-blue-500 text-white font-bold py-2 px-4 rounded-full shadow-md hover:bg-blue-600 transition">
                    <i class="fas fa-camera mr-2"></i> Take/Upload Seal Photo
                </label>
                <input id="swal-seal-photo" type="file" class="hidden" accept="image/*" capture="environment">
                <img id="swal-seal-preview" src="#" alt="Seal Preview" class="hidden mt-4 w-full h-auto max-w-xs mx-auto rounded-lg border-2 border-gray-300 p-1"/>
            </div>
            <hr class="my-4">
            <h4 class="font-bold mb-2"><i class="fas fa-warehouse mr-2"></i>Warehouse Photos (Max 2)</h4>
            <div class="mt-4 text-center">
                 <label for="swal-warehouse-photos" class="cursor-pointer bg-gray-500 text-white font-bold py-2 px-4 rounded-full shadow-md hover:bg-gray-600 transition">
                    <i class="fas fa-images mr-2"></i> Upload Warehouse Photos
                </label>
                <input id="swal-warehouse-photos" type="file" class="hidden" accept="image/*" multiple>
                <div id="swal-warehouse-previews" class="mt-4 flex justify-center gap-4"></div>
            </div>
        </div>`;

    Swal.fire({
        title: 'Confirm Check-In',
        html: `
            <p class="text-sm text-gray-600 mb-4">Booking ID: <strong>${booking.id}</strong></p>
            ${paymentSectionHTML}
            ${sealSectionHTML}
        `,
        confirmButtonText: 'Complete Check-In',
        confirmButtonColor: '#28a745',
        showCancelButton: true,
        width: '500px',
        didOpen: () => {
            const confirmBtn = Swal.getConfirmButton();
            if (isCOD) confirmBtn.disabled = true;

            document.getElementById('confirm-payment-btn')?.addEventListener('click', async () => {
                const paymentBtn = document.getElementById('confirm-payment-btn');
                paymentBtn.disabled = true;
                paymentBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';
                
                try {
                    await db.ref(`bookings/${booking.id}`).update({ paymentStatus: 'paid' });
                    document.getElementById('payment-section').style.display = 'none';
                    document.getElementById('seal-section').classList.remove('hidden');
                    confirmBtn.disabled = false;
                    Swal.fire({ toast: true, icon: 'success', title: 'Payment confirmed!', position: 'top-end', showConfirmButton: false, timer: 2000 });
                } catch (err) {
                    Swal.showValidationMessage(`Failed to update payment: ${err.message}`);
                    paymentBtn.disabled = false;
                    paymentBtn.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Confirm Payment Received';
                }
            });

            const sealPhotoInput = document.getElementById('swal-seal-photo');
            const sealPreview = document.getElementById('swal-seal-preview');
            sealPhotoInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    selectedSealImageFile = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        sealPreview.src = re.target.result;
                        sealPreview.classList.remove('hidden');
                    };
                    reader.readAsDataURL(selectedSealImageFile);
                }
            });
            
            const warehousePhotosInput = document.getElementById('swal-warehouse-photos');
            const warehousePreviewsContainer = document.getElementById('swal-warehouse-previews');
            warehousePhotosInput.addEventListener('change', (e) => {
                if (e.target.files) {
                    selectedWarehouseImageFiles = Array.from(e.target.files).slice(0, 2);
                    warehousePreviewsContainer.innerHTML = '';
                    selectedWarehouseImageFiles.forEach(file => {
                        const reader = new FileReader();
                        reader.onload = (re) => {
                            const img = document.createElement('img');
                            img.src = re.target.result;
                            img.className = 'w-24 h-24 object-cover rounded-lg border-2 border-gray-300 p-1';
                            warehousePreviewsContainer.appendChild(img);
                        };
                        reader.readAsDataURL(file);
                    });
                }
            });
        },
        preConfirm: async () => {
            const sealNumber = document.getElementById('swal-seal-number').value;
            if (!sealNumber || !selectedSealImageFile) {
                Swal.showValidationMessage('Please provide seal number and photo to complete check-in.');
                return false;
            }

            Swal.showLoading();
            try {
                const sealPhotoUrl = await uploadImage(selectedSealImageFile);
                const warehousePhotoUrls = await Promise.all(selectedWarehouseImageFiles.map(file => uploadImage(file)));
                return { sealNumber, sealPhotoUrl, warehousePhotoUrls };
            } catch (error) {
                Swal.showValidationMessage(`Upload Failed: ${error.message}`);
                return false;
            }
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const { sealNumber, sealPhotoUrl, warehousePhotoUrls } = result.value;
            try {
                const finalUpdates = {
                    sealNumber,
                    sealPhotoUrl,
                    warehousePhotoUrls,
                    bookingStatus: 'checked_in',
                    checkInTime: firebase.database.ServerValue.TIMESTAMP
                };
                await db.ref(`bookings/${booking.id}`).update(finalUpdates);
                await sendUserNotification(booking.userId, 'item_checked_in', { ...booking, ...finalUpdates });
                Swal.fire('Success!', 'Booking has been checked-in.', 'success');
            } catch (err) {
                Swal.fire('Error', `Failed to update booking: ${err.message}`, 'error');
            }
        }
    });
}

function startQrScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.warn("QR Code stop failed", err));
    }
    document.getElementById('qr-scanner-modal').classList.remove('hidden');

    html5QrCode = new Html5Qrcode("qr-reader");
    const successCb = (decodedText, decodedResult) => {
        document.getElementById('qr-scanner-modal').classList.add('hidden');
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().catch(err => console.warn("QR Code stop failed after scan", err));
        }
        const booking = allBookings.find(b => b.id === decodedText);
        if (booking) {
            // --- LOGIKA BARU DIMULAI DI SINI ---
            if (booking.bookingStatus === 'checked_in') {
                // Jika sudah check-in, langsung tawarkan check-out
                handleCheckOut(booking.id);
            } else if (booking.bookingStatus === 'active' || booking.bookingStatus === 'processing_by_courier') {
                // Jika belum, buka modal check-in
                openCheckInModal(booking);
            } else {
                Swal.fire('Info', `Booking status is '${booking.bookingStatus}'. No immediate action available via QR scan.`, 'info');
            }
            // --- LOGIKA BARU SELESAI ---
        } else {
            Swal.fire('Error', `Booking ID ${decodedText} not found.`, 'error');
        }
    };
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, successCb)
        .catch(err => {
            Swal.fire('Camera Error', 'Could not start camera. Please ensure permissions are granted.', 'error');
        });
}


function followUpOverdue(bookingId) {
    const booking = allBookings.find(b => b.id === bookingId);
    const user = allUsers[booking.userId];
    if (!booking || !user || !user.phone) {
        return Swal.fire('Error', 'User data or phone number not found for this booking.', 'error');
    }

    const template = "Hello {userName}, your storage for {storageType} at {locationName} is overdue. Please check out soon or contact us for extension.";
    const message = template.replace(/{userName}/g, user.name).replace(/{locationName}/g, booking.locationName).replace(/{storageType}/g, (booking.storageType || 'storage unit'));
    const sanitizedPhone = user.phone.replace(/[^0-9]/g, '');
    const waLink = `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(message)}`;
    window.open(waLink, '_blank');
}

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