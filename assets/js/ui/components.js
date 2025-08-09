function addNavigationListeners() {
    // Listener untuk navigasi bawah (mobile)
    document.getElementById('bottom-nav')?.addEventListener('click', (e) => {
        const navButton = e.target.closest('.nav-btn');
        if (navButton && navButton.dataset.path) {
            location.hash = navButton.dataset.path;
        }
    });

    // Listener untuk navigasi atas (desktop)
    document.getElementById('desktop-nav')?.addEventListener('click', (e) => {
        const navButton = e.target.closest('.nav-btn');
        if (navButton && navButton.dataset.path) {
            location.hash = navButton.dataset.path;
        }
    });

    // Listener untuk tombol inbox di header
    document.getElementById('inbox-btn')?.addEventListener('click', () => {
        location.hash = '#/inbox';
    });

    // Listener untuk tombol notifikasi di header
    document.getElementById('notifications-btn')?.addEventListener('click', () => {
        location.hash = '#/notifications';
    });
}

/**
 * Merender shell aplikasi (header, footer, dan area konten) berdasarkan tipe perangkat.
 * @param {HTMLElement} appRoot - Elemen root tempat aplikasi dirender.
 * @param {boolean} isDesktop - True jika tampilan adalah desktop, false jika mobile.
 */
export function renderAppShell(appRoot, isDesktop) {
    if (isDesktop) {
        appRoot.innerHTML = `
            <header id="main-header" class="main-header">
                <img src="/assets/img/storapedia.png" alt="Storapedia Logo" class="logo">
                <div class="header-actions">
                    <nav id="desktop-nav">
                        <button class="nav-btn" data-page="home" data-path="#/">
                            <i class="fas fa-home"></i>
                            <span>Home</span>
                        </button>
                        <button class="nav-btn" data-page="map" data-path="#/map">
                            <i class="fas fa-map-marked-alt"></i>
                            <span>Map</span>
                        </button>
                        <button class="nav-btn" data-page="bookings" data-path="#/bookings">
                            <i class="fas fa-box"></i>
                            <span>Bookings</span>
                        </button>
                        <button class="nav-btn" data-page="profile" data-path="#/profile">
                            <i class="fas fa-user-circle"></i>
                            <span>Profile</span>
                        </button>
                    </nav>
                    <button id="inbox-btn" class="icon-btn" title="Inbox">
                        <i class="fas fa-inbox"></i>
                        <span id="inbox-badge" class="badge hidden">0</span>
                    </button>
                    <button id="notifications-btn" class="icon-btn" title="Notifications">
                        <i class="fas fa-bell"></i>
                        <span id="notification-badge" class="badge hidden">0</span>
                    </button>
                </div>
            </header>
            <main id="page-container" class="page-container"></main>
            <nav id="bottom-nav" style="display: none;"></nav>
        `;
    } else {
        appRoot.innerHTML = `
            <header id="main-header" class="main-header">
                <img src="/assets/img/storapedia.png" alt="Storapedia Logo" class="logo">
                <div class="header-actions">
                    <button id="inbox-btn" class="icon-btn" title="Inbox">
                        <i class="fas fa-inbox"></i>
                        <span id="inbox-badge" class="badge hidden">0</span>
                    </button>
                    <button id="notifications-btn" class="icon-btn" title="Notifications">
                        <i class="fas fa-bell"></i>
                        <span id="notification-badge" class="badge hidden">0</span>
                    </button>
                </div>
            </header>
            <main id="page-container" class="page-container"></main>
            <nav id="bottom-nav">
                <button class="nav-btn" data-page="home" data-path="#/">
                    <i class="fas fa-home"></i>
                    <span>Home</span>
                </button>
                <button class="nav-btn" data-page="map" data-path="#/map">
                    <i class="fas fa-map-marked-alt"></i>
                    <span>Map</span>
                </button>
                <button class="nav-btn" data-page="bookings" data-path="#/bookings">
                    <i class="fas fa-box"></i>
                    <span>Bookings</span>
                </button>
                <button class="nav-btn" data-page="profile" data-path="#/profile">
                    <i class="fas fa-user-circle"></i>
                    <span>Profile</span>
                </button>
            </nav>
        `;
    }
    addNavigationListeners();
}

export function getStarRatingHTML(rating) {
    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
            starsHtml += '<i class="fas fa-star"></i>';
        } else if (i - 0.5 <= rating) {
            starsHtml += '<i class="fas fa-star-half-alt"></i>';
        } else {
            starsHtml += '<i class="far fa-star"></i>';
        }
    }
    return starsHtml;
}