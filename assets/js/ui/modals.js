import { getStarRatingHTML } from './components.js';
import { showModal, hideModal, showToast, showLoader } from './ui-helpers.js';
import { getCurrentUser } from '../services/auth.js';
import { db } from '../firebase-init.js';
import { createIpaymuInvoice } from '../services/payment-handler.js';
import { createNewBooking, fetchUserData, requestPickup, updateBookingStatus, fetchStorageLocationData, fetchCourierData } from '../services/firebase-api.js';

let bookingState = {};
let globalCart = {};
let mapInstance = null;
let mapMarker = null;
let autocomplete = null;
let geocoder = null;
let mapsApiStyleInjected = false;

const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString('en-US', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
    });
};

const getCheapestPrice = (locationData) => {
    if (!locationData.categories || locationData.categories.length === 0) return Infinity;
    return locationData.categories
        .flatMap(cat => cat.sizes || [])
        .flatMap(size => size.rates || [])
        .reduce((min, rate) => Math.min(min, rate.price), Infinity);
};

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
    bookingState.pickupFee = 0;
    bookingState.deliveryFee = 0;
    bookingState.pickupDistance = 0;
    bookingState.deliveryDistance = 0;

    if (!bookingState.duration) {
        return { subTotal: 0, pickupFee: 0, deliveryFee: 0, discountAmount: 0, finalPrice: 0, totalItems: 0 };
    }
    
    Object.values(bookingState.locationsToBook).forEach(loc => {
        loc.items.forEach(item => {
            const timeDiff = bookingState.endDate - bookingState.startDate;
            const totalDays = Math.max(1, Math.ceil(timeDiff / (1000 * 3600 * 24)));
            let itemPrice = 0;
            if (bookingState.duration.toLowerCase() === 'daily') {
                const dailyRate = item.size.rates.find(r => r.duration.toLowerCase() === 'daily');
                if (dailyRate) itemPrice = item.quantity * dailyRate.price * totalDays;
            } else {
                const rate = item.size.rates.find(r => r.duration === bookingState.duration);
                if (rate) itemPrice = item.quantity * rate.price;
            }
            subTotal += itemPrice;
            totalItems += item.quantity;
        });
    });

    const settingsSnapshot = await db.ref('settings').once('value');
    const settings = settingsSnapshot.val();

    if (bookingState.serviceType === 'pickup') {
        const pickupResult = await calculateServiceFee(bookingState.pickupGeolocation, settings);
        bookingState.pickupFee = pickupResult.fee;
        bookingState.pickupDistance = pickupResult.distance;
    }
    if (bookingState.needsDelivery) {
        const deliveryResult = await calculateServiceFee(bookingState.deliveryGeolocation, settings);
        bookingState.deliveryFee = deliveryResult.fee;
        bookingState.deliveryDistance = deliveryResult.distance;
    }

    const totalServiceFee = bookingState.pickupFee + bookingState.deliveryFee;
    const priceBeforeDiscount = subTotal + totalServiceFee;
    let discountAmount = 0;
    if (bookingState.voucher?.discount_percent > 0) {
        discountAmount = priceBeforeDiscount * (bookingState.voucher.discount_percent / 100);
    }
    
    const finalPrice = priceBeforeDiscount - discountAmount;
    
    bookingState.subTotal = subTotal;
    bookingState.totalPrice = finalPrice;
    bookingState.totalItems = totalItems;

    return { subTotal, pickupFee: bookingState.pickupFee, deliveryFee: bookingState.deliveryFee, discountAmount, finalPrice, totalItems };
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

function getServiceStepHTML() {
  const isPickup = bookingState.serviceType === 'pickup';
  return `
    <style>
        .highlight-blink {
            animation: blinker 1s linear infinite;
        }
        @keyframes blinker {
            50% { opacity: 0; }
        }
    </style>
    <div class="sp-bookings-flow-header">
      <h3 class="modal-title">1. Choose Service</h3>
      <button class="close-modal-btn">&times;</button>
    </div>
    <div class="sp-bookings-flow-body">
      <p class="text-sm mb-1">How would you like to handle your items?</p>
      <div class="sp-service-type-toggle sp-service-type-toggle-vertical">
        <button type="button" data-service="self-dropoff" class="${!isPickup ? 'active' : ''}" style="padding-top: 10px;">Self Drop-off</button>
        <button type="button" data-service="pickup" class="${isPickup ? 'active' : ''}" style="padding-top: 10px;">Pickup Service</button>
      </div>
      
      <div id="sp-pickup-service-options" style="display: ${isPickup ? 'block' : 'none'};">
          <div class="sp-confirmation-summary mt-1">
              <h4 class="mt-0 mb-1">Pickup Details</h4>
              <p class="no-margin text-sm text-gray-700"><b>Address:</b> ${bookingState.pickupAddress || 'Not set'}</p>
              <p class="no-margin text-sm text-gray-700"><b>Phone:</b> ${bookingState.contactNumber || 'Not set'}</p>
              <button data-address-type="pickup" class="btn btn-primary btn-sm mt-1">${bookingState.pickupAddress ? 'Edit Details' : 'Set Pickup Details'}</button>
              <div class="sp-bookings-flow-input-group mt-1">
                  <label for="pickup-time-input">Pickup Time</label>
                  <input type="time" id="pickup-time-input" class="sp-input-field" value="${bookingState.pickupTime || ''}">
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
                  <input type="time" id="delivery-time-input" class="sp-input-field" value="${bookingState.deliveryTime || ''}">
              </div>
          </div>
      </div>
      <div id="validation-message" class="text-sm text-danger-500 text-center mt-1"></div>
      <div class="sp-summary-section">
        <h4 class="mt-1-5 mb-1">Booking Summary</h4>
        <div id="sp-editable-summary-list"></div>
      </div>
    </div>
    <div class="sp-bookings-flow-footer">
      <button id="next-step-btn" class="btn btn-primary btn-full" disabled>Next</button>
    </div>
  `;
}

async function updateAndValidateServiceStep() {
    const nextBtn = document.getElementById('next-step-btn');
    const validationMessage = document.getElementById('validation-message');
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

function addServiceStepLogic() {
    const serviceTypeToggle = document.querySelector('.sp-service-type-toggle');
    const pickupOptions = document.getElementById('sp-pickup-service-options');
    const deliveryCheckbox = document.getElementById('needs-delivery-checkbox');
    const deliverySection = document.getElementById('sp-delivery-details-section');
    const pickupTimeInput = document.getElementById('pickup-time-input');
    const deliveryTimeInput = document.getElementById('delivery-time-input');

    const now = new Date();
    now.setHours(now.getHours() + 3);
    const minTime = now.toTimeString().slice(0, 5);
    pickupTimeInput.min = minTime;
    if (!bookingState.pickupTime || pickupTimeInput.value < minTime) {
        bookingState.pickupTime = minTime;
        pickupTimeInput.value = minTime;
    }

    serviceTypeToggle.addEventListener('click', e => {
        const btn = e.target.closest('button[data-service]');
        if(btn) {
            document.querySelectorAll('.sp-service-type-toggle button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            bookingState.serviceType = btn.dataset.service;
            pickupOptions.style.display = bookingState.serviceType === 'pickup' ? 'block' : 'none';
            if(bookingState.serviceType !== 'pickup') {
                bookingState.needsDelivery = false;
                deliveryCheckbox.checked = false;
                deliverySection.style.display = 'none';
            }
            updateAndValidateServiceStep();
        }
    });

    deliveryCheckbox.addEventListener('change', e => {
        bookingState.needsDelivery = e.target.checked;
        deliverySection.style.display = bookingState.needsDelivery ? 'block' : 'none';
        updateAndValidateServiceStep();
    });

    pickupTimeInput.addEventListener('change', () => {
        if (pickupTimeInput.value < minTime) {
            showToast(`Pickup time must be at least 3 hours from now.`, 'warning');
            pickupTimeInput.value = minTime;
        }
        bookingState.pickupTime = pickupTimeInput.value;
        updateAndValidateServiceStep();
    });

    deliveryTimeInput.addEventListener('change', () => {
        bookingState.deliveryTime = deliveryTimeInput.value;
        updateAndValidateServiceStep();
    });
    
    const pickupAddressButton = document.querySelector('button[data-address-type="pickup"]');
    if (pickupAddressButton) {
        pickupAddressButton.addEventListener('click', () => {
            renderAddressModal('pickup');
        });
    }

    const deliveryAddressButton = document.querySelector('button[data-address-type="delivery"]');
    if (deliveryAddressButton) {
        deliveryAddressButton.addEventListener('click', () => {
            renderAddressModal('delivery');
        });
    }
    updateAndValidateServiceStep();
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
    </div>
    <div class="sp-bookings-flow-footer">
      <div id="price-summary-container" style="display: none;"></div>
      <button id="next-step-btn" class="btn btn-primary btn-full" disabled>Next</button>
    </div>
  `;
}

function addDurationStepLogic() {
    const modalContent = document.querySelector('#booking-flow-modal .modal-content');
    if (!modalContent) return;
    const nextBtn = document.getElementById('next-step-btn');
    const updateAndValidate = async () => {
        const startDateInput = document.getElementById('start-date');
        const startTimeInput = document.getElementById('start-time');
        const endDateInput = document.getElementById('end-date');
        bookingState.startDate = new Date(`${startDateInput.value}T${startTimeInput.value}`).getTime();
        let newEndDate;
        const durationType = bookingState.duration?.toLowerCase();
        
        if (durationType === 'daily') {
            const endDateValue = endDateInput ? new Date(`${endDateInput.value}T${startTimeInput.value}`) : new Date(bookingState.startDate);
            if (endDateValue.getTime() <= bookingState.startDate) {
                endDateValue.setDate(new Date(bookingState.startDate).getDate() + 1);
                if (endDateInput) endDateInput.value = endDateValue.toISOString().split('T')[0];
            }
            newEndDate = endDateValue;
        } else {
            newEndDate = new Date(bookingState.startDate);
            switch (durationType) {
                case 'weekly': newEndDate.setDate(newEndDate.getDate() + 7); break;
                case 'monthly': newEndDate.setMonth(newEndDate.getMonth() + 1); break;
                default:
                    if (!isNaN(parseInt(durationType))) {
                        newEndDate.setDate(newEndDate.getDate() + parseInt(durationType));
                    }
                    break;
            }
            const endDateContainer = document.getElementById('end-date-container');
            if (endDateContainer) {
                endDateContainer.innerHTML = `<span class="text-primary-500 font-bold">${formatDateTime(newEndDate.getTime())}</span>`;
            }
        }
        
        bookingState.endDate = newEndDate.getTime();

        if (bookingState.endDate >= bookingState.startDate) {
            const timeDiff = bookingState.endDate - bookingState.startDate;
            const totalDays = Math.max(1, Math.ceil(timeDiff / (1000 * 3600 * 24)));
            const durationInfoText = document.getElementById('duration-info-text');
            if (durationInfoText) {
                durationInfoText.textContent = `Total duration: ${totalDays} day(s)`;
            }
        } else {
             const durationInfoText = document.getElementById('duration-info-text');
             if (durationInfoText) durationInfoText.textContent = '';
        }
        await updateBookingSummary();
        
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
    if (bookingState.duration) {
        updateAndValidate();
    } else {
        updateBookingSummary();
    }
}

function getConfirmationStepHTML(user) {
  const summary = bookingState;
  
  const itemsSummary = Object.values(summary.locationsToBook).flatMap(loc =>
    loc.items.map(item => `<p class="no-margin"><b>Item:</b> ${item.size.name} (${item.quantity}x) at ${loc.locationData.name} - ${summary.duration}</p>`)
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
      <div class="sp-confirmation-summary">
        ${itemsSummary}
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
      ${user ? '<button id="confirm-book-btn" class="btn btn-success btn-full">Confirm & Book</button>' : '<button id="login-to-book-btn" class="btn btn-primary btn-full">Login to Complete Booking</button>'}
    </div>
  `;
}

function addConfirmationStepLogic() {
    const applyVoucherBtn = document.getElementById('apply-voucher-btn');
    if (applyVoucherBtn) {
        applyVoucherBtn.addEventListener('click', async () => {
            const code = document.getElementById('voucher-code-input').value.trim().toUpperCase();
            const messageEl = document.getElementById('voucher-message');
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
            await updateBookingSummary();
        });
    }
    updateBookingSummary();
}

async function updateBookingSummary(hidePrice = false) {
    const summaryList = document.getElementById('sp-editable-summary-list');
    const priceSummaryContainer = document.getElementById('price-summary-container');
    
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

    let itemsSummaryHTML = '';
    Object.values(bookingState.locationsToBook).forEach(loc => {
        loc.items.forEach(item => {
            itemsSummaryHTML += `
                <div class="sp-summary-item-card">
                    <div>
                        <p class="font-semibold">${item.size.name} (${item.quantity}x)</p>
                        <p class="text-sm text-gray-600">at ${loc.locationData.name}</p>
                        ${bookingState.duration ? `<p class="mt-0-5 text-sm text-primary-500 font-bold">${bookingState.duration}</p>` : ''}
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit-summary-item" data-location-id="${loc.locationData.id}" data-category-name="${item.category.name}">Edit</button>
                </div>`;
        });
    });
    if (summaryList) summaryList.innerHTML = itemsSummaryHTML || '<p class="text-sm text-gray-500">No items selected.</p>';
}

function getPriceDetailsHTML(totals) {
    let html = `<div class="sp-price-details">Subtotal: $${totals.subTotal.toFixed(2)}</div>`;
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

function addStepLogic() {
    switch(bookingState.step) {
        case 1: addServiceStepLogic(); break;
        case 2: addDurationStepLogic(); break;
        case 3: addConfirmationStepLogic(); break;
    }
}

async function handleConfirmBooking() {
  const user = getCurrentUser();
  if (!user) { showToast('You must be logged in to book.', 'error'); return; }
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
    Object.values(bookingState.locationsToBook).forEach(loc => {
        loc.items.forEach(item => {
            const timeDiff = bookingState.endDate - bookingState.startDate;
            const totalDays = Math.max(1, Math.ceil(timeDiff / (1000 * 3600 * 24)));
            let itemPrice = 0;
            if (bookingState.duration.toLowerCase() === 'daily') {
                const rate = item.size.rates.find(r => r.duration.toLowerCase() === 'daily');
                if(rate) itemPrice = item.quantity * rate.price * totalDays;
            } else {
                const rate = item.size.rates.find(r => r.duration === bookingState.duration);
                if (rate) itemPrice = item.quantity * rate.price;
            }
            
            const proportion = totals.subTotal > 0 ? itemPrice / totals.subTotal : 1 / totals.totalItems;
            const itemPickupFee = (totals.pickupFee || 0) * proportion;
            const itemDeliveryFee = (totals.deliveryFee || 0) * proportion;
            const itemDiscount = (totals.discountAmount || 0) * proportion;
            const finalItemPrice = itemPrice + itemPickupFee + itemDeliveryFee - itemDiscount;

            const newBookingData = {
                orderId, userId: user.uid, locationId: loc.locationData.id, locationName: loc.locationData.name,
                category: item.category.name, storageType: item.size.name, quantity: item.quantity,
                duration: bookingState.duration, totalPrice: finalItemPrice, startDate: bookingState.startDate,
                endDate: bookingState.endDate, serviceType: bookingState.serviceType, paymentMethod,
                paymentStatus: paymentMethod === 'online' ? 'pending' : 'unpaid_on_site',
                bookingStatus: 'active', notes: bookingState.notes,
                needsDelivery: bookingState.needsDelivery || false,
            };

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
        });
    });
    
    const creationPromises = bookingsToCreate.map(b => createNewBooking(b));
    const createdBookings = await Promise.all(creationPromises);
    
    const pickupBookings = createdBookings.filter(b => b.serviceType === 'pickup');
    for (const booking of pickupBookings) {
        await requestPickup(booking.locationId, booking);
    }
    
    globalCart = {};
    bookingState = {};
    
if (paymentMethod === 'online') {
    showLoader(true, 'Converting currency for payment...');
    try {
        const amountInIDR = await getConvertedPrice(totals.finalPrice);
        const finalAmount = parseInt(amountInIDR, 10); 
        showLoader(true, 'Redirecting to payment gateway...');
        const paymentData = {
            id: orderId,
            totalPrice: finalAmount,
            userEmail: userData?.email || 'customer@example.com',
            userName: userData?.name || 'Customer'
        };
        await createIpaymuInvoice(paymentData);
    } catch (conversionError) {
        showLoader(false);
        showToast(conversionError.message, 'error');
    }
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

function renderBookingStep() {
    const user = getCurrentUser();
    let content = '';
    switch (bookingState.step) {
        case 1: content = getServiceStepHTML(); break;
        case 2: content = getDurationStepHTML(); break;
        case 3: content = getConfirmationStepHTML(user); break;
        default: hideModal('booking-flow-modal'); return;
    }
    const modalContent = document.querySelector('#booking-flow-modal .modal-content');
    if (modalContent) {
        modalContent.innerHTML = content;
        addStepLogic();
    }
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
      serviceType: 'self-dropoff', needsDelivery: false, notes: ''
    };
  } else {
    showToast('Please select a storage unit to book.', 'error');
    return;
  }
  showModal('booking-flow-modal', `<div class="modal-content"><div class="loader"></div></div>`);
  
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
        if (bookingState.step < 3) {
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

  renderBookingStep();
}

export async function renderLocationDetailModal(locationData, reviews) {
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
        quantitiesInPopup[size.name] = currentQty;
      }
    } else if (decreaseBtn) {
      const sizeName = decreaseBtn.dataset.sizeName;
      const size = category.sizes.find(s => s.name === sizeName);
      const display = modal.querySelector(`.quantity-display[data-size-name="${sizeName}"]`);
      let currentQty = quantitiesInPopup[sizeName] || 0;
      if (size && currentQty > 0) {
        currentQty--;
        if (display) display.textContent = currentQty;
        quantitiesInPopup[size.name] = currentQty;
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
      if (bookingState.step === 1 || bookingState.step === 2) {
        updateBookingSummary(bookingState.step === 1);
      }
    } else if (target.closest('.close-modal-btn')) {
      hideModal('category-detail-modal');
    }
  });
}

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

async function renderAddressModal(addressType) {
  const isPickup = addressType === 'pickup';
  const currentAddress = isPickup ? bookingState.pickupAddress : bookingState.deliveryAddress;
  const currentPhone = isPickup ? bookingState.contactNumber : bookingState.deliveryContactNumber;

  const content = `
    <div id="sp-address-modal-content" class="sp-pickup-modal-content">
      <div class="sp-pickup-modal-header">
        <h3 class="modal-title">Set ${isPickup ? 'Pickup' : 'Delivery'} Details</h3>
        <button class="sp-pickup-close-btn">&times;</button>
      </div>
      <div class="sp-pickup-modal-body">
        <div class="sp-bookings-flow-input-group">
          <label>${isPickup ? 'Pickup' : 'Delivery'} Address</label>
          <input type="text" id="sp-address-input" class="sp-input-field" value="${currentAddress || ''}" placeholder="Enter your address">
        </div>
        <div class="sp-bookings-flow-input-group mt-1">
          <label>Contact Phone Number</label>
          <input type="tel" id="sp-phone-input" class="sp-input-field" value="${currentPhone || ''}" placeholder="e.g., 08123456789">
        </div>
        <div id="sp-address-map" class="sp-map-container" style="height: 200px; width: 100%; background-color: #e0e0e0; margin-top: 1rem;"></div>
      </div>
      <div class="sp-pickup-modal-footer">
        <button id="sp-confirm-address-btn" class="sp-pickup-btn-primary" disabled>Confirm Details</button>
      </div>
    </div>
  `;
  showModal('sp-address-modal', content, true);
  setTimeout(() => addAddressModalLogic(addressType), 100);
}

function addAddressModalLogic(addressType) {
    const modal = document.getElementById('sp-address-modal');
    if (!modal || !window.isGoogleMapsReady) {
        showToast("Map feature is unavailable.", "error");
        return;
    }
    const confirmBtn = document.getElementById('sp-confirm-address-btn');
    const addressInput = document.getElementById('sp-address-input');
    const phoneInput = document.getElementById('sp-phone-input');
    let tempGeolocation = null;

    if (!mapsApiStyleInjected) {
        const style = document.createElement('style');
        style.textContent = `.pac-container { z-index: 10000 !important; }`;
        document.head.appendChild(style);
        mapsApiStyleInjected = true;
    }
    
    const validateInput = () => {
        const isValid = addressInput.value.trim() && phoneInput.value.trim() && tempGeolocation;
        if(confirmBtn) {
            confirmBtn.disabled = !isValid;
            confirmBtn.style.opacity = isValid ? '1' : '0.5';
        }
    };

    addressInput.addEventListener('input', validateInput);
    phoneInput.addEventListener('input', validateInput);

    const handleAddressUpdate = (address, location) => {
        addressInput.value = address;
        tempGeolocation = { latitude: location.lat(), longitude: location.lng() };
        validateInput();
    };

    const firstLocationId = Object.keys(bookingState.locationsToBook)[0];
    const locationData = bookingState.locationsToBook[firstLocationId].locationData;
    let initialPosition;
    if (addressType === 'pickup' && bookingState.pickupGeolocation) {
        initialPosition = { lat: bookingState.pickupGeolocation.latitude, lng: bookingState.pickupGeolocation.longitude };
    } else if (addressType === 'delivery' && bookingState.deliveryGeolocation) {
        initialPosition = { lat: bookingState.deliveryGeolocation.latitude, lng: bookingState.deliveryGeolocation.longitude };
    } else {
        initialPosition = { lat: locationData.geolocation.latitude, lng: locationData.geolocation.longitude };
    }
    if (initialPosition) tempGeolocation = { latitude: initialPosition.lat, longitude: initialPosition.lng };

    mapInstance = new google.maps.Map(document.getElementById("sp-address-map"), { center: initialPosition, zoom: 12, streetViewControl: false, mapTypeControl: false });
    mapMarker = new google.maps.Marker({ map: mapInstance, position: initialPosition, draggable: true });
    
    if (!geocoder) geocoder = new google.maps.Geocoder();
    
    mapMarker.addListener('dragend', () => {
        const newPosition = mapMarker.getPosition();
        geocoder.geocode({ 'location': newPosition }, (results, status) => {
            if (status === 'OK' && results[0]) {
                handleAddressUpdate(results[0].formatted_address, newPosition);
            }
        });
    });

    autocomplete = new google.maps.places.Autocomplete(addressInput);
    autocomplete.bindTo('bounds', mapInstance);
    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place.geometry) {
            mapInstance.setCenter(place.geometry.location);
            mapInstance.setZoom(17);
            mapMarker.setPosition(place.geometry.location);
            handleAddressUpdate(place.formatted_address || place.name, place.geometry.location);
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
        hideModal('sp-address-modal');
        renderBookingStep(); 
    });
    
    modal.querySelector('.sp-pickup-close-btn').addEventListener('click', () => hideModal('sp-address-modal'));
    validateInput();
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
        if (rating === 0) { showToast('Please provide a star rating.', 'error'); return; }
        if (comment.length < 10) { showToast('Please write a more detailed review.', 'error'); return; }
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

export async function renderAddInventoryModal(booking) {
    showToast("Inventory management is not yet implemented.", "info");
}

export async function renderExtendBookingModal(booking) {
    showLoader(true, 'Fetching data for extension...');
    const modalId = 'extend-booking-modal';
    const locationData = await fetchStorageLocationData(booking.locationId);
    if (!locationData) {
        showToast('Failed to get location data to calculate extension price.', 'error');
        showLoader(false);
        return;
    }
    const rates = locationData.categories.flatMap(cat => cat.sizes)
                             .find(size => size.name === booking.storageType)
                             ?.rates || [];
    
    showLoader(false);
    const originalEndDate = booking.endDate ? new Date(booking.endDate) : new Date(Date.now());
    const minEndDate = new Date(originalEndDate);
    minEndDate.setDate(minEndDate.getDate() + 1);
    const minEndDateString = minEndDate.toISOString().split('T')[0];

    const calculatePrice = (newDate) => {
        const diffTime = newDate.getTime() - originalEndDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const dailyRate = rates.find(r => r.duration === 'Daily')?.price || 0;
        const totalExtensionPrice = diffDays * dailyRate;
        return booking.totalPrice + totalExtensionPrice;
    };

    let newTotalPrice = calculatePrice(minEndDate);

    const content = `
        <div class="modal-header">
            <h3>Extend Booking for ${booking.storageType}</h3>
            <button class="close-modal-btn" data-modal-id="${modalId}">&times;</button>
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
    showModal(modalId, content);
    convertCurrencyAndUpdateUI(newTotalPrice, 'new-total-price-idr');

    const newEndDateInput = document.getElementById('new-end-date-input');
    const newTotalPriceUsdSpan = document.getElementById('new-total-price-usd');

    newEndDateInput.addEventListener('change', () => {
        const newSelectedDate = new Date(newEndDateInput.value);
        newTotalPrice = calculatePrice(newSelectedDate);
        newTotalPriceUsdSpan.textContent = `$${newTotalPrice.toFixed(2)}`;
        convertCurrencyAndUpdateUI(newTotalPrice, 'new-total-price-idr');
    });

    document.getElementById('confirm-extend-btn').addEventListener('click', async () => {
        showLoader(true, 'Processing extension...');
        try {
            const newEndDateTimestamp = new Date(newEndDateInput.value).getTime();
            showLoader(true, 'Converting currency for payment...');
            const amountInIDR = await getConvertedPrice(newTotalPrice);
            showLoader(true, 'Updating booking and redirecting to payment...');
            await updateBookingStatus(booking.id, 'extended', {
                endDate: newEndDateTimestamp,
                totalPrice: newTotalPrice,
                paymentStatus: 'pending',
            });
            const user = getCurrentUser();
            const userData = await fetchUserData(user.uid);
            await createIpaymuInvoice({
                id: booking.orderId || booking.id,
                totalPrice: amountInIDR,
                userEmail: userData.email,
                userName: userData.name
            });
            showToast('Booking successfully extended. Redirecting to online payment.', 'success');
            hideModal(modalId);
        } catch (error) {
            showToast(`Extension failed: ${error.message}`, 'error');
            showLoader(false);
        }
    });
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
            showLoader(true, 'Converting currency for payment...');
            const amountInIDR = await getConvertedPrice(booking.totalPrice);
            showLoader(true, 'Redirecting to payment gateway...');
            const user = getCurrentUser();
            const userData = await fetchUserData(user.uid);
            await createIpaymuInvoice({
                id: booking.orderId || booking.id,
                totalPrice: amountInIDR,
                userEmail: userData.email,
                userName: userData.name
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
    
    const user = getCurrentUser();
    let userData = null;
    if (user) {
        try {
            userData = await fetchUserData(user.uid);
        } catch(e) {
            console.error("Failed to fetch user data for modal", e);
        }
    }
    
    const formatAndRenderDetail = (label, value, convertValue = true) => {
        if (value) {
            const formattedValue = convertValue ? value.toString().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : value;
            return `<p class="booking-detail-item"><strong>${label}:</strong> ${formattedValue}</p>`;
        }
        return '';
    };

    let orderInfoHtml = `
        <div class="booking-detail-card">
            <h4 class="booking-details-title">Order Information</h4>
            <div class="booking-details-grid">
                ${formatAndRenderDetail('Booking ID', booking.id, false)}
                ${formatAndRenderDetail('Location', booking.locationName, false)}
                ${formatAndRenderDetail('Storage Type', booking.storageType, false)}
                ${formatAndRenderDetail('Category', booking.category, false)}
                ${formatAndRenderDetail('Duration', booking.duration, false)}
                ${formatAndRenderDetail('Status', `<span class="booking-status-badge status-${booking.bookingStatus || 'active'}">${(booking.bookingStatus || 'active').replace(/_/g, ' ')}</span>`, false)}
            </div>
        </div>
    `;

    let serviceTimingHtml = `
        <div class="booking-detail-card">
            <h4 class="booking-details-title">Service & Timing</h4>
            <div class="booking-details-grid">
                ${formatAndRenderDetail('Service Type', booking.serviceType)}
                ${formatAndRenderDetail('Booking Date', formatDate(booking.startDate), false)}
                ${formatAndRenderDetail('End Date', formatDate(booking.endDate), false)}
                ${formatAndRenderDetail('Booked On', formatDateTime(booking.createdAt), false)}
                ${formatAndRenderDetail('Checked In', formatDateTime(booking.checkInTime), false)}
                ${formatAndRenderDetail('Checked Out', formatDateTime(booking.checkOutTime), false)}
            </div>
        </div>
    `;

    let pickupDetailsHtml = '';
    if (booking.serviceType === 'pickup' && (booking.pickupAddress || booking.pickupTime || booking.pickupStatus)) {
        let courierInfo = '';
        if (booking.courierId && booking.courierName) {
            courierInfo = `
                ${formatAndRenderDetail('Courier Name', booking.courierName, false)}
            `;
        }
        pickupDetailsHtml = `
            <div class="booking-detail-card">
                <h4 class="booking-details-title">Pickup Details</h4>
                <div class="booking-details-grid">
                    ${formatAndRenderDetail('Pickup Status', booking.pickupStatus)}
                    ${formatAndRenderDetail('Pickup Address', booking.pickupAddress, false)}
                    ${formatAndRenderDetail('Pickup Time', booking.pickupTime, false)}
                    ${courierInfo}
                    ${formatAndRenderDetail('Contact Number', booking.contactNumber, false)}
                </div>
            </div>
        `;
    }

    let deliveryDetailsHtml = '';
    if (booking.needsDelivery) {
        deliveryDetailsHtml = `
            <div class="booking-detail-card">
                <h4 class="booking-details-title">Delivery Details</h4>
                <div class="booking-details-grid">
                    ${formatAndRenderDetail('Delivery Status', booking.deliveryStatus)}
                    ${formatAndRenderDetail('Delivery Address', booking.deliveryAddress, false)}
                    ${formatAndRenderDetail('Delivery Time', booking.deliveryTime, false)}
                    ${formatAndRenderDetail('Contact Number', booking.deliveryContactNumber, false)}
                </div>
            </div>
        `;
    }

    let paymentInfoHtml = `
        <div class="booking-detail-card">
            <h4 class="booking-details-title">Payment Information</h4>
            <div class="booking-details-grid">
                ${formatAndRenderDetail('Total Price', `$${booking.totalPrice.toFixed(2)}`, false)}
                ${formatAndRenderDetail('Payment Status', booking.paymentStatus)}
                ${formatAndRenderDetail('Payment Method', booking.paymentMethod)}
                ${formatAndRenderDetail('Voucher', booking.voucherCode, false)}
                ${formatAndRenderDetail('Discount', booking.discountApplied ? `${booking.discountApplied}%` : '', false)}
            </div>
        </div>
    `;

    let securityInfoHtml = '';
    if (booking.sealNumber || booking.sealPhotoUrl || booking.id) {
        securityInfoHtml = `
            <div class="booking-detail-card">
                <h4 class="booking-details-title">Security Information</h4>
                <div style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 1rem;">
                    ${formatAndRenderDetail('Seal Code', booking.sealNumber, false)}
                    ${booking.sealPhotoUrl ? `<img src="${booking.sealPhotoUrl}" alt="Seal Photo" style="max-width: 200px; border-radius: 0.5rem;">` : ''}
                    <div class="booking-qrcode-container" id="qrcode-container"></div>
                </div>
            </div>
        `;
    }
    
    let actionsHtml = getBookingCardActionButtons(booking);

    const modalContent = `
        <div class="modal-content-inner">
            <div class="booking-details-modal-header">
                <h3 class="modal-title">Booking Details</h3>
                <button type="button" class="close-modal-btn">&times;</button>
            </div>
            <div class="booking-details-modal-body">
                ${orderInfoHtml}
                ${serviceTimingHtml}
                ${pickupDetailsHtml}
                ${deliveryDetailsHtml}
                ${paymentInfoHtml}
                ${securityInfoHtml}
            </div>
            <div class="modal-footer">
                ${actionsHtml}
            </div>
        </div>
    `;

    showModal(modalId, modalContent);

    const qrcodeContainer = document.getElementById("qrcode-container");
    if (qrcodeContainer && typeof QRCode !== 'undefined') {
        new QRCode(qrcodeContainer, {
            text: booking.id, width: 128, height: 128,
            colorDark: "#000000", colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    document.querySelectorAll('#' + modalId + ' .modal-footer button[data-action]').forEach(button => {
        button.addEventListener('click', async (event) => {
            const action = event.target.dataset.action;
            
            showLoader(true, `Performing action: ${action}...`);
            try {
                if (action === 'download-invoice') {
                    await downloadInvoice(booking);
                } else if (action === 'review') {
                    renderReviewModal(booking);
                }
            } catch (error) {
                console.error(`Error performing ${action}:`, error);
                showToast(`Failed to perform action "${action}". Please try again.`, 'error');
            } finally {
                showLoader(false);
                hideModal(modalId);
            }
        });
    });
}
