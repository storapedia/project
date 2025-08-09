import { getStarRatingHTML } from './components.js';
import { showModal, hideModal, showToast, showLoader } from './ui-helpers.js';
import { getCurrentUser } from '../services/auth.js';
import { db } from '../firebase-init.js';
import { createIpaymuInvoice } from '../services/payment-handler.js';
import { createNewBooking, fetchUserData, submitReview, requestPickup } from '../services/firebase-api.js';

let bookingState = {};
let globalCart = {};
let mapInstance = null;
let mapMarker = null;
let pickupAutocomplete = null;
let geocoder = null;
let mapsApiStyleInjected = false;

// Format timestamp to a readable English format
const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString('en-US', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
    });
};

// Find the cheapest price for a location
const getCheapestPrice = (locationData) => {
    if (!locationData.categories || locationData.categories.length === 0) return Infinity;
    return locationData.categories
        .flatMap(cat => cat.sizes || [])
        .flatMap(size => size.rates || [])
        .reduce((min, rate) => Math.min(min, rate.price), Infinity);
};

// Calculate distance between two geo-coordinates in kilometers
const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c) / 1000; // Return distance in km
};

// Calculate all booking totals, including subtotal, pickup fees, and discounts
async function calculateBookingTotals() {
    let subTotal = 0;
    let totalItems = 0;
    let pickupFee = 0;

    if (!bookingState.duration) {
        return { subTotal: 0, pickupFee: 0, discountAmount: 0, finalPrice: 0, totalItems: 0 };
    }

    Object.values(bookingState.locationsToBook).forEach(loc => {
        loc.items.forEach(item => {
            if (bookingState.duration.toLowerCase() === 'daily') {
                const timeDiff = bookingState.endDate - bookingState.startDate;
                const totalDays = Math.max(1, Math.ceil(timeDiff / (1000 * 3600 * 24)));
                const dailyRate = item.size.rates.find(r => r.duration.toLowerCase() === 'daily');
                if (dailyRate) {
                    subTotal += item.quantity * dailyRate.price * totalDays;
                }
            } else {
                const rate = item.size.rates.find(r => r.duration === bookingState.duration);
                if (rate) {
                    subTotal += item.quantity * rate.price;
                }
            }
            totalItems += item.quantity;
        });
    });

    if (bookingState.serviceType === 'pickup' && bookingState.geolocation?.latitude) {
        try {
            const settingsSnapshot = await db.ref('settings').once('value');
            const settings = settingsSnapshot.val();
            const firstLocationId = Object.keys(bookingState.locationsToBook)[0];
            const locationData = bookingState.locationsToBook[firstLocationId].locationData;
            const { latitude: storeLat, longitude: storeLng } = locationData.geolocation;
            const { latitude: pickupLat, longitude: pickupLng } = bookingState.geolocation;
            const distanceKm = getDistance(pickupLat, pickupLng, storeLat, storeLng);
            bookingState.pickupDistance = distanceKm;

            if (settings?.pricing) {
                pickupFee = settings.pricing.kmFee > 0 ? distanceKm * settings.pricing.kmFee : (settings.pricing.pickupFee || 0);
            }
        } catch (error) {
            console.error("Error calculating pickup fee:", error);
            showToast("Could not calculate pickup fee.", "error");
        }
    }

    const priceBeforeDiscount = subTotal + pickupFee;
    let discountAmount = 0;
    if (bookingState.voucher?.discount_percent > 0) {
        discountAmount = priceBeforeDiscount * (bookingState.voucher.discount_percent / 100);
    }
    
    const finalPrice = priceBeforeDiscount - discountAmount;

    bookingState.subTotal = subTotal;
    bookingState.pickupFee = pickupFee;
    bookingState.totalPrice = finalPrice;
    bookingState.totalItems = totalItems;

    return { subTotal, pickupFee, discountAmount, finalPrice, totalItems };
}

// --- NEW: Currency Conversion Function ---
async function convertCurrencyAndUpdateUI(totalUSD) {
    const idrPriceElement = document.getElementById('total-price-summary-idr');
    const statusElement = document.getElementById('currency-conversion-status');

    if (!idrPriceElement || !statusElement) return;

    // API Key from ExchangeRate-API.com
    const apiKey = 'cdb0e64314935946403b2da4'; 

    // Immediately show loading state
    statusElement.innerHTML = `<div class="mini-loader"></div> Converting USD to IDR...`;
    idrPriceElement.textContent = '';

    try {
        const response = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        const exchangeRate = data.conversion_rates.IDR;
        const totalIDR = totalUSD * exchangeRate;

        // Update UI with the result
        idrPriceElement.textContent = `Approx. Rp ${totalIDR.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        statusElement.textContent = `Using rate: 1 USD = Rp ${exchangeRate.toLocaleString('id-ID')}`;

    } catch (error) {
        console.error('Currency conversion failed:', error);
        statusElement.textContent = 'Could not fetch exchange rate.';
        idrPriceElement.textContent = ''; // Clear price on error
    }
}

// --- GET SERVICE STEP HTML (MODIFIED) ---
function getServiceStepHTML() {
  return `
    <div class="sp-bookings-flow-header">
      <button class="back-step-btn">&larr;</button>
      <h3 class="modal-title">2. Choose Service</h3>
      <button class="close-modal-btn">&times;</button>
    </div>
    <div class="sp-bookings-flow-body">
        <div class="sp-service-type-toggle">
            <button type="button" data-service="self-dropoff" class="${bookingState.serviceType === 'self-dropoff' ? 'active' : ''}">Self Drop-off</button>
            <button type="button" data-service="pickup" class="${bookingState.serviceType === 'pickup' ? 'active' : ''}">Pickup Service</button>
        </div>
        <div class="sp-summary-section">
            <h4 class="mt-1 mb-1">Booking Summary</h4>
            <div id="sp-editable-summary-list"></div>
        </div>
        <div id="sp-service-summary-details" class="sp-confirmation-summary mt-1" style="display: none;"></div>
    </div>
    <div class="sp-bookings-flow-footer">
        <div id="total-price-summary" class="sp-total-price text-left mb-0-5">Total: $0.00</div>
        <div id="total-price-summary-idr" class="sp-total-price-idr text-left text-sm font-semibold text-gray-700"></div>
        <div id="currency-conversion-status" class="text-xs text-gray-500 mt-0-5 mb-1"></div>
        <button id="next-step-btn" class="btn btn-primary btn-full" disabled>Next</button>
    </div>
  `;
}

// --- ADD SERVICE STEP LOGIC (MODIFIED) ---
function addServiceStepLogic() {
    const nextBtn = document.getElementById('next-step-btn');
    const serviceTypeToggle = document.querySelector('.sp-service-type-toggle');
    const summaryList = document.getElementById('sp-editable-summary-list');

    const validateAndRefresh = async () => {
        // Show loading state for currency conversion immediately
        const statusElement = document.getElementById('currency-conversion-status');
        if (statusElement) {
            statusElement.innerHTML = `<div class="mini-loader"></div> Preparing summary...`;
        }
        
        // Update the USD summary first
        await updateBookingSummary();
        
        // Then, trigger the currency conversion
        if (bookingState.totalPrice > 0) {
            convertCurrencyAndUpdateUI(bookingState.totalPrice);
        } else {
            // Clear currency fields if total is zero
            const idrPriceElement = document.getElementById('total-price-summary-idr');
            if(idrPriceElement) idrPriceElement.textContent = '';
            if(statusElement) statusElement.textContent = '';
        }
        
        const isFormValid = !!bookingState.serviceType;
        if(nextBtn) {
            nextBtn.disabled = !isFormValid;
            nextBtn.style.opacity = isFormValid ? '1' : '0.5';
        }
    };

    serviceTypeToggle.addEventListener('click', e => {
        const btn = e.target.closest('button[data-service]');
        if(btn) {
            document.querySelectorAll('.sp-service-type-toggle button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            bookingState.serviceType = btn.dataset.service;
            validateAndRefresh();
        }
    });

    summaryList.addEventListener('click', e => {
        const editBtn = e.target.closest('[data-action="edit-summary-item"]');
        if (editBtn) {
            const { locationId, categoryName } = editBtn.dataset;
            const locationData = bookingState.locationsToBook[locationId]?.locationData;
            const category = locationData?.categories.find(cat => cat.name === categoryName);
            if (category && locationData) {
                renderCategoryDetailPopup(category, locationData);
            } else {
                showToast('Could not edit item. Category not found.', 'error');
            }
        }
    });
    
    // Initial call to load summary and start conversion
    validateAndRefresh();
}


// ... [SISA KODE DI BAWAH INI SAMA, TIDAK PERLU DIUBAH] ...

function renderSchedules(schedules) {
  if (!schedules) return '<p>Opening hours not available.</p>';
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return `
    <table class="opening-hours-table">
      <tbody>
        ${days.map(day => `
          <tr class="border-bottom">
            <td class="font-semibold">${day}</td>
            <td class="text-right">
              ${(schedules[day] && schedules[day].open_hour !== 'Closed')
                ? `${schedules[day].open_hour} - ${schedules[day].close_hour}`
                : `<span class="closed-day">Closed</span>`}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderCategorySlider(categories) {
  if (!categories || categories.length === 0) return '<p>No storage categories available at this location.</p>';
  return `
    <div class="sp-category-slider-container">
      <div class="sp-category-slider">
        ${categories.map((cat, index) => `
          <div class="sp-category-card">
            <div class="sp-category-card-content">
              <img src="${cat.image || '/assets/img/storapedia.png'}" alt="${cat.name}" class="sp-category-image">
              <div class="sp-category-text">
                <h5 class="sp-category-title">${cat.name}</h5>
                <p class="sp-category-description">${cat.description}</p>
              </div>
            </div>
            <div class="sp-category-footer">
              <button class="btn btn-primary btn-full" data-action="view-category-detail" data-category-index="${index}">Book This Storage</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderCategoryDetailPopup(category, locationData) {
  const content = `
    <div class="modal-content" id="category-detail-modal-content">
      <div class="modal-header">
        <h3 class="modal-title">${category.name}</h3>
        <button class="close-modal-btn" data-modal-id="category-detail-modal">&times;</button>
      </div>
      <div class="modal-body">
        <p class="text-gray-600">${category.description}</p>
        <h4 class="mt-1-5 border-top-1 pt-1">Select Size</h4>
        ${(category.sizes || []).map(size => `
          <div class="sp-size-detail-item">
            <div class="sp-size-details">
              <h6 class="sp-size-title">${size.name}</h6>
              <p class="sp-size-description">${size.description}</p>
              <span class="sp-size-capacity ${size.capacity > 0 ? 'available' : 'full'}">
                ${size.capacity > 0 ? `${size.capacity} Available` : 'Fully Booked'}
              </span>
              ${size.rates ? `<div class="sp-size-rates">
                ${size.rates.map(rate => `<span>${rate.duration}: <b>$${rate.price.toFixed(2)}</b></span>`).join(' • ')}
              </div>` : ''}
            </div>
            <div class="sp-quantity-selector">
              <button class="btn-quantity" data-action="decrease-quantity" data-size-name="${size.name}">-</button>
              <span class="quantity-display" data-size-name="${size.name}">0</span>
              <button class="btn-quantity" data-action="increase-quantity" data-size-name="${size.name}" ${size.capacity === 0 ? 'disabled' : ''}>+</button>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="modal-footer sticky-footer">
        <button id="confirm-selection-btn" class="btn btn-primary btn-full">Save</button>
      </div>
    </div>
  `;
  showModal('category-detail-modal', content);
  addCategoryDetailListeners(category, locationData);
}

function addCategoryDetailListeners(category, locationData) {
  const modal = document.getElementById('category-detail-modal');
  if (!modal) return;
  let quantitiesInPopup = {};
  const locationId = locationData.id;
  category.sizes.forEach(size => {
    const itemInCart = (globalCart[locationId]?.items || []).find(item => item.size.name === size.name);
    quantitiesInPopup[size.name] = itemInCart ? itemInCart.quantity : 0;
    const display = modal.querySelector(`.quantity-display[data-size-name="${size.name}"]`);
    if (display) display.textContent = quantitiesInPopup[size.name];
  });
  const updateMainLocationFooter = () => {
    const footer = document.querySelector('#location-detail-modal .modal-footer');
    if (!footer) return;
    const totalItems = Object.values(globalCart).reduce((sum, loc) => sum + (loc.items.reduce((itemSum, i) => itemSum + i.quantity, 0)), 0);
    if (totalItems > 0) {
      footer.innerHTML = `<button id="continue-booking-btn" data-action="start-booking-flow" class="btn btn-primary btn-full bg-success-500">Continue with ${totalItems} item(s)</button>`;
    } else {
      const cheapestPrice = getCheapestPrice(locationData);
      footer.innerHTML = `
        <div class="sp-start-price">
          Starts from <strong class="text-xl text-dark-secondary">$${cheapestPrice !== Infinity ? cheapestPrice.toFixed(2) : 'N/A'}</strong>
        </div>
        <button data-action="scroll-to-storage" class="btn btn-primary">Book a Space</button>
      `;
    }
  };
  modal.addEventListener('click', e => {
    const target = e.target;
    const increaseBtn = target.closest('[data-action="increase-quantity"]');
    const decreaseBtn = target.closest('[data-action="decrease-quantity"]');
    if (increaseBtn) {
      const sizeName = increaseBtn.dataset.sizeName;
      const size = category.sizes.find(s => s.name === sizeName);
      const display = modal.querySelector(`.quantity-display[data-size-name="${sizeName}"]`);
      let currentQty = quantitiesInPopup[sizeName] || 0;
      if (size && currentQty < size.capacity) {
        currentQty++;
        if (display) display.textContent = currentQty;
        quantitiesInPopup[sizeName] = currentQty;
      }
    } else if (decreaseBtn) {
      const sizeName = decreaseBtn.dataset.sizeName;
      const size = category.sizes.find(s => s.name === sizeName);
      const display = modal.querySelector(`.quantity-display[data-size-name="${sizeName}"]`);
      let currentQty = quantitiesInPopup[sizeName] || 0;
      if (size && currentQty > 0) {
        currentQty--;
        if (display) display.textContent = currentQty;
        quantitiesInPopup[sizeName] = currentQty;
      }
    } else if (target.closest('#confirm-selection-btn')) {
      if (!globalCart[locationId]) {
        globalCart[locationId] = { locationData: locationData, items: [] };
      }
      globalCart[locationId].items = globalCart[locationId].items.filter(item => item.category.name !== category.name);
      Object.keys(quantitiesInPopup).forEach(sizeName => {
        if (quantitiesInPopup[sizeName] > 0) {
          const size = category.sizes.find(s => s.name === sizeName);
          if (size) {
            globalCart[locationId].items.push({ category, size, quantity: quantitiesInPopup[sizeName] });
          }
        }
      });
      if (globalCart[locationId].items.length === 0) {
          delete globalCart[locationId];
      }
      updateMainLocationFooter();
      hideModal('category-detail-modal');
      if (bookingState.step === 2) {
        updateBookingSummary();
      }
    } else if (target.closest('.close-modal-btn')) {
      hideModal('category-detail-modal');
    }
  });
}

export function renderLocationDetailModal(locationData, reviews) {
  const locationId = locationData.id;
  const reviewsForLocation = reviews?.[locationId] ? Object.values(reviews[locationId]) : [];
  const cheapestPrice = getCheapestPrice(locationData);
  const content = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">${locationData.name}</h3>
        <button class="close-modal-btn" data-modal-id="location-detail-modal">&times;</button>
      </div>
      <div class="modal-body bg-neutral-50 overflow-y-auto">
        <div class="location-detail-image" style="background-image: url('${locationData.imageUrl}');"></div>
        <div class="location-detail-card">
          <div class="location-detail-info">
            <p class="location-detail-address">${locationData.address}</p>
            <span class="location-status-badge ${locationData.status === 'Open' ? 'open' : 'closed'}">${locationData.status}</span>
          </div>
          <p class="location-detail-description">${locationData.description || ''}</p>
        </div>
        <h4 class="mt-1-5 mb-0-75">Features</h4>
        <div class="location-features-list">
          ${(locationData.features || []).map(f => `<span class="feature-tag"><i class="${f.icon}"></i><span>${f.name}</span></span>`).join('')}
        </div>
        <h4 class="mt-1-5 mb-0-75">Opening Hours</h4>
        <div class="location-detail-card">${renderSchedules(locationData.schedules)}</div>
        <div id="available-storage-section">
          <h4 class="mt-1-5 mb-0-75">Available Storage</h4>
          ${renderCategorySlider(locationData.categories)}
        </div>
        <h4 class="mt-1-5 mb-0-75">Reviews (${reviewsForLocation.length})</h4>
        <div class="location-detail-card p-0-5">
          ${reviewsForLocation.length > 0 ? reviewsForLocation.map(r => `<div class="review-item"><div class="review-header"><h5 class="font-semibold">${r.name}</h5><div class="star-rating">${getStarRatingHTML(r.rating)}</div></div><p class="review-comment">${r.comment}</p></div>`).join('') : '<p class="text-center text-gray-500 p-1">No reviews yet.</p>'}
        </div>
      </div>
      <div class="modal-footer sticky-footer">
        <div class="sp-start-price">
          Starts from <strong class="text-xl text-dark-secondary">$${cheapestPrice !== Infinity ? cheapestPrice.toFixed(2) : 'N/A'}</strong>
        </div>
        <button data-action="scroll-to-storage" class="btn btn-primary">Book a Space</button>
      </div>
    </div>
  `;
  showModal('location-detail-modal', content);
  addDetailModalListeners(locationData);
}

export function addDetailModalListeners(locationData) {
  const modal = document.getElementById('location-detail-modal');
  if (!modal) return;
  modal.addEventListener('click', e => {
    const target = e.target;
    const scrollBtn = target.closest('[data-action="scroll-to-storage"]');
    const viewCategoryBtn = target.closest('[data-action="view-category-detail"]');
    const closeModalBtn = target.closest('.close-modal-btn');
    const startBookingBtn = target.closest('[data-action="start-booking-flow"]');
    if (scrollBtn) {
      modal.querySelector('#available-storage-section')?.scrollIntoView({ behavior: 'smooth' });
    } else if (viewCategoryBtn) {
      const categoryIndex = viewCategoryBtn.dataset.categoryIndex;
      const category = locationData.categories[categoryIndex];
      if (category) {
        renderCategoryDetailPopup(category, locationData);
      }
    } else if (startBookingBtn) {
      hideModal('location-detail-modal');
      renderBookingFlowModal();
    } else if (closeModalBtn) {
      hideModal('location-detail-modal');
    }
  });
}

function renderBookingStep() {
    const user = getCurrentUser();
    let content = '';
    switch (bookingState.step) {
        case 1: content = getDurationStepHTML(); break;
        case 2: content = getServiceStepHTML(); break;
        case 3: content = getConfirmationStepHTML(user); break;
        default:
            console.error("Invalid booking step:", bookingState.step);
            hideModal('booking-flow-modal');
            return;
    }
    const modalContent = document.querySelector('#booking-flow-modal .modal-content');
    if (modalContent) {
        modalContent.innerHTML = content;
        addStepLogic();
    }
}

async function updateBookingSummary() {
    const summaryList = document.getElementById('sp-editable-summary-list');
    const priceSummary = document.getElementById('total-price-summary');
    const serviceDetails = document.getElementById('sp-service-summary-details');
    const totals = await calculateBookingTotals();
    let itemsSummaryHTML = '';
    Object.values(bookingState.locationsToBook).forEach(loc => {
        loc.items.forEach(item => {
            itemsSummaryHTML += `
                <div class="sp-summary-item-card">
                    <div>
                        <p class="font-semibold">${item.size.name} (${item.quantity}x)</p>
                        <p class="text-sm text-gray-600">at ${loc.locationData.name}</p>
                        <p class="mt-0-5 text-sm text-primary-500 font-bold">${bookingState.duration || 'Not selected'}</p>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit-summary-item" data-location-id="${loc.locationData.id}" data-category-name="${item.category.name}">Edit</button>
                </div>`;
        });
    });
    if (summaryList) summaryList.innerHTML = itemsSummaryHTML;
    if (priceSummary) priceSummary.textContent = `Total: $${totals.finalPrice.toFixed(2)}`;
    if (serviceDetails) {
        if (bookingState.serviceType === 'pickup' && bookingState.pickupAddress) {
            serviceDetails.innerHTML = `
                <p class="no-margin">Pickup Service selected.</p>
                <p class="no-margin">Pickup Address: ${bookingState.pickupAddress}</p>
                <p class="no-margin">Distance: ${(bookingState.pickupDistance || 0).toFixed(2)} km</p>
                <p class="no-margin">Pickup Fee: $${(bookingState.pickupFee || 0).toFixed(2)}</p>
            `;
            serviceDetails.style.display = 'block';
        } else if (bookingState.serviceType === 'pickup') {
            serviceDetails.innerHTML = `<p class="no-margin">Pickup Service selected. Please add your pickup details.</p>`;
            serviceDetails.style.display = 'block';
        } else {
            serviceDetails.style.display = 'none';
        }
    }
}

function getDurationStepHTML() {
  const firstLocationId = Object.keys(bookingState.locationsToBook)[0];
  const firstItem = bookingState.locationsToBook[firstLocationId].items[0];
  const sharedRates = firstItem.size.rates;
  const startDate = new Date(bookingState.startDate);
  const isDaily = bookingState.duration && bookingState.duration.toLowerCase() === 'daily';
  const endDateHTML = isDaily 
      ? `<input type="date" id="end-date" class="sp-input-field" value="${new Date(bookingState.endDate).toISOString().split('T')[0]}">` 
      : `<span class="text-primary-500 font-bold">${formatDateTime(bookingState.endDate)}</span>`;
  return `
    <div class="sp-bookings-flow-header">
      <h3 class="modal-title">1. Select Duration & Date</h3>
      <button class="close-modal-btn">&times;</button>
    </div>
    <div class="sp-bookings-flow-body">
      <div class="sp-bookings-flow-input-group">
        <label>Start Date & Time</label>
        <div class="flex-container">
          <input type="date" id="start-date" class="sp-input-field" value="${startDate.toISOString().split('T')[0]}">
          <input type="time" id="start-time" class="sp-input-field" value="${startDate.toTimeString().slice(0, 5)}">
        </div>
      </div>
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
        <label>End Date & Time</label>
        <div class="sp-readonly-field">
            <div id="end-date-container">${endDateHTML}</div>
            <p class="no-margin text-sm text-gray-600 mt-0-5" id="duration-info-text"></p>
        </div>
      </div>
      <div id="booking-price-summary" class="sp-total-price">Total: $0.00</div>
    </div>
    <div class="sp-bookings-flow-footer">
      <button id="next-step-btn" class="btn btn-primary btn-full" disabled>Next</button>
    </div>
  `;
}

// --- START: MODIFIED getConfirmationStepHTML ---
function getConfirmationStepHTML(user) {
  const summary = bookingState;
  const totals = {
      subTotal: summary.subTotal || 0,
      pickupFee: summary.pickupFee || 0,
      finalPrice: summary.totalPrice || 0,
      discountAmount: (summary.subTotal + summary.pickupFee) - summary.totalPrice
  };
  const itemsSummary = Object.values(summary.locationsToBook).flatMap(loc =>
    loc.items.map(item => `<p class="no-margin"><b>Item:</b> ${item.size.name} (${item.quantity}x) at ${loc.locationData.name} - ${summary.duration}</p>`)
  ).join('');
  const getPriceDetailsHTML = (t) => {
    const originalPrice = t.finalPrice + t.discountAmount;
    if (t.discountAmount > 0) {
        return `
            <div class="sp-price-details">Subtotal: $${t.subTotal.toFixed(2)}</div>
            ${t.pickupFee > 0 ? `<div class="sp-price-details">Pickup Fee: $${t.pickupFee.toFixed(2)}</div>` : ''}
            <div class="sp-price-details sp-original-price-strikethrough">Original Total: <s>$${originalPrice.toFixed(2)}</s></div>
            <div class="sp-price-details sp-discount-text">Discount: -$${t.discountAmount.toFixed(2)}</div>
            <div id="total-price-summary" class="sp-total-price">Total: $${t.finalPrice.toFixed(2)}</div>
        `;
    }
    return `
        <div class="sp-price-details">Subtotal: $${t.subTotal.toFixed(2)}</div>
        ${t.pickupFee > 0 ? `<div class="sp-price-details">Pickup Fee: $${t.pickupFee.toFixed(2)}</div>` : ''}
        <div id="total-price-summary" class="sp-total-price">Total: $${t.finalPrice.toFixed(2)}</div>
    `;
  }
  return `
    <div class="sp-bookings-flow-header">
      <button class="back-step-btn">&larr;</button>
      <h3 class="modal-title">3. Confirmation & Payment</h3>
      <button class="close-modal-btn">&times;</button>
    </div>
    <div class="sp-bookings-flow-body text-sm overflow-y-auto">
      <h4 class="mt-0 mb-1">Booking Summary</h4>
      <div class="sp-confirmation-summary">
        ${itemsSummary}
        <p class="no-margin"><b>From:</b> ${formatDateTime(summary.startDate)}</p>
        <p class="no-margin"><b>To:</b> ${formatDateTime(summary.endDate)}</p>
      </div>
      <div class="sp-confirmation-summary mt-1">
        <p class="no-margin"><b>Service:</b> ${summary.serviceType === 'pickup' ? 'Pickup Service' : 'Self Drop-off'}</p>
        ${summary.serviceType === 'pickup' ? `<p class="no-margin"><b>Pickup Address:</b> ${summary.pickupAddress || 'Not set'}</p>` : ''}
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
      <div id="total-price-container" class="sp-total-price-container">
          ${getPriceDetailsHTML(totals)}
          <div id="total-price-summary-idr" class="sp-total-price-idr text-left text-sm font-semibold text-gray-700"></div>
          <div id="currency-conversion-status" class="text-xs text-gray-500 mt-0-5 mb-1"></div>
      </div>
      ${user ? `
        <h4 class="mt-1-5 mb-1">Payment Method</h4>
        <div class="sp-payment-options">
          <label class="sp-payment-option"><input type="radio" name="paymentMethod" value="on_site" ${bookingState.paymentMethod === 'on_site' ? 'checked' : ''}><span>Pay On-Site</span></label>
          <label class="sp-payment-option"><input type="radio" name="paymentMethod" value="online" ${bookingState.paymentMethod === 'online' ? 'checked' : ''}><span>Pay Online (iPaymu)</span></label>
        </div>` : ''}
    </div>
    <div class="sp-bookings-flow-footer">
      ${user ? '<button id="confirm-book-btn" class="btn btn-success btn-full">Confirm & Book</button>' : '<button id="login-to-book-btn" class="btn btn-primary btn-full">Login to Complete Booking</button>'}
    </div>
  `;
}
// --- END: MODIFIED getConfirmationStepHTML ---

async function handleConfirmBooking() {
  const user = getCurrentUser();
  if (!user) {
    showToast('You must be logged in to book.', 'error');
    return;
  }
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value;
  if (!paymentMethod) {
      showToast("Please select a payment method.", "error");
      return;
  }
  if (bookingState.serviceType === 'pickup' && (!bookingState.pickupAddress || !bookingState.geolocation)) {
      showToast("Please provide your pickup address details.", "error");
      renderPickupDetailsModal();
      return;
  }
  bookingState.notes = document.getElementById('booking-notes')?.value.trim() || '';
  showLoader(true, 'Creating your booking...');
  try {
    const userData = await fetchUserData(user.uid);
    const totals = await calculateBookingTotals();
    const cartSubtotal = totals.subTotal;
    const orderId = db.ref('bookings').push().key;
    const bookingsToCreate = [];
    Object.values(bookingState.locationsToBook).forEach(loc => {
        loc.items.forEach(item => {
            const isDaily = bookingState.duration.toLowerCase() === 'daily';
            const rateInfo = isDaily ? item.size.rates.find(r => r.duration.toLowerCase() === 'daily') : item.size.rates.find(r => r.duration === bookingState.duration);
            if (!rateInfo) return;
            const timeDiff = bookingState.endDate - bookingState.startDate;
            const totalDays = Math.max(1, Math.ceil(timeDiff / (1000 * 3600 * 24)));
            const itemSubtotal = isDaily ? item.quantity * rateInfo.price * totalDays : item.quantity * rateInfo.price;
            const proportion = cartSubtotal > 0 ? itemSubtotal / cartSubtotal : 1 / totalItems;
            const itemPickupFee = (totals.pickupFee || 0) * proportion;
            const itemDiscount = (totals.discountAmount || 0) * proportion;
            const finalItemPrice = itemSubtotal + itemPickupFee - itemDiscount;
            const newBookingData = {
                orderId, userId: user.uid, locationId: loc.locationData.id, locationName: loc.locationData.name,
                category: item.category.name, storageType: item.size.name, quantity: item.quantity,
                duration: bookingState.duration, totalPrice: finalItemPrice, startDate: bookingState.startDate,
                endDate: bookingState.endDate, serviceType: bookingState.serviceType, paymentMethod,
                paymentStatus: paymentMethod === 'online' ? 'pending' : 'unpaid_on_site',
                bookingStatus: 'active', notes: bookingState.notes,
            };
            if (bookingState.voucher) {
                newBookingData.voucherCode = bookingState.voucher.code;
                newBookingData.discountApplied = bookingState.voucher.discount_percent;
            }
            if (bookingState.serviceType === 'pickup') {
                newBookingData.pickupAddress = bookingState.pickupAddress || 'Not specified';
                newBookingData.geolocation = bookingState.geolocation || null;
                newBookingData.pickupFee = itemPickupFee;
                newBookingData.pickupDistance = bookingState.pickupDistance || 0;
            }
            bookingsToCreate.push(newBookingData);
        });
    });
    for (const booking of bookingsToCreate) {
        await createNewBooking(booking);
    }
    globalCart = {};
    bookingState = {};
    if (paymentMethod === 'online') {
      const paymentData = {
        id: orderId, totalPrice: totals.finalPrice,
        userEmail: userData?.email || 'customer@example.com', userName: userData?.name || 'Customer'
      };
      await createIpaymuInvoice(paymentData);
    } else {
      showLoader(false);
      showToast('Booking created successfully!', 'success');
      hideModal('booking-flow-modal');
      window.location.hash = '#/bookings';
    }
  } catch (error) {
    showLoader(false);
    showToast('Failed to create booking. Please try again.', 'error');
    console.error("Booking creation error:", error);
  }
}

function addDurationStepLogic() {
    const modalContent = document.querySelector('#booking-flow-modal .modal-content');
    if (!modalContent) return;
    const nextBtn = document.getElementById('next-step-btn');
    const priceSummary = document.getElementById('booking-price-summary');
    const durationInfoText = document.getElementById('duration-info-text');
    const updateAndValidate = async () => {
        const startDateInput = document.getElementById('start-date');
        const startTimeInput = document.getElementById('start-time');
        const endDateInput = document.getElementById('end-date');
        bookingState.startDate = new Date(`${startDateInput.value}T${startTimeInput.value}`).getTime();
        let newEndDate;
        const durationType = bookingState.duration?.toLowerCase();
        if (durationType === 'daily' && endDateInput) {
            const endDateValue = new Date(`${endDateInput.value}T${startTimeInput.value}`);
            if (endDateValue.getTime() < bookingState.startDate) {
                endDateValue.setDate(new Date(bookingState.startDate).getDate());
                endDateInput.value = endDateValue.toISOString().split('T')[0];
            }
            newEndDate = endDateValue;
        } else {
            newEndDate = new Date(bookingState.startDate);
            switch (durationType) {
                case 'weekly': newEndDate.setDate(newEndDate.getDate() + 7); break;
                case 'monthly': newEndDate.setMonth(newEndDate.getMonth() + 1); break;
                default:
                    const days = parseInt(durationType);
                    if (!isNaN(days)) newEndDate.setDate(newEndDate.getDate() + days);
                    break;
            }
        }
        bookingState.endDate = newEndDate.getTime();
        const endDateContainer = document.getElementById('end-date-container');
        if (durationType !== 'daily' && endDateContainer) {
            endDateContainer.innerHTML = `<span class="text-primary-500 font-bold">${formatDateTime(bookingState.endDate)}</span>`;
        }
        if (bookingState.endDate >= bookingState.startDate) {
            const timeDiff = bookingState.endDate - bookingState.startDate;
            const totalDays = Math.max(1, Math.ceil(timeDiff / (1000 * 3600 * 24)));
            if (durationInfoText) {
                durationInfoText.textContent = `Total duration: ${totalDays} day(s)`;
            }
        } else {
             if (durationInfoText) durationInfoText.textContent = '';
        }
        const totals = await calculateBookingTotals();
        if (priceSummary) priceSummary.textContent = `Total: $${totals.finalPrice.toFixed(2)}`;
        const isFormValid = bookingState.duration && bookingState.endDate >= bookingState.startDate;
        if (nextBtn) {
            nextBtn.disabled = !isFormValid;
            nextBtn.style.opacity = isFormValid ? '1' : '0.5';
        }
    };
    modalContent.addEventListener('change', e => {
        if (e.target.matches('#start-date, #start-time, #end-date')) {
            updateAndValidate();
        }
    });
    modalContent.querySelectorAll('.sp-duration-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            modalContent.querySelectorAll('.sp-duration-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            bookingState.duration = btn.dataset.duration;
            renderBookingStep(); 
        });
    });
    if (bookingState.duration) updateAndValidate();
}

// --- START: MODIFIED addConfirmationStepLogic ---
async function updateConfirmationSummary() {
    const totals = await calculateBookingTotals();
    const priceSummary = document.getElementById('total-price-summary');
    if (priceSummary) {
        priceSummary.textContent = `Total: $${totals.finalPrice.toFixed(2)}`;
    }
    if (bookingState.totalPrice > 0) {
        convertCurrencyAndUpdateUI(bookingState.totalPrice);
    } else {
        const idrPriceElement = document.getElementById('total-price-summary-idr');
        const statusElement = document.getElementById('currency-conversion-status');
        if(idrPriceElement) idrPriceElement.textContent = '';
        if(statusElement) statusElement.textContent = '';
    }
}

function addConfirmationStepLogic() {
    const applyVoucherBtn = document.getElementById('apply-voucher-btn');
    const voucherInput = document.getElementById('voucher-code-input');
    const voucherMessage = document.getElementById('voucher-message');

    // Initial call to load summary and start conversion
    updateConfirmationSummary();

    applyVoucherBtn.addEventListener('click', async () => {
        const voucherCode = voucherInput.value.trim().toUpperCase();
        if (!voucherCode) {
            voucherMessage.innerHTML = `<span class="text-danger-500">Please enter a voucher code.</span>`;
            return;
        }
        const voucherSnapshot = await db.ref(`vouchers/${voucherCode}`).once('value');
        const voucherData = voucherSnapshot.val();
        if (voucherData?.active) {
            bookingState.voucher = voucherData;
            voucherMessage.innerHTML = `<span class="text-success-500">Voucher '${voucherCode}' applied!</span>`;
        } else {
            delete bookingState.voucher;
            voucherMessage.innerHTML = `<span class="text-danger-500">Invalid or expired voucher code.</span>`;
        }
        // Refresh the step to recalculate totals and update the display
        renderBookingStep(); 
    });
    document.querySelectorAll('.sp-payment-option input').forEach(radio => {
        radio.addEventListener('change', e => bookingState.paymentMethod = e.target.value);
    });
    document.getElementById('booking-notes')?.addEventListener('input', e => bookingState.notes = e.target.value);
}
// --- END: MODIFIED addConfirmationStepLogic ---

function addStepLogic() {
    switch(bookingState.step) {
        case 1: addDurationStepLogic(); break;
        case 2: addServiceStepLogic(); break;
        case 3: addConfirmationStepLogic(); break;
    }
}

async function renderPickupDetailsModal() {
  const content = `
    <div id="sp-pickup-modal-content" class="sp-pickup-modal-content">
      <div class="sp-pickup-modal-header">
        <h3 class="modal-title">Pickup Details</h3>
        <button class="sp-pickup-close-btn">&times;</button>
      </div>
      <div class="sp-pickup-modal-body">
        <div class="sp-bookings-flow-input-group">
          <label>Pickup Address</label>
          <input type="text" id="sp-pickup-address" class="sp-input-field" value="${bookingState.pickupAddress || ''}" placeholder="Enter your address">
        </div>
        <button id="sp-use-my-location-btn" class="sp-pickup-btn"><i class="fas fa-crosshairs"></i> Use My Location</button>
        <div class="sp-bookings-flow-input-group mt-1-5">
          <label>Contact Number</label>
          <input type="tel" id="sp-contact-number" class="sp-input-field" value="${bookingState.contactNumber || ''}" placeholder="Enter phone number">
        </div>
        <div id="sp-pickup-map" class="sp-map-container" style="height: 250px; width: 100%; background-color: #e0e0e0; margin-top: 1rem;"></div>
      </div>
      <div class="sp-pickup-modal-footer">
        <button id="sp-confirm-pickup-btn" class="sp-pickup-btn-primary" disabled>Confirm Pickup Details</button>
      </div>
    </div>
  `;
  showModal('sp-pickup-modal', content, true);
  setTimeout(addPickupDetailsModalLogic, 100);
}

function addPickupDetailsModalLogic() {
  const modal = document.getElementById('sp-pickup-modal');
  if(!modal) return;
  if (!window.isGoogleMapsReady) {
    console.error("Google Maps script is not loaded yet.");
    showToast("Map feature is unavailable. Please try again later.", "error");
    return;
  }
  const confirmBtn = document.getElementById('sp-confirm-pickup-btn');
  const pickupAddressInput = document.getElementById('sp-pickup-address');
  const contactNumberInput = document.getElementById('sp-contact-number');
  if (!mapsApiStyleInjected) {
    const style = document.createElement('style');
    style.textContent = `.pac-container { z-index: 10000 !important; }`;
    document.head.appendChild(style);
    mapsApiStyleInjected = true;
  }
  const validateInputs = () => {
    const isFormValid = pickupAddressInput.value.trim() && contactNumberInput.value.trim() && bookingState.geolocation;
    if(confirmBtn) {
        confirmBtn.disabled = !isFormValid;
        confirmBtn.style.opacity = isFormValid ? '1' : '0.5';
    }
  };
  const handleAddressUpdate = (address, location) => {
    pickupAddressInput.value = address;
    bookingState.pickupAddress = address;
    bookingState.geolocation = { latitude: location.lat(), longitude: location.lng() };
    validateInputs();
  };
  pickupAddressInput.addEventListener('input', () => {
      bookingState.pickupAddress = pickupAddressInput.value;
      validateInputs();
  });
  contactNumberInput.addEventListener('input', () => {
      bookingState.contactNumber = contactNumberInput.value;
      validateInputs();
  });
  const mapCanvas = document.getElementById("sp-pickup-map");
  const firstLocationId = Object.keys(bookingState.locationsToBook)[0];
  const locationData = bookingState.locationsToBook[firstLocationId].locationData;
  const initialPosition = bookingState.geolocation 
      ? { lat: bookingState.geolocation.latitude, lng: bookingState.geolocation.longitude } 
      : { lat: locationData.geolocation.latitude, lng: locationData.geolocation.longitude };
  mapInstance = new google.maps.Map(mapCanvas, { center: initialPosition, zoom: 12, streetViewControl: false, mapTypeControl: false });
  google.maps.event.trigger(mapInstance, 'resize');
  mapInstance.setCenter(initialPosition);
  mapMarker = new google.maps.Marker({ map: mapInstance, position: initialPosition, draggable: true });
  mapMarker.addListener('dragend', () => {
    const newPosition = mapMarker.getPosition();
    if (!geocoder) geocoder = new google.maps.Geocoder();
    geocoder.geocode({ 'location': newPosition }, (results, status) => {
      if (status === 'OK' && results[0]) {
        handleAddressUpdate(results[0].formatted_address, newPosition);
        showToast('Address updated from marker.', 'info');
      } else {
        showToast('Could not find address for location.', 'error');
      }
    });
  });
  pickupAutocomplete = new google.maps.places.Autocomplete(pickupAddressInput);
  pickupAutocomplete.bindTo('bounds', mapInstance);
  pickupAutocomplete.addListener('place_changed', () => {
    const place = pickupAutocomplete.getPlace();
    if (place.geometry) {
      mapInstance.setCenter(place.geometry.location);
      mapInstance.setZoom(17);
      mapMarker.setPosition(place.geometry.location);
      handleAddressUpdate(place.formatted_address || place.name, place.geometry.location);
    } else {
      showToast('Address not found.', 'error');
    }
  });
  document.getElementById('sp-use-my-location-btn').addEventListener('click', () => {
    if (navigator.geolocation) {
      showLoader(true, 'Detecting location...');
      navigator.geolocation.getCurrentPosition(pos => {
        const userGoogleLocation = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        mapInstance.setCenter(userGoogleLocation);
        mapInstance.setZoom(17);
        mapMarker.setPosition(userGoogleLocation);
        if (!geocoder) geocoder = new google.maps.Geocoder();
        geocoder.geocode({ 'location': userGoogleLocation }, (results, status) => {
          showLoader(false);
          if (status === 'OK' && results[0]) {
            handleAddressUpdate(results[0].formatted_address, userGoogleLocation);
            showToast('Location updated.', 'success');
          } else {
            showToast('Could not find address for your location.', 'error');
          }
        });
      }, () => {
        showToast('Could not detect location.', 'error');
        showLoader(false);
      });
    } else {
        showToast('Geolocation is not supported by this browser.', 'error');
    }
  });
  validateInputs();
  confirmBtn.addEventListener('click', async () => {
    hideModal('sp-pickup-modal');
    await updateBookingSummary();
    renderBookingStep();
  });
  modal.querySelector('.sp-pickup-close-btn').addEventListener('click', () => {
    hideModal('sp-pickup-modal');
    bookingState.step = 2;
    renderBookingStep();
  });
}

export function renderBookingFlowModal(restoredState = null) {
  if (restoredState) {
    bookingState = { ...restoredState };
  } else if (Object.keys(globalCart).length > 0) {
    const startDate = new Date();
    startDate.setHours(startDate.getHours() + 1, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    bookingState = {
      step: 1, startDate: startDate.getTime(), endDate: endDate.getTime(), duration: null,
      totalPrice: 0, totalItems: 0, locationsToBook: globalCart, paymentMethod: 'on_site',
      serviceType: 'self-dropoff', notes: ''
    };
  } else {
    showToast('Please select a storage unit to book.', 'error');
    return;
  }
  showModal('booking-flow-modal', `<div class="modal-content"><div class="loader"></div></div>`);
  renderBookingStep();
  const modal = document.getElementById('booking-flow-modal');
  modal.addEventListener('click', e => {
    const target = e.target;
    if (target.closest('.close-modal-btn')) {
      hideModal('booking-flow-modal');
    } else if (target.closest('.back-step-btn')) {
      if (bookingState.step > 1) {
        bookingState.step--;
        renderBookingStep();
      }
    } else if (target.closest('#next-step-btn')) {
        if (bookingState.step === 2 && bookingState.serviceType === 'pickup') {
            bookingState.step++; 
            renderPickupDetailsModal();
        } else if (bookingState.step < 3) {
            bookingState.step++;
            renderBookingStep();
        }
    } else if (target.closest('#login-to-book-btn')) {
        sessionStorage.setItem('pendingBooking', JSON.stringify(bookingState));
        hideModal('booking-flow-modal');
        window.location.hash = '#/auth';
    } else if (target.closest('#confirm-book-btn')) {
        handleConfirmBooking();
    }
  });
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

function generateInvoiceHtml(booking, userData) {
    const invoiceNumber = `SP-${booking.id.slice(-8).toUpperCase()}`;
    const base64Logo = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=`; 
    return `
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Invoice ${invoiceNumber}</title>
    <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;background-color:#F8FAFC;}.invoice-container{max-width:800px;margin:2rem auto;background-color:#fff;padding:2.5rem;border-radius:1rem;box-shadow:0 10px 15px -3px rgba(0,0,0,.08);border:1px solid #e2e8f0}.invoice-header{display:flex;justify-content:space-between;align-items:center;padding-bottom:1.5rem;border-bottom:2px solid #DBEAFE}.logo{max-width:160px}.company-info{text-align:right;font-size:.9em}.company-info h1{color:#1D4ED8;font-size:2em;margin:0 0 5px}.company-info p{margin:0;color:#64748B}.details-section{display:flex;justify-content:space-between;margin:2rem 0}.details-section div{flex-basis:48%}.details-section h2{font-size:1.3em;color:#1E293B;margin-bottom:1rem;border-bottom:1px solid #E2E8F0;padding-bottom:.5rem}.details-section p{margin:5px 0;font-size:.95em}.invoice-table{width:100%;border-collapse:collapse;margin-bottom:2rem}.invoice-table th,.invoice-table td{padding:12px 15px;text-align:left;border-bottom:1px solid #e2e8f0}.invoice-table th{background-color:#3B82F6;color:#fff;font-weight:600;text-transform:uppercase;font-size:.85em}.invoice-table tr:nth-child(even){background-color:#F8FAFC}.totals-section{display:flex;justify-content:flex-end;margin-bottom:2rem}.totals-table{width:40%}.totals-table td{padding:8px;text-align:right}.totals-table tr.total-due td{font-weight:700;font-size:1.3em;color:#1D4ED8;border-top:2px solid #3B82F6}.payment-info{padding:1.5rem;background-color:#EFF6FF;border-radius:.75rem;border:1px solid #DBEAFE}.footer{text-align:center;margin-top:3rem;padding-top:1.5rem;border-top:1px dashed #CBD5E1;font-size:.85em;color:#64748B}@media print{body{background-color:#fff}.invoice-container{box-shadow:none;border:none;margin:0;padding:0}}</style></head>
    <body><div class="invoice-container"><div class="invoice-header"><img src="${base64Logo}" alt="Logo" class="logo"><div class="company-info"><h1>INVOICE</h1><p>Storapedia Inc.</p><p>Bali, Indonesia</p></div></div>
    <div class="details-section"><div><h2>BILL TO</h2><p><strong>${userData?.name || 'Customer'}</strong></p><p>${userData?.email || 'N/A'}</p><p>${booking.serviceType === 'pickup' ? booking.pickupAddress || '' : ''}</p></div><div><h2>DETAILS</h2><p><strong>Invoice No:</strong> ${invoiceNumber}</p><p><strong>Date:</strong> ${new Date().toLocaleDateString('en-GB')}</p><p><strong>Due Date:</strong> ${new Date(booking.endDate).toLocaleDateString('en-GB')}</p></div></div>
    <table class="invoice-table"><thead><tr><th>Description</th><th>Duration</th><th>Unit Price</th><th>Total</th></tr></thead><tbody><tr><td>${booking.storageType} at ${booking.locationName}</td><td>${booking.duration}</td><td>$${booking.totalPrice.toFixed(2)}</td><td>$${booking.totalPrice.toFixed(2)}</td></tr>
    ${booking.pickupFee > 0 ? `<tr><td>Pickup Fee</td><td>-</td><td>$${booking.pickupFee.toFixed(2)}</td><td>$${booking.pickupFee.toFixed(2)}</td></tr>` : ''}
    ${booking.discountApplied ? `<tr><td>Discount (${booking.voucherCode})</td><td>-</td><td style="color:green;">-$${(booking.totalPrice * (booking.discountApplied / (100-booking.discountApplied))).toFixed(2)}</td><td style="color:green;">-$${(booking.totalPrice * (booking.discountApplied / (100-booking.discountApplied))).toFixed(2)}</td></tr>` : ''}
    </tbody></table><div class="totals-section"><table class="totals-table"><tbody><tr class="total-due"><td style="text-align:left;">TOTAL DUE</td><td>$${booking.totalPrice.toFixed(2)}</td></tr></tbody></table></div>
    <div class="payment-info"><h3>Payment Information</h3><p><strong>Method:</strong> ${booking.paymentMethod.replace(/_/g, ' ').toUpperCase()}</p><p><strong>Status:</strong> ${booking.paymentStatus.replace(/_/g, ' ').toUpperCase()}</p></div>
    <div class="footer"><p>Thank you for choosing Storapedia!</p></div></div></body></html>
    `;
}

export async function renderReviewModal(booking) {
    const modalId = 'review-modal';
    const content = `
        <div class="modal-header">
            <h3 class="modal-title">Write a Review for ${booking.locationName}</h3>
            <button class="close-modal-btn" data-modal-id="${modalId}">&times;</button>
        </div>
        <div class="modal-body">
            <h4 class="mt-1-5">Your Rating</h4>
            <div class="rating-input">
                ${[...Array(5)].map((_, i) => `<span data-rating="${i + 1}" class="star">&#9733;</span>`).join('')}
            </div>
            <input type="hidden" id="review-rating" value="0">
            <h4 class="mt-1-5">Your Review</h4>
            <textarea id="review-comment" class="sp-input-field" rows="5" placeholder="Share details of your own experience at this place..."></textarea>
        </div>
        <div class="modal-footer">
            <button id="submit-review-btn" class="btn btn-primary btn-full">Submit Review</button>
        </div>
    `;
    showModal(modalId, content);
    const modal = document.getElementById(modalId);
    const stars = modal.querySelectorAll('.rating-input .star');
    const ratingInput = modal.querySelector('#review-rating');
    const updateStars = (rating) => {
        stars.forEach((s, i) => s.style.color = i < rating ? '#FFD700' : '#ccc');
    };
    stars.forEach(star => {
        star.addEventListener('mouseover', () => updateStars(parseInt(star.dataset.rating)));
        star.addEventListener('mouseout', () => updateStars(parseInt(ratingInput.value)));
        star.addEventListener('click', () => {
            ratingInput.value = star.dataset.rating;
            updateStars(parseInt(ratingInput.value));
        });
    });
    modal.querySelector('#submit-review-btn').addEventListener('click', async () => {
        const rating = parseInt(ratingInput.value);
        const comment = modal.querySelector('#review-comment').value.trim();
        if (rating === 0) {
            showToast('Please provide a star rating.', 'error');
            return;
        }
        if (comment.length < 10) {
            showToast('Please write a more detailed review.', 'error');
            return;
        }
        showLoader(true, 'Submitting your review...');
        try {
            const user = getCurrentUser();
            await submitReview(booking.locationId, booking.id, {
                userId: user.uid, rating, comment,
                name: user.displayName || 'Anonymous',
                timestamp: Date.now()
            });
            showToast('Review submitted successfully!', 'success');
            hideModal(modalId);
        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            showLoader(false);
        }
    });
}

export async function renderRequestPickupModal(booking) {
    const modalId = 'request-pickup-modal';
    const now = new Date();
    const minPickupTime = new Date(Math.max(now.getTime(), booking.createdAt) + 3 * 60 * 60 * 1000);
    const minTime = minPickupTime.toTimeString().slice(0, 5);
    const content = `
        <div class="modal-header">
            <h3>Request Pickup Time</h3>
            <button class="close-modal-btn" data-modal-id="${modalId}">&times;</button>
        </div>
        <div class="modal-body">
            <p>Select a time for pickup. The earliest available time is 3 hours after booking.</p>
            <input type="time" id="pickup-time-input" class="sp-input-field" min="${minTime}">
        </div>
        <div class="modal-footer">
            <button id="confirm-pickup-request-btn" class="btn btn-primary btn-full">Confirm Request</button>
        </div>
    `;
    showModal(modalId, content);
    document.getElementById('confirm-pickup-request-btn').addEventListener('click', async () => {
        const pickupTime = document.getElementById('pickup-time-input').value;
        if (!pickupTime) {
            showToast('Please select a valid time.', 'error');
            return;
        }
        showLoader(true, 'Sending pickup request...');
        try {
            const user = getCurrentUser();
            await requestPickup(booking.locationId, booking.id, {
                userId: user.uid, pickupTime, status: 'requested',
                pickupAddress: booking.pickupAddress, locationName: booking.locationName,
                timestamp: Date.now()
            });
            showToast('Pickup request sent successfully!', 'success');
            hideModal(modalId);
        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            showLoader(false);
        }
    });
}

export async function renderAddInventoryModal(booking) {
    showToast("Inventory management is not yet implemented.", "info");
}

export async function renderExtendBookingModal(booking) {
    showToast("Booking extension is not yet implemented.", "info");
}

export async function renderPayToCheckInModal(booking) {
    const modalId = 'pay-checkin-modal';
    const content = `
        <div class="modal-header">
            <h3>Pay to Check In</h3>
            <button class="close-modal-btn" data-modal-id="${modalId}">&times;</button>
        </div>
        <div class="modal-body">
            <p><strong>Total Amount Due:</strong> $${booking.totalPrice.toFixed(2)}</p>
            <p>Complete payment to finalize your check-in.</p>
        </div>
        <div class="modal-footer">
            <button id="pay-online-btn" class="btn btn-primary btn-full">Pay Online Now</button>
        </div>
    `;
    showModal(modalId, content);
    document.getElementById('pay-online-btn').addEventListener('click', async () => {
        showLoader(true, 'Redirecting to payment gateway...');
        try {
            const user = getCurrentUser();
            const userData = await fetchUserData(user.uid);
            await createIpaymuInvoice({
                id: booking.orderId || booking.id, totalPrice: booking.totalPrice,
                userEmail: userData.email, userName: userData.name
            });
            hideModal(modalId);
        } catch (error) {
            showToast(`Payment failed: ${error.message}`, 'error');
            showLoader(false);
        }
    });
}

export async function renderBookingDetailsModal(booking) {
    const modalId = 'booking-details-modal';
    const content = `
        <div class="modal-header">
            <h3>Booking Details</h3>
            <button class="close-modal-btn" data-modal-id="${modalId}">&times;</button>
        </div>
        <div class="modal-body">
            <div class="booking-detail-card">
                <p><strong>Booking ID:</strong> ${booking.id}</p>
                <p><strong>Location:</strong> ${booking.locationName}</p>
                <p><strong>Status:</strong> <span class="booking-status-badge status-${booking.bookingStatus}">${booking.bookingStatus.replace(/_/g, ' ')}</span></p>
                <p><strong>Total Price:</strong> $${booking.totalPrice.toFixed(2)}</p>
                <p><strong>Payment:</strong> ${booking.paymentStatus.replace(/_/g, ' ')} via ${booking.paymentMethod.replace(/_/g, ' ')}</p>
            </div>
             <div class="booking-detail-card">
                <h4 class="booking-details-title">QR Code</h4>
                <div class="booking-qrcode-container" id="qrcode-container"></div>
                <p class="booking-qrcode-caption">Show this code to staff for verification.</p>
            </div>
        </div>
        <div class="modal-footer">
             <button id="download-invoice-btn" data-action="download_invoice" class="btn btn-secondary">Download Invoice</button>
        </div>
    `;
    showModal(modalId, content);
    new QRCode(document.getElementById("qrcode-container"), {
        text: booking.id, width: 128, height: 128,
        correctLevel: QRCode.CorrectLevel.H
    });
    document.getElementById('download-invoice-btn').addEventListener('click', () => {
        renderInvoiceViewer(booking);
    });
}