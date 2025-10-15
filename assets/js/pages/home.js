import { getStarRatingHTML } from '../ui/components.js';
import { debounce, showLoader, showToast } from '../ui/ui-helpers.js';
import { renderLocationDetailModal } from '../ui/modals.js';
import { publicDataCache } from '../main.js';
import { db } from '../firebase-init.js';

let state = {
    allLocations: {},
    allVouchers: {},
    allReviews: {},
    userLocation: null,
    filters: {
        searchQuery: ''
    }
};

function getDistance(coords1, coords2) {
    if (!coords1 || !coords2 || !coords1.lat || !coords2.latitude) return null;
    const R = 6371; // Radius of the earth in km
    const dLat = (coords2.latitude - coords1.lat) * Math.PI / 180;
    const dLon = (coords2.longitude - coords1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(coords1.lat * Math.PI / 180) * Math.cos(coords2.latitude * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getCheapestPrice(location) {
    if (!location.categories || location.categories.length === 0) {
        return { price: Infinity, duration: null };
    }
    const allRates = location.categories.flatMap(category =>
        (category.sizes || []).flatMap(size =>
            size.rates || []
        )
    );
    if (allRates.length === 0) {
        return { price: Infinity, duration: null };
    }
    return allRates.reduce((min, rate) => {
        if (rate && typeof rate.price === 'number') {
            if (rate.price < min.price) {
                return { price: rate.price, duration: rate.duration };
            }
        }
        return min;
    }, { price: Infinity, duration: null });
}

async function fetchAllData() {
    try {
        const snapshot = await db.ref('/').once('value');
        const data = snapshot.val();
        publicDataCache.locations = data.storageLocations || {};
        publicDataCache.vouchers = data.vouchers || {};
        publicDataCache.reviews = data.reviews || {};
        publicDataCache.settings = data.settings || {};
    } catch (error) {
        console.error('Error fetching data from Firebase:', error);
        throw new Error('Failed to fetch data.');
    }
}

async function renderLocations() {
    const container = document.getElementById('nearby-locations-list');
    if (!container) return;

    showLoader(true, 'Finding locations...');

    let locationsArray = Object.keys(state.allLocations).map(id => ({ id, ...state.allLocations[id] }));

    if (state.filters.searchQuery) {
        const query = state.filters.searchQuery.toLowerCase();
        locationsArray = locationsArray.filter(loc => (loc.name || '').toLowerCase().includes(query) || (loc.address || '').toLowerCase().includes(query));
    }

    locationsArray.forEach(loc => {
        const reviewsForLocation = Object.values(state.allReviews[loc.id] || {});
        loc.averageRating = reviewsForLocation.length > 0 ? (reviewsForLocation.reduce((sum, r) => sum + r.rating, 0) / reviewsForLocation.length) : 0;
        loc.reviewCount = reviewsForLocation.length;
        if (state.userLocation && loc.geolocation) {
            loc.distance = getDistance(state.userLocation, loc.geolocation);
        }
    });

    locationsArray.sort((a, b) => {
        if (state.userLocation) {
            return (a.distance ?? Infinity) - (b.distance ?? Infinity);
        }
        return 0;
    });

    if (locationsArray.length === 0) {
        container.innerHTML = `<p class="no-locations-message">No locations found matching your criteria.</p>`;
        showLoader(false);
        return;
    }

    container.innerHTML = locationsArray.map(loc => {
        const { price: cheapestPrice, duration: cheapestDuration } = getCheapestPrice(loc);
        const priceText = cheapestPrice !== Infinity ? `Starts from <span class="text-primary-500 font-bold">$${cheapestPrice.toFixed(2)} / ${cheapestDuration}</span>` : 'N/A';

        const imageUrl = loc.imageUrl
            ? `/.netlify/functions/get-photo?key=${encodeURIComponent(loc.imageUrl.split('key=')[1] || loc.imageUrl)}`
            : 'https://placehold.co/300x150';

        return `
            <div class="location-card" data-location-id="${loc.id}">
                <img src="${imageUrl}" alt="${loc.name}" class="location-card-img">
                <div class="location-card-content">
                    <div>
                        <h4 class="location-card-title">${loc.name}</h4>
                        <p class="location-card-info">${(loc.address || '').split(',').slice(0, 2).join(', ')}</p>
                        ${loc.distance ? `<p class="location-card-info no-margin"><b>~${loc.distance.toFixed(1)} km away</b></p>` : ''}
                        <div class="star-rating">${getStarRatingHTML(loc.averageRating)} (${loc.reviewCount})</div>
                        <p class="location-card-price-label mt-1">${priceText}</p>
                    </div>
                    <button class="btn btn-primary" data-action="view-details">View Details</button>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('[data-action="view-details"]').forEach(button => {
        button.addEventListener('click', e => {
            e.preventDefault();
            const locationCard = e.target.closest('.location-card');
            const locationId = locationCard.dataset.locationId;
            if (locationId && state.allLocations[locationId]) {
                const locationData = { id: locationId, ...state.allLocations[locationId] };
                renderLocationDetailModal(locationData, state.allReviews);
            }
        });
    });

    showLoader(false);
}

function renderVouchers() {
    const container = document.querySelector('#voucher-slider .voucher-slider-inner');
    if (!container) return;
    const activeVouchers = Object.values(state.allVouchers || {}).filter(v => v.active);
    
    const sliderContainer = document.querySelector('.voucher-slider-container');
    if (activeVouchers.length > 0) {
        if (sliderContainer) sliderContainer.style.display = 'block';
        container.innerHTML = activeVouchers.map(v => `
            <div class="voucher-slide" style="background-image: url('${v.imageUrl}');">
                <div class="voucher-slide-content">
                    <p class="voucher-slide-discount">${v.discount_percent}% OFF</p>
                    <span class="voucher-code" data-code="${v.code}">CODE: ${v.code}</span>
                </div>
            </div>
        `).join('');
    } else {
        if (sliderContainer) sliderContainer.style.display = 'none';
        return;
    }

    container.querySelectorAll('.voucher-code').forEach(codeElement => {
        codeElement.addEventListener('click', (e) => {
            const code = e.target.dataset.code;
            navigator.clipboard.writeText(code).then(() => {
                showToast('Voucher code copied!', 'success');
            }).catch(err => {
                showToast('Failed to copy code.', 'error');
            });
        });
    });
}

function addEventListeners() {
    const pageContainer = document.getElementById('page-container');
    if (!pageContainer) return;

    pageContainer.addEventListener('click', e => {
        const menuItem = e.target.closest('.app-menu-item');
        if (menuItem) {
            if (menuItem.dataset.category) {
                const path = '/' + menuItem.dataset.category.toLowerCase().replace(/\s+/g, '-');
                window.location.hash = path;
                return;
            }
            if (menuItem.dataset.path) {
                window.location.hash = menuItem.dataset.path;
                return;
            }
        }
    });

    const searchInput = document.getElementById('search-input');
    const detectLocationBtn = document.getElementById('detect-location-btn');
    
    if (searchInput && typeof google !== 'undefined' && google.maps) {
        const autocomplete = new google.maps.places.Autocomplete(searchInput);
        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry && place.geometry.location) {
                state.userLocation = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
                state.filters.searchQuery = place.name;
                renderLocations();
            }
        });
    }

    if (detectLocationBtn) {
        detectLocationBtn.addEventListener('click', () => {
            if (navigator.geolocation) {
                showLoader(true, 'Detecting your location...');
                navigator.geolocation.getCurrentPosition(pos => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    const geocoder = new google.maps.Geocoder();
                    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                        showLoader(false);
                        if (status === 'OK' && results[0]) {
                            state.userLocation = { lat, lng };
                            state.filters.searchQuery = results[0].formatted_address;
                            searchInput.value = results[0].formatted_address;
                            renderLocations();
                        } else {
                            showToast('Could not find address for your location.', 'error');
                        }
                    });
                }, () => {
                    showToast('Could not detect location.', 'error');
                    showLoader(false);
                });
            } else {
                showToast('Geolocation is not supported by your browser.', 'error');
            }
        });
    }
}

export default {
    render: async () => `
        <style>
            .app-menu-grid {
                grid-template-columns: repeat(3, 1fr);
                gap: 1.5rem;
            }
            .app-menu-item:nth-child(4) {
                grid-column: 1 / 2;
            }
            .app-menu-item:nth-child(5) {
                grid-column: 3 / 4;
            }
            @media (min-width: 768px) {
                .app-menu-grid {
                    grid-template-columns: repeat(5, 1fr);
                }
                .app-menu-item:nth-child(4),
                .app-menu-item:nth-child(5) {
                    grid-column: auto;
                }
            }
        </style>
        <div class="hero-section">
            <h2 id="banner-title" style="font-size: 1.75rem; font-weight: 800;">${publicDataCache.settings?.banner?.title || 'Secure, Simple, Smart Storage.'}</h2>
            <p id="banner-subtitle" style="opacity: 0.9; margin-top: 0.5rem;">${publicDataCache.settings?.banner?.subtitle || 'Find affordable and accessible self-storage units near you.'}</p>
            <div class="search-container">
                <input type="text" id="search-input" placeholder="Search by name or area...">
                <button id="detect-location-btn" title="Use my location">
                    <i class="fas fa-crosshairs"></i>
                </button>
            </div>
        </div>
        <div class="app-menu-container">
            <div class="app-menu-grid">
                <div class="app-menu-item" data-category="Luggage Storage">
                    <div class="app-menu-icon-wrapper luggage">
                        <i class="fas fa-suitcase-rolling"></i>
                    </div>
                    <span>Luggage Storage</span>
                </div>
                <div class="app-menu-item" data-category="Surfboard Storage">
                    <div class="app-menu-icon-wrapper surfboard">
                        <i class="fas fa-water"></i>
                    </div>
                    <span>Surfboard Storage</span>
                </div>
                <div class="app-menu-item" data-category="Self Storage">
                    <div class="app-menu-icon-wrapper self-storage">
                        <i class="fas fa-box-open"></i>
                    </div>
                    <span>Self Storage</span>
                </div>
                <div class="app-menu-item" data-category="Luggage Taxi">
                    <div class="app-menu-icon-wrapper luggage-taxi">
                        <i class="fas fa-taxi"></i>
                    </div>
                    <span>Luggage Taxi</span>
                </div>
                <div class="app-menu-item" data-path="#/shop">
                    <div class="app-menu-icon-wrapper" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed);">
                        <i class="fas fa-shopping-cart"></i>
                    </div>
                    <span>Shop</span>
                </div>
            </div>
        </div>
        <div class="voucher-slider-container">
            <h3 class="section-title">Exclusive Vouchers</h3>
            <div id="voucher-slider" class="voucher-slider">
                <div class="voucher-slider-inner">
                    <div class="voucher-slide-skeleton skeleton"></div>
                </div>
            </div>
        </div>
        <div class="locations-container" id="locations-container">
            <h3 class="section-title">Find Your Space</h3>
            <div id="nearby-locations-list" class="grid-view">
                <div class="location-card-skeleton skeleton"></div>
            </div>
        </div>
    `,
    afterRender: async () => {
        showLoader(true, 'Initializing...');
        try {
            if (!publicDataCache.locations) {
                await fetchAllData();
            }
            state.allLocations = publicDataCache.locations || {};
            state.allVouchers = publicDataCache.vouchers || {};
            state.allReviews = publicDataCache.reviews || {};
            renderVouchers();
            renderLocations();
            addEventListeners();
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(pos => {
                    state.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    renderLocations();
                }, () => {});
            }
        } catch (error) {
            console.error("Failed to render home page:", error);
            showToast('Failed to load page content.', 'error');
        } finally {
            showLoader(false);
        }
    }
};