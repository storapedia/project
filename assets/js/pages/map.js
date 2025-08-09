import { showLoader, showToast, debounce, showModal, hideModal } from '../ui/ui-helpers.js';
import { renderLocationDetailModal } from '../ui/modals.js';
import { getStarRatingHTML } from '../ui/components.js';
import { publicDataCache } from '../main.js';

// Global variables
let map = null;
let infoWindow = null;
let markers = [];
let allLocations = [];
let allReviews = {};
let userLocation = null;
let currentFilters = { sortBy: 'nearest', categories: new Set(), features: new Set(), searchQuery: '' };
let mapInitialized = false;

// Variables for swipe panel logic
let bottomSheet, sheetHeader;
let isDragging = false, startY, startHeight;

// API Key & Map Styles
const MAPS_API_KEY = "AIzaSyADCv-AX09lIYq6Gr7Gm56rChp4kS0J08Q";
const MAP_STYLES = [
    {"featureType":"water","elementType":"geometry","stylers":[{"color":"#e9e9e9"},{"lightness":17}]},{"featureType":"landscape","elementType":"geometry","stylers":[{"color":"#f5f5f5"},{"lightness":20}]},{"featureType":"road.highway","elementType":"geometry.fill","stylers":[{"color":"#ffffff"},{"lightness":17}]},{"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#ffffff"},{"lightness":29},{"weight":0.2}]},{"featureType":"road.arterial","elementType":"geometry","stylers":[{"color":"#ffffff"},{"lightness":18}]},{"featureType":"road.local","elementType":"geometry","stylers":[{"color":"#ffffff"},{"lightness":16}]},{"featureType":"poi","elementType":"geometry","stylers":[{"color":"#f5f5f5"},{"lightness":21}]},{"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#dedede"},{"lightness":21}]},{"elementType":"labels.text.stroke","stylers":[{"visibility":"on"},{"color":"#ffffff"},{"lightness":16}]},{"elementType":"labels.text.fill","stylers":[{"saturation":36},{"color":"#333333"},{"lightness":40}]},{"elementType":"labels.icon","stylers":[{"visibility":"off"}]},{"featureType":"transit","elementType":"geometry","stylers":[{"color":"#f2f2f2"},{"lightness":19}]},{"featureType":"administrative","elementType":"geometry.fill","stylers":[{"color":"#fefefe"},{"lightness":20}]},{"featureType":"administrative","elementType":"geometry.stroke","stylers":[{"color":"#fefefe"},{"lightness":17},{"weight":1.2}]}
];

// Utility function to calculate distance
function getDistance(coords1, coords2) {
    if (!coords1 || !coords2 || typeof coords1.lat !== 'number' || typeof coords1.lng !== 'number' || typeof coords2.latitude !== 'number' || typeof coords2.longitude !== 'number') return null;
    const R = 6371;
    const dLat = (coords2.latitude - coords1.lat) * Math.PI / 180;
    const dLon = (coords2.longitude - coords1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(coords1.lat * Math.PI / 180) * Math.cos(coords2.latitude * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function saveMapState() {
    if (!map) return;
    const center = map.getCenter();
    const zoom = map.getZoom();
    const mapState = {
        lat: center.lat(),
        lng: center.lng(),
        zoom: zoom
    };
    localStorage.setItem('storaMapLocation', JSON.stringify(mapState));
}

// Map Initialization
window.storamaps_initMap = function() {
    if (mapInitialized) return;
    const mapCanvas = document.getElementById("mapnew-sp-map-canvas");
    if (!mapCanvas) { setTimeout(window.storamaps_initMap, 500); return; }
    
    const savedLocation = JSON.parse(localStorage.getItem('storaMapLocation'));
    const defaultCenter = { lat: -8.6525, lng: 115.2167 };
    
    const initialCenter = savedLocation ? { lat: savedLocation.lat, lng: savedLocation.lng } : defaultCenter;
    const initialZoom = savedLocation ? savedLocation.zoom : 12;

    try {
        map = new google.maps.Map(mapCanvas, {
            center: initialCenter,
            zoom: initialZoom,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            gestureHandling: 'greedy',
            styles: MAP_STYLES
        });
        infoWindow = new google.maps.InfoWindow();
        mapInitialized = true;
        
        map.addListener('dragend', saveMapState);
        map.addListener('zoom_changed', saveMapState);

        loadMapDataAndRender();
        const searchInput = document.getElementById('mapnew-sp-search-input');
        if (searchInput) {
            const autocomplete = new google.maps.places.Autocomplete(searchInput, { fields: ["geometry", "name"], types: ["geocode"], componentRestrictions: { 'country': ['id'] } });
            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                if (place.geometry?.location) {
                    userLocation = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
                    map.setCenter(userLocation); map.setZoom(14);
                    applyFiltersAndRenderMarkers();
                }
            });
            searchInput.addEventListener('input', debounce((e) => { currentFilters.searchQuery = e.target.value.trim(); applyFiltersAndRenderMarkers(); }, 300));
        }
    } catch(e) { console.error("Google Maps initialization failed:", e); }
};

async function loadMapDataAndRender() {
    showLoader(true, 'Loading locations...');
    if (publicDataCache.locations) {
        allLocations = Object.values(publicDataCache.locations);
        allReviews = publicDataCache.reviews || {};
        populateFilterPopup();
        applyFiltersAndRenderMarkers();
    } else {
        showToast('Application data is still loading...', 'info');
        setTimeout(loadMapDataAndRender, 1000);
    }
    showLoader(false);
}

async function getUserLocation() {
    return new Promise((resolve) => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition( (position) => {
                userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
                map.setCenter(userLocation); map.setZoom(13);
                applyFiltersAndRenderMarkers();
                resolve();
            }, () => { 
                showToast('Could not detect location.', 'error');
                resolve(); 
            }, { timeout: 5000 });
        } else { 
            showToast('Geolocation is not supported by your browser.', 'error');
            resolve(); 
        }
    });
}

function applyFiltersAndRenderMarkers() {
    markers.forEach(marker => marker.setMap(null));
    markers = [];
    let filteredLocations = [...allLocations];
    
    filteredLocations.forEach(loc => {
        const reviewsForLocation = Object.values(allReviews[loc.id] || {});
        loc.averageRating = reviewsForLocation.length > 0 ? (reviewsForLocation.reduce((sum, r) => sum + r.rating, 0) / reviewsForLocation.length) : 0;
        loc.reviewCount = reviewsForLocation.length;
        loc.distance = userLocation ? getDistance(userLocation, loc.geolocation) : null;
    });
    
    if (currentFilters.searchQuery) {
        const query = currentFilters.searchQuery.toLowerCase();
        filteredLocations = filteredLocations.filter(loc => (loc.name?.toLowerCase().includes(query) || loc.address?.toLowerCase().includes(query)));
    }
    if (currentFilters.features.size > 0) {
        filteredLocations = filteredLocations.filter(loc => {
            const locFeatures = (loc.features || []).map(f => f.name);
            return [...currentFilters.features].every(filterFeature => locFeatures.includes(filterFeature));
        });
    }
    if (currentFilters.categories.size > 0) {
        filteredLocations = filteredLocations.filter(loc => {
            const locCategories = (loc.categories || []).map(c => c.name);
            return [...currentFilters.categories].some(filterCategory => locCategories.includes(filterCategory));
        });
    }

    filteredLocations.sort((a, b) => {
        if (currentFilters.sortBy === 'nearest') return (a.distance ?? Infinity) - (b.distance ?? Infinity);
        if (currentFilters.sortBy === 'top_rated') return b.averageRating - a.averageRating;
        if (currentFilters.sortBy === 'cheapest') {
            const priceA = a.categories?.flatMap(c => c.sizes).flatMap(s => s?.rates).reduce((min, r) => Math.min(min, r.price), Infinity) || Infinity;
            const priceB = b.categories?.flatMap(c => c.sizes).flatMap(s => s?.rates).reduce((min, r) => Math.min(min, r.price), Infinity) || Infinity;
            return priceA - priceB;
        }
        return 0;
    });

    renderMarkersOnMap(filteredLocations);
    renderLocationCards(filteredLocations);
}

function renderMarkersOnMap(locationsToRender) {
    if (!map) return;
    locationsToRender.forEach(location => {
        if (location.geolocation?.latitude && location.geolocation?.longitude) {
            const position = { lat: location.geolocation.latitude, lng: location.geolocation.longitude };
            const icon = '/assets/img/icon.png';
            const marker = new google.maps.Marker({
                position: position,
                map: map,
                title: location.name,
                icon: {
                    url: icon,
                    scaledSize: new google.maps.Size(40, 40)
                }
            });
            
            const cheapestPrice = location.categories?.flatMap(c => c.sizes).flatMap(s => s?.rates).reduce((min, r) => Math.min(min, r.price), Infinity) || Infinity;
            const priceText = cheapestPrice !== Infinity ? `$${cheapestPrice.toFixed(2)}` : 'N/A';
            const contentString = `
                <div style="font-weight:bold; font-size: 1rem;">${location.name}</div>
                <div style="font-size: 0.9rem; color: #00BEFC;">Starts from ${priceText}</div>
            `;
            
            marker.addListener('click', () => {
                infoWindow.setContent(contentString);
                infoWindow.open(map, marker);
                map.panTo(position);
            });
            
            marker.locationData = location;
            markers.push(marker);
        }
    });
}

function renderLocationCards(locationsToRender) {
    const listContainer = document.getElementById('mapnew-sp-locations-list');
    if (!listContainer) return;

    if (locationsToRender.length === 0) { 
        listContainer.innerHTML = `<p style="text-align:center; color: #6B7280; grid-column: 1 / -1;">No locations found.</p>`; 
        return; 
    }

    listContainer.innerHTML = locationsToRender.map(loc => {
        const cheapestPrice = loc.categories?.flatMap(c => c.sizes).flatMap(s => s?.rates).reduce((min, r) => Math.min(min, r.price), Infinity) || Infinity;
        const priceText = cheapestPrice !== Infinity ? `$${cheapestPrice.toFixed(2)}/day` : 'N/A';
        const ratingHTML = getStarRatingHTML(loc.averageRating);
        
        return `
            <div class="location-card" data-location-id="${loc.id}" style="border: 1px solid #E5E7EB; border-radius: 0.75rem; overflow: hidden; transition: box-shadow 0.2s;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; padding: 0.75rem;">
                    <div class="location-info">
                        <h4 style="font-size: 0.9rem; font-weight: 700; margin: 0 0 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${loc.name}">${loc.name}</h4>
                        <p style="font-size: 0.75rem; color: #6B7280; margin: 0 0 4px 0;">${loc.distance !== null ? `~${loc.distance.toFixed(1)} km away` : loc.address.split(',')[0]}</p>
                        <div style="display: flex; align-items: center; gap: 3px; font-size: 0.8rem; color: #FBBF24; margin-bottom: 0.5rem;">${ratingHTML} <span style="color: #6B7280; font-size: 0.75rem;">(${loc.reviewCount})</span></div>
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <span style="font-weight: bold; color: #00BEFC; font-size: 0.9rem;">${priceText}</span>
                            <button class="btn btn-sm" data-action="view-location-detail" style="background-color: #00BEFC; color: white; padding: 0.25rem 0.75rem; font-size: 0.75rem; border: none; border-radius: 9999px;">View</button>
                        </div>
                    </div>
                    <div id="mapnew-sp-mini-map-${loc.id}" class="mini-map-container" style="height: 120px; width: 100%; border-radius: 0.5rem; overflow: hidden;"></div>
                </div>
            </div>
        `;
    }).join('');

    locationsToRender.forEach(loc => {
        if (loc.geolocation?.latitude && loc.geolocation?.longitude) {
            const miniMap = new google.maps.Map(document.getElementById(`mapnew-sp-mini-map-${loc.id}`), {
                center: { lat: loc.geolocation.latitude, lng: loc.geolocation.longitude },
                zoom: 14,
                disableDefaultUI: true,
                gestureHandling: "none"
            });
            const icon = '/assets/img/icon.png';
            const marker = new google.maps.Marker({
                position: { lat: loc.geolocation.latitude, lng: loc.geolocation.longitude },
                map: miniMap,
                icon: {
                    url: icon,
                    scaledSize: new google.maps.Size(40, 40)
                }
            });

            marker.addListener('click', () => {
                renderLocationDetailModal(loc, allReviews);
            });
        }
    });
    
    listContainer.querySelectorAll('[data-action="view-location-detail"]').forEach(button => {
        button.addEventListener('click', e => {
            e.stopPropagation();
            const card = e.target.closest('.location-card');
            const locationId = card.dataset.locationId;
            const locationData = allLocations.find(l => l.id === locationId);
            if (locationData) {
                renderLocationDetailModal(locationData, allReviews);
            }
        });
    });
}

function populateFilterPopup() {
    const allUniqueFeatures = new Set();
    const allUniqueCategories = new Set();

    allLocations.forEach(loc => {
        loc.features?.forEach(f => f.name && f.icon && allUniqueFeatures.add(JSON.stringify(f)));
        loc.categories?.forEach(c => c.name && allUniqueCategories.add(c.name));
    });
    
    const uniqueFeaturesArray = Array.from(allUniqueFeatures).map(s => JSON.parse(s)).sort((a,b) => a.name.localeCompare(b.name));
    const uniqueCategoriesArray = Array.from(allUniqueCategories).sort();

    const categoryListHTML = uniqueCategoriesArray.map(catName => `
        <label class="filter-chip-label">
            <input type="checkbox" name="category" value="${catName}" style="display:none;" ${currentFilters.categories.has(catName) ? 'checked' : ''}>
            <span class="filter-chip">${catName}</span>
        </label>
    `).join('');

    const featureListHTML = uniqueFeaturesArray.map(feature => `
        <label class="filter-chip-label">
            <input type="checkbox" name="feature" value="${feature.name}" style="display:none;" ${currentFilters.features.has(feature.name) ? 'checked' : ''}>
            <span class="filter-chip" style="display: flex; align-items: center; gap: 0.5rem;">
                <i class="${feature.icon}"></i>
                <span>${feature.name}</span>
            </span>
        </label>
    `).join('');
    
    const content = `
        <div id="filter-modal-content" style="max-width: 500px; width: 90%; margin: auto; position: relative; max-height: 90vh; display: flex; flex-direction: column; background: #fff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding: 1.5rem 1.5rem 1rem 1.5rem;">
                <h3 style="margin: 0; font-size: 1.25rem;">Filter Locations</h3>
                <button class="close-modal-btn" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">&times;</button>
            </div>
            <div class="modal-body" style="overflow-y: auto; padding: 1.5rem; flex-grow: 1;">
                <h4 style="margin-top: 0; margin-bottom: 0.75rem;">By Storage Type</h4>
                <div id="category-filter-list" class="filter-chip-container" style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.5rem;">${categoryListHTML}</div>
                <h4 style="margin-top: 1rem; margin-bottom: 0.75rem;">By Features</h4>
                <div id="feature-filter-list" class="filter-chip-container" style="display: flex; flex-wrap: wrap; gap: 0.5rem;">${featureListHTML}</div>
            </div>
            <div class="modal-footer" style="padding: 1rem 1.5rem; border-top: 1px solid #eee; position: sticky; bottom: 0; background: #fff;">
                <button id="apply-filters-btn" class="btn btn-primary btn-full" style="width: 100%; padding: 0.75rem; border: none; background-color: #00BEFC; color: white; border-radius: 9999px; cursor: pointer;">Save</button>
            </div>
        </div>
    `;

    if (!document.getElementById('filter-modal')) {
        const modalContainer = document.createElement('div');
        modalContainer.id = 'filter-modal';
        modalContainer.className = 'modal-backdrop';
        modalContainer.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 9998;
            justify-content: center;
            align-items: center;
        `;
        document.body.appendChild(modalContainer);
    }
    document.getElementById('filter-modal').innerHTML = content;

    document.getElementById('apply-filters-btn').addEventListener('click', () => {
        const selectedCategories = new Set();
        document.querySelectorAll('#category-filter-list input[name="category"]:checked').forEach(checkbox => selectedCategories.add(checkbox.value));
        
        const selectedFeatures = new Set();
        document.querySelectorAll('#feature-filter-list input[name="feature"]:checked').forEach(checkbox => selectedFeatures.add(checkbox.value));

        currentFilters.categories = selectedCategories;
        currentFilters.features = selectedFeatures;

        applyFiltersAndRenderMarkers();
        hideModal('filter-modal');
    });
    
    document.querySelector('#filter-modal .close-modal-btn').addEventListener('click', () => {
        hideModal('filter-modal');
    });
}

const dragStart = (e) => {
    isDragging = true;
    startY = e.pageY || e.touches?.[0].pageY;
    startHeight = parseInt(getComputedStyle(bottomSheet).height, 10);
    bottomSheet.classList.add('is-dragging');
};
const dragging = (e) => {
    if (!isDragging) return;
    const delta = startY - (e.pageY || e.touches?.[0].pageY);
    const newHeight = startHeight + delta;
    bottomSheet.style.height = `${newHeight}px`;
};
const dragStop = () => {
    if (!isDragging) return;
    isDragging = false;
    bottomSheet.classList.remove('is-dragging');
    const sheetHeight = parseInt(bottomSheet.style.height, 10);
    const viewportHeight = window.innerHeight;
    const expandedHeight = viewportHeight * 0.9; 
    const collapsedHeight = viewportHeight * 0.45;
    const halfwayPoint = (expandedHeight + collapsedHeight) / 2;
    if (sheetHeight > halfwayPoint) {
        bottomSheet.style.height = `${expandedHeight}px`;
    } else {
        bottomSheet.style.height = `${collapsedHeight}px`;
    }
};

function attachPageEventListeners() {
    document.getElementById('open-filter-modal-btn')?.addEventListener('click', () => {
        document.getElementById('filter-modal').style.display = 'flex';
    });

    document.getElementById('mapnew-sp-sort-by-tabs')?.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-sort-by]');
        if (tab && tab.dataset.sortBy !== currentFilters.sortBy) {
            currentFilters.sortBy = tab.dataset.sortBy;
            document.querySelectorAll('#mapnew-sp-sort-by-tabs [data-sort-by]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            applyFiltersAndRenderMarkers();
        }
    });
    
    document.getElementById('mapnew-sp-use-my-location-btn')?.addEventListener('click', async () => {
        showLoader(true, 'Detecting location...');
        await getUserLocation();
        showLoader(false);
    });

    bottomSheet = document.querySelector(".bottom-sheet");
    sheetHeader = document.querySelector(".sheet-header");
    sheetHeader.addEventListener("mousedown", dragStart);
    document.addEventListener("mousemove", dragging);
    document.addEventListener("mouseup", dragStop);
    sheetHeader.addEventListener("touchstart", dragStart, { passive: false });
    document.addEventListener("touchmove", dragging, { passive: false });
    document.addEventListener("touchend", dragStop, { passive: false });
}

export default {
    render: async () => `
        <style>
            .page-container {
                position: relative;
                height: calc(100vh - 60px);
                overflow: hidden;
            }
            .map-area { 
                width: 100%; 
                height: 55%; 
            }
            .search-bar { 
                position: absolute; 
                top: 1rem; 
                left: 1rem; 
                right: 1rem; 
                z-index: 10; 
                background: white; 
                border-radius: 0.5rem; 
                box-shadow: 0 2px 8px rgba(0,0,0,0.15); 
                display: flex; 
                align-items: center; 
                padding: 0.5rem; 
            }
            #mapnew-sp-search-input { 
                flex-grow: 1; 
                border: none; 
                outline: none; 
                font-size: 1rem; 
                padding-left: 0.5rem; 
            }
            #mapnew-sp-use-my-location-btn { 
                background: none; 
                border: none; 
                font-size: 1.25rem; 
                color: #00BEFC; 
                cursor: pointer; 
                padding: 0 0.5rem; 
            }
            
            .bottom-sheet { 
                position: absolute; 
                bottom: 0; 
                left: 0; 
                width: 100%; 
                height: 45vh; 
                max-height: 90vh; 
                min-height: 30vh; 
                background-color: white; 
                border-top-left-radius: 1.5rem; 
                border-top-right-radius: 1.5rem; 
                box-shadow: 0 -2px 10px rgba(0,0,0,0.1); 
                display: flex; 
                flex-direction: column; 
                z-index: 20; 
                transition: height 0.3s ease-out; 
            }
            .bottom-sheet.is-dragging { 
                transition: none; 
            }
            .sheet-header { 
                padding: 0.75rem 1rem; 
                cursor: grab; 
                user-select: none; 
                flex-shrink: 0; 
            }
            .drag-indicator { 
                width: 40px; 
                height: 4px; 
                background-color: #D1D5DB; 
                border-radius: 2px; 
                margin: 0 auto 0.75rem; 
            }
            #mapnew-sp-sort-by-tabs { 
                display: flex; 
                gap: 0.5rem;
            }
            #mapnew-sp-sort-by-tabs button { 
                flex-grow: 1;
                background-color: #F3F4F6; 
                color: #4B5563; 
                border: 1px solid #E5E7EB; 
                padding: 0.5rem; 
                border-radius: 0.5rem; 
                font-size: 0.8rem; 
                font-weight: 500; 
                cursor: pointer; 
                transition: all 0.2s; 
            }
            #mapnew-sp-sort-by-tabs button.active { 
                background-color: #00BEFC; 
                color: white; 
                border-color: #00BEFC; 
            }
            .sheet-content-wrapper {
                flex-grow: 1; 
                overflow-y: auto; 
                padding: 0 1rem 1rem; 
            }
            #mapnew-sp-locations-list { 
                display: flex;
                flex-direction: column;
                gap: 1rem; 
            }
            .modal-backdrop {
                animation: fadeIn 0.3s forwards;
            }
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            .filter-chip-container {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem;
            }
            .filter-chip-label {
                cursor: pointer;
            }
            .filter-chip {
                display: block;
                padding: 0.5rem 1rem;
                background-color: #f3f4f6;
                color: #4b5563;
                border: 1px solid #e5e7eb;
                border-radius: 9999px;
                transition: all 0.2s;
                white-space: nowrap;
            }
            .filter-chip-label input:checked + .filter-chip {
                background-color: #00BEFC;
                color: white;
                border-color: #00BEFC;
            }
        </style>

        <div class="page-container">
            <div class="map-area" id="mapnew-sp-map-canvas"></div>
            <div class="search-bar">
                <input type="text" id="mapnew-sp-search-input" placeholder="Search locations..." style="flex-grow: 1; border: none; background: transparent; outline: none; font-size: 0.9rem; padding: 0.75rem 1rem;">
                <button id="mapnew-sp-use-my-location-btn" title="Use My Location" style="background: none; border: none; font-size: 1.1rem; color: #00BEFC; cursor: pointer; padding: 0 0.75rem;"><i class="fas fa-crosshairs"></i></button>
            </div>

            <div class="bottom-sheet">
                <header class="sheet-header">
                    <div class="drag-indicator"></div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                        <div id="mapnew-sp-sort-by-tabs">
                            <button data-sort-by="nearest" class="active">Nearest</button>
                            <button data-sort-by="top_rated">Top Rated</button>
                            <button data-sort-by="cheapest">Cheapest</button>
                        </div>
                        <button id="open-filter-modal-btn" class="btn btn-primary" style="display: flex; align-items: center; gap: 0.5rem; background-color: white; color: #374151; border: 1px solid #E5E7EB; border-radius: 0.5rem; padding: 0.5rem 1rem;"><i class="fas fa-filter"></i> Filter</button>
                    </div>
                </header>
                <div class="sheet-content-wrapper">
                    <div id="mapnew-sp-locations-list"></div>
                </div>
            </div>
        </div>
    `,
    afterRender: async () => {
        if (typeof google === 'object' && typeof google.maps === 'object') {
            if (!mapInitialized) { window.storamaps_initMap(); } 
            else { loadMapDataAndRender(); }
        } else {
            console.warn("Google Maps script not loaded. Retrying...");
            setTimeout(() => { 
                if (typeof google === 'object' && typeof google.maps === 'object' && !mapInitialized) { 
                    window.storamaps_initMap(); 
                }
            }, 1000);
        }
        attachPageEventListeners();
    }
};