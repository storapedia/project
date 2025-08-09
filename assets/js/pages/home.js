import { getStarRatingHTML } from '../ui/components.js';
import { debounce, showLoader, showToast } from '../ui/ui-helpers.js';
import { renderLocationDetailModal } from '../ui/modals.js';
import { publicDataCache } from '../main.js';

let state = {
    allLocations: {},
    allVouchers: {},
    allReviews: {},
    allEasySteps: {},
    allAvailableFeatures: [], // New state for dynamic features
    allAvailableCategories: [], // New state for dynamic categories
    userLocation: null,
    filters: { 
        sortBy: 'nearest', 
        filterType: 'features', // New filter state: 'features' or 'categories'
        features: [], 
        categories: [], // New filter state for categories
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

async function renderLocations() {
    const container = document.getElementById('nearby-locations-list');
    if (!container) return;

    showLoader(true, 'Finding locations...');
    
    let locationsArray = Object.keys(state.allLocations).map(id => ({ id, ...state.allLocations[id] }));

    if (state.filters.searchQuery) {
        const query = state.filters.searchQuery.toLowerCase();
        locationsArray = locationsArray.filter(loc => loc.name.toLowerCase().includes(query) || loc.address.toLowerCase().includes(query));
    }

    if (state.filters.filterType === 'features' && state.filters.features.length > 0) {
        locationsArray = locationsArray.filter(loc => {
            const locFeatures = (loc.features || []).map(f => f.name);
            return state.filters.features.every(filterFeature => locFeatures.includes(filterFeature));
        });
    }

    if (state.filters.filterType === 'categories' && state.filters.categories.length > 0) {
        locationsArray = locationsArray.filter(loc => {
            const locCategories = (loc.categories || []).map(c => c.name);
            return state.filters.categories.some(filterCategory => locCategories.includes(filterCategory));
        });
    }

    locationsArray.forEach(loc => {
        const reviewsForLocation = Object.values(state.allReviews[loc.id] || {});
        loc.averageRating = reviewsForLocation.length > 0 ? (reviewsForLocation.reduce((sum, r) => sum + r.rating, 0) / reviewsForLocation.length) : 0;
        loc.reviewCount = reviewsForLocation.length;
        if (state.userLocation) {
            loc.distance = getDistance(state.userLocation, loc.geolocation);
        }
    });

    locationsArray.sort((a, b) => {
        if (state.filters.sortBy === 'nearest') {
            return (a.distance ?? Infinity) - (b.distance ?? Infinity);
        }
        if (state.filters.sortBy === 'cheapest') {
            const getCheapestPrice = (loc) => {
                if (!loc.categories || loc.categories.length === 0) return Infinity;
                return loc.categories
                    .flatMap(cat => cat.sizes || [])
                    .flatMap(size => size.rates || [])
                    .reduce((min, rate) => Math.min(min, rate.price), Infinity);
            };
            return getCheapestPrice(a) - getCheapestPrice(b);
        }
        if (state.filters.sortBy === 'top_rated') {
            return b.averageRating - a.averageRating;
        }
        return 0;
    });

    if (locationsArray.length === 0) {
        container.innerHTML = `<p class="no-locations-message">No locations found matching your criteria.</p>`;
        showLoader(false);
        return;
    }

    container.innerHTML = locationsArray.map(loc => {
        const cheapestPrice = loc.categories?.flatMap(c => c.sizes || []).flatMap(t => t.rates || []).reduce((min, r) => Math.min(min, r.price), Infinity);

        return `
            <div class="location-card">
                <img src="${loc.imageUrl || 'https://via.placeholder.com/300x150'}" alt="${loc.name}" class="location-card-img">
                <div class="location-card-content">
                    <div>
                        <h4 class="location-card-title">${loc.name}</h4>
                        <p class="location-card-info">${loc.address.split(',').slice(0, 2).join(', ')}</p>
                        ${loc.distance ? `<p class="location-card-info"><b>~${loc.distance.toFixed(1)} km away</b></p>` : ''}
                        <div class="star-rating">${getStarRatingHTML(loc.averageRating)} (${loc.reviewCount})</div>
                        ${cheapestPrice !== Infinity ? `<p class="location-card-price-label">Starts from $${cheapestPrice} / day</p>` : ''}
                    </div>
                    <button class="btn btn-secondary btn-secondary-custom" data-action="view-detail" data-location-id="${loc.id}">View Details</button>
                </div>
            </div>
        `;
    }).join('');

    showLoader(false);
}

function renderFilters() {
    const sortContainer = document.getElementById('sort-by-tabs');
    const filterTypeContainer = document.getElementById('filter-type-tabs');
    const filterOptionsContainer = document.getElementById('filter-options');

    if (!sortContainer || !filterTypeContainer || !filterOptionsContainer) return;

    sortContainer.innerHTML = [
        { id: 'nearest', label: 'Nearest' }, { id: 'cheapest', label: 'Cheapest' }, { id: 'top_rated', label: 'Top Rated' }
    ].map(o => `<button class="filter-sort-tab ${state.filters.sortBy === o.id ? 'active' : ''}" data-sort-by="${o.id}">${o.label}</button>`).join('');

    filterTypeContainer.innerHTML = `
        <button class="filter-sort-tab ${state.filters.filterType === 'features' ? 'active' : ''}" data-filter-type="features">Features</button>
        <button class="filter-sort-tab ${state.filters.filterType === 'categories' ? 'active' : ''}" data-filter-type="categories">Categories</button>
    `;

    if (state.filters.filterType === 'features') {
        filterOptionsContainer.innerHTML = state.allAvailableFeatures.map(f => `<div class="feature-filter-item ${state.filters.features.includes(f.name) ? 'selected' : ''}" data-feature="${f.name}"><i class="${f.icon}"></i><span>${f.name}</span></div>`).join('');
    } else if (state.filters.filterType === 'categories') {
        filterOptionsContainer.innerHTML = state.allAvailableCategories.map(c => `<div class="feature-filter-item ${state.filters.categories.includes(c) ? 'selected' : ''}" data-category="${c}"><span>${c}</span></div>`).join('');
    }
}

function renderVouchers() {
    const container = document.querySelector('#voucher-slider .voucher-slider-inner');
    if (!container) return;
    const activeVouchers = Object.values(state.allVouchers).filter(v => v.active);
    if (activeVouchers.length > 0) {
        container.innerHTML = activeVouchers.map(v => `
            <div class="voucher-slide" style="background-image: url('${v.imageUrl}')">
                <div class="voucher-slide-content">
                    <p class="voucher-slide-discount">${v.discount_percent}% OFF</p>
                    <span class="voucher-code" data-code="${v.code}">CODE: ${v.code}</span>
                </div>
            </div>
        `).join('');
    } else {
        const sliderContainer = document.querySelector('.voucher-slider-container');
        if (sliderContainer) sliderContainer.style.display = 'none';
    }
}

function renderEasySteps() {
    const container = document.getElementById('easy-steps-list');
    if (!container) return;
    const steps = Object.values(state.allEasySteps).sort((a, b) => a.order - b.order);
    if (steps.length > 0) {
        container.innerHTML = steps.map(step => `
            <div class="easy-step-item">
                <div class="easy-step-icon"><i class="${step.icon}"></i></div>
                <p class="easy-step-text">${step.text}</p>
            </div>
        `).join('');
    } else {
        const stepsContainer = document.querySelector('.easy-steps-container');
        if (stepsContainer) stepsContainer.style.display = 'none';
    }
}

function addEventListeners() {
    const pageContainer = document.getElementById('page-container');
    if (!pageContainer) return;

    pageContainer.addEventListener('click', e => {
        const viewDetailButton = e.target.closest('[data-action="view-detail"]');
        if (viewDetailButton) {
            const locationId = viewDetailButton.dataset.locationId;
            if (locationId && state.allLocations[locationId]) {
                const locationData = { id: locationId, ...state.allLocations[locationId] };
                renderLocationDetailModal(locationData, state.allReviews);
            }
            return;
        }
        
        const sortByTab = e.target.closest('.filter-sort-tab');
        if (sortByTab) {
            if (sortByTab.dataset.sortBy) {
                state.filters.sortBy = sortByTab.dataset.sortBy;
            }
            if (sortByTab.dataset.filterType) {
                state.filters.filterType = sortByTab.dataset.filterType;
            }
            renderFilters();
            renderLocations();
            return;
        }
        
        const featureItem = e.target.closest('.feature-filter-item');
        if (featureItem) {
            if (featureItem.dataset.feature) {
                const featureName = featureItem.dataset.feature;
                const index = state.filters.features.indexOf(featureName);
                if (index > -1) {
                    state.filters.features.splice(index, 1);
                } else {
                    state.filters.features.push(featureName);
                }
            }
            if (featureItem.dataset.category) {
                const categoryName = featureItem.dataset.category;
                const index = state.filters.categories.indexOf(categoryName);
                if (index > -1) {
                    state.filters.categories.splice(index, 1);
                } else {
                    state.filters.categories.push(categoryName);
                }
            }
            renderFilters();
            renderLocations();
            return;
        }
    });
    
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            state.filters.searchQuery = searchInput.value;
            renderLocations();
        }, 300));

        if (typeof google !== 'undefined' && google.maps && google.maps.places) {
            const autocomplete = new google.maps.places.PlaceAutocompleteElement();
            autocomplete.addEventListener('place_changed', () => {
                const place = autocomplete.getPlace();
                if (place.geometry) {
                    state.userLocation = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
                    renderLocations();
                }
            });
        }
    }

    const detectLocationBtn = document.getElementById('detect-location-btn');
    if (detectLocationBtn) {
        detectLocationBtn.addEventListener('click', () => {
            if (navigator.geolocation) {
                showLoader(true, 'Detecting your location...');
                navigator.geolocation.getCurrentPosition(pos => {
                    state.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    showToast('Location detected!', 'success');
                    renderLocations();
                    showLoader(false);
                }, () => {
                    showToast('Could not detect location.', 'error');
                    showLoader(false);
                });
            }
        });
    }
}

function extractUniqueFeaturesAndCategories(locations) {
    const features = new Set();
    const categories = new Set();
    Object.values(locations).forEach(loc => {
        (loc.features || []).forEach(f => features.add(JSON.stringify(f)));
        (loc.categories || []).forEach(c => categories.add(c.name));
    });
    
    // Parse back to objects and filter out duplicates
    const uniqueFeatures = Array.from(features).map(f => JSON.parse(f));
    const uniqueCategories = Array.from(categories);

    return { uniqueFeatures, uniqueCategories };
}


export default {
    render: async () => `
        <div class="hero-section">
            <h2 id="banner-title" style="font-size: 1.75rem; font-weight: 800;">${publicDataCache.settings?.banner?.title || 'Secure, Simple, Smart Storage.'}</h2>
            <p id="banner-subtitle" style="opacity: 0.9; margin-top: 0.5rem;">${publicDataCache.settings?.banner?.subtitle || 'Find affordable and accessible self-storage units near you.'}</p>
            <div class="search-container"><input type="text" id="search-input" placeholder="Search by name or area..."><button id="detect-location-btn" title="Use my location"><i class="fas fa-crosshairs"></i></button></div>
        </div>
        <div class="easy-steps-container">
            <h3 class="section-title">Easy Steps to Order</h3>
            <div id="easy-steps-list" class="easy-steps-list">
                <div class="easy-step-item-skeleton skeleton"></div>
                <div class="easy-step-item-skeleton skeleton"></div>
                <div class="easy-step-item-skeleton skeleton"></div>
                <div class="easy-step-item-skeleton skeleton"></div>
            </div>
        </div>
        <div class="voucher-slider-container">
            <h3 class="section-title">Exclusive Vouchers</h3>
            <div id="voucher-slider" class="voucher-slider">
                <div class="voucher-slider-inner">
                    <div class="voucher-slide-skeleton skeleton"></div>
                    <div class="voucher-slide-skeleton skeleton"></div>
                    <div class="voucher-slide-skeleton skeleton"></div>
                </div>
            </div>
        </div>
        <div class="locations-container" id="locations-container">
            <h3 class="section-title">Find Your Space</h3>
            <div id="sort-by-tabs" class="filter-sort-tabs">
                <div class="filter-sort-tab-skeleton skeleton"></div>
                <div class="filter-sort-tab-skeleton skeleton"></div>
                <div class="filter-sort-tab-skeleton skeleton"></div>
            </div>
            <div id="filter-type-tabs" class="filter-sort-tabs">
                <div class="filter-sort-tab-skeleton skeleton"></div>
                <div class="filter-sort-tab-skeleton skeleton"></div>
            </div>
            <div id="filter-options" class="feature-filter-list">
                <div class="feature-filter-item-skeleton skeleton"></div>
                <div class="feature-filter-item-skeleton skeleton"></div>
                <div class="feature-filter-item-skeleton skeleton"></div>
            </div>
            <div id="nearby-locations-list" class="grid-view">
                <div class="location-card-skeleton skeleton"></div>
                <div class="location-card-skeleton skeleton"></div>
                <div class="location-card-skeleton skeleton"></div>
            </div>
        </div>
    `,
    afterRender: async () => {
        document.body.classList.add('loading-state');
        showLoader(true, 'Finding locations...');
        
        await new Promise(resolve => {
            const checkData = () => {
                if (publicDataCache.locations && publicDataCache.vouchers && publicDataCache.reviews && publicDataCache.easySteps) {
                    resolve();
                } else {
                    setTimeout(checkData, 100);
                }
            };
            checkData();
        });

        try {
            state.allLocations = publicDataCache.locations || {};
            state.allVouchers = publicDataCache.vouchers || {};
            state.allReviews = publicDataCache.reviews || {};
            state.allEasySteps = publicDataCache.easySteps || {};

            // Extract unique features and categories from the fetched data
            const { uniqueFeatures, uniqueCategories } = extractUniqueFeaturesAndCategories(state.allLocations);
            state.allAvailableFeatures = uniqueFeatures;
            state.allAvailableCategories = uniqueCategories;

            renderFilters();
            renderVouchers();
            renderEasySteps();
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
        } finally {
            showLoader(false);
            document.body.classList.remove('loading-state');
        }
    }
};