import { getStarRatingHTML } from '../ui/components.js';
import { showLoader, showToast } from '../ui/ui-helpers.js';
import { renderLocationDetailModal } from '../ui/modals.js';
import { publicDataCache } from '../main.js';
import { db } from '../firebase-init.js';

/**
 * Renders a filtered list of locations based on the "Self Storage" category.
 */
async function renderSelfStorageLocations() {
    const container = document.getElementById('locations-list');
    if (!container) return;

    showLoader(true, 'Finding Self Storage locations...');

    try {
        // Ensure data is available in the cache, fetching if necessary
        if (!publicDataCache.locations || !publicDataCache.reviews) {
            showToast('Loading initial data...', 'info');
            const snapshot = await db.ref('/').once('value');
            const data = snapshot.val();
            publicDataCache.locations = data.storageLocations || {};
            publicDataCache.reviews = data.reviews || {};
        }

        const locationsMap = publicDataCache.locations || {};
        const allLocations = Object.keys(locationsMap).map(id => ({ id, ...locationsMap[id] }));

        // Filter locations that offer the "Self Storage" category
        const filteredLocations = allLocations.filter(loc =>
            loc.categories && loc.categories.some(cat => cat.name.trim() === 'Self Storage')
        );

        if (filteredLocations.length === 0) {
            container.innerHTML = `<p class="no-locations-message">No locations found for Self Storage.</p>`;
            return;
        }

        container.innerHTML = filteredLocations.map(loc => {
            const reviews = Object.values(publicDataCache.reviews[loc.id] || {});
            const averageRating = reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) : 0;
            const reviewCount = reviews.length;

            return `
                <div class="location-card" data-location-id="${loc.id}">
                    <img src="${loc.imageUrl || 'https://placehold.co/300x150'}" alt="${loc.name}" class="location-card-img">
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

        // Add event listeners after rendering the cards
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
            <div class="category-hero-section self-storage-banner">
                <h1>Self Storage</h1>
                <p>Flexible and secure self-storage solutions for your needs.</p>
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
        renderSelfStorageLocations();
    }
};