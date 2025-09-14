import { getStarRatingHTML } from '../ui/components.js';
import { showLoader, showToast } from '../ui/ui-helpers.js';
import { renderLocationDetailModal } from '../ui/modals.js';
import { publicDataCache } from '../main.js';
import { db } from '../firebase-init.js';

/**
 * Renders a filtered list of locations based on a specific category name.
 * @param {string} categoryName - The name of the category to filter by (e.g., "Luggage Storage").
 */
async function renderFilteredLocations(categoryName) {
    const container = document.getElementById('locations-list');
    if (!container) return;

    showLoader(true, `Finding ${categoryName} locations...`);

    try {
        // Ensure data is available in the cache
        if (!publicDataCache.locations || !publicDataCache.reviews) {
            showToast('Loading initial data...', 'info');
            const snapshot = await db.ref('/').once('value');
            const data = snapshot.val();
            publicDataCache.locations = data.storageLocations || {};
            publicDataCache.reviews = data.reviews || {};
        }

        const locationsMap = publicDataCache.locations || {};
        const allLocations = Object.keys(locationsMap).map(id => ({ id, ...locationsMap[id] }));

        const filteredLocations = allLocations.filter(loc =>
            loc.categories && loc.categories.some(cat => cat.name === categoryName)
        );

        if (filteredLocations.length === 0) {
            container.innerHTML = `<p class="no-locations-message">No locations found for ${categoryName}.</p>`;
            return;
        }

        container.innerHTML = filteredLocations.map(loc => {
            const reviews = Object.values(publicDataCache.reviews[loc.id] || {});
            const averageRating = reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) : 0;
            const reviewCount = reviews.length;

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
                            <div class="star-rating">${getStarRatingHTML(averageRating)} (${reviewCount})</div>
                        </div>
                        <button class="btn btn-primary" data-action="view-details">View Details</button>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('[data-action="view-details"]').forEach(button => {
            button.addEventListener('click', e => {
                const locationId = e.target.closest('.location-card').dataset.locationId;
                const locationData = { id: locationId, ...publicDataCache.locations[locationId] };
                renderLocationDetailModal(locationData, publicDataCache.reviews);
            });
        });

    } catch (error) {
        console.error("Error rendering locations:", error);
        showToast('Could not load location data.', 'error');
        container.innerHTML = `<p class="no-locations-message">An error occurred while loading locations.</p>`;
    } finally {
        showLoader(false);
    }
}

export default {
    render: async () => `
        <div class="content-wrapper">
            <div class="category-hero-section luggage-storage-banner">
                <h1>Luggage Storage</h1>
                <p>Secure and reliable storage for your baggage while you travel.</p>
            </div>
            <div class="locations-container">
                <h3 class="section-title">Available Locations</h3>
                <div id="locations-list" class="grid-view">
                    <div class="location-card-skeleton skeleton"></div>
                    <div class="location-card-skeleton skeleton"></div>
                    <div class="location-card-skeleton skeleton"></div>
                </div>
            </div>
        </div>
    `,
    afterRender: async () => {
        // The data is loaded from the cache; if not present, it will be fetched.
        renderFilteredLocations('Luggage Storage');
    }
};