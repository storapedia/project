import { getStarRatingHTML } from '../ui/components.js';
import { debounce, showLoader, showToast } from '../ui/ui-helpers.js';
import { renderLocationDetailModal } from '../ui/modals.js';
import { publicDataCache } from '../main.js';

let map;
let markers = [];
let userMarker = null;
let drawnLines = [];
let allLocationsData = [];
let detailPopup = null;

/**
 * Menghitung jarak antara dua koordinat geografis.
 * @param {object} coords1 - Koordinat pertama {lat, lng}.
 * @param {object} coords2 - Koordinat kedua {latitude, longitude}.
 * @returns {number} Jarak dalam kilometer.
 */
function getDistance(coords1, coords2) {
    if (!coords1 || !coords2) return Infinity;
    const R = 6371; // Radius bumi dalam km
    const dLat = (coords2.latitude - coords1.lat) * Math.PI / 180;
    const dLon = (coords2.longitude - coords1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(coords1.lat * Math.PI / 180) * Math.cos(coords2.latitude * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Menampilkan atau menyembunyikan popup detail lokasi di bagian bawah layar.
 * @param {object|null} locationData - Data lokasi untuk ditampilkan, atau null untuk menyembunyikan.
 */
function toggleDetailPopup(locationData) {
    const parentContainer = document.getElementById('map-page-wrapper') || document.body;
    if (!detailPopup) {
        detailPopup = document.createElement('div');
        detailPopup.id = 'map-detail-popup';
        parentContainer.appendChild(detailPopup);
    }

    // === PERBAIKAN UTAMA ADA DI SINI ===
    Object.assign(detailPopup.style, {
        position: 'fixed', // Diubah menjadi 'fixed' agar selalu relatif terhadap layar
        bottom: '-200px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 2rem)', // Lebar responsif
        maxWidth: '450px',
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 -4px 15px rgba(0,0,0,0.1)',
        padding: '1rem',
        zIndex: '1001', // Dinaikkan agar di atas footer mobile (z-index: 1000)
        transition: 'bottom 0.3s ease-in-out',
        display: 'flex',
        gap: '1rem',
        alignItems: 'center'
    });
    
    if (locationData) {
        const reviews = Object.values(publicDataCache.reviews[locationData.id] || {});
        const avgRating = reviews.length > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length) : 0;
        
        detailPopup.innerHTML = `
            <img src="${locationData.imageUrl || 'https://placehold.co/100x70'}" alt="${locationData.name}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; flex-shrink: 0;">
            <div style="flex-grow: 1; min-width: 0;">
                <h5 style="margin: 0 0 0.25rem; font-size: 1rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${locationData.name}</h5>
                <div style="font-size: 0.8rem; margin-bottom: 0.5rem;">${getStarRatingHTML(avgRating)}</div>
                <button class="btn btn-primary" onclick="window.viewLocationFromMap('${locationData.id}')" style="padding: 0.5rem 1rem; font-size: 0.8rem; border-radius: 50px;">Book Now</button>
            </div>
            <button onclick="document.getElementById('map-detail-popup').style.bottom = '-200px';" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #999; position: absolute; top: 0.5rem; right: 0.5rem; line-height: 1;">&times;</button>
        `;
        
        // Atur posisi 'bottom' berdasarkan ukuran layar
        const isMobile = window.innerWidth < 1024;
        const bottomPosition = isMobile ? 'calc(60px + 1rem)' : '1.5rem'; // 60px adalah tinggi footer
        
        setTimeout(() => detailPopup.style.bottom = bottomPosition, 50);
    } else {
        detailPopup.style.bottom = '-200px';
    }
}

/**
 * Menggambar garis dari lokasi pengguna ke 3 lokasi terdekat.
 * @param {object} userCoords - Koordinat pengguna {lat, lng}.
 */
function drawLinesToNearest(userCoords) {
    drawnLines.forEach(line => line.setMap(null));
    drawnLines = [];

    if (!userCoords) return;

    const sortedLocations = allLocationsData
        .map(loc => ({ ...loc, distance: getDistance(userCoords, loc.geolocation) }))
        .sort((a, b) => a.distance - b.distance);

    sortedLocations.slice(0, 3).forEach(loc => {
        if (loc.geolocation) {
            const line = new google.maps.Polyline({
                path: [userCoords, { lat: loc.geolocation.latitude, lng: loc.geolocation.longitude }],
                geodesic: true,
                strokeColor: '#007AFF',
                strokeOpacity: 0.7,
                strokeWeight: 2.5,
                map: map
            });
            drawnLines.push(line);
        }
    });
}

/**
 * Inisialisasi peta dan semua komponennya.
 */
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
    
    allLocationsData = Object.keys(publicDataCache.locations).map(id => ({ id, ...publicDataCache.locations[id] }));

    setupEventListeners();
    updateListingsAndMarkers();
}

/**
 * Menyiapkan semua event listener untuk interaksi peta.
 */
function setupEventListeners() {
    const searchInput = document.getElementById('map-search-input');
    const findMeBtn = document.getElementById('find-me-btn');

    if (searchInput) {
        const autocomplete = new google.maps.places.Autocomplete(searchInput);
        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry) {
                map.panTo(place.geometry.location);
                map.setZoom(15);
            }
        });
    }

    if (findMeBtn) {
        findMeBtn.addEventListener('click', () => {
            if (navigator.geolocation) {
                showLoader(true, "Finding your location...");
                navigator.geolocation.getCurrentPosition(pos => {
                    showLoader(false);
                    const userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    map.setCenter(userCoords);
                    map.setZoom(14);

                    if (userMarker) userMarker.setMap(null);

                    userMarker = new google.maps.Marker({
                        position: userCoords,
                        map: map,
                        title: "Your Location",
                        animation: google.maps.Animation.BOUNCE,
                    });
                    
                    drawLinesToNearest(userCoords);
                }, () => {
                    showLoader(false);
                    showToast("Could not get your location.", "error");
                });
            }
        });
    }
    
    map.addListener('idle', debounce(updateListingsAndMarkers, 300));
    map.addListener('click', () => toggleDetailPopup(null));
}

/**
 * Memperbarui penanda di peta berdasarkan area yang terlihat.
 */
function updateListingsAndMarkers() {
    if (!map || !map.getBounds()) return;

    const bounds = map.getBounds();
    markers.forEach(marker => marker.setMap(null));
    markers = [];
    
    allLocationsData.forEach(loc => {
        const position = loc.geolocation ? { lat: loc.geolocation.latitude, lng: loc.geolocation.longitude } : null;
        if (!position || !bounds.contains(position)) return;
        
        const marker = new google.maps.Marker({
            position,
            map: map,
            title: loc.name,
            icon: {
                url: '/assets/img/maps.png',
                scaledSize: new google.maps.Size(32, 32),
            }
        });
        
        marker.addListener('click', (e) => {
            e.domEvent.stopPropagation(); // Mencegah event 'click' peta saat marker diklik
            toggleDetailPopup(loc);
            map.panTo(marker.getPosition());
        });
        markers.push(marker);
    });
}

// Fungsi global untuk membuka modal dari peta
window.viewLocationFromMap = (locationId) => {
    const locationData = allLocationsData.find(loc => loc.id === locationId);
    if (locationData) renderLocationDetailModal(locationData, publicDataCache.reviews);
};

// Objek utama untuk halaman Peta
const Map = {
    render: async () => `
        <div id="map-page-wrapper" style="display: flex; height: 100vh; width: 100%; position: absolute; top: 0; left: 0; font-family: 'Montserrat', sans-serif;">
            <div id="map-container" style="flex-grow: 1; height: 100%; position: relative; overflow: hidden;"></div>
            <div class="map-controls" style="position: absolute; top: 1rem; left: 1rem; right: 1rem; z-index: 10; display: flex; gap: 0.5rem; max-width: 500px; margin: auto;">
                <input type="text" id="map-search-input" placeholder="Search address or place..." style="flex-grow: 1; border: none; border-radius: 50px; padding: 12px 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-size: 1rem;">
                <button id="find-me-btn" title="My Location" style="flex-shrink: 0; width: 48px; height: 48px; border-radius: 50%; border: none; background: white; cursor: pointer; font-size: 1.2rem; color: #555; box-shadow: 0 2px 8px rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-crosshairs"></i>
                </button>
            </div>
        </div>
        <style>
            .pac-container { z-index: 9999 !important; }
            #map-detail-popup .btn {
                display: inline-flex; align-items: center; justify-content: center;
                padding: 0.5rem 1rem; border-radius: 9999px; font-size: 0.8rem;
                font-weight: 600; cursor: pointer; border: 1px solid transparent;
                text-decoration: none; user-select: none;
                background-color: #00BEFC; color: white;
            }
            #map-detail-popup .btn:hover { background-color: #00A9E0; }
        </style>
    `,
    afterRender: async () => {
        if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
            showToast("Loading Google Maps, please wait...", "info");
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