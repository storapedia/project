import { initializeFirebase, db } from './firebase-init.js';
import { initializeRouter, registerRoute, router } from './router.js';
import { renderAppShell } from './ui/components.js';
import { onAuthStateChanged } from './services/auth.js';
import { renderBookingFlowModal } from './ui/modals.js';
import { fetchAllPublicData } from './services/firebase-api.js';
import { showLoader } from './ui/ui-helpers.js';

import Home from './pages/home.js';
import Map from './pages/map.js';
import Bookings from './pages/bookings.js';
import Profile from './pages/profile.js';
import Auth from './pages/auth.js';
import Inbox from './pages/inbox.js';
import Notifications from './pages/notifications.js';

export const publicDataCache = {
    locations: null,
    reviews: null,
    vouchers: null,
    easySteps: null
};


let userNotificationSound = new Audio('/assets/sounds/notification.wav');
let lastUserNotificationCount = 0;
let hasUserInteracted = false;
let routerInitialized = false;

// --- PWA Installation Logic for Android & iOS ---
function setupInstallBanner() {
    let deferredPrompt;
    const installBanner = document.getElementById('install-banner');
    if (!installBanner) return;

    const installButton = document.getElementById('install-button');
    const installText = installBanner.querySelector('.install-banner-text');
    const closeButton = document.getElementById('close-install-banner');

    if (sessionStorage.getItem('installBannerClosed') === 'true' || window.matchMedia('(display-mode: standalone)').matches) {
        installBanner.classList.add('hidden');
        return;
    }

    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isSafariOnIOS = isIOS && /Safari/.test(ua) && !/CriOS/.test(ua) && !/FxiOS/.test(ua);

    if (isSafariOnIOS) {
        installText.innerHTML = "<strong>Install Storapedia</strong><span>Tap 'Share' then 'Add to Home Screen'</span>";
        installButton.classList.add('hidden');
        installBanner.classList.remove('hidden');

    } else if (isIOS && !isSafariOnIOS) {
        installText.innerHTML = "<strong>Install App</strong><span>To install, please open this page in Safari.</span>";
        installButton.classList.add('hidden');
        installBanner.classList.remove('hidden');

    } else {
        // Hapus `event.preventDefault()` agar banner bawaan browser dapat muncul
        window.addEventListener('beforeinstallprompt', (e) => {
            deferredPrompt = e;
            installBanner.classList.remove('hidden');

            installButton.addEventListener('click', async () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    await deferredPrompt.userChoice;
                    deferredPrompt = null;
                    installBanner.classList.add('hidden');
                }
            });
        });
    }

    closeButton.addEventListener('click', () => {
        installBanner.classList.add('hidden');
        sessionStorage.setItem('installBannerClosed', 'true');
    });

    window.addEventListener('appinstalled', () => {
        console.log('Storapedia was installed.');
        installBanner.classList.add('hidden');
        deferredPrompt = null;
    });
}
// --- End of PWA Installation Logic ---

// This function now needs to be called after firebase is initialized
// to ensure the Maps API key is available.
function loadGoogleMapsScript() {
    // We now retrieve the Maps API key from the config loader
    const Maps_API_KEY = window.APP_CONFIG?.Maps_API_KEY;
    if (!Maps_API_KEY || document.getElementById('google-maps-script')) return;
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${Maps_API_KEY}&libraries=places,geometry&callback=storamaps_initMap&loading=async`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

function listenForUserNotifications(userId) {
    if (!userId) return;
    if (window.userNotificationListener) {
        window.userNotificationListener.off();
    }
    window.userNotificationListener = db.ref(`notifications/users/${userId}`);
    window.userNotificationListener.on('value', (snapshot) => {
        const unreadNotifications = [];
        snapshot.forEach((childSnapshot) => {
            const notification = childSnapshot.val();
            if (!notification.read) {
                unreadNotifications.push(notification);
            }
        });
        const currentUnreadCount = unreadNotifications.length;
        const badge = document.getElementById('notification-badge');
        if (currentUnreadCount > 0) {
            badge.textContent = currentUnreadCount;
            badge.classList.remove('hidden');
            if (currentUnreadCount > lastUserNotificationCount && hasUserInteracted) {
                userNotificationSound.play().catch(e => console.warn("User notification sound failed to play:", e));
            }
        } else {
            badge.classList.add('hidden');
        }
        lastUserNotificationCount = currentUnreadCount;
    }, (error) => {
        console.error("Error listening for user notifications:", error);
    });
}

function handleResize() {
    // Deteksi apakah lebar layar lebih besar atau sama dengan 1024px
    const isDesktop = window.innerWidth >= 1024;
    renderAppShell(document.getElementById('app'), isDesktop);
    // Panggil router untuk merender ulang halaman jika diperlukan
    router();
}

async function main() {
    try {
        const appRoot = document.getElementById('app');
        
        // Render awal berdasarkan device type saat halaman dimuat
        const isDesktop = window.innerWidth >= 1024;
        renderAppShell(appRoot, isDesktop);

        // Tambahkan event listener untuk mendeteksi perubahan ukuran jendela
        window.addEventListener('resize', handleResize);

        setupInstallBanner();
        
        // Load the config first, and then initialize Firebase
        // NOTE: The `fetchConfig` function is no longer needed here if we do this in `firebase-init.js`
        // We will call `initializeFirebase()` which now handles fetching config.
        await initializeFirebase();
        
        // Now that Firebase is initialized, we can safely load the Maps script
        loadGoogleMapsScript();

        registerRoute('/', Home);
        registerRoute('/map', Map);
        registerRoute('/bookings', Bookings);
        registerRoute('/profile', Profile);
        registerRoute('/auth', Auth);
        registerRoute('/inbox', Inbox);
        registerRoute('/notifications', Notifications);
        registerRoute('/404', {
            render: async () => `<div class="page-header"><h2 class="page-title">Page Not Found</h2></div>`
        });

        initializeRouter();
        router();
        routerInitialized = true;

        document.body.addEventListener('click', () => {
            hasUserInteracted = true;
        }, { once: true });

        onAuthStateChanged(user => {
            const pendingBooking = sessionStorage.getItem('pendingBooking');
            if (user && pendingBooking) {
                sessionStorage.removeItem('pendingBooking');
                const restoredState = JSON.parse(pendingBooking);
                location.hash = '#/';
                renderBookingFlowModal(restoredState.location, restoredState);
            } else {
                const restrictedPaths = ['#/bookings', '#/profile', '#/inbox', '#/notifications'];
                if (!user && restrictedPaths.includes(location.hash)) {
                    location.hash = '#/auth';
                }
            }

            if (user) {
                listenForUserNotifications(user.uid);
            } else {
                if (window.userNotificationListener) {
                    window.userNotificationListener.off();
                    document.getElementById('notification-badge').classList.add('hidden');
                    lastUserNotificationCount = 0;
                }
            }
        });

        showLoader(true, 'Loading initial data...');
        const data = await fetchAllPublicData();
        publicDataCache.locations = data.locations;
        publicDataCache.reviews = data.reviews;
        publicDataCache.vouchers = data.vouchers;
        publicDataCache.easySteps = data.easySteps;
        showLoader(false);
    } catch (error) {
        console.error("Application failed to start:", error);
        showLoader(false);
    }
}

// Jalankan aplikasi
main();
