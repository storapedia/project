import { getStarRatingHTML } from '../ui/components.js';
import { showLoader, showToast } from '../ui/ui-helpers.js';
import { renderLocationDetailModal } from '../ui/modals.js';
import { publicDataCache } from '../main.js';
import { db } from '../firebase-init.js';

async function renderFilteredLocations(categoryName) {
    const container = document.getElementById('locations-list');
    if (!container) return;

    showLoader(true, `Finding ${categoryName} services...`);

    let locationsArray = Object.values(publicDataCache.locations || {}).map((loc, index) => ({
        id: Object.keys(publicDataCache.locations)[index],
        ...loc
    }));

    locationsArray = locationsArray.filter(loc =>
        loc.categories && loc.categories.some(cat => cat.name === categoryName)
    );
    
    if (locationsArray.length === 0) {
        container.innerHTML = `<p class="no-locations-message">No locations found for ${categoryName}.</p>`;
        showLoader(false);
        return;
    }

    container.innerHTML = locationsArray.map(loc => {
        const reviewsForLocation = Object.values(publicDataCache.reviews[loc.id] || {});
        const averageRating = reviewsForLocation.length > 0 ? (reviewsForLocation.reduce((sum, r) => sum + r.rating, 0) / reviewsForLocation.length) : 0;
        const reviewCount = reviewsForLocation.length;

        return `
            <div class="location-card" data-location-id="${loc.id}">
                <img src="${loc.imageUrl || 'https://placehold.co/300x150'}" alt="${loc.name}" class="location-card-img">
                <div class="location-card-content">
                    <div>
                        <h4 class="location-card-title">${loc.name}</h4>
                        <p class="location-card-info">${(loc.address || '').split(',').slice(0, 2).join(', ')}</p>
                        <div class="star-rating">${getStarRatingHTML(averageRating)} (${reviewCount})</div>
                    </div>
                    <button class="btn btn-secondary btn-secondary-custom" data-action="view-detail">View Details</button>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('[data-action="view-detail"]').forEach(button => {
        button.addEventListener('click', e => {
            const locationId = e.target.closest('.location-card').dataset.locationId;
            const locationData = { id: locationId, ...publicDataCache.locations[locationId] };
            renderLocationDetailModal(locationData, publicDataCache.reviews);
        });
    });

    showLoader(false);
}

export default {
    render: async () => `
        <div class="category-hero-section luggage-taxi-banner">
            <h1>Luggage Taxi</h1>
            <p>Antar jemput barang bawaan Anda dari dan ke lokasi tujuan.</p>
        </div>
        <div class="locations-container" id="locations-container">
            <h3 class="section-title">Available Locations</h3>
            <div id="locations-list" class="grid-view">
                <div class="location-card-skeleton skeleton"></div>
                <div class="location-card-skeleton skeleton"></div>
            </div>
        </div>
    `,
    afterRender: async () => {
        if (!publicDataCache.locations) {
            showToast('Loading data, please wait...', 'info');
            const snapshot = await db.ref('/').once('value');
            const data = snapshot.val();
            publicDataCache.locations = data.storageLocations || {};
            publicDataCache.reviews = data.reviews || {};
        }
        renderFilteredLocations('Luggage Taxi');
    }
};