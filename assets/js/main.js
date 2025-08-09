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

// --- Global State ---
let userNotificationSound = new Audio('/assets/sounds/notification.wav');
let lastUserNotificationCount = 0;
let hasUserInteracted = false;

// --- PWA Installation Logic ---
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
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
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

// --- Google Maps Loading Logic (Corrected) ---
/**
 * Loads the Google Maps script using the API Key from the global config.
 */
function loadGoogleMapsScript() {
    if (document.getElementById('google-maps-script')) return;

    // Get API key from window.APP_CONFIG set by firebase-init.js
    const MAPS_API_KEY = window.APP_CONFIG?.MAPS_API_KEY;
    if (!MAPS_API_KEY) {
        console.error("Maps API Key not found in window.APP_CONFIG. Maps feature will be disabled.");
        return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    
    // PERBAIKAN KUNCI: Membuat URL dengan benar menggunakan variabel MAPS_API_KEY.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=places,geometry&callback=storamaps_initMap`;
    
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

/**
 * KEY FIX: This callback function must be in the global scope.
 * Google will call this function after the script has finished loading.
 */
window.storamaps_initMap = function() {
    console.log("✅ Google Maps API is loaded and ready.");
    // Set a global flag to indicate that the API is safe to use
    window.isGoogleMapsReady = true;
};


// --- Notification Logic ---
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
        if (badge) {
            if (currentUnreadCount > 0) {
                badge.textContent = currentUnreadCount;
                badge.classList.remove('hidden');
                if (currentUnreadCount > lastUserNotificationCount && hasUserInteracted) {
                    userNotificationSound.play().catch(e => console.warn("Notification sound failed:", e));
                }
            } else {
                badge.classList.add('hidden');
            }
        }
        lastUserNotificationCount = currentUnreadCount;
    }, (error) => {
        console.error("Error listening to notifications:", error);
    });
}

// --- App Initialization ---
function handleResize() {
    const isDesktop = window.innerWidth >= 1024;
    renderAppShell(document.getElementById('app'), isDesktop);
    router();
}

async function main() {
    try {
        const appRoot = document.getElementById('app');
        
        renderAppShell(appRoot, window.innerWidth >= 1024);
        window.addEventListener('resize', handleResize);
        setupInstallBanner();

        // 1. Initialize Firebase. This will also fetch the config from Netlify
        //    and should store the API Key in `window.APP_CONFIG`.
        await initializeFirebase();
        
        // 2. After Firebase is ready and config is loaded, call the function to load the Maps script.
        loadGoogleMapsScript();

        // 3. Register all app routes.
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

        // 4. Initialize the router and navigate to the initial route.
        initializeRouter();
        router();

        document.body.addEventListener('click', () => {
            hasUserInteracted = true;
        }, { once: true });

        // 5. Monitor user authentication status.
        onAuthStateChanged(user => {
            const pendingBooking = sessionStorage.getItem('pendingBooking');
            if (user && pendingBooking) {
                sessionStorage.removeItem('pendingBooking');
                const restoredState = JSON.parse(pendingBooking);
                location.hash = '#/';
                setTimeout(() => renderBookingFlowModal(restoredState), 100);
            } else {
                const restrictedPaths = ['#/bookings', '#/profile', '#/inbox', '#/notifications'];
                if (!user && restrictedPaths.includes(location.hash)) {
                    location.hash = '#/auth';
                }
            }

            if (user) {
                listenForUserNotifications(user.uid);
            } else if (window.userNotificationListener) {
                window.userNotificationListener.off();
                const badge = document.getElementById('notification-badge');
                if (badge) badge.classList.add('hidden');
                lastUserNotificationCount = 0;
            }
        });

        // 6. Fetch public data after the UI is ready.
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

// Run the application
main();