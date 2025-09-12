/**
 * Menyiapkan semua event listener untuk elemen navigasi utama.
 */
function addNavigationListeners() {
    const app = document.getElementById('app');
    app.addEventListener('click', (e) => {
        const navButton = e.target.closest('.nav-btn');
        const actionLink = e.target.closest('a[href^="#/"]');

        if (navButton && navButton.dataset.path) {
            location.hash = navButton.dataset.path;
        } else if (actionLink) {
            // Biarkan browser menangani perubahan hash untuk tag anchor
        }
    });
}

/**
 * Merender kerangka utama aplikasi (header, footer, area konten).
 * @param {HTMLElement} appRoot - Elemen root untuk merender aplikasi.
 * @param {boolean} isDesktop - True untuk tampilan desktop, false untuk mobile.
 */
export function renderAppShell(appRoot, isDesktop) {
    // Ganti dengan nomor WhatsApp Anda
    const whatsappLink = "https://wa.me/6281234567890"; 

    if (isDesktop) {
        appRoot.innerHTML = `
            <header id="main-header" class="main-header">
                <div class="main-header-content">
                    <img src="/assets/img/storapedia.png" alt="Storapedia Logo" class="logo">
                    <div id="sidebar-actions">
                         <a href="#/inbox" class="icon-btn">
                            <i class="fas fa-inbox"></i>
                            <span>Inbox</span>
                        </a>
                         <a href="#/notifications" class="icon-btn">
                            <i class="fas fa-bell"></i>
                            <span>Notifications</span>
                            <span id="notification-badge" class="badge hidden"></span>
                        </a>
                        <a href="${whatsappLink}" target="_blank" class="icon-btn">
                            <i class="fab fa-whatsapp"></i>
                            <span>WhatsApp</span>
                        </a>
                    </div>
                    <nav id="desktop-nav">
                        <button class="nav-btn active" data-page="home" data-path="#/">
                            <i class="fas fa-home"></i><span>Home</span>
                        </button>
                        <button class="nav-btn" data-page="map" data-path="#/map">
                            <i class="fas fa-map-marked-alt"></i><span>Map</span>
                        </button>
                        <button class="nav-btn" data-page="shop" data-path="#/shop">
                            <i class="fas fa-shopping-cart"></i><span>Shop</span>
                        </button>
                        <button class="nav-btn" data-page="bookings" data-path="#/bookings">
                            <i class="fas fa-box"></i><span>Bookings</span>
                        </button>
                        <button class="nav-btn" data-page="profile" data-path="#/profile">
                            <i class="fas fa-user-circle"></i><span>Profile</span>
                        </button>
                    </nav>
                    <div class="sidebar-bottom">
                         <div class="sidebar-legal-links">
                            <a href="#/terms">Terms & Conditions</a>
                            <a href="#/privacy">Privacy Policy</a>
                            <a href="#/help">Help Center</a>
                        </div>
                    </div>
                </div>
            </header>
            <main id="page-container" class="page-container"></main>
            <nav id="bottom-nav" style="display: none;"></nav>
        `;
    } else {
        // Tata letak mobile dengan header yang sudah diperbaiki
        appRoot.innerHTML = `
            <header id="main-header" class="main-header">
                <img src="/assets/img/storapedia.png" alt="Storapedia Logo" class="logo">
                <div class="header-actions">
                    <a href="#/inbox" class="icon-btn">
                        <i class="fas fa-inbox"></i>
                    </a>
                    <a href="#/notifications" class="icon-btn">
                        <i class="fas fa-bell"></i>
                        <span id="notification-badge" class="badge hidden"></span>
                    </a>
                    <a href="${whatsappLink}" target="_blank" class="icon-btn">
                        <i class="fab fa-whatsapp"></i>
                    </a>
                </div>
            </header>
            <main id="page-container" class="page-container"></main>
            <nav id="bottom-nav">
                <button class="nav-btn" data-page="home" data-path="#/">
                    <i class="fas fa-home"></i><span>Home</span>
                </button>
                <button class="nav-btn" data-page="map" data-path="#/map">
                    <i class="fas fa-map-marked-alt"></i><span>Map</span>
                </button>
                <button class="nav-btn" data-page="shop" data-path="#/shop">
                    <i class="fas fa-shopping-cart"></i><span>Shop</span>
                </button>
                <button class="nav-btn" data-page="bookings" data-path="#/bookings">
                    <i class="fas fa-box"></i><span>Bookings</span>
                </button>
                <button class="nav-btn" data-page="profile" data-path="#/profile">
                    <i class="fas fa-user-circle"></i><span>Profile</span>
                </button>
            </nav>
        `;
    }
    addNavigationListeners();
}


/**
 * Menghasilkan HTML untuk rating bintang berdasarkan skor.
 * @param {number} rating - Skor rating (mis., 4.5).
 * @returns {string} String HTML dari ikon bintang.
 */
export function getStarRatingHTML(rating) {
    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
            starsHtml += '<i class="fas fa-star" style="color: #F59E0B;"></i>';
        } else if (i - 0.5 <= rating) {
            starsHtml += '<i class="fas fa-star-half-alt" style="color: #F59E0B;"></i>';
        } else {
            starsHtml += '<i class="far fa-star" style="color: #D1D5DB;"></i>';
        }
    }
    return starsHtml;
}