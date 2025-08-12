let allBookings = [];
let allUsers = {};
let allLocations = [];
let allVouchers = [];
let allConversations = [];
let allFaqs = [];
let allReviews = [];
let allTestimonials = [];
let allCouriers = {};
let allStorageTypes = {};

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

const firebaseConfig = {
  apiKey: "AIzaSyBeX6K3ejM-zu755LVDDMwgxBi-KW-ogx4",
  authDomain: "storapedia.firebaseapp.com",
  databaseURL: "https://storapedia-default-rtdb.firebaseio.com",
  projectId: "storapedia",
  storageBucket: "storapedia.firebasestorage.app",
  messagingSenderId: "145464021088",
  appId: "1:145464021088:web:1e24a2847994ac5003f305"
};

    const Maps_API_KEY = '{{ .Env.MAPS_API_KEY }}';

let auth, db, storage;

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

function loadGoogleMapsScript() {
    if (typeof Maps_API_KEY === 'undefined' || Maps_API_KEY === '' || Maps_API_KEY === 'YOUR_MAPS_API_KEY') {
        console.error('Google Maps API Key is not available. Please provide a valid key in main.js');
        return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${Maps_API_KEY}&libraries=places,geometry&callback=initAdminMap`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

document.addEventListener('DOMContentLoaded', async () => {
    initializeFirebase();
    loadGoogleMapsScript();

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

    await db.ref('users').once('value', snapshot => {
        allUsers = snapshot.val() || {};
    });
    
    await db.ref('couriers').once('value', snapshot => {
        allCouriers = snapshot.val() || {};
    });
    
    await db.ref('settings/storageTypes').once('value', snapshot => {
        allStorageTypes = snapshot.val() || {};
    });

    attachDataListeners();

    showPage('dashboard');
}

function attachDataListeners() {
    db.ref('users').on('value', snapshot => {
        allUsers = snapshot.val() || {};
        renderUsersTable(Object.values(allUsers).map((user, i) => ({...user, id: Object.keys(allUsers)[i]})));
        if (document.getElementById('page-bookings').classList.contains('active')) renderBookingsTable();
        if (document.getElementById('page-inbox').classList.contains('active')) renderConversationsList();
        if (document.getElementById('page-reviews').classList.contains('active')) window.renderReviews();
    }, (error) => {
        console.error("Error fetching users:", error);
    });

    db.ref('bookings').on('value', snapshot => {
        allBookings = [];
        snapshot.forEach(child => { allBookings.push({ id: child.key, ...child.val() }); });
        allBookings.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (document.getElementById('page-bookings').classList.contains('active')) renderBookingsTable();
        fetchAndRenderDashboard();
    }, (error) => {
        console.error("Error fetching bookings:", error);
    });
    
    db.ref('couriers').on('value', snapshot => {
        allCouriers = snapshot.val() || {};
    }, (error) => {
        console.error("Error fetching couriers:", error);
    });

    db.ref('faqs').on('value', snapshot => {
        allFaqs = [];
        snapshot.forEach(child => { allFaqs.push({ id: child.key, ...child.val() }); });
        if (document.getElementById('page-faqs').classList.contains('active')) renderFaqsTable(allFaqs);
    }, (error) => {
        console.error("Error fetching FAQs:", error);
    });

    db.ref('chats').on('value', snapshot => {
        if (document.getElementById('page-inbox').classList.contains('active')) fetchAndRenderConversations(true);
    }, (error) => {
        console.error("Error fetching chats:", error);
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
        if (document.getElementById('page-bookings').classList.contains('active')) renderBookingsTable();
        if (document.getElementById('page-reviews').classList.contains('active')) window.renderReviews();
    }, (error) => {
        console.error("Error fetching storageLocations:", error);
    });

    db.ref('vouchers').on('value', snapshot => {
        const data = snapshot.val();
        allVouchers = [];
        if (data) {
            allVouchers = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            }));
        }
        if (document.getElementById('page-vouchers').classList.contains('active')) {
            renderVouchersTable(allVouchers);
        }
    }, (error) => {
        console.error("Error fetching vouchers:", error);
    });
    
    db.ref('testimonials').on('value', snapshot => {
        const data = snapshot.val();
        allTestimonials = [];
        if (data) {
            allTestimonials = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            }));
        }
        if (document.getElementById('page-reviews').classList.contains('active')) {
            window.renderTestimonials();
        }
    }, (error) => {
        console.error("Error fetching testimonials:", error);
    });

    db.ref('reviews').on('value', snapshot => {
        allReviews = [];
        snapshot.forEach(locationSnapshot => {
            const locationId = locationSnapshot.key;
            locationSnapshot.forEach(reviewSnapshot => {
                allReviews.push({
                    id: reviewSnapshot.key,
                    locationId: locationId,
                    ...reviewSnapshot.val()
                });
            });
        });
        if (document.getElementById('page-reviews').classList.contains('active')) window.renderReviews();
    }, (error) => {
        console.error("Error fetching reviews:", error);
    });

    db.ref('settings/storageTypes').on('value', snapshot => {
        allStorageTypes = snapshot.val() || {};
        if (document.getElementById('page-locations').classList.contains('active')) {
            renderLocationsTable(allLocations);
        }
    }, (error) => {
        console.error("Error fetching storage types:", error);
    });
}

function setupEventListeners() {
    document.querySelectorAll('.sidebar-link').forEach(link => link.addEventListener('click', e => {
        e.preventDefault();
        showPage(e.currentTarget.dataset.page);
        if (window.innerWidth < 768) {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.add('hidden');
            sidebar.classList.remove('active');
        }
    }));

    document.getElementById('booking-search').addEventListener('input', renderBookingsTable);
    document.getElementById('booking-status-filter').addEventListener('change', renderBookingsTable);
    document.getElementById('booking-location-filter').addEventListener('change', renderBookingsTable);
    document.getElementById('user-search').addEventListener('input', () => renderUsersTable(Object.values(allUsers).map((user, i) => ({...user, id: Object.keys(allUsers)[i]}))));
    document.getElementById('conversation-search').addEventListener('input', renderConversationsList);
    document.querySelectorAll('.inbox-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.inbox-filter-btn').forEach(b => {
                b.classList.remove('bg-primary-600', 'text-white');
                b.classList.add('bg-gray-200', 'text-gray-700');
            });
            e.currentTarget.classList.add('bg-primary-600', 'text-white');
            e.currentTarget.classList.remove('bg-gray-200', 'text-gray-700');
            renderConversationsList();
        });
    });

    document.getElementById('scan-qr-btn').addEventListener('click', startQrScanner);
    document.getElementById('add-location-btn').addEventListener('click', () => openLocationModal());
    document.getElementById('add-faq-btn').addEventListener('click', () => openFaqModal());
    document.getElementById('add-voucher-btn').addEventListener('click', () => openVoucherModal());
    document.getElementById('new-message-btn').addEventListener('click', openNewMessageModal);
    document.getElementById('broadcast-message-btn').addEventListener('click', openBroadcastModal);
    document.getElementById('chat-form').addEventListener('submit', handleSendMessage);
    document.getElementById('website-settings-form').addEventListener('submit', handleWebsiteSettingsSubmit);

    document.getElementById('close-qr-scanner-btn').addEventListener('click', () => {
        document.getElementById('qr-scanner-modal').classList.add('hidden');
        if (html5QrCode && html5QrCode.isScanning) html5QrCode.stop();
    });
    document.getElementById('close-edit-booking-modal').addEventListener('click', () => {
        document.getElementById('edit-booking-modal').classList.add('hidden');
    });

    document.getElementById('manage-storage-types-btn').addEventListener('click', () => {
        openManageStorageTypesModal();
    });
}

function showPage(pageId) {
    if (!pageId) {
        return;
    }

    document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pageId}`).classList.add('active');

    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`.sidebar-link[data-page="${pageId}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }

    const title = pageId.charAt(0).toUpperCase() + pageId.slice(1);
    document.getElementById('page-title').textContent = title === 'Faqs' ? 'FAQs' : title;

    switch(pageId) {
        case 'dashboard': fetchAndRenderDashboard(); break;
        case 'bookings': renderBookingsTable(); break;
        case 'users': renderUsersTable(Object.values(allUsers).map((user, i) => ({...user, id: Object.keys(allUsers)[i]}))); break;
        case 'inbox': fetchAndRenderConversations(true); break;
        case 'locations': renderLocationsTable(allLocations); break;
        case 'vouchers': renderVouchersTable(allVouchers); break;
        case 'reviews':
            window.renderReviews();
            window.renderTestimonials();
            break;
        case 'faqs': renderFaqsTable(allFaqs); break;
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

function startQrScanner() {
    if(html5QrCode && html5QrCode.isScanning) { html5QrCode.stop(); }
    document.getElementById('qr-scanner-modal').classList.remove('hidden');

    html5QrCode = new Html5Qrcode("qr-reader");
    const successCb = (decodedText, decodedResult) => {
        document.getElementById('qr-scanner-modal').classList.add('hidden');
        if (html5QrCode && html5QrCode.isScanning) html5QrCode.stop();
        const booking = allBookings.find(b => b.id === decodedText);
        if(booking) {
            if (booking.bookingStatus === 'active') {
                handleCheckIn(decodedText);
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