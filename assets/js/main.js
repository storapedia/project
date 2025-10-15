import { initializeFirebase, db } from './firebase-init.js';
import { initializeRouter, registerRoute, router } from './router.js';
import { renderAppShell } from './ui/components.js';
import { onAuthStateChanged, initializeAuth } from './services/auth.js';
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
    easySteps: null,
    shopProducts: null
};

let userNotificationSound = new Audio('/assets/sounds/notification.wav');
let lastUserNotificationCount = 0;
let hasUserInteracted = false;

function setupServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then(registration => console.log('Service Worker terdaftar: ', registration))
                .catch(err => console.log('Gagal mendaftar Service Worker: ', err));
        });
    }
}

function setupInstallBanner() {
    let deferredPrompt;
    const installBanner = document.createElement('div');
    installBanner.id = 'install-banner';
    installBanner.className = 'install-banner hidden';
    installBanner.innerHTML = `
        <div class="install-banner-content">
            <img src="/assets/img/icon.png" alt="Install App" class="install-banner-icon">
            <div class="install-banner-text">
                <strong>Install Storapedia</strong>
                <span>Add to your home screen for a better experience.</span>
            </div>
        </div>
        <div>
            <button id="install-button" class="btn btn-primary">Install</button>
            <button id="close-install-banner" class="icon-btn">&times;</button>
        </div>
    `;
    document.body.prepend(installBanner);

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
        installBanner.classList.add('hidden');
        deferredPrompt = null;
    });
}

function loadDynamicStyles() {
    const existingLink = document.getElementById('dynamic-stylesheet');
    if (existingLink) existingLink.remove();

    const link = document.createElement('link');
    link.id = 'dynamic-stylesheet';
    link.rel = 'stylesheet';
    link.href = window.innerWidth >= 1024 ? '/assets/css/style2.css' : '/assets/css/style.css';
    document.head.appendChild(link);
}

function listenForUserNotifications(userId) {
    if (!userId) return;
    if (window.userNotificationListener) window.userNotificationListener.off();

    window.userNotificationListener = db.ref(`notifications/users/${userId}`);
    window.userNotificationListener.on('value', (snapshot) => {
        const unreadNotifications = [];
        snapshot.forEach((childSnapshot) => {
            if (!childSnapshot.val().read) unreadNotifications.push(childSnapshot.val());
        });
        
        const currentUnreadCount = unreadNotifications.length;
        const badge = document.getElementById('notification-badge');
        
        if (badge) {
            badge.textContent = currentUnreadCount > 0 ? currentUnreadCount : '';
            badge.classList.toggle('hidden', currentUnreadCount === 0);
            if (currentUnreadCount > lastUserNotificationCount && hasUserInteracted) {
                userNotificationSound.play().catch(e => console.warn("Notification sound failed:", e));
            }
        }
        lastUserNotificationCount = currentUnreadCount;
    }, (error) => {
        console.error("Error listening to notifications:", error);
    });
}

// --- FUNGSI BARU UNTUK MENGHAPUS TOMBOL WHATSAPP ---
function removeFloatingWhatsAppButton() {
    const floatingButton = document.querySelector('.floating-whatsapp');
    if (floatingButton) {
        floatingButton.remove();
        console.log('Floating WhatsApp button removed.');
    }
}

function handleResize() {
    renderAppShell(document.getElementById('app'), window.innerWidth >= 1024);
    loadDynamicStyles();
    removeFloatingWhatsAppButton(); // Panggil juga saat resize
    router();
}

async function main() {
    try {
        const appRoot = document.getElementById('app');
        renderAppShell(appRoot, window.innerWidth >= 1024);
        loadDynamicStyles();
        removeFloatingWhatsAppButton(); // Panggil saat aplikasi pertama kali dimuat
        window.addEventListener('resize', handleResize);
        setupServiceWorker();
        setupInstallBanner();

        await initializeFirebase();
        
        const initialUser = await initializeAuth();
        const restrictedPaths = ['#/bookings', '#/profile', '#/inbox', '#/notifications'];
        if (!initialUser && restrictedPaths.includes(location.hash)) {
            location.hash = '#/auth';
        }
        
        registerRoute('/', Home);
        registerRoute('/map', Map);
        registerRoute('/bookings', Bookings);
        registerRoute('/profile', Profile);
        registerRoute('/auth', Auth);
        registerRoute('/inbox', Inbox);
        registerRoute('/notifications', Notifications);
        registerRoute('/404', { render: async () => `<div class="page-header"><h2 class="page-title">Page Not Found</h2></div>` });
        initializeRouter();
        router();

        document.body.addEventListener('click', () => { hasUserInteracted = true; }, { once: true });
        
        onAuthStateChanged(user => {
            const pendingBooking = sessionStorage.getItem('pendingBooking');
            if (user && pendingBooking) {
                sessionStorage.removeItem('pendingBooking');
                const restoredState = JSON.parse(pendingBooking);
                location.hash = '#/';
                setTimeout(() => renderBookingFlowModal(restoredState), 100);
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

        showLoader(true, 'Loading initial data...');
        const data = await fetchAllPublicData();
        Object.assign(publicDataCache, data);
        showLoader(false);

    } catch (error) {
        console.error("Application failed to start:", error);
        showLoader(false);
    }
}

main();