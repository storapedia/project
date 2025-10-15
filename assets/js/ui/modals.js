// assets/js/ui/modals.js
import { getStarRatingHTML } from './components.js';
import { showModal, hideModal, showToast, showLoader, debounce } from './ui-helpers.js';
import { getCurrentUser } from '../services/auth.js';
import { db } from '../firebase-init.js';
import { createIpaymuInvoice } from '../services/payment-handler.js';
import { createNewBooking, fetchUserData, requestPickup, updateBookingStatus, submitReview } from '../services/firebase-api.js';
import { publicDataCache } from '../main.js';

let bookingState = {};
let globalCart = {};
let mapInstance = null;
let mapMarker = null;

async function getRatesForBookingItem(locationId, categoryName) {
    const locationData = publicDataCache.locations[locationId];
    if (!locationData || !locationData.categories) {
        return [];
    }
    const matchingCategory = locationData.categories.find(cat => cat.name === categoryName);
    if (!matchingCategory || !matchingCategory.sizes) {
        return [];
    }
    // Mengambil semua rate dari semua ukuran dalam satu kategori
    const allRates = matchingCategory.sizes.flatMap(size => size.rates).filter(Boolean);
    
    // Menghilangkan duplikasi rate berdasarkan durasi
    const uniqueRates = Array.from(new Set(allRates.map(r => r.duration)))
        .map(duration => allRates.find(r => r.duration === duration));
    return uniqueRates;
}

const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
};

const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString('en-US', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
    });
};

async function getCheapestPrice(locationData) {
    if (!locationData.categories || locationData.categories.length === 0) {
        return Infinity;
    }
    const allRates = locationData.categories.flatMap(category =>
        (category.sizes || []).flatMap(size =>
            size.rates || []
        )
    );
    if (allRates.length === 0) {
        return Infinity;
    }
    const cheapestRate = allRates.reduce((min, rate) => {
        if (rate && typeof rate.price === 'number') {
            return Math.min(min, rate.price);
        }
        return min;
    }, Infinity);
    return cheapestRate;
}

const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c) / 1000;
};

async function calculateServiceFee(geolocation, settings) {
    if (!geolocation?.latitude || !settings?.pricing) return { fee: 0, distance: 0 };
    const firstLocationId = Object.keys(bookingState.locationsToBook)[0];
    const locationData = bookingState.locationsToBook[firstLocationId].locationData;
    const { latitude: storeLat, longitude: storeLng } = locationData.geolocation;
    const { latitude: serviceLat, longitude: serviceLng } = geolocation;
    const distanceKm = getDistance(serviceLat, serviceLng, storeLat, storeLng);
    const fee = settings.pricing.kmFee > 0 ? distanceKm * settings.pricing.kmFee : (settings.pricing.pickupFee || 0);
    return { fee, distance: distanceKm };
}

async function calculateBookingTotals() {
    let subTotal = 0;
    let totalItems = 0;
    let suppliesTotal = 0;
    bookingState.pickupFee = 0;
    bookingState.deliveryFee = 0;
    bookingState.pickupDistance = 0;
    bookingState.deliveryDistance = 0;

    for (const loc of Object.values(bookingState.locationsToBook)) {
        if (loc.items && loc.items.length > 0 && bookingState.duration) {
             for (const item of loc.items) {
                const rates = await getRatesForBookingItem(loc.locationData.id, item.category.name);
                const timeDiff = bookingState.endDate - bookingState.startDate;
                const totalDays = Math.max(1, Math.ceil(timeDiff / (1000 * 3600 * 24)));
                let itemPrice = 0;
                if (rates && rates.length > 0) {
                    if (bookingState.duration.toLowerCase().trim() === 'daily') {
                        const dailyRate = rates.find(r => r.duration.toLowerCase().trim() === 'daily');
                        if (dailyRate) itemPrice = item.quantity * dailyRate.price * totalDays;
                    } else {
                        const rate = rates.find(r => r.duration && r.duration.trim() === bookingState.duration.trim());
                        if (rate) itemPrice = item.quantity * rate.price;
                    }
                }
                subTotal += itemPrice;
                totalItems += item.quantity;
            }
        }
       
        if (loc.supplies && loc.supplies.length > 0) {
            suppliesTotal += loc.supplies.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        }
    }

    const settingsSnapshot = await db.ref('settings').once('value');
    const settings = settingsSnapshot.val();
    if (bookingState.serviceType === 'pickup' && bookingState.pickupGeolocation) {
        const pickupResult = await calculateServiceFee(bookingState.pickupGeolocation, settings);
        bookingState.pickupFee = pickupResult.fee;
        bookingState.pickupDistance = pickupResult.distance;
    }
    if (bookingState.needsDelivery && bookingState.deliveryGeolocation) {
        const deliveryResult = await calculateServiceFee(bookingState.deliveryGeolocation, settings);
        bookingState.deliveryFee = deliveryResult.fee;
        bookingState.deliveryDistance = deliveryResult.distance;
    }
    const totalServiceFee = (bookingState.pickupFee || 0) + (bookingState.deliveryFee || 0);
    const priceBeforeDiscount = subTotal + suppliesTotal + totalServiceFee;
    let discountAmount = 0;
    if (bookingState.voucher?.discount_percent > 0) {
        discountAmount = priceBeforeDiscount * (bookingState.voucher.discount_percent / 100);
    }
    const finalPrice = priceBeforeDiscount - discountAmount;
    bookingState.subTotal = subTotal;
    bookingState.suppliesTotal = suppliesTotal;
    bookingState.totalPrice = finalPrice;
    bookingState.totalItems = totalItems;
    return { subTotal, suppliesTotal, pickupFee: bookingState.pickupFee, deliveryFee: bookingState.deliveryFee, discountAmount, finalPrice, totalItems };
}

async function getConvertedPrice(amountInUSD) {
    const apiKey = 'cdb0e64314935946403b2da4';
    try {
        const response = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        const exchangeRate = data.conversion_rates.IDR;
        const totalIDR = amountInUSD * exchangeRate;
        return Math.round(totalIDR);
    } catch (error) {
        console.error('Currency conversion failed for payment:', error);
        throw new Error('Could not get currency conversion rate for payment.');
    }
}

async function convertCurrencyAndUpdateUI(totalUSD, priceSummaryId) {
    const idrPriceElement = document.getElementById(priceSummaryId);
    const statusElement = document.getElementById('currency-conversion-status');
    if (!idrPriceElement || !statusElement) return;
    const apiKey = 'cdb0e64314935946403b2da4';
    statusElement.innerHTML = `<div class="mini-loader"></div> Converting USD to IDR...`;
    idrPriceElement.textContent = '';
    try {
        const response = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        const exchangeRate = data.conversion_rates.IDR;
        const totalIDR = totalUSD * exchangeRate;
        idrPriceElement.textContent = `Approx. Rp ${totalIDR.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        statusElement.textContent = `Using rate: 1 USD = Rp ${exchangeRate.toLocaleString('id-ID')}`;
    } catch (error) {
        console.error('Currency conversion failed:', error);
        statusElement.textContent = 'Could not fetch exchange rate.';
        idrPriceElement.textContent = '';
    }
}

function getPriceDetailsHTML(totals) {
    let html = `<div class="sp-price-details">Subtotal (Storage): $${totals.subTotal.toFixed(2)}</div>`;
    if (totals.suppliesTotal > 0) {
        html += `<div class="sp-price-details">Subtotal (Supplies): $${totals.suppliesTotal.toFixed(2)}</div>`;
    }
    if (totals.pickupFee > 0) {
        html += `<div class="sp-price-details">Pickup Fee: $${totals.pickupFee.toFixed(2)}</div>`;
    }
    if (totals.deliveryFee > 0) {
        html += `<div class="sp-price-details">Delivery Fee: $${totals.deliveryFee.toFixed(2)}</div>`;
    }
    if (totals.discountAmount > 0) {
        const originalPrice = totals.finalPrice + totals.discountAmount;
        html += `
            <div class="sp-price-details sp-original-price-strikethrough">Original: <s>$${originalPrice.toFixed(2)}</s></div>
            <div class="sp-price-details sp-discount-text">Discount: -$${totals.discountAmount.toFixed(2)}</div>
        `;
    }
    html += `<div id="total-price-summary" class="sp-total-price">Total: $${totals.finalPrice.toFixed(2)}</div>`;
    html += `<div id="total-price-summary-idr" class="sp-total-price-idr text-left text-sm font-semibold text-gray-700"></div>`;
    html += `<div id="currency-conversion-status" class="text-xs text-gray-500 mt-0-5 mb-1"></div>`;
    return html;
}

function getServiceStepHTML() {
    const isPickup = bookingState.serviceType === 'pickup';
    return `
    <style>
        .highlight-blink { animation: blinker 1s linear infinite; }
        @keyframes blinker { 50% { opacity: 0; } }
    </style>
    <div class="sp-bookings-flow-header">
        <h3 class="modal-title">1. Choose Service</h3>
        <button class="close-modal-btn">&times;</button>
    </div>
    <div class="sp-bookings-flow-body">
        <p class="text-sm mb-1">How would you like to handle your items?</p>
        <div class="service-buttons-container" style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem;">
            <button type="button" data-service="self-dropoff" class="btn ${!isPickup ? 'btn-primary' : 'btn-secondary'} btn-full">Self Drop-off</button>
            <button type="button" data-service="pickup" class="btn ${isPickup ? 'btn-primary' : 'btn-secondary'} btn-full">Pickup Service</button>
        </div>
        <div id="sp-pickup-service-options" style="display: ${isPickup ? 'block' : 'none'};">
            <div class="sp-confirmation-summary mt-1">
                <h4 class="mt-0 mb-1">Pickup Details</h4>
                <p class="no-margin text-sm text-gray-700"><b>Address:</b> ${bookingState.pickupAddress || 'Not set'}</p>
                <p class="no-margin text-sm text-gray-700"><b>Phone:</b> ${bookingState.contactNumber || 'Not set'}</p>
                <button data-address-type="pickup" class="btn btn-primary btn-sm mt-1">${bookingState.pickupAddress ? 'Edit Details' : 'Set Pickup Details'}</button>
                <div class="sp-bookings-flow-input-group mt-1">
                    <label for="pickup-time-input">Pickup Time</label>
                    <input type="time" id="pickup-time-input" class="sp-input-field" value="${bookingState.pickupTime || ''}" max="17:00">
                </div>
            </div>
            <div class="sp-bookings-flow-input-group mt-1">
                <label class="sp-checkbox-label ${bookingState.needsDelivery ? 'highlight-blink' : ''}">
                    <input type="checkbox" id="needs-delivery-checkbox" ${bookingState.needsDelivery ? 'checked' : ''}>
                    <span class="font-bold">Need delivery service after storage?</span>
                </label>
            </div>
            <div id="sp-delivery-details-section" class="sp-confirmation-summary mt-1" style="display: ${bookingState.needsDelivery ? 'block' : 'none'};">
                <h4 class="mt-0 mb-1">Delivery Details</h4>
                <p class="no-margin text-sm text-gray-700"><b>Address:</b> ${bookingState.deliveryAddress || 'Not set'}</p>
                <p class="no-margin text-sm text-gray-700"><b>Phone:</b> ${bookingState.deliveryContactNumber || 'Not set'}</p>
                <button data-address-type="delivery" class="btn btn-primary btn-sm mt-1">${bookingState.deliveryAddress ? 'Edit Details' : 'Set Delivery Details'}</button>
                <div class="sp-bookings-flow-input-group mt-1">
                    <label for="delivery-time-input">Delivery Time</label>
                    <input type="time" id="delivery-time-input" class="sp-input-field" value="${bookingState.deliveryTime || ''}" max="17:00">
                </div>
            </div>
        </div>
        <div id="validation-message" class="text-sm text-danger-500 text-center mt-1"></div>
    </div>
    <div class="sp-bookings-flow-footer">
        <button id="next-step-btn" class="btn btn-primary btn-full" disabled>Next</button>
    </div>
    `;
}

async function getDurationStepHTML() {
    const firstLocationId = Object.keys(bookingState.locationsToBook)[0];
    if (!bookingState.locationsToBook[firstLocationId] || !bookingState.locationsToBook[firstLocationId].items || bookingState.locationsToBook[firstLocationId].items.length === 0) {
        showToast("Error: No storage item selected.", "error");
        bookingState.currentView = 'category-detail'; 
        return await renderCategoryDetailPopupContent(bookingState.selectedCategory, bookingState.selectedLocation);
    }
    const firstItem = bookingState.locationsToBook[firstLocationId].items[0];

    const sharedRates = await getRatesForBookingItem(firstLocationId, firstItem.category.name);
    const startDate = new Date(bookingState.startDate);
    const isDaily = bookingState.duration && bookingState.duration.toLowerCase().trim() === 'daily';
    const endDateHTML = isDaily
        ? `<input type="date" id="end-date" class="sp-input-field" value="${new Date(bookingState.endDate).toISOString().split('T')[0]}">`
        : `<span class="text-primary-500 font-bold">${formatDateTime(bookingState.endDate)}</span>`;
    
    const products = Object.keys(publicDataCache.shopProducts || {}).map(id => ({ id, ...publicDataCache.shopProducts[id] }));
    const suppliesSliderHTML = products.length > 0 ? `
        <div class="sp-bookings-flow-input-group" style="margin-top: 1.5rem; border-top: 1px solid #E5E7EB; padding-top: 1.5rem;">
            <label>Add Supplies & Extras</label>
            <div class="sp-category-slider">
                ${products.map(p => {
                    const imageUrl = p.imageUrl ? `/.netlify/functions/get-photo?key=${encodeURIComponent(p.imageUrl.split('key=')[1] || p.imageUrl)}` : 'https://placehold.co/100x100/e2e8f0/64748b?text=Item';
                    return `
                    <div class="sp-category-card" style="flex: 0 0 180px;">
                        <div class="sp-category-card-content" style="padding: 0.5rem; flex-direction: column; align-items: center;">
                            <img src="${imageUrl}" alt="${p.name}" class="sp-category-image" style="width: 80px; height: 80px; margin-right: 0;">
                            <div class="sp-category-text text-center mt-1">
                                <h5 class="sp-category-title text-sm">${p.name}</h5>
                                <p class="font-bold text-primary-500 text-sm">$${p.price.toFixed(2)}</p>
                            </div>
                        </div>
                        <div class="sp-category-footer" style="padding: 0.5rem;">
                            <button class="btn btn-primary btn-full btn-sm" data-action="add-supply" data-product-id="${p.id}">Add</button>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
    ` : '';

    return `
    <div class="sp-bookings-flow-header">
        <button class="back-step-btn">&larr;</button>
        <h3 class="modal-title">2. Select Duration & Date</h3>
        <button class="close-modal-btn">&times;</button>
    </div>
    <div class="sp-bookings-flow-body">
        <div class="sp-bookings-flow-input-group">
            <label>Duration</label>
            <div class="sp-duration-options">
                ${sharedRates.map(rate => `
                <button type="button" class="sp-duration-btn ${bookingState.duration === rate.duration ? 'active' : ''}" data-duration="${rate.duration}">
                    <span>${rate.duration}</span><br><span class="text-sm text-gray-600">$${rate.price.toFixed(2)}</span>
                </button>
                `).join('')}
            </div>
        </div>
        <div class="sp-bookings-flow-input-group">
            <label>Start Date & Time</label>
            <div class="flex-container">
                <input type="date" id="start-date" class="sp-input-field" value="${startDate.toISOString().split('T')[0]}">
                <input type="time" id="start-time" class="sp-input-field" value="${startDate.toTimeString().slice(0, 5)}">
            </div>
        </div>
        <div class="sp-bookings-flow-input-group">
            <label>End Date & Time</label>
            <div class="sp-readonly-field">
                <div id="end-date-container">${endDateHTML}</div>
                <p class="no-margin text-sm text-gray-600 mt-0-5" id="duration-info-text"></p>
            </div>
        </div>
        ${suppliesSliderHTML}
    </div>
    <div class="sp-bookings-flow-footer">
        <div id="price-summary-container" style="display: none;"></div>
        <button id="next-step-btn" class="btn btn-primary btn-full" disabled>Next</button>
    </div>
    `;
}

function getConfirmationStepHTML(user) {
    const summary = bookingState;
    const itemsSummary = Object.values(summary.locationsToBook).flatMap(loc =>
        (loc.items || []).map(item => `
            <div class="sp-summary-item-card">
                <div>
                    <p class="font-semibold">${item.size.name} (${item.quantity}x)</p>
                    <p class="text-sm text-gray-600">at ${loc.locationData.name}</p>
                    ${bookingState.duration ? `<p class="mt-0-5 text-sm text-primary-500 font-bold">${bookingState.duration}</p>` : ''}
                </div>
                <div class="sp-quantity-selector">
                    <button class="btn-quantity" data-action="decrease-quantity" data-item-type="storage" data-location-id="${loc.locationData.id}" data-category-name="${item.category.name}" data-size-name="${item.size.name}">-</button>
                    <span class="quantity-display">${item.quantity}</span>
                    <button class="btn-quantity" data-action="increase-quantity" data-item-type="storage" data-location-id="${loc.locationData.id}" data-category-name="${item.category.name}" data-size-name="${item.size.name}">+</button>
                </div>
            </div>
        `)
    ).join('');

    const suppliesSummary = Object.values(summary.locationsToBook).flatMap(loc =>
        (loc.supplies || []).map(supply => `
            <div class="sp-summary-item-card">
                <div>
                    <p class="font-semibold">${supply.name} (${supply.quantity}x)</p>
                    <p class="text-sm text-gray-600">Supply Item</p>
                </div>
                <div class="sp-quantity-selector">
                    <button class="btn-quantity" data-action="decrease-quantity" data-item-type="supply" data-location-id="${loc.locationData.id}" data-product-id="${supply.id}">-</button>
                    <span class="quantity-display">${supply.quantity}</span>
                    <button class="btn-quantity" data-action="increase-quantity" data-item-type="supply" data-location-id="${loc.locationData.id}" data-product-id="${supply.id}">+</button>
                </div>
            </div>
        `)
    ).join('');

    let serviceSummaryHTML = `<p class="no-margin"><b>Service:</b> ${summary.serviceType === 'pickup' ? 'Pickup Service' : 'Self Drop-off'}</p>`;
    if (summary.serviceType === 'pickup') {
        serviceSummaryHTML += `<p class="no-margin"><b>Pickup Address:</b> ${summary.pickupAddress || 'Not set'}</p>`;
        serviceSummaryHTML += `<p class="no-margin"><b>Pickup Phone:</b> ${summary.contactNumber || 'Not set'}</p>`;
        serviceSummaryHTML += `<p class="no-margin"><b>Pickup Time:</b> ${summary.pickupTime || 'Not set'}</p>`;
    }
    if (summary.needsDelivery) {
        serviceSummaryHTML += `<p class="no-margin mt-1 font-semibold">Delivery Service requested.</p>`;
        serviceSummaryHTML += `<p class="no-margin"><b>Delivery Address:</b> ${summary.deliveryAddress || 'Not set'}</p>`;
        serviceSummaryHTML += `<p class="no-margin"><b>Delivery Phone:</b> ${summary.deliveryContactNumber || 'Not set'}</p>`;
        serviceSummaryHTML += `<p class="no-margin"><b>Delivery Time:</b> ${summary.deliveryTime || 'Not set'}</p>`;
    }
    return `
    <div class="sp-bookings-flow-header">
        <button class="back-step-btn">&larr;</button>
        <h3 class="modal-title">3. Confirmation & Payment</h3>
        <button class="close-modal-btn">&times;</button>
    </div>
    <div class="sp-bookings-flow-body text-sm overflow-y-auto">
        <h4 class="mt-0 mb-1">Booking Summary</h4>
        <div class="sp-summary-section">
            <div id="sp-editable-summary-list">
                ${itemsSummary}
                ${suppliesSummary}
            </div>
            <p class="no-margin"><b>From:</b> ${formatDateTime(summary.startDate)}</p>
            <p class="no-margin"><b>To:</b> ${formatDateTime(summary.endDate)}</p>
        </div>
        <div class="sp-confirmation-summary mt-1">
            ${serviceSummaryHTML}
        </div>
        <div class="sp-bookings-flow-input-group mt-1">
            <label>Voucher Code</label>
            <div class="flex-container">
                <input type="text" id="voucher-code-input" class="sp-input-field" placeholder="Enter voucher code" value="${bookingState.voucher?.code || ''}">
                <button type="button" id="apply-voucher-btn" class="btn btn-primary">Apply</button>
            </div>
            <div id="voucher-message" class="text-sm mt-0-5"></div>
        </div>
        <div class="sp-bookings-flow-input-group mt-1">
            <label>Notes (Optional)</label>
            <textarea id="booking-notes" class="sp-input-field" placeholder="Add any special instructions...">${bookingState.notes || ''}</textarea>
        </div>
        <div id="price-summary-container" class="sp-total-price-container"></div>
        ${user ? `
        <h4 class="mt-1-5 mb-1">Payment Method</h4>
        <div class="sp-payment-options">
            <label class="sp-payment-option"><input type="radio" name="paymentMethod" value="on_site" ${bookingState.paymentMethod === 'on_site' ? 'checked' : ''}><span>Pay On-Site</span></label>
            <label class="sp-payment-option"><input type="radio" name="paymentMethod" value="online" ${bookingState.paymentMethod === 'online' ? 'checked' : ''}><span>Pay Online (iPaymu)</span></label>
        </div>` : ''}
    </div>
    <div class="sp-bookings-flow-footer">
        <div id="booking-total-summary"></div>
        ${user ? '<button id="confirm-book-btn" class="btn btn-success btn-full">Confirm & Book</button>' : '<button id="login-to-book-btn" class="btn btn-primary btn-full">Login to Complete Booking</button>'}
    </div>
    `;
}

function getAddressModalHTML(addressType, currentAddress, currentPhone) {
    const isPickup = addressType === 'pickup';
    return `
    <div class="sp-bookings-flow-header">
        <button class="back-step-btn">&larr;</button>
        <h3 class="modal-title">Set ${isPickup ? 'Pickup' : 'Delivery'} Details</h3>
    </div>
    <div class="sp-bookings-flow-body">
        <div class="sp-bookings-flow-input-group">
            <label for="sp-address-input">${isPickup ? 'Pickup' : 'Delivery'} Address</label>
            <input type="text" id="sp-address-input" class="sp-input-field" placeholder="Start typing your address..." value="${currentAddress || ''}">
        </div>
        <div class="sp-bookings-flow-input-group mt-1">
            <label>Contact Phone Number</label>
            <input type="tel" id="sp-phone-input" class="sp-input-field" value="${currentPhone || ''}" placeholder="e.g., 08123456789">
        </div>
        <div id="sp-address-map" class="sp-map-container" style="height: 200px; width: 100%; background-color: #e0e0e0; margin-top: 1rem; border-radius: 12px;"></div>
        <button id="use-my-location-btn" class="btn btn-secondary btn-full" style="margin-top: 1rem;">Use My Current Location</button>
    </div>
    <div class="sp-bookings-flow-footer">
        <button id="sp-confirm-address-btn" class="btn btn-primary btn-full" disabled>Confirm Details</button>
    </div>
    `;
}

async function getReviewModalHTML(booking) {
    return `
    <div class="modal-header">
        <h3>Write a Review for ${booking.locationName}</h3>
        <button class="close-modal-btn">&times;</button>
    </div>
    <div class="modal-body">
        <h4>Your Rating</h4>
        <div class="rating-input">
            ${[...Array(5)].map((_, i) => `<span data-rating="${i + 1}" class="star">&#9733;</span>`).join('')}
        </div>
        <input type="hidden" id="review-rating" value="0">
        <h4>Your Review</h4>
        <textarea id="review-comment" class="sp-input-field" rows="5" placeholder="Share details of your own experience at this place..."></textarea>
    </div>
    <div class="modal-footer">
        <button id="submit-review-btn" class="btn btn-primary btn-full">Submit Review</button>
    </div>
    `;
}

async function getExtendBookingModalHTML(booking) {
    const rates = await getRatesForBookingItem(booking.locationId, booking.category);
    const dailyRate = rates.find(r => r.duration.toLowerCase() === 'daily')?.price || 0;
    const originalEndDate = booking.endDate ? new Date(booking.endDate) : new Date(Date.now());
    const minEndDate = new Date(originalEndDate);
    minEndDate.setDate(minEndDate.getDate() + 1);
    const minEndDateString = minEndDate.toISOString().split('T')[0];
    const calculatePrice = (newDate) => {
        const diffTime = newDate.getTime() - originalEndDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const totalExtensionPrice = diffDays * dailyRate * (booking.quantity || 1);
        return booking.totalPrice + totalExtensionPrice;
    };
    let newTotalPrice = calculatePrice(minEndDate);

    return `
    <div class="modal-header">
        <h3>Extend Booking for ${booking.storageType}</h3>
        <button class="close-modal-btn">&times;</button>
    </div>
    <div class="modal-body">
        <p><strong>Original End Date:</strong> ${formatDate(booking.endDate)}</p>
        <div class="sp-bookings-flow-input-group mt-1">
            <label for="new-end-date-input">New End Date:</label>
            <input type="date" id="new-end-date-input" class="sp-input-field" value="${minEndDateString}" min="${minEndDateString}">
        </div>
        <p class="mt-1"><strong>New Total Price:</strong> <span id="new-total-price-usd">$${newTotalPrice.toFixed(2)}</span></p>
        <p class="mt-0-5 text-sm font-semibold text-gray-700" id="new-total-price-idr"></p>
        <p class="text-xs text-gray-500 mt-0-5 mb-1" id="currency-conversion-status"></p>
    </div>
    <div class="modal-footer">
        <button id="confirm-extend-btn" class="btn btn-primary btn-full">Confirm Extension</button>
    </div>
    `;
}

function getPayToCheckInModalHTML(booking) {
    const paymentOptionStyle = "display: block; border: 1px solid #ddd; padding: 12px 15px; border-radius: 8px; cursor: pointer;";

    return `
    <div class="booking-details-modal-header">
        <h3 class="modal-title">Pay to Check In</h3>
        <button type="button" class="close-modal-btn">&times;</button>
    </div>
    <div class="booking-details-modal-body booking-pay-body">
        <h4>Booking Details</h4>
        <p><strong>Booking ID:</strong> ${booking.id}</p>
        <p><strong>Location:</strong> ${booking.locationName}</p>
        <p><strong>Storage Type:</strong> ${booking.storageType}</p>
        <p><strong>Total Amount Due:</strong> $${booking.totalPrice.toFixed(2)}</p>
        
        <h4 class="mt-1-5">Choose Payment Method</h4>
        
        <div class="payment-options" style="display: flex; flex-direction: column; gap: 12px;">
            <label class="payment-option" style="${paymentOptionStyle}">
                <input type="radio" name="payMethodCheckIn" value="online" checked>
                Online Payment (iPaymu)
            </label>
            <label class="payment-option" style="${paymentOptionStyle}">
                <input type="radio" name="payMethodCheckIn" value="cod_on_site">
                Cash On Site (COD)
            </label>
        </div>

        <div class="booking-detail-actions" style="margin-top: 24px;">
            <button 
                class="btn btn-primary" 
                id="confirm-pay-checkin-btn" 
                style="width: 100%; padding: 12px 0; font-size: 16px; text-align: center;">
                <i class="fas fa-check-circle"></i> Pay Now
            </button>
        </div>
    </div>
    `;
}

async function renderMainModal(view, data) {
    let mainModalContainer = document.getElementById('main-app-modal');
    if (!mainModalContainer) {
        mainModalContainer = document.createElement('div');
        mainModalContainer.id = 'main-app-modal';
        mainModalContainer.className = 'modal-overlay';
        document.body.appendChild(mainModalContainer);
        mainModalContainer.addEventListener('click', handleMainModalClick);
    }
    
    let content = '';
    showLoader(true);
    mainModalContainer.innerHTML = '';
    
    try {
        switch (view) {
            case 'location-detail':
                content = await renderLocationDetailModalContent(data);
                break;
            case 'category-detail':
                content = await renderCategoryDetailPopupContent(data.category, data.locationData);
                break;
            case 'booking-flow-step-1':
                content = getServiceStepHTML();
                break;
            case 'booking-flow-step-2':
                content = await getDurationStepHTML();
                break;
            case 'booking-flow-step-3':
                const user = getCurrentUser();
                content = getConfirmationStepHTML(user);
                break;
            case 'review-modal':
                content = await getReviewModalHTML(data.booking);
                break;
            case 'extend-booking':
                content = await getExtendBookingModalHTML(data.booking);
                break;
            case 'pay-checkin':
                content = getPayToCheckInModalHTML(data.booking);
                break;
            default:
                hideModal('main-app-modal');
                return;
        }
        mainModalContainer.innerHTML = `<div class="modal-content">${content}</div>`;
        
        setTimeout(() => {
            mainModalContainer.classList.add('active');
        }, 10);

        showLoader(false);
        addDynamicEventListeners(view);
    } catch (error) {
        console.error('Error rendering modal view:', error);
        showToast('Failed to load content.', 'error');
        hideModal('main-app-modal');
        showLoader(false);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    let mainModalContainer = document.getElementById('main-app-modal');
    if (!mainModalContainer) {
        mainModalContainer = document.createElement('div');
        mainModalContainer.id = 'main-app-modal';
        mainModalContainer.className = 'modal-overlay';
        document.body.appendChild(mainModalContainer);
        mainModalContainer.addEventListener('click', handleMainModalClick);
    }
});

function handleMainModalClick(e) {
    const target = e.target;
    if (target.classList.contains('modal-overlay') || target.closest('.close-modal-btn')) {
        hideModal('main-app-modal');
        bookingState = {};
        globalCart = {};
    } else if (target.closest('.back-step-btn')) {
        handleBackStep();
    } else if (target.closest('#next-step-btn')) {
        handleNextStep(target.closest('#next-step-btn'));
    } else if (target.closest('#login-to-book-btn')) {
        sessionStorage.setItem('pendingBooking', JSON.stringify(bookingState));
        hideModal('main-app-modal');
        window.location.hash = '#/auth';
    } else if (target.closest('#confirm-book-btn')) {
        handleConfirmBooking();
    } else if (target.closest('button[data-service]')) {
        handleServiceTypeChange(target.closest('button[data-service]'));
    } else if (target.closest('[data-address-type]')) {
        renderAddressView(target.closest('[data-address-type]').dataset.addressType);
    } else if (target.closest('.sp-duration-btn')) {
        handleDurationChange(target.closest('.sp-duration-btn'));
    } else if (target.closest('#apply-voucher-btn')) {
        handleApplyVoucher();
    } else if (target.closest('[data-action="increase-quantity"]') || target.closest('[data-action="decrease-quantity"]')) {
        handleQuantityChange(e);
    } else if (target.closest('[data-action="view-category-detail"]')) {
        handleViewCategoryDetail(target.closest('[data-action="view-category-detail"]'));
    } else if (target.closest('[data-action="add-supply"]')) {
        handleAddSupply(target.closest('[data-action="add-supply"]'));
    }
}

async function handleBackStep() {
    if (bookingState.currentView === 'category-detail') {
        bookingState.currentView = 'location-detail';
        await renderMainModal('location-detail', {
            locationData: bookingState.selectedLocation,
            reviews: publicDataCache.reviews
        });
    } else if (bookingState.currentView === 'booking-flow-step-2') {
        bookingState.currentView = 'booking-flow-step-1';
        await renderMainModal('booking-flow-step-1');
    } else if (bookingState.currentView === 'booking-flow-step-3') {
        bookingState.currentView = 'booking-flow-step-2';
        await renderMainModal('booking-flow-step-2');
    } else if (bookingState.currentView === 'address-modal') {
        bookingState.currentView = 'booking-flow-step-1';
        await renderMainModal('booking-flow-step-1');
    }
}

async function handleNextStep(btn) {
    if (btn.disabled) return;
    if (bookingState.currentView === 'category-detail') {
        handleCategorySelectionConfirm(true);
    } else if (bookingState.currentView === 'booking-flow-step-1') {
        bookingState.currentView = 'booking-flow-step-2';
        await renderMainModal(bookingState.currentView);
    } else if (bookingState.currentView === 'booking-flow-step-2') {
        bookingState.currentView = 'booking-flow-step-3';
        await renderMainModal(bookingState.currentView);
    }
}

function handleServiceTypeChange(btn) {
    const mainModalContainer = document.getElementById('main-app-modal');
    const pickupOptions = mainModalContainer.querySelector('#sp-pickup-service-options');
    mainModalContainer.querySelectorAll('.service-buttons-container .btn').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
    });
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-secondary');

    bookingState.serviceType = btn.dataset.service;
    if (pickupOptions) pickupOptions.style.display = bookingState.serviceType === 'pickup' ? 'block' : 'none';
    if (bookingState.serviceType !== 'pickup') {
        bookingState.needsDelivery = false;
        const deliveryCheckbox = mainModalContainer.querySelector('#needs-delivery-checkbox');
        if (deliveryCheckbox) deliveryCheckbox.checked = false;
        const deliverySection = mainModalContainer.querySelector('#sp-delivery-details-section');
        if (deliverySection) deliverySection.style.display = 'none';
    }
    updateAndValidateServiceStep();
}

function handleDurationChange(btn) {
    const mainModalContainer = document.getElementById('main-app-modal');
    mainModalContainer.querySelectorAll('.sp-duration-options .sp-duration-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    bookingState.duration = btn.dataset.duration;
    addDurationStepLogic();
}

async function handleApplyVoucher() {
    const mainModalContainer = document.getElementById('main-app-modal');
    const code = mainModalContainer.querySelector('#voucher-code-input').value.trim().toUpperCase();
    const messageEl = mainModalContainer.querySelector('#voucher-message');
    if (!code) {
        messageEl.textContent = 'Please enter a code.';
        messageEl.className = 'text-sm mt-0-5 text-warning-500';
        return;
    }
    try {
        const voucherSnapshot = await db.ref(`vouchers/${code}`).once('value');
        if (voucherSnapshot.exists() && voucherSnapshot.val().active) {
            bookingState.voucher = voucherSnapshot.val();
            messageEl.textContent = `Success! ${bookingState.voucher.discount_percent}% discount applied.`;
            messageEl.className = 'text-sm mt-0-5 text-success-500';
        } else {
            bookingState.voucher = null;
            messageEl.textContent = 'Invalid or expired voucher code.';
            messageEl.className = 'text-sm mt-0-5 text-danger-500';
        }
    } catch (error) {
        messageEl.textContent = 'Could not verify voucher.';
        messageEl.className = 'text-sm mt-0-5 text-danger-500';
    }
    updateBookingSummary();
}

function handleQuantityChange(e) {
    const button = e.target.closest('button');
    if (!button) return;

    const itemType = button.dataset.itemType;
    const locationId = button.dataset.locationId;
    const isIncrease = button.dataset.action === 'increase-quantity';
    
    const cartLocation = globalCart[locationId];
    if (!cartLocation) return;

    if (itemType === 'storage') {
        const sizeName = button.dataset.sizeName;
        const item = cartLocation.items.find(i => i.size.name === sizeName);
        if (item) {
            if (isIncrease) {
                item.quantity++;
            } else if (item.quantity > 1) {
                item.quantity--;
            } else { 
                cartLocation.items = cartLocation.items.filter(i => i.size.name !== sizeName);
            }
        }
    } else if (itemType === 'supply') {
        const productId = button.dataset.productId;
        const supply = cartLocation.supplies.find(s => s.id === productId);
        if (supply) {
            if (isIncrease) {
                supply.quantity++;
            } else if (supply.quantity > 1) {
                supply.quantity--;
            } else { 
                cartLocation.supplies = cartLocation.supplies.filter(s => s.id !== productId);
            }
        }
    }

    if (cartLocation.items.length === 0 && (!cartLocation.supplies || cartLocation.supplies.length === 0)) {
        delete globalCart[locationId];
    }
    
    updateBookingSummary();
}

function handleViewCategoryDetail(btn) {
    const categoryIndex = btn.dataset.categoryIndex;
    const locationData = bookingState.locationsToBook[Object.keys(bookingState.locationsToBook)[0]].locationData;
    const category = locationData.categories[categoryIndex];
    if (category) {
        bookingState.currentView = 'category-detail';
        bookingState.selectedCategory = category;
        renderMainModal('category-detail', { category, locationData });
    }
}

function handleCategorySelectionConfirm(proceedToNextStep = false) {
    const locationId = bookingState.selectedLocation.id;
    const category = bookingState.selectedCategory;
    const quantities = {};
    const mainModalContainer = document.getElementById('main-app-modal');
    mainModalContainer.querySelectorAll('.quantity-display').forEach(el => {
        const sizeName = el.dataset.sizeName;
        quantities[sizeName] = parseInt(el.textContent, 10);
    });

    if (!globalCart[locationId]) {
        globalCart[locationId] = { locationData: bookingState.selectedLocation, items: [], supplies: [] };
    }
    
    globalCart[locationId].items = globalCart[locationId].items.filter(item => item.category.name !== category.name);

    Object.keys(quantities).forEach(sizeName => {
        const quantity = quantities[sizeName];
        if (quantity > 0) {
            const size = category.sizes.find(s => s.name === sizeName);
            if (size) {
                 globalCart[locationId].items.push({ category, size, quantity });
            }
        }
    });

    if (globalCart[locationId].items.length === 0 && (!globalCart[locationId].supplies || globalCart[locationId].supplies.length === 0)) {
        delete globalCart[locationId];
        if(proceedToNextStep) {
            showToast("Please select at least one item to continue.", "warning");
            return; 
        }
    }

    if (proceedToNextStep) {
        renderBookingFlowModal();
    } else {
        bookingState.currentView = 'location-detail';
        renderMainModal('location-detail', {
            locationData: bookingState.selectedLocation,
            reviews: publicDataCache.reviews
        });
    }
}

async function handleConfirmBooking() {
    const user = getCurrentUser();
    if (!user) { showToast('You must be logged in to book.', 'error'); return; }
    if (Object.keys(bookingState.locationsToBook).length === 0 || !bookingState.duration || !bookingState.startDate || !bookingState.endDate) {
        showToast("Booking details are incomplete. Please go back and fill them in.", "error");
        return;
    }
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value;
    if (!paymentMethod) { showToast("Please select a payment method.", "error"); return; }
    if (bookingState.serviceType === 'pickup') {
        if (!bookingState.pickupAddress || !bookingState.contactNumber || !bookingState.pickupTime) {
            showToast("Please provide complete pickup details (address, phone, time).", "error"); return;
        }
    }
    if (bookingState.needsDelivery) {
        if (!bookingState.deliveryAddress || !bookingState.deliveryContactNumber || !bookingState.deliveryTime) {
            showToast("Please provide complete delivery details (address, phone, time).", "error"); return;
        }
    }
    bookingState.notes = document.getElementById('booking-notes')?.value.trim() || '';
    showLoader(true, 'Creating your booking...');
    try {
        const userData = await fetchUserData(user.uid);
        const totals = await calculateBookingTotals();
        const orderId = db.ref('bookings').push().key;
        const bookingsToCreate = [];
        let totalBookingBasePrice = 0;
        let totalItemsInBooking = 0;
        for (const loc of Object.values(bookingState.locationsToBook)) {
            for (const item of loc.items) {
                const rates = await getRatesForBookingItem(loc.locationData.id, item.category.name);
                const timeDiff = bookingState.endDate - bookingState.startDate;
                const totalDays = Math.max(1, Math.ceil(timeDiff / (1000 * 3600 * 24)));
                let itemBasePrice = 0;
                if (rates && rates.length > 0) {
                    if (bookingState.duration.toLowerCase() === 'daily') {
                        const rate = rates.find(r => r.duration.toLowerCase() === 'daily');
                        if (rate) itemBasePrice = rate.price * totalDays;
                    } else {
                        const rate = rates.find(r => r.duration === bookingState.duration);
                        if (rate) itemBasePrice = rate.price;
                    }
                }
                totalBookingBasePrice += itemBasePrice * item.quantity;
                totalItemsInBooking += item.quantity;
            }
        }
        for (const loc of Object.values(bookingState.locationsToBook)) {
            const suppliesForBooking = (loc.supplies && loc.supplies.length > 0) ? loc.supplies : null;

            for (const item of loc.items) {
                const rates = await getRatesForBookingItem(loc.locationData.id, item.category.name);
                const timeDiff = bookingState.endDate - bookingState.startDate;
                const totalDays = Math.max(1, Math.ceil(timeDiff / (1000 * 3600 * 24)));
                let itemBasePrice = 0;
                let unitPrice = 0;
                if (rates && rates.length > 0) {
                    if (bookingState.duration.toLowerCase() === 'daily') {
                        const rate = rates.find(r => r.duration.toLowerCase() === 'daily');
                        if (rate) {
                            itemBasePrice = rate.price * totalDays;
                            unitPrice = rate.price;
                        }
                    } else {
                        const rate = rates.find(r => r.duration === bookingState.duration);
                        if (rate) {
                            itemBasePrice = rate.price;
                            unitPrice = rate.price;
                        }
                    }
                }
                const itemSubtotal = itemBasePrice * item.quantity;
                const proportion = totalBookingBasePrice > 0 ? itemSubtotal / totalBookingBasePrice : 1 / totalItemsInBooking;
                const itemPickupFee = (totals.pickupFee || 0) * proportion;
                const itemDeliveryFee = (totals.deliveryFee || 0) * proportion;
                const itemDiscount = (totals.discountAmount || 0) * proportion;
                const finalItemPrice = itemSubtotal + itemPickupFee + itemDeliveryFee - itemDiscount;
                const newBookingData = {
                    orderId, userId: user.uid, locationId: loc.locationData.id, locationName: loc.locationData.name,
                    category: item.category.name, storageType: item.size.name, quantity: item.quantity,
                    duration: bookingState.duration,
                    unitPrice: unitPrice,
                    totalPrice: finalItemPrice,
                    subtotal: itemSubtotal,
                    startDate: bookingState.startDate,
                    endDate: bookingState.endDate,
                    serviceType: bookingState.serviceType, paymentMethod,
                    paymentStatus: paymentMethod === 'online' ? 'pending' : 'unpaid_on_site',
                    bookingStatus: 'active', notes: bookingState.notes,
                    needsDelivery: bookingState.needsDelivery || false,
                };

                if (suppliesForBooking) {
                    newBookingData.supplies = suppliesForBooking;
                }

                if (bookingState.voucher) {
                    newBookingData.voucherCode = bookingState.voucher.code;
                    newBookingData.discountApplied = bookingState.voucher.discount_percent;
                }
                if (bookingState.serviceType === 'pickup') {
                    newBookingData.pickupAddress = bookingState.pickupAddress;
                    newBookingData.pickupGeolocation = bookingState.pickupGeolocation;
                    newBookingData.contactNumber = bookingState.contactNumber;
                    newBookingData.pickupFee = itemPickupFee;
                    newBookingData.pickupDistance = bookingState.pickupDistance;
                    newBookingData.pickupTime = bookingState.pickupTime;
                    newBookingData.pickupStatus = 'requested';
                }
                if (bookingState.needsDelivery) {
                    newBookingData.deliveryAddress = bookingState.deliveryAddress;
                    newBookingData.deliveryGeolocation = bookingState.deliveryGeolocation;
                    newBookingData.deliveryContactNumber = bookingState.deliveryContactNumber;
                    newBookingData.deliveryFee = itemDeliveryFee;
                    newBookingData.deliveryDistance = bookingState.deliveryDistance;
                    newBookingData.deliveryTime = bookingState.deliveryTime;
                    newBookingData.deliveryStatus = 'requested';
                }
                bookingsToCreate.push(newBookingData);
            }
        }
        const creationPromises = bookingsToCreate.map(b => createNewBooking(b));
        const createdBookings = await Promise.all(creationPromises);
        const pickupBookings = createdBookings.filter(b => b.serviceType === 'pickup');
        for (const booking of pickupBookings) {
            await requestPickup(booking.locationId, booking);
        }
        globalCart = {};
        if (paymentMethod === 'online') {
            showLoader(true, 'Converting currency for payment...');
            try {
                const amountInIDR = await getConvertedPrice(totals.finalPrice);
                const finalAmount = parseInt(amountInIDR, 10);
                showLoader(true, 'Redirecting to payment gateway...');
                const selectedItems = await Promise.all(Object.values(bookingState.locationsToBook).flatMap(loc =>
                    loc.items.map(async item => {
                        const rates = await getRatesForBookingItem(loc.locationData.id, item.category.name);
                        const rate = rates.find(r => r.duration === bookingState.duration);
                        return {
                            name: item.size.name,
                            quantity: item.quantity,
                            price: rate?.price || 0
                        };
                    })
                ));
                const paymentData = {
                    orderId: orderId,
                    totalPrice: finalAmount,
                    name: userData?.name || 'Customer',
                    email: userData?.email || 'customer@example.com',
                    phone: bookingState.contactNumber || 'N/A',
                    selectedSpaces: selectedItems
                };
                await createIpaymuInvoice(paymentData);
            } catch (conversionError) {
                showLoader(false);
                showToast(conversionError.message, 'error');
            }
        } else {
            showLoader(false);
            showToast('Booking created successfully!', 'success');
            hideModal('main-app-modal');
            bookingState = {};
            window.location.hash = '#/bookings';
        }
    } catch (error) {
        showLoader(false);
        showToast('Failed to create booking. Please try again.', 'error');
        console.error("Booking creation error:", error);
    }
}

async function renderAddressView(addressType) {
    const isPickup = addressType === 'pickup';
    const currentAddress = isPickup ? bookingState.pickupAddress : bookingState.deliveryAddress;
    const currentPhone = isPickup ? bookingState.contactNumber : bookingState.deliveryContactNumber;
    bookingState.addressType = addressType;
    bookingState.currentView = 'address-modal';
    const content = getAddressModalHTML(addressType, currentAddress, currentPhone);
    const mainModalContainer = document.getElementById('main-app-modal');
    mainModalContainer.querySelector('.modal-content').innerHTML = content;
    addAddressModalLogic(addressType);
}

function addAddressModalLogic(addressType) {
    const modal = document.getElementById('main-app-modal');
    if (!modal) return;

    if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
        showToast("Google Maps script not loaded. Check API key.", "error");
        return;
    }

    const confirmBtn = modal.querySelector('#sp-confirm-address-btn');
    const phoneInput = modal.querySelector('#sp-phone-input');
    const useMyLocationBtn = modal.querySelector('#use-my-location-btn');
    const addressInput = modal.querySelector('#sp-address-input');
    const mapDiv = modal.querySelector('#sp-address-map');

    let tempGeolocation = null;
    let mapInstance, mapMarker;

    const validateInput = () => {
        const isValid = addressInput.value.trim() && phoneInput.value.trim() && tempGeolocation;
        if (confirmBtn) {
            confirmBtn.disabled = !isValid;
            confirmBtn.style.opacity = isValid ? '1' : '0.5';
        }
    };

    const updateMapAndMarker = (lat, lng, address) => {
        const position = { lat, lng };
        tempGeolocation = { latitude: lat, longitude: lng };
        
        if (address) {
            addressInput.value = address;
        }

        if (!mapInstance) {
            mapInstance = new google.maps.Map(mapDiv, {
                center: position,
                zoom: 17,
                disableDefaultUI: true,
                zoomControl: true,
            });
            mapMarker = new google.maps.Marker({
                position,
                map: mapInstance,
                draggable: true,
            });
            
            mapMarker.addListener('dragend', () => {
                const newPosition = mapMarker.getPosition();
                const geocoder = new google.maps.Geocoder();
                geocoder.geocode({ location: newPosition }, (results, status) => {
                    if (status === 'OK' && results[0]) {
                        updateMapAndMarker(newPosition.lat(), newPosition.lng(), results[0].formatted_address);
                    }
                });
            });
        } else {
            mapInstance.setCenter(position);
            mapMarker.setPosition(position);
        }
        validateInput();
    };
    
    setTimeout(() => {
        const firstLocationId = Object.keys(bookingState.locationsToBook)[0];
        const locationData = bookingState.locationsToBook[firstLocationId].locationData;
        let initialLat, initialLng;

        if (addressType === 'pickup' && bookingState.pickupGeolocation) {
            initialLat = bookingState.pickupGeolocation.latitude;
            initialLng = bookingState.pickupGeolocation.longitude;
        } else if (addressType === 'delivery' && bookingState.deliveryGeolocation) {
            initialLat = bookingState.deliveryGeolocation.latitude;
            initialLng = bookingState.deliveryGeolocation.longitude;
        } else {
            initialLat = locationData.geolocation.latitude;
            initialLng = locationData.geolocation.longitude;
        }
        
        updateMapAndMarker(initialLat, initialLng);

        const autocomplete = new google.maps.places.Autocomplete(addressInput, {
            fields: ["formatted_address", "geometry", "name"],
            types: ['geocode', 'establishment'],
            componentRestrictions: { 'country': 'id' }
        });

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry && place.geometry.location) {
                const lat = place.geometry.location.lat();
                const lng = place.geometry.location.lng();
                updateMapAndMarker(lat, lng, place.formatted_address);
            }
        });

        phoneInput.addEventListener('input', validateInput);
        addressInput.addEventListener('input', () => {
            tempGeolocation = null; 
            validateInput();
        });

        useMyLocationBtn.addEventListener('click', () => {
            if (navigator.geolocation) {
                showLoader(true, "Finding your location...");
                navigator.geolocation.getCurrentPosition(position => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    const geocoder = new google.maps.Geocoder();
                    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                        showLoader(false);
                        if (status === 'OK' && results[0]) {
                            updateMapAndMarker(lat, lng, results[0].formatted_address);
                        } else {
                            showToast('Could not find address for your location.', 'error');
                        }
                    });
                }, () => {
                    showLoader(false);
                    showToast("Could not get your location.", "error");
                });
            }
        });

        confirmBtn.addEventListener('click', () => {
            if (addressType === 'pickup') {
                bookingState.pickupAddress = addressInput.value;
                bookingState.contactNumber = phoneInput.value;
                bookingState.pickupGeolocation = tempGeolocation;
            } else {
                bookingState.deliveryAddress = addressInput.value;
                bookingState.deliveryContactNumber = phoneInput.value;
                bookingState.deliveryGeolocation = tempGeolocation;
            }
            bookingState.currentView = 'booking-flow-step-1';
            renderMainModal('booking-flow-step-1');
        });

        validateInput();
    }, 150);
}

export async function renderInvoiceViewer(booking) {
    showLoader(true, 'Generating invoice...');
    try {
        const user = getCurrentUser();
        const userData = user ? await fetchUserData(user.uid) : null;
        const invoiceHtml = generateInvoiceHtml(booking, userData);
        const newWindow = window.open();
        if (newWindow) {
            newWindow.document.write(invoiceHtml);
            newWindow.document.title = `Invoice-SP-${booking.id.slice(-8)}`;
            newWindow.document.close();
        } else {
            showToast('Please allow pop-ups to view the invoice.', 'warning');
        }
    } catch (error) {
        console.error('Error generating invoice:', error);
        showToast('Failed to generate invoice.', 'error');
    } finally {
        showLoader(false);
    }
}

export function generateInvoiceHtml(booking, userData) {
    const invoiceNumber = `SP-${booking.id.slice(-8).toUpperCase()}`;
    const logoHtml = `<h1 style="color:#1D4ED8;font-size:2em;margin:0 0 5px">Storapedia</h1>`;
    const finalSubtotal = (booking.subtotal || 0);
    return `
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Invoice ${invoiceNumber}</title>
    <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;background-color:#F8FAFC;}.invoice-container{max-width:800px;margin:2rem auto;background-color:#fff;padding:2.5rem;border-radius:1rem;box-shadow:0 10px 15px -3px rgba(0,0,0,.08);border:1px solid #e2e8f0}.invoice-header{display:flex;justify-content:space-between;align-items:center;padding-bottom:1.5rem;border-bottom:2px solid #DBEAFE}.logo{max-width:160px}.company-info{text-align:right;font-size:.9em}.company-info h1{color:#1D4ED8;font-size:2em;margin:0 0 5px}.company-info p{margin:0;color:#64748B}.details-section{display:flex;justify-content:space-between;margin:2rem 0}.details-section div{flex-basis:48%}.details-section h2{font-size:1.3em;color:#1E293B;margin-bottom:1rem;border-bottom:1px solid #E2E8F0;padding-bottom:.5rem}.details-section p{margin:5px 0;font-size:.95em}.invoice-table{width:100%;border-collapse:collapse;margin-bottom:2rem}.invoice-table th,.invoice-table td{padding:12px 15px;text-align:left;border-bottom:1px solid #e2e8f0}.invoice-table th{background-color:#3B82F6;color:#fff;font-weight:600;text-transform:uppercase;font-size:.85em}.invoice-table tr:nth-child(even){background-color:#F8FAFC}.totals-section{display:flex;justify-content:flex-end;margin-bottom:2rem}.totals-table{width:40%}.totals-table td{padding:8px;text-align:right}.totals-table tr.total-due td{font-weight:700;font-size:1.3em;color:#1D4ED8;border-top:2px solid #3B82F6}.payment-info{padding:1.5rem;background-color:#EFF6FF;border-radius:.75rem;border:1px solid #DBEAFE}.footer{text-align:center;margin-top:3rem;padding-top:1.5rem;border-top:1px dashed #CBD5E1;font-size:.85em;color:#64748B}@media print{body{background-color:#fff}.invoice-container{box-shadow:none;border:none;margin:0;padding:0}}</style></head>
        <body><div class="invoice-container"><div class="invoice-header">${logoHtml}<div class="company-info"><h1>INVOICE</h1><p>Storapedia Inc.</p><p>Bali, Indonesia</p></div></div>
        <div class="details-section"><div><h2>BILL TO</h2><p><strong>${userData?.name || 'Customer'}</strong></p><p>${userData?.email || 'N/A'}</p><p>${booking.serviceType === 'pickup' ? booking.pickupAddress || '' : ''}</p></div><div><h2>DETAILS</h2><p><strong>Invoice No:</strong> ${invoiceNumber}</p><p><strong>Date:</strong> ${new Date().toLocaleDateString('en-GB')}</p><p><strong>Due Date:</strong> ${new Date(booking.endDate).toLocaleDateString('en-GB')}</p></div></div>
        <table class="invoice-table"><thead><tr><th>Description</th><th>Quantity</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>
        <tr>
            <td>${booking.storageType} at ${booking.locationName}</td>
            <td>${booking.quantity}</td>
            <td>$${(booking.unitPrice || 0).toFixed(2)}</td>
            <td>$${(booking.subtotal || 0).toFixed(2)}</td>
        </tr>
        ${booking.pickupFee > 0 ? `<tr><td colspan="3">Pickup Fee</td><td>$${booking.pickupFee.toFixed(2)}</td></tr>` : ''}
        ${booking.deliveryFee > 0 ? `<tr><td colspan="3">Delivery Fee</td><td>$${booking.deliveryFee.toFixed(2)}</td></tr>` : ''}
        ${booking.discountApplied ? `<tr><td colspan="3" style="color:green;">Discount (${booking.voucherCode})</td><td style="color:green;">-$${((finalSubtotal + (booking.pickupFee||0) + (booking.deliveryFee||0) - booking.totalPrice) || 0).toFixed(2)}</td></tr>` : ''}
        </tbody></table><div class="totals-section"><table class="totals-table"><tbody><tr class="total-due"><td style="text-align:left;">TOTAL DUE</td><td>$${(booking.totalPrice || 0).toFixed(2)}</td></tr></tbody></table></div>
        <div class="payment-info"><h3>Payment Information</h3><p><strong>Method:</strong> ${booking.paymentMethod.replace(/_/g, ' ').toUpperCase()}</p><p><strong>Status:</strong> ${booking.paymentStatus.replace(/_/g, ' ').toUpperCase()}</p></div>
        <div class="footer"><p>Thank you for choosing Storapedia!</p></div></body></html>
        `;
    }
    
    export async function renderReviewModal(booking) {
        bookingState.currentBooking = booking;
        await renderMainModal('review-modal', { booking });
    }
    
    export async function renderAddInventoryModal(booking) {
        showToast("Inventory management is not yet implemented.", "info");
    }
    
    export async function renderExtendBookingModal(booking) {
        showLoader(true, 'Fetching data for extension...');
        bookingState.currentBooking = booking;
        const rates = await getRatesForBookingItem(booking.locationId, booking.category);
        const dailyRate = rates.find(r => r.duration.toLowerCase() === 'daily')?.price || 0;
        if (dailyRate === 0) {
            showToast('Daily rate not found to calculate extension price.', 'error');
            showLoader(false);
            return;
        }
        showLoader(false);
        await renderMainModal('extend-booking', { booking });
    }
    
    export async function renderPayToCheckInModal(booking) {
        bookingState.currentBooking = booking;
        await renderMainModal('pay-checkin', { booking });
    }
    
    export async function renderLocationDetailModal(locationData, reviews) {
        bookingState = {
            currentView: 'location-detail',
            locationsToBook: {
                [locationData.id]: { locationData: locationData, items: [], supplies: [] }
            },
            reviews: reviews,
            selectedLocation: locationData
        };
        globalCart = {};
        await renderMainModal('location-detail', { locationData, reviews });
    }
    
    export async function renderBookingFlowModal(restoredState = null) {
        if (restoredState) {
            bookingState = { ...restoredState, locationsToBook: globalCart };
        } else if (Object.keys(globalCart).length > 0) {
            const startDate = new Date();
            startDate.setHours(startDate.getHours() + 1, 0, 0, 0);
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
            bookingState = {
                currentView: 'booking-flow-step-1',
                startDate: startDate.getTime(),
                endDate: endDate.getTime(),
                duration: null,
                totalPrice: 0,
                totalItems: 0,
                locationsToBook: globalCart,
                paymentMethod: 'on_site',
                serviceType: 'self-dropoff',
                needsDelivery: false,
                notes: ''
            };
        } else {
            showToast('Please select a storage unit to book.', 'error');
            return;
        }
        await renderMainModal(bookingState.currentView);
    }
    
    async function renderLocationDetailModalContent(data) {
        const { locationData, reviews } = data;
        const reviewsForLocation = reviews?.[locationData.id] ? Object.values(reviews[locationData.id]) : [];
        const avgRating = reviewsForLocation.length > 0 ? (reviewsForLocation.reduce((sum, r) => sum + r.rating, 0) / reviewsForLocation.length) : 0;
        const cheapestPrice = await getCheapestPrice(locationData);
        
        const imageUrl = locationData.imageUrl 
            ? `${window.location.origin}/.netlify/functions/get-photo?key=${encodeURIComponent(locationData.imageUrl.split('key=')[1] || locationData.imageUrl.split('/').pop())}` 
            : 'https://placehold.co/300x200';
            
        const shortDescription = locationData.description?.length > 200 
            ? locationData.description.substring(0, 200) + '...' 
            : locationData.description;
        const isDescriptionLong = locationData.description?.length > 200;
    
        const footerHTML = `<div class="sp-start-price">Mulai dari <strong class="text-xl text-dark-secondary">$${cheapestPrice !== Infinity ? cheapestPrice.toFixed(2) : 'N/A'}</strong></div>`;
        
        const tabsHtml = `
            <div class="tabs-container">
                <div class="tab-buttons flex border-b border-gray-200">
                    <button type="button" class="tab-button px-4 py-2 text-sm font-medium text-center text-gray-500 border-b-2 border-primary-500 active-tab" data-tab-name="details">Detail</button>
                    <button type="button" class="tab-button px-4 py-2 text-sm font-medium text-center text-gray-500 border-b-2 border-transparent hover:border-gray-300" data-tab-name="reviews">Reviews</button>
                    <button type="button" class="tab-button px-4 py-2 text-sm font-medium text-center text-gray-500 border-b-2 border-transparent hover:border-gray-300" data-tab-name="hours">Hours</button>
                </div>
                
                <div id="tab-content-container" class="mt-4">
                    <div id="details" class="tab-content active">
                        <div class="location-detail-card">
                            <p class="location-detail-address">${locationData.address || ''}</p>
                            <div id="location-description" class="location-detail-description">
                                ${shortDescription || ''}
                                ${isDescriptionLong ? `<button id="see-more-btn" class="text-blue-500 hover:underline">See More</button>` : ''}
                            </div>
                        </div>
                        <h4 class="mt-1-5 mb-0-75">Features</h4>
                        <div class="location-features-list">
                            ${(locationData.features || []).map(f => `<span class="feature-tag"><i class="${f?.icon || ''}"></i><span>${f?.name || ''}</span></span>`).join('')}
                        </div>
                        <div id="available-storage-section">
                            <h4 class="mt-1-5 mb-0-75">Available Storage</h4>
                            ${renderCategorySlider(locationData.categories)}
                        </div>
                    </div>
    
                    <div id="reviews" class="tab-content hidden">
                         <div class="location-detail-card p-0-5">
                             <div class="flex items-center justify-center p-2 mb-2 bg-gray-100 rounded-lg">
                                <span class="text-3xl font-bold text-primary-500 mr-2">${avgRating.toFixed(1)}</span>
                                <div class="text-yellow-400 text-xl">${getStarRatingHTML(avgRating)}</div>
                                <span class="text-gray-500 text-sm ml-2">(${reviewsForLocation.length} reviews)</span>
                             </div>
                             ${reviewsForLocation.length > 0 ? reviewsForLocation.map(r => `
                                 <div class="review-item border-b border-gray-100 last:border-b-0 p-2">
                                     <div class="review-header flex justify-between items-center">
                                         <h5 class="font-semibold text-sm">${r.name || 'Anonymous'}</h5>
                                         <div class="star-rating text-xs">${getStarRatingHTML(r.rating)}</div>
                                     </div>
                                     <p class="review-comment text-xs text-gray-600 mt-1">${r.comment || 'No comment.'}</p>
                                 </div>`).join('') : '<p class="text-center text-gray-500 p-1">No reviews yet.</p>'}
                         </div>
                    </div>
    
                    <div id="hours" class="tab-content hidden">
                        <h4 class="mt-0 mb-0-75">Opening Hours</h4>
                        <div class="location-detail-card">${renderSchedules(locationData.openingHours)}</div>
                    </div>
                </div>
            </div>
        `;
    
        return `
        <style>
            .tabs-container .tab-buttons button.active-tab {
                color: var(--primary-500);
                border-color: var(--primary-500);
                font-weight: 600;
            }
            .tabs-container .tab-content { display: none; }
            .tabs-container .tab-content.active { display: block; }
            #location-description.expanded { max-height: none; }
            .location-features-list { padding: 1rem; }
        </style>
        <div class="modal-header">
            <h3 class="modal-title">${locationData.name || ''}</h3>
            <button class="close-modal-btn">&times;</button>
        </div>
        <div class="modal-body bg-neutral-50 overflow-y-auto">
            <div class="location-detail-image" style="background-image: url('${imageUrl}');"></div>
            ${tabsHtml}
        </div>
        <div class="modal-footer sticky-footer">
            ${footerHTML}
            <button class="btn btn-primary" id="book-now-btn">Book Now</button>
        </div>
        `;
    }
    
    async function renderCategoryDetailPopupContent(category, locationData) {
        const sizesWithRates = (category.sizes || []).map(size => {
            const rates = size.rates || [];
            return { ...size, rates };
        });
    
        return `
        <div class="modal-header">
            <button class="back-step-btn">&larr;</button>
            <h3 class="modal-title">${category.name || ''}</h3>
            <button class="close-modal-btn">&times;</button>
        </div>
        <div class="modal-body">
            <p class="text-gray-600">${category.description || ''}</p>
            <h4 class="mt-1-5 border-top-1 pt-1">Select Size</h4>
            ${sizesWithRates.map(size => {
                const currentQty = (globalCart[locationData.id]?.items || []).find(item => item.size?.name === size?.name)?.quantity || 0;
                const sizeDescription = size?.description || '';
                const sizeImageUrl = size?.imageUrl 
                    ? `${window.location.origin}/.netlify/functions/get-photo?key=${encodeURIComponent(size.imageUrl.split('key=')[1] || size.imageUrl.split('/').pop())}`
                    : 'https://placehold.co/100x100?text=No+Image';
    
                return `
                <div class="sp-size-detail-item">
                    <div class="flex-shrink-0 mr-3">
                        <img src="${sizeImageUrl}" alt="${size?.name || 'Storage Size'}" class="w-24 h-24 object-cover rounded-lg">
                    </div>
                    <div class="sp-size-details flex-grow">
                        <h6 class="sp-size-title">${size?.name || ''}</h6>
                        ${sizeDescription ? `<div class="sp-size-description text-xs text-gray-600 mb-1">${sizeDescription}</div>` : ''}
                        <span class="sp-size-capacity ${size?.capacity > 0 ? 'available' : 'full'}">
                            ${size?.capacity > 0 ? `${size.capacity} Available` : 'Fully Booked'}
                        </span>
                        ${size?.rates && size.rates.length > 0 ? `<div class="sp-size-rates text-xs text-gray-700 mt-1">
                            ${size.rates.map(rate => `<span>${rate.duration || ''}: <b>$${(rate.price || 0).toFixed(2)}</b></span>`).join(' • ')}
                        </div>` : ''}
                    </div>
                    <div class="sp-quantity-selector flex-shrink-0">
                        <button class="btn-quantity" data-action="decrease-quantity" data-size-name="${size?.name || ''}">-</button>
                        <span class="quantity-display" data-size-name="${size?.name || ''}">${currentQty}</span>
                        <button class="btn-quantity" data-action="increase-quantity" data-size-name="${size?.name || ''}" ${size?.capacity > 0 ? '' : 'disabled'}>+</button>
                    </div>
                </div>
                `;
            }).join('')}
        </div>
        <div class="modal-footer sticky-footer">
            <button id="next-step-btn" class="btn btn-primary btn-full">Next</button>
        </div>
        `;
    }
    
    function addDynamicEventListeners(view) {
        switch(view) {
            case 'location-detail':
                addDetailModalListeners(bookingState.locationsToBook[Object.keys(bookingState.locationsToBook)[0]]?.locationData);
                break;
            case 'category-detail':
                addCategoryDetailListeners(bookingState.selectedCategory, bookingState.selectedLocation);
                break;
            case 'booking-flow-step-1':
                addServiceStepLogic();
                break;
            case 'booking-flow-step-2':
                addDurationStepLogic();
                break;
            case 'booking-flow-step-3':
                addConfirmationStepLogic();
                break;
            case 'address-modal':
                break;
            case 'pay-checkin':
                addPayCheckinListeners();
                break;
            case 'extend-booking':
                addExtendBookingListeners();
                break;
        }
    }
    
    async function addExtendBookingListeners() {
        const mainModalContainer = document.getElementById('main-app-modal');
        if (!mainModalContainer) return;
    
        const booking = bookingState.currentBooking;
        const confirmBtn = mainModalContainer.querySelector('#confirm-extend-btn');
        const newEndDateInput = mainModalContainer.querySelector('#new-end-date-input');
        const newPriceUsdSpan = mainModalContainer.querySelector('#new-total-price-usd');
        const newPriceIdrSpan = mainModalContainer.querySelector('#new-total-price-idr');
    
        const rates = await getRatesForBookingItem(booking.locationId, booking.category);
        const dailyRate = rates.find(r => r.duration.toLowerCase() === 'daily')?.price || 0;
    
        const updatePrice = () => {
            const originalEndDate = new Date(booking.endDate);
            const newEndDate = new Date(newEndDateInput.value);
            if (newEndDate <= originalEndDate) {
                newEndDate.setDate(originalEndDate.getDate() + 1);
                newEndDateInput.value = newEndDate.toISOString().split('T')[0];
            }
    
            const diffTime = newEndDate.getTime() - originalEndDate.getTime();
            const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
            const totalExtensionPrice = diffDays * dailyRate * (booking.quantity || 1);
            const newTotalPrice = booking.totalPrice + totalExtensionPrice;
    
            newPriceUsdSpan.textContent = `$${newTotalPrice.toFixed(2)}`;
            convertCurrencyAndUpdateUI(newTotalPrice, 'new-total-price-idr');
        };
    
        updatePrice();
    
        newEndDateInput.addEventListener('change', updatePrice);
    
        confirmBtn.addEventListener('click', async () => {
            const user = getCurrentUser();
            if (!user) {
                showToast("You must be logged in to extend.", "error");
                return;
            }
    
            const newEndDateTimestamp = new Date(newEndDateInput.value).getTime();
            const finalPriceText = newPriceUsdSpan.textContent;
            const newTotalPrice = parseFloat(finalPriceText.replace('$', ''));
            const extensionPrice = newTotalPrice - booking.totalPrice;
    
            showLoader(true, 'Processing extension...');
            try {
                const userData = await fetchUserData(user.uid);
                
                await updateBookingStatus(booking.id, booking.bookingStatus, {
                    endDate: newEndDateTimestamp,
                    totalPrice: newTotalPrice,
                    paymentMethod: 'online',
                    paymentStatus: 'pending_extension',
                });
    
                const amountInIDR = await getConvertedPrice(extensionPrice);
                const paymentData = {
                    orderId: `EXT-${booking.id.slice(-6)}-${Date.now()}`,
                    totalPrice: parseInt(amountInIDR, 10),
                    name: userData?.name || 'Customer',
                    email: userData?.email || 'customer@example.com',
                    phone: userData?.phone || 'N/A',
                    selectedSpaces: [{
                        name: `Extend ${booking.storageType} until ${formatDate(newEndDateTimestamp)}`,
                        quantity: 1,
                        price: extensionPrice
                    }]
                };
    
                await createIpaymuInvoice(paymentData);
                
                showToast('Redirecting to payment gateway...', 'success');
                hideModal('main-app-modal');
    
            } catch (error) {
                console.error('Error extending booking:', error);
                showToast('Failed to extend booking. Please try again.', 'error');
            } finally {
                showLoader(false);
            }
        });
    }
    
    function addPayCheckinListeners() {
        const mainModalContainer = document.getElementById('main-app-modal');
        if (!mainModalContainer) return;
    
        const confirmBtn = mainModalContainer.querySelector('#confirm-pay-checkin-btn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                const bookingToPay = bookingState.currentBooking;
                if (!bookingToPay) return;
    
                const user = getCurrentUser();
                if (!user) {
                    showToast("Please log in to proceed with payment and check-in.", 'error');
                    location.hash = '#/auth';
                    return;
                }
    
                const userData = await fetchUserData(user.uid);
                const selectedPayMethod = mainModalContainer.querySelector('input[name="payMethodCheckIn"]:checked').value;
    
                showLoader(true, 'Processing payment for check-in...');
                try {
                    if (selectedPayMethod === 'online') {
                        showLoader(true, 'Converting currency for payment...');
                        const amountInIDR = await getConvertedPrice(bookingToPay.totalPrice);
                        const finalAmount = parseInt(amountInIDR, 10);
                        showLoader(true, 'Redirecting to payment gateway...');
    
                        const paymentData = {
                            totalPrice: finalAmount,
                            id: bookingToPay.id,
                            name: userData?.name || 'Customer',
                            email: userData?.email || 'customer@example.com',
                            phone: userData?.phone || 'N/A',
                            selectedSpaces: [{
                                name: `${bookingToPay.storageType} at ${bookingToPay.locationName}`,
                                quantity: bookingToPay.quantity,
                                price: bookingToPay.unitPrice
                            }]
                        };
                        await createIpaymuInvoice(paymentData);
                        showToast('Redirecting to iPaymu for payment. Please complete payment to proceed.', 'info');
                        hideModal('main-app-modal');
                    } else {
                        await updateBookingStatus(bookingToPay.id, bookingToPay.bookingStatus, {
                            paymentMethod: 'cod_on_site',
                            paymentStatus: 'unpaid_on_site'
                        });
                        showToast('You have selected Cash On Site. Please wait for admin confirmation to check in.', 'success');
                        hideModal('main-app-modal');
                    }
                } catch (error) {
                    console.error('Error processing payment for check-in:', error);
                    showToast('Failed to process payment. Please try again.', 'error');
                } finally {
                    showLoader(false);
                }
            });
        }
    }
    
    function addServiceStepLogic() {
        const mainModalContainer = document.getElementById('main-app-modal');
        const deliveryCheckbox = mainModalContainer.querySelector('#needs-delivery-checkbox');
        const deliverySection = mainModalContainer.querySelector('#sp-delivery-details-section');
        const pickupTimeInput = mainModalContainer.querySelector('#pickup-time-input');
        const deliveryTimeInput = mainModalContainer.querySelector('#delivery-time-input');
        const now = new Date();
        now.setHours(now.getHours() + 3);
        const minTime = now.toTimeString().slice(0, 5);
        const maxTime = "17:00";
    
        if(pickupTimeInput) {
            pickupTimeInput.min = minTime;
            pickupTimeInput.max = maxTime;
            if (!bookingState.pickupTime || pickupTimeInput.value < minTime) {
                bookingState.pickupTime = minTime;
                pickupTimeInput.value = minTime;
            }
            if (pickupTimeInput.value > maxTime) {
                bookingState.pickupTime = maxTime;
                pickupTimeInput.value = maxTime;
            }
        }
        if(deliveryTimeInput) {
            deliveryTimeInput.min = minTime;
            deliveryTimeInput.max = maxTime;
            if (!bookingState.deliveryTime || deliveryTimeInput.value < minTime) {
                bookingState.deliveryTime = minTime;
                deliveryTimeInput.value = minTime;
            }
            if (deliveryTimeInput.value > maxTime) {
                bookingState.deliveryTime = maxTime;
                deliveryTimeInput.value = maxTime;
            }
        }
    
        if(deliveryCheckbox) {
            deliveryCheckbox.addEventListener('change', e => {
                bookingState.needsDelivery = e.target.checked;
                if(deliverySection) deliverySection.style.display = bookingState.needsDelivery ? 'block' : 'none';
                updateAndValidateServiceStep();
            });
        }
    
        if(pickupTimeInput) {
            pickupTimeInput.addEventListener('change', () => {
                if (pickupTimeInput.value < minTime) {
                    showToast(`Pickup time must be at least 3 hours from now.`, 'warning');
                    pickupTimeInput.value = minTime;
                }
                if (pickupTimeInput.value > maxTime) {
                    showToast(`Pickup service is only available until 17:00.`, 'warning');
                    pickupTimeInput.value = maxTime;
                }
                bookingState.pickupTime = pickupTimeInput.value;
                updateAndValidateServiceStep();
            });
        }
    
        if(deliveryTimeInput) {
            deliveryTimeInput.addEventListener('change', () => {
                if (deliveryTimeInput.value < minTime) {
                    showToast(`Delivery time must be at least 3 hours from now.`, 'warning');
                    deliveryTimeInput.value = minTime;
                }
                if (deliveryTimeInput.value > maxTime) {
                    showToast(`Delivery service is only available until 17:00.`, 'warning');
                    deliveryTimeInput.value = maxTime;
                }
                bookingState.deliveryTime = deliveryTimeInput.value;
                updateAndValidateServiceStep();
            });
        }
        updateAndValidateServiceStep();
    }
    
    async function updateAndValidateServiceStep() {
        const mainModalContainer = document.getElementById('main-app-modal');
        const nextBtn = mainModalContainer.querySelector('#next-step-btn');
        const validationMessage = mainModalContainer.querySelector('#validation-message');
        let isFormValid = true;
        let message = '';
        if (Object.keys(bookingState.locationsToBook).length === 0) {
            isFormValid = false;
            message = 'Please select a storage unit to book.';
        } else if (bookingState.serviceType === 'pickup') {
            if (!bookingState.pickupAddress || !bookingState.contactNumber || !bookingState.pickupTime) {
                isFormValid = false;
                message = 'Please provide complete pickup details.';
            }
        }
        if (bookingState.needsDelivery) {
            if (!bookingState.deliveryAddress || !bookingState.deliveryContactNumber || !bookingState.deliveryTime) {
                isFormValid = false;
                message = 'Please provide complete delivery details.';
            }
        }
        await updateBookingSummary(true);
        if (nextBtn) {
            nextBtn.disabled = !isFormValid;
            nextBtn.style.opacity = isFormValid ? '1' : '0.5';
        }
        if (validationMessage) {
            validationMessage.textContent = message;
        }
    }
    
    async function addDurationStepLogic() {
        const mainModalContainer = document.getElementById('main-app-modal');
        const nextBtn = mainModalContainer.querySelector('#next-step-btn');
        const durationBtns = mainModalContainer.querySelectorAll('.sp-duration-btn');
        const startDateInput = mainModalContainer.querySelector('#start-date');
        const startTimeInput = mainModalContainer.querySelector('#start-time');
        const endDateContainer = mainModalContainer.querySelector('#end-date-container');
    
        const updateNextButton = () => {
            const isFormValid = bookingState.duration && bookingState.startDate && bookingState.endDate && bookingState.endDate >= bookingState.startDate;
            if (nextBtn) {
                nextBtn.disabled = !isFormValid;
                nextBtn.style.opacity = isFormValid ? '1' : '0.5';
            }
        };
        
        const updateEndDate = () => {
            const startDate = new Date(`${startDateInput.value}T${startTimeInput.value}`);
            let endDate = new Date(startDate);
            const duration = bookingState.duration?.trim().toLowerCase();
            
            if(!duration) { 
                endDateContainer.innerHTML = `<span class="text-primary-500 font-bold">N/A</span>`;
                bookingState.endDate = null;
                updateNextButton();
                return;
            }
    
            switch (duration) {
                case 'daily':
                    if (!bookingState.endDate || bookingState.endDate < startDate.getTime()) {
                         endDate.setDate(startDate.getDate() + 1);
                         bookingState.endDate = endDate.getTime();
                    }
                    endDateContainer.innerHTML = `<input type="date" id="end-date" class="sp-input-field" value="${new Date(bookingState.endDate).toISOString().split('T')[0]}">`;
                    const endDateInput = document.getElementById('end-date');
                    endDateInput.addEventListener('change', () => {
                        const newEndDate = new Date(`${endDateInput.value}T${startTimeInput.value}`).getTime();
                        bookingState.endDate = newEndDate;
                        updateBookingSummary();
                        updateNextButton();
                    });
                    break;
                case 'weekly':
                    endDate.setDate(startDate.getDate() + 7);
                    endDateContainer.innerHTML = `<span class="text-primary-500 font-bold">${formatDateTime(endDate.getTime())}</span>`;
                    bookingState.endDate = endDate.getTime();
                    break;
                case 'monthly':
                    endDate.setMonth(startDate.getMonth() + 1);
                    endDateContainer.innerHTML = `<span class="text-primary-500 font-bold">${formatDateTime(endDate.getTime())}</span>`;
                    bookingState.endDate = endDate.getTime();
                    break;
                default:
                    endDateContainer.innerHTML = `<span class="text-primary-500 font-bold">N/A</span>`;
                    bookingState.endDate = null;
                    break;
            }
            updateBookingSummary();
            updateNextButton();
        };
    
        durationBtns.forEach(btn => {
            btn.addEventListener('click', e => {
                durationBtns.forEach(b => b.classList.remove('active'));
                e.target.closest('.sp-duration-btn').classList.add('active');
                bookingState.duration = e.target.closest('.sp-duration-btn').dataset.duration;
                updateEndDate();
            });
        });
        startDateInput.addEventListener('change', () => {
            bookingState.startDate = new Date(`${startDateInput.value}T${startTimeInput.value}`).getTime();
            updateEndDate();
        });
        startTimeInput.addEventListener('change', () => {
            bookingState.startDate = new Date(`${startDateInput.value}T${startTimeInput.value}`).getTime();
            updateEndDate();
        });
        
        updateEndDate();
    }
    
    function addConfirmationStepLogic() {
        updateBookingSummary();
    }
    
    async function updateBookingSummary(hidePrice = false) {
        const mainModalContainer = document.getElementById('main-app-modal');
        if (!mainModalContainer) return; 
        const summaryList = mainModalContainer.querySelector('#sp-editable-summary-list');
        const priceSummaryContainer = mainModalContainer.querySelector('#price-summary-container');
        if (hidePrice) {
            if (priceSummaryContainer) priceSummaryContainer.style.display = 'none';
        } else {
            const totals = await calculateBookingTotals();
            if (priceSummaryContainer) {
                priceSummaryContainer.style.display = 'block';
                priceSummaryContainer.innerHTML = getPriceDetailsHTML(totals);
                if (totals.finalPrice > 0) {
                    convertCurrencyAndUpdateUI(totals.finalPrice, 'total-price-summary-idr');
                }
            }
        }
        if (summaryList) {
            let hasItems = false;
            summaryList.innerHTML = Object.values(bookingState.locationsToBook).flatMap(loc =>
                (loc.items || []).map(item => {
                    hasItems = true;
                    return `
                    <div class="sp-summary-item-card">
                        <div>
                            <p class="font-semibold">${item.size.name || ''} (${item.quantity}x)</p>
                            <p class="text-sm text-gray-600">at ${loc.locationData.name || ''}</p>
                            ${bookingState.duration ? `<p class="mt-0-5 text-sm text-primary-500 font-bold">${bookingState.duration}</p>` : ''}
                        </div>
                        <div class="sp-quantity-selector">
                            <button class="btn-quantity" data-action="decrease-quantity" data-item-type="storage" data-location-id="${loc.locationData.id || ''}" data-category-name="${item.category.name || ''}" data-size-name="${item.size.name || ''}">-</button>
                            <span class="quantity-display">${item.quantity || 0}</span>
                            <button class="btn-quantity" data-action="increase-quantity" data-item-type="storage" data-location-id="${loc.locationData.id || ''}" data-category-name="${item.category.name || ''}" data-size-name="${item.size.name || ''}">+</button>
                        </div>
                    </div>
                    `;
                }).concat((loc.supplies || []).map(supply => {
                    hasItems = true;
                    return `
                    <div class="sp-summary-item-card">
                        <div>
                            <p class="font-semibold">${supply.name || ''} (${supply.quantity}x)</p>
                            <p class="text-sm text-gray-600">Supply Item</p>
                        </div>
                        <div class="sp-quantity-selector">
                            <button class="btn-quantity" data-action="decrease-quantity" data-item-type="supply" data-location-id="${loc.locationData.id || ''}" data-product-id="${supply.id || ''}">-</button>
                            <span class="quantity-display">${supply.quantity || 0}</span>
                            <button class="btn-quantity" data-action="increase-quantity" data-item-type="supply" data-location-id="${loc.locationData.id || ''}" data-product-id="${supply.id || ''}">+</button>
                        </div>
                    </div>
                    `;
                }))
            ).join('');
            if (!hasItems) {
                summaryList.innerHTML = '<p class="text-sm text-gray-500">No items selected.</p>';
            }
        }
    }
    
    function addDetailModalListeners(locationData) {
        const seeMoreBtn = document.getElementById('see-more-btn');
        const locationDescription = document.getElementById('location-description');
        const fullDescription = locationData.description;
        
        if (seeMoreBtn && locationDescription) {
            seeMoreBtn.addEventListener('click', () => {
                if (locationDescription.classList.contains('expanded')) {
                    locationDescription.innerHTML = fullDescription.substring(0, 200) + '... ' + `<button id="see-more-btn" class="text-blue-500 hover:underline">See More</button>`;
                    locationDescription.classList.remove('expanded');
                } else {
                    locationDescription.innerHTML = fullDescription + ' ' + `<button id="see-more-btn" class="text-blue-500 hover:underline">See Less</button>`;
                    locationDescription.classList.add('expanded');
                }
                addDetailModalListeners(locationData); 
            });
        }
    
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tabName;
                tabButtons.forEach(btn => {
                    btn.classList.remove('active-tab');
                    btn.classList.remove('border-primary-500');
                    btn.classList.add('border-transparent');
                    btn.classList.add('hover:border-gray-300');
                });
                button.classList.add('active-tab');
                button.classList.add('border-primary-500');
                button.classList.remove('border-transparent');
                
                document.querySelectorAll('.tab-content').forEach(content => {
                    if (content.id === tabName) {
                        content.classList.remove('hidden');
                        content.classList.add('active');
                    } else {
                        content.classList.remove('active');
                        content.classList.add('hidden');
                    }
                });
            });
        });
    
        const bookNowBtn = document.getElementById('book-now-btn');
        if (bookNowBtn) {
            bookNowBtn.addEventListener('click', () => {
                // Cek apakah ada item yang sudah dipilih
                const cartItems = globalCart?.[locationData.id]?.items || [];
                if (cartItems.length > 0) {
                    renderBookingFlowModal();
                } else {
                    showToast("Please select at least one storage unit from 'Available Storage' to book.", "warning");
                }
            });
        }
    }
    
    function addCategoryDetailListeners(category, locationData) {
        const modal = document.getElementById('main-app-modal');
        if (!modal) return;
        modal.addEventListener('click', e => {
            const target = e.target;
            const increaseBtn = target.closest('[data-action="increase-quantity"]');
            const decreaseBtn = target.closest('[data-action="decrease-quantity"]');
            if (increaseBtn || decreaseBtn) {
                const sizeName = (increaseBtn || decreaseBtn).dataset.sizeName;
                const size = category.sizes.find(s => s.name === sizeName);
                const display = modal.querySelector(`.quantity-display[data-size-name="${sizeName}"]`);
                let currentQty = parseInt(display.textContent, 10);
                if (increaseBtn && size && currentQty < size.capacity) {
                    currentQty++;
                } else if (decreaseBtn && size && currentQty > 0) {
                    currentQty--;
                }
                if (display) display.textContent = currentQty;
            }
        });
    }
    
    function renderSchedules(openingHours) {
        if (!openingHours || Object.keys(openingHours).length === 0) return '<p>Opening hours not available.</p>';
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        return `
        <table class="opening-hours-table">
            <tbody>
                ${days.map(day => {
                    const dayKey = day.toLowerCase();
                    const hours = openingHours[dayKey];
                    return `
                    <tr class="border-bottom">
                        <td class="font-semibold">${day}</td>
                        <td class="text-right">
                            ${hours && hours.open && hours.close ? `${hours.open} - ${hours.close}` : `<span class="closed-day">Closed</span>`}
                        </td>
                    </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
        `;
    }
    
    function renderCategorySlider(categories) {
        if (!categories || categories.length === 0) return '<p>No storage categories available at this location.</p>';
        return `
        <div class="sp-category-slider-container">
            <div class="sp-category-slider">
                ${categories.map((cat, index) => {
                    const imageUrl = cat.image 
                        ? `${window.location.origin}/.netlify/functions/get-photo?key=${encodeURIComponent(cat.image.split('key=')[1] || cat.image)}` 
                        : `${window.location.origin}/assets/img/storapedia.png`;
                    return `
                    <div class="sp-category-card">
                        <div class="sp-category-card-content">
                            <img src="${imageUrl}" alt="${cat.name || 'Storage Category'}" class="sp-category-image">
                            <div class="sp-category-text">
                                <h5 class="sp-category-title">${cat.name || ''}</h5>
                                <div class="sp-category-description">${cat.description || ''}</div>
                            </div>
                        </div>
                        <div class="sp-category-footer">
                            <button class="btn btn-primary btn-full" data-action="view-category-detail" data-category-index="${index}">Book This Storage</button>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
        `;
    }
    
    function handleAddSupply(button) {
        const productId = button.dataset.productId;
        const product = publicDataCache.shopProducts[productId];
        if (!product) return;
    
        const locationId = Object.keys(bookingState.locationsToBook)[0];
        if (!locationId) return;
    
        if (!globalCart[locationId]) {
            globalCart[locationId] = {
                locationData: bookingState.locationsToBook[locationId].locationData,
                items: [],
                supplies: []
            };
        }
        
        if(!globalCart[locationId].supplies) {
            globalCart[locationId].supplies = [];
        }
    
        const existingSupply = globalCart[locationId].supplies.find(item => item.id === productId);
    
        if (existingSupply) {
            existingSupply.quantity++;
        } else {
            globalCart[locationId].supplies.push({
                id: productId,
                name: product.name,
                price: product.price,
                quantity: 1
            });
        }
    
        showToast(`${product.name} added to your items.`, 'success');
        updateBookingSummary();
    }