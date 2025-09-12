import { getStarRatingHTML } from '../ui/components.js';
import { debounce, showLoader } from '../ui/ui-helpers.js';
import { renderLocationDetailModal } from '../ui/modals.js';
import { publicDataCache } from '../main.js';

let map;
let markers = [];
let allLocationsData = [];
let infoWindow;

// Fungsi untuk menampilkan detail lokasi di sidebar
function showLocationDetailInSidebar(locationId) {
    const sidebar = document.getElementById('map-sidebar');
    const locationData = allLocationsData.find(loc => loc.id === locationId);
    if (!locationData) return;

    const reviews = Object.values(publicDataCache.reviews[locationData.id] || {});
    const avgRating = reviews.length > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length) : 0;
    
    const detailHTML = `
        <div class="sidebar-detail-view" style="display: flex; flex-direction: column; height: 100%;">
            <div class="detail-header" style="padding: 1rem; border-bottom: 1px solid #EAEBF0;">
                <button id="back-to-list-btn" class="btn btn-secondary btn-sm"><i class="fas fa-arrow-left"></i> Back</button>
            </div>
            <div class="detail-content" style="overflow-y: auto; padding: 1rem;">
                <img src="${locationData.imageUrl || 'https://placehold.co/300x200'}" alt="${locationData.name}" style="width: 100%; border-radius: 12px;">
                <h3 style="margin: 1rem 0 0.5rem;">${locationData.name}</h3>
                <div style="margin-bottom: 1rem;">${getStarRatingHTML(avgRating)}</div>
                <p>${locationData.address || 'N/A'}</p>
                <button class="btn btn-primary btn-full" style="margin-top: 1.5rem;" onclick="window.viewLocationFromMap('${locationData.id}')">Book Now</button>
            </div>
        </div>`;
    sidebar.innerHTML = detailHTML;
    document.getElementById('back-to-list-btn').addEventListener('click', () => {
        // Render ulang sidebar ke tampilan daftar
        const page = document.getElementById('map-page-wrapper');
        page.innerHTML = Map.sidebarHTML + page.querySelector('#map-container').outerHTML;
        setupEventListeners();
        populateFilterButtons();
        updateListingsAndMarkers();
    });
}

// Fungsi untuk mempopulasikan tombol filter
function populateFilterButtons() {
    const filtersContainer = document.getElementById('map-filters');
    if (!filtersContainer) return;
    const categories = new Set(['All', ...allLocationsData.flatMap(loc => (loc.categories || []).map(cat => cat.name))]);
    filtersContainer.innerHTML = Array.from(categories).map(category => 
        `<button class="btn btn-secondary filter-btn ${category === 'All' ? 'active' : ''}" data-category="${category}">${category}</button>`
    ).join('');
}

// Inisialisasi peta
async function initMap() {
    if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
        console.error("Google Maps script is not loaded.");
        return;
    }
    const mapElement = document.getElementById('map-container');
    if (!mapElement || mapElement.classList.contains('map-initialized')) return;
    
    map = new google.maps.Map(mapElement, {
        center: { lat: -8.6702, lng: 115.2124 },
        zoom: 11,
        disableDefaultUI: true,
        zoomControl: true,
    });
    mapElement.classList.add('map-initialized');
    infoWindow = new google.maps.InfoWindow();
    
    allLocationsData = Object.keys(publicDataCache.locations).map(id => ({ id, ...publicDataCache.locations[id] }));

    populateFilterButtons();
    setupEventListeners();
    updateListingsAndMarkers();
}

// Event listeners untuk kontrol peta
function setupEventListeners() {
    const searchInput = document.getElementById('map-search-input');
    const findMeBtn = document.getElementById('find-me-btn');
    const filtersContainer = document.getElementById('map-filters');

    if(searchInput) {
        const autocomplete = new google.maps.places.Autocomplete(searchInput);
        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry) {
                map.panTo(place.geometry.location);
                map.setZoom(15);
            }
        });
    }

    if(findMeBtn) findMeBtn.addEventListener('click', () => {
        if(navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }));
        }
    });
    
    if(filtersContainer) {
        filtersContainer.addEventListener('click', e => {
            if(e.target.classList.contains('filter-btn')) {
                filtersContainer.querySelector('.active')?.classList.remove('active');
                e.target.classList.add('active');
                updateListingsAndMarkers();
            }
        });
    }
    
    map.addListener('idle', debounce(updateListingsAndMarkers, 300));
}

// assets/js/pages/map.js

function updateListingsAndMarkers() {
    // Perbaikan: Pastikan map dan bounds sudah siap
    if (!map || !map.getBounds()) {
        console.warn("Map or map bounds not ready yet. Skipping update.");
        return;
    }

    const bounds = map.getBounds();
    const listingsContainer = document.getElementById('map-listings');
    const selectedCategory = document.querySelector('#map-filters .filter-btn.active')?.dataset.category || 'All';

    // Hapus marker yang lama
    markers.forEach(marker => marker.setMap(null));
    markers = [];
    listingsContainer.innerHTML = '';
    
    let locationsInViewCount = 0;
    allLocationsData.forEach(loc => {
        const position = loc.geolocation ? { lat: loc.geolocation.latitude, lng: loc.geolocation.longitude } : null;
        
        // Perbaikan: Cek apakah lokasi ada di dalam bounds
        if (!position || !bounds.contains(position)) {
            return;
        }
        
        const categoryMatch = selectedCategory === 'All' || loc.categories?.some(cat => cat.name === selectedCategory);
        if (!categoryMatch) return;
        
        locationsInViewCount++;
        const marker = new google.maps.Marker({
            position,
            map: map,
            title: loc.name,
            icon: '/assets/img/maps.png' // Pastikan path icon benar
        });
        
        marker.addListener('click', () => {
            if (infoWindow) {
                infoWindow.setContent(`<strong>${loc.name}</strong>`);
                infoWindow.open(map, marker);
                map.panTo(marker.getPosition());
            }
        });
        markers.push(marker);

        const avgRating = Object.values(publicDataCache.reviews[loc.id] || {}).reduce((acc, r, _, arr) => acc + r.rating / arr.length, 0);
        
        const listingItem = document.createElement('div');
        listingItem.className = 'listing-item';
        listingItem.innerHTML = `
            <img src="${loc.imageUrl || 'https://placehold.co/100x70'}" alt="${loc.name}">
            <div>
                <h5 class="listing-title">${loc.name}</h5>
                <div class="listing-rating">${getStarRatingHTML(avgRating)}</div>
            </div>`;
        listingItem.addEventListener('click', () => showLocationDetailInSidebar(loc.id));
        listingsContainer.appendChild(listingItem);
    });

    if (locationsInViewCount === 0) {
        listingsContainer.innerHTML = '<div class="no-results">No locations found in this area.</div>';
    }
}

// Fungsi global untuk membuka modal dari peta
window.viewLocationFromMap = (locationId) => {
    const locationData = allLocationsData.find(loc => loc.id === locationId);
    if (locationData) renderLocationDetailModal(locationData, publicDataCache.reviews);
};

// Object Map utama
const Map = {
    sidebarHTML: `
        <div id="map-sidebar" style="width: 350px; background: #FFFFFF; border-right: 1px solid #EAEBF0; display: flex; flex-direction: column; flex-shrink: 0;">
            <div class="map-controls" style="padding: 1rem; border-bottom: 1px solid #EAEBF0;">
                <input type="text" id="map-search-input" placeholder="Search address or place..." style="width: 100%; margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div id="map-filters" style="display: flex; gap: 0.5rem; overflow-x: auto;"></div>
                    <button id="find-me-btn" title="My Location" class="btn btn-secondary"><i class="fas fa-crosshairs"></i></button>
                </div>
            </div>
            <div id="map-listings" style="overflow-y: auto; flex-grow: 1;"></div>
        </div>`,
    render: async () => `
        <div id="map-page-wrapper" style="display: flex; height: 100vh; width: 100%; position: absolute; top: 0; left: 0;">
            ${Map.sidebarHTML}
            <div id="map-container" style="flex-grow: 1; height: 100%;"></div>
        </div>
        <style>
            @media (max-width: 768px) {
                #map-page-wrapper { flex-direction: column; }
                #map-sidebar { width: 100% !important; height: 45%; max-height: 45vh; border-right: none; border-bottom: 1px solid #EAEBF0; }
                #map-container { height: 55%; }
            }
        </style>
    `,
    afterRender: async () => {
        if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
            showToast("Loading Google Maps, please wait...", "info");
            // Maps akan diinisialisasi oleh script di index.html
            // Kita hanya perlu menunggu
            const checkGoogle = setInterval(() => {
                if (typeof google !== 'undefined' && google.maps) {
                    clearInterval(checkGoogle);
                    initMap();
                }
            }, 200);
        } else {
            initMap();
        }
    }
};

export default Map;