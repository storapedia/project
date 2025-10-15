import { showLoader, showToast } from '../ui/ui-helpers.js';
import { listenForUserBookings, updateBookingStatus, fetchUserData, submitReview, requestPickup, fetchStorageLocationData, fetchCourierData, sendMessageToCourierAndAdmin } from '../services/firebase-api.js';
import { getCurrentUser } from '../services/auth.js';
import { createIpaymuInvoice } from '../services/payment-handler.js';
import { renderPayToCheckInModal, renderExtendBookingModal, renderReviewModal, generateInvoiceHtml } from '../ui/modals.js';

let bookingsListener = null;

const formatDate = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * Formats the creation date of the booking into a relative or absolute string.
 * @param {number} timestamp - The creation timestamp of the booking.
 * @returns {string} Formatted date string (e.g., "Today", "Yesterday", "15 Sep 2025").
 */
const formatBookingCreationDate = (timestamp) => {
    if (!timestamp) return 'Unknown date';

    const now = new Date();
    const bookingDate = new Date(timestamp);

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    if (bookingDate >= startOfToday) {
        return 'Today';
    } else if (bookingDate >= startOfYesterday) {
        return 'Yesterday';
    } else {
        return bookingDate.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }
};

const formatDateTime = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

async function getBookingStatusNotification(booking) {
    if (['checked_in', 'completed', 'cancelled'].includes(booking.bookingStatus) || booking.serviceType !== 'pickup') {
        return '';
    }

    let statusHtml = '';
    switch (booking.pickupStatus) {
        case 'requested':
            statusHtml = `<p class="booking-card-info mt-0-5 text-warning-500"><i class="fas fa-clock"></i> <b>Pickup Requested:</b> Waiting for courier assignment.</p>`;
            break;
        case 'processing_by_courier':
            const courierName = booking.courierName || 'Our courier';
            statusHtml = `<p class="booking-card-info mt-0-5 text-info-500"><i class="fas fa-user-check"></i> <b>Courier Assigned:</b> ${courierName} is on the way.</p>`;
            break;
        case 'picked_up':
            statusHtml = `<p class="booking-card-info mt-0-5 text-success-500"><i class="fas fa-truck-loading"></i> <b>Item Picked Up:</b> Your item is now en route to our secure facility.</p>`;
            break;
    }
    return statusHtml;
}

async function getBookingCardActionButtons(booking) {
    let buttonsHtml = `<button class="btn btn-secondary" data-booking-id="${booking.id}" data-action="details"><i class="fas fa-info-circle"></i> Details</button>`;
    const now = Date.now();
    const endDate = booking.endDate;
    const isPaid = ['paid', 'paid_on_site'].includes(booking.paymentStatus);

    if (booking.bookingStatus === 'checked_in' && isPaid && now <= endDate) {
        buttonsHtml += `<button class="btn btn-warning extend-btn" data-booking-id="${booking.id}" data-action="extend"><i class="fas fa-calendar-plus"></i> Extend</button>`;
    } else if (booking.bookingStatus === 'active') {
        if (booking.serviceType === 'self-dropoff' && !booking.checkInTime) {
            if (booking.paymentStatus === 'paid') {
                buttonsHtml += `<button class="btn btn-primary check-in-btn" data-booking-id="${booking.id}" data-action="checkin"><i class="fas fa-sign-in-alt"></i> Check In</button>`;
            } else if (booking.paymentStatus === 'unpaid_on_site') {
                buttonsHtml += `<button class="btn btn-warning pay-to-check-in-btn" data-booking-id="${booking.id}" data-action="pay_to_checkin"><i class="fas fa-dollar-sign"></i> Pay & Check In</button>`;
            }
        }
    }

    if (booking.bookingStatus === 'completed' && !booking.reviewedAt) {
        buttonsHtml += `<button class="btn btn-primary" data-booking-id="${booking.id}" data-action="review"><i class="fas fa-star"></i> Review</button>`;
    }

    return buttonsHtml;
}

async function downloadInvoice(booking) {
    showLoader(true, 'Generating invoice PDF...');
    try {
        const user = getCurrentUser();
        let userData = null;
        if (user) {
            userData = await fetchUserData(user.uid);
        }

        const invoiceHtml = generateInvoiceHtml(booking, userData);

        const opt = {
            margin: 15,
            filename: `invoice_${booking.id}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: false, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        await html2pdf().set(opt).from(invoiceHtml).output('datauristring').then(function(pdfDataUri) {
            const newWindow = window.open();
            if (newWindow) {
                newWindow.document.write('<iframe width=\'100%\' height=\'100%\' src=\'' + pdfDataUri + '\' frameborder=\'0\'></iframe>');
                newWindow.document.title = opt.filename;
                newWindow.document.body.style.margin = '0';
            } else {
                alert('Browser blocked opening a new tab. Please allow pop-ups to view the invoice.');
            }
        });
    } catch (error) {
        console.error('Error generating or displaying invoice PDF:', error);
        alert('Failed to display the invoice. Please try again.');
    } finally {
        showLoader(false);
    }
}

async function showReviewModal(booking) {
    const modalContent = `
        <div class="booking-details-modal-header">
            <h3 class="modal-title">Write a Review for: ${booking.locationName}</h3>
            <button type="button" class="close-modal-btn">&times;</button>
        </div>
        <div class="booking-details-modal-body booking-review-body">
            <h4>Booking Details</h4>
            <p><strong>Booking ID:</strong> ${booking.id}</p>
            <p><strong>Location:</strong> ${booking.locationName}</p>
            <p><strong>Storage Type:</strong> ${booking.storageType}</p>
            <p><strong>Duration:</strong> ${booking.duration}</p>
            
            <h4 class="mt-1-5">Your Rating</h4>
            <div class="rating-input">
                <span data-rating="1" class="star">&#9733;</span>
                <span data-rating="2" class="star">&#9733;</span>
                <span data-rating="3" class="star">&#9733;</span>
                <span data-rating="4" class="star">&#9733;</span>
                <span data-rating="5" class="star">&#9733;</span>
            </div>
            <input type="hidden" id="review-rating" value="0">

            <h4 class="mt-1-5">Your Review</h4>
            <textarea id="review-message" class="input-field" rows="5" placeholder="Write your review here..."></textarea>

            <div class="booking-detail-actions">
                <button class="btn btn-primary" id="submit-review-btn"><i class="fas fa-paper-plane"></i> Submit Review</button>
            </div>
        </div>
    `;

    let reviewModal = document.getElementById('reviewModal');
    if (!reviewModal) {
        reviewModal = document.createElement('div');
        reviewModal.id = 'reviewModal';
        reviewModal.classList.add('booking-details-modal-overlay');
        document.body.appendChild(reviewModal);
    }
    reviewModal.innerHTML = `<div class="booking-details-modal-content">${modalContent}</div>`;
    reviewModal.style.display = 'flex';

    reviewModal.querySelector('.close-modal-btn').addEventListener('click', () => {
        reviewModal.style.display = 'none';
        reviewModal.remove();
    });

    const stars = reviewModal.querySelectorAll('.rating-input .star');
    const reviewRatingInput = reviewModal.querySelector('#review-rating');

    stars.forEach(star => {
        star.addEventListener('mouseover', () => {
            const rating = parseInt(star.dataset.rating);
            stars.forEach((s, index) => {
                s.style.color = index < rating ? '#FFD700' : '#ccc';
            });
        });
        star.addEventListener('mouseout', () => {
            const currentRating = parseInt(reviewRatingInput.value);
            stars.forEach((s, index) => {
                s.style.color = index < currentRating ? '#FFD700' : '#ccc';
            });
        });
        star.addEventListener('click', () => {
            const rating = parseInt(star.dataset.rating);
            reviewRatingInput.value = rating;
            stars.forEach((s, index) => {
                s.style.color = index < rating ? '#FFD700' : '#ccc';
            });
        });
    });

    reviewModal.querySelector('#submit-review-btn').addEventListener('click', async () => {
        const rating = parseInt(reviewRatingInput.value);
        const message = reviewModal.querySelector('#review-message').value.trim();
        const user = getCurrentUser();

        if (rating === 0) {
            alert('Please provide a star rating!');
            return;
        }
        if (message.length < 10) {
            alert('Review is too short. Minimum 10 characters.');
            return;
        }

        showLoader(true, 'Submitting your review...');
        try {
            await submitReview(booking.locationId, {
                userId: user.uid,
                rating: rating,
                comment: message,
                name: user.displayName || 'Anonymous User',
                timestamp: Date.now()
            });

            await updateBookingStatus(booking.id, booking.bookingStatus, { reviewedAt: Date.now() });

            showToast('Your review has been submitted successfully!', 'success');
            reviewModal.style.display = 'none';
            reviewModal.remove();
        } catch (error) {
            console.error('Error submitting review:', error);
            showToast('Failed to submit review. Please try again.', 'error');
        } finally {
            showLoader(false);
        }
    });
}

async function showBookingDetailsModal(booking) {
    const renderDetail = (label, value) => {
      if (value) {
        return `<p class="booking-detail-item"><strong>${label}:</strong> ${value}</p>`;
      }
      return '';
    };

    let warehousePhotosHtml = '';
    if (booking.warehousePhotoUrls && booking.warehousePhotoUrls.length > 0) {
        const slides = booking.warehousePhotoUrls.map(url => `<div class="swiper-slide"><img src="${url}" class="w-full h-auto object-cover rounded-lg"></div>`).join('');
        warehousePhotosHtml = `
            <div class="booking-detail-card">
                <h4 class="booking-details-title">Warehouse Photos</h4>
                <div class="swiper-container warehouse-slider relative">
                    <div class="swiper-wrapper">${slides}</div>
                    <div class="swiper-button-next text-white"></div>
                    <div class="swiper-button-prev text-white"></div>
                </div>
            </div>
        `;
    }

    let suppliesHtml = '';
    if (booking.supplies && booking.supplies.length > 0) {
        const suppliesList = booking.supplies.map(item => `
            <div class="flex justify-between items-center text-sm py-1">
                <span>- ${item.name} (x${item.quantity})</span>
                <strong>$${(item.price * item.quantity).toFixed(2)}</strong>
            </div>
        `).join('');
        suppliesHtml = `
            <div class="booking-detail-card">
                <h4 class="booking-details-title">Supplies & Extras</h4>
                ${suppliesList}
            </div>
        `;
    }

    let orderInfoHtml = `
        <div class="booking-detail-card">
            <h4 class="booking-details-title">Order Information</h4>
            <div class="booking-details-grid">
                ${renderDetail('Booking ID', booking.id)}
                ${renderDetail('Location', booking.locationName)}
                ${renderDetail('Storage Type', booking.storageType)}
                ${renderDetail('Category', booking.category)}
                ${renderDetail('Duration', booking.duration)}
                ${renderDetail('Status', `<span class="booking-status-badge status-${booking.bookingStatus || 'active'}">${(booking.bookingStatus || 'active').replace(/_/g, ' ')}</span>`)}
            </div>
        </div>
    `;

    let serviceTimingHtml = `
        <div class="booking-detail-card">
            <h4 class="booking-details-title">Service & Timing</h4>
            <div class="booking-details-grid">
                ${renderDetail('Service Type', booking.serviceType ? booking.serviceType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '')}
                ${renderDetail('Booking Date', formatDate(booking.startDate))}
                ${renderDetail('End Date', formatDate(booking.endDate))}
                ${renderDetail('Booked On', formatDateTime(booking.createdAt))}
                ${renderDetail('Checked In', formatDateTime(booking.checkInTime))}
                ${renderDetail('Checked Out', formatDateTime(booking.checkOutTime))}
            </div>
        </div>
    `;

    let pickupDetailsHtml = '';
    if (booking.serviceType === 'pickup') {
        const courierInfoHtml = booking.courierName ? `
            ${renderDetail('Courier', booking.courierName)}
            ${renderDetail('Contact Number', booking.contactNumber)}
        ` : '';

        const pickupInfo = `
            ${renderDetail('Pickup Status', booking.pickupStatus ? booking.pickupStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'N/A')}
            ${renderDetail('Pickup Address', booking.pickupAddress)}
            ${renderDetail('Pickup Request Time', booking.pickupTime)}
            ${renderDetail('Pickup Distance', booking.pickupDistance ? `${booking.pickupDistance.toFixed(2)} km` : '')}
            ${renderDetail('Pickup Fee', booking.pickupFee ? `$${booking.pickupFee}` : '')}
            ${courierInfoHtml}
        `;
        if (pickupInfo.trim() !== '') {
            pickupDetailsHtml = `<div class="booking-detail-card"><h4 class="booking-details-title">Pickup Details</h4><div class="booking-details-grid">${pickupInfo}</div></div>`;
        }
    }

    let deliveryDetailsHtml = '';
    if (booking.needsDelivery) {
        const deliveryInfo = `
            ${renderDetail('Delivery Status', booking.deliveryStatus ? booking.deliveryStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'N/A')}
            ${renderDetail('Delivery Address', booking.deliveryAddress)}
            ${renderDetail('Delivery Request Time', booking.deliveryTime)}
            ${renderDetail('Delivery Distance', booking.deliveryDistance ? `${booking.deliveryDistance.toFixed(2)} km` : '')}
            ${renderDetail('Delivery Fee', booking.deliveryFee ? `$${booking.deliveryFee}` : '')}
            ${renderDetail('Delivery Contact Number', booking.deliveryContactNumber)}
        `;
        if (deliveryInfo.trim() !== '') {
            deliveryDetailsHtml = `<div class="booking-detail-card"><h4 class="booking-details-title">Delivery Details</h4><div class="booking-details-grid">${deliveryInfo}</div></div>`;
        }
    }

    let paymentInfoHtml = `
        <div class="booking-detail-card">
            <h4 class="booking-details-title">Payment Information</h4>
            <div class="booking-details-grid">
                ${renderDetail('Total Price', `$${booking.totalPrice}`)}
                ${renderDetail('Payment Status', booking.paymentStatus ? booking.paymentStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '')}
                ${renderDetail('Payment Method', booking.paymentMethod ? booking.paymentMethod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '')}
            </div>
        </div>
    `;

    let securityInfoHtml = '';
    if (booking.sealNumber || booking.sealPhotoUrl || booking.id) {
        securityInfoHtml = `
            <div class="booking-detail-card">
                <h4 class="booking-details-title">Security Information</h4>
                <div style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 1rem;">
                    ${renderDetail('Seal Code', booking.sealNumber)}
                    ${booking.sealPhotoUrl ? `<img src="${booking.sealPhotoUrl}" alt="Seal Photo" style="max-width: 200px; border-radius: 0.5rem;">` : ''}
                    <div class="booking-qrcode-container" id="qrcode-container"></div>
                </div>
            </div>
        `;
    }

    let otherInfoHtml = '';
    const otherDetails = [
        renderDetail('Notes', booking.notes),
        renderDetail('Order ID', booking.orderId),
        renderDetail('Voucher Code', booking.voucherCode),
        renderDetail('Discount Applied', booking.discountApplied ? `${booking.discountApplied}%` : ''),
        renderDetail('Voucher Discount', booking.voucherDiscount ? `$${booking.voucherDiscount}` : ''),
        renderDetail('Quantity', booking.quantity),
    ].join('');
    if (otherDetails.trim() !== '') {
        otherInfoHtml = `<div class="booking-detail-card"><h4 class="booking-details-title">Other Details</h4><div class="booking-details-grid">${otherInfoHtml}</div></div>`;
    }


    const modalContent = `
        <div class="booking-details-modal-header">
            <h3 class="modal-title">Booking Details: ${booking.locationName} - ${booking.storageType}</h3>
            <button type="button" class="close-modal-btn">&times;</button>
        </div>
        <div class="booking-details-modal-body">
            ${orderInfoHtml}
            ${serviceTimingHtml}
            ${pickupDetailsHtml}
            ${deliveryDetailsHtml}
            ${paymentInfoHtml}
            ${suppliesHtml}
            ${otherInfoHtml}
            ${securityInfoHtml}
            ${warehousePhotosHtml}
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" data-action="download-invoice">Download Invoice</button>
        </div>
    `;

    let modal = document.getElementById('detailsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'detailsModal';
        modal.classList.add('booking-details-modal-overlay');
        document.body.appendChild(modal);
    }

    modal.innerHTML = `<div class="booking-details-modal-content">${modalContent}</div>`;
    modal.style.display = 'flex';

    modal.querySelector('.close-modal-btn').addEventListener('click', () => {
        modal.style.display = 'none';
        modal.remove();
    });

    if (booking.warehousePhotoUrls && booking.warehousePhotoUrls.length > 0 && typeof Swiper !== 'undefined') {
        new Swiper('.warehouse-slider', {
            navigation: {
                nextEl: '.swiper-button-next',
                prevEl: '.swiper-button-prev',
            },
            loop: true,
        });
    }

    const qrcodeContainer = modal.querySelector("#qrcode-container");
    if (qrcodeContainer && typeof QRCode !== 'undefined') {
        new QRCode(qrcodeContainer, {
            text: booking.id,
            width: 128,
            height: 128,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    modal.querySelector('[data-action="download-invoice"]').addEventListener('click', () => {
        downloadInvoice(booking);
    });
}

async function showExtendConfirmationModal(originalBooking) {
    const user = getCurrentUser();
    if (!user) {
        showToast("Please log in to extend your booking.", 'error');
        location.hash = '#/auth';
        return;
    }
    showLoader(true, 'Fetching data for extension...');
    const locationData = await fetchStorageLocationData(originalBooking.locationId);
    if (!locationData) {
        showToast('Failed to get location data to calculate extension price.', 'error');
        showLoader(false);
        return;
    }

    const rates = locationData.categories.flatMap(cat => cat.sizes)
                             .find(size => size.name === originalBooking.storageType)
                             ?.rates || [];
    
    showLoader(false);

    const originalEndDate = originalBooking.endDate ? new Date(originalBooking.endDate) : new Date(Date.now());
    const minEndDate = new Date(originalEndDate);
    minEndDate.setDate(minEndDate.getDate() + 1);
    const minEndDateString = minEndDate.toISOString().split('T')[0];
    
    const calculatePriceAndDuration = (startDate, endDate) => {
        const diffTime = endDate.getTime() - startDate.getTime();
        const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        
        let durationText = `${diffDays} Day(s)`;
        let rateKey = 'Daily';
        if (diffDays >= 30) {
            durationText = 'Monthly';
            rateKey = 'Monthly';
        } else if (diffDays >= 7) {
            durationText = 'Weekly';
            rateKey = 'Weekly';
        }
        
        const dailyRate = rates.find(r => r.duration.toLowerCase() === 'daily')?.price || 0;
        const totalExtensionPrice = diffDays * dailyRate;
        
        return { durationText, totalExtensionPrice };
    };

    let { durationText, totalExtensionPrice } = calculatePriceAndDuration(originalEndDate, minEndDate);

    const extendModalContent = `
        <div class="booking-details-modal-header">
            <h3 class="modal-title">Extend Booking: ${originalBooking.storageType}</h3>
            <button type="button" class="close-modal-btn">&times;</button>
        </div>
        <div class="booking-details-modal-body booking-extend-body">
            <h4>Original Booking</h4>
            <p><strong>Current End Date:</strong> ${formatDate(originalBooking.endDate)}</p>
            
            <h4 class="mt-1-5">Extension Details</h4>
            <div class="input-group">
                <label for="new-end-date-input">New End Date:</label>
                <input type="date" id="new-end-date-input" class="form-control" value="${minEndDateString}" min="${minEndDateString}">
            </div>
            <p><strong>Extension Duration:</strong> <span id="new-duration-span">${durationText}</span></p>
            <p><strong>Extension Price:</strong> <span id="extension-price-span" class="booking-total-price">$${totalExtensionPrice.toFixed(2)}</span></p>

            <h4 class="mt-1-5">Payment Method</h4>
            <div class="payment-options">
                <label class="payment-option">
                    <input type="radio" name="paymentMethod" value="online" checked>
                    Online Payment (iPaymu)
                </label>
            </div>

            <div class="booking-detail-actions">
                <button class="btn btn-primary" id="confirm-extend-btn"><i class="fas fa-check-circle"></i> Confirm & Pay</button>
            </div>
        </div>
    `;

    let extendModal = document.getElementById('extendConfirmationModal');
    if (!extendModal) {
        extendModal = document.createElement('div');
        extendModal.id = 'extendConfirmationModal';
        extendModal.classList.add('booking-details-modal-overlay');
        document.body.appendChild(extendModal);
    }
    extendModal.innerHTML = `<div class="booking-details-modal-content">${extendModalContent}</div>`;
    extendModal.style.display = 'flex';

    const newEndDateInput = extendModal.querySelector('#new-end-date-input');
    const newDurationSpan = extendModal.querySelector('#new-duration-span');
    const extensionPriceSpan = extendModal.querySelector('#extension-price-span');

    newEndDateInput.addEventListener('change', (e) => {
        const newSelectedDate = new Date(e.target.value);
        const { durationText, totalExtensionPrice } = calculatePriceAndDuration(originalEndDate, newSelectedDate);
        newDurationSpan.textContent = durationText;
        extensionPriceSpan.textContent = `$${totalExtensionPrice.toFixed(2)}`;
    });

    extendModal.querySelector('.close-modal-btn').addEventListener('click', () => {
        extendModal.style.display = 'none';
        extendModal.remove();
    });

    extendModal.querySelector('#confirm-extend-btn').addEventListener('click', async () => {
        showLoader(true, 'Processing extension...');
        try {
            const newEndDateTimestamp = new Date(newEndDateInput.value).getTime();
            const extensionPrice = parseFloat(extensionPriceSpan.textContent.replace('$', ''));
            const newTotalPrice = originalBooking.totalPrice + extensionPrice;

            await updateBookingStatus(originalBooking.id, 'extended', {
                endDate: newEndDateTimestamp,
                totalPrice: newTotalPrice,
                paymentMethod: 'online',
                paymentStatus: 'pending',
            });

            const userData = await fetchUserData(user.uid);
            
            const paymentData = {
                orderId: `EXT-${originalBooking.id.slice(-6)}-${Date.now()}`,
                totalPrice: extensionPrice,
                name: userData?.name || 'Customer',
                email: userData?.email || 'customer@example.com',
                phone: userData?.phone || 'N/A',
                selectedSpaces: [{
                    name: `Extend ${originalBooking.storageType}`,
                    quantity: 1,
                    price: extensionPrice
                }]
            };

            await createIpaymuInvoice(paymentData);
            
            showToast('Redirecting to payment gateway...', 'success');
            
            extendModal.style.display = 'none';
            extendModal.remove();

        } catch (error) {
            console.error('Error extending booking:', error);
            showToast('Failed to extend booking. Please try again.', 'error');
        } finally {
            showLoader(false);
        }
    });
}

async function showPayToCheckInModal(bookingToPay) {
    const user = getCurrentUser();
    if (!user) {
        showToast("Please log in to proceed with payment and check-in.", 'error');
        location.hash = '#/auth';
        return;
    }
    const userData = await fetchUserData(user.uid);

    const payModalContent = `
        <div class="booking-details-modal-header">
            <h3 class="modal-title">Pay to Check In</h3>
            <button type="button" class="close-modal-btn">&times;</button>
        </div>
        <div class="booking-details-modal-body booking-pay-body">
            <h4>Booking Details</h4>
            <p><strong>Booking ID:</strong> ${bookingToPay.id}</p>
            <p><strong>Location:</strong> ${bookingToPay.locationName}</p>
            <p><strong>Storage Type:</strong> ${bookingToPay.storageType}</p>
            <p><strong>Total Amount Due:</strong> $${bookingToPay.totalPrice}</p>
            
            <h4 class="mt-1-5">Choose Payment Method</h4>
            <div class="payment-options">
                <label class="payment-option">
                    <input type="radio" name="payMethodCheckIn" value="online" checked>
                    Online Payment (iPaymu)
                </label>
                <label class="payment-option">
                    <input type="radio" name="payMethodCheckIn" value="cod_on_site">
                    Cash On Site (COD)
                </label>
            </div>

            <div class="booking-detail-actions">
                <button class="btn btn-primary" id="confirm-pay-checkin-btn"><i class="fas fa-check-circle"></i> Pay Now</button>
            </div>
        </div>
    `;

    let payModal = document.getElementById('payToCheckInModal');
    if (!payModal) {
        payModal = document.createElement('div');
        payModal.id = 'payToCheckInModal';
        payModal.classList.add('booking-details-modal-overlay');
        document.body.appendChild(payModal);
    }
    payModal.innerHTML = `<div class="booking-details-modal-content">${payModalContent}</div>`;
    payModal.style.display = 'flex';

    payModal.querySelector('.close-modal-btn').addEventListener('click', () => {
        payModal.style.display = 'none';
        payModal.remove();
    });

    payModal.querySelector('#confirm-pay-checkin-btn').addEventListener('click', async () => {
        showLoader(true, 'Processing payment for check-in...');
        try {
            const selectedPayMethod = payModal.querySelector('input[name="payMethodCheckIn"]:checked').value;

            if (selectedPayMethod === 'online') {
                const paymentData = {
                    totalPrice: bookingToPay.totalPrice,
                    id: bookingToPay.id,
                    userEmail: userData?.email || 'customer@example.com',
                    userName: userData?.name || 'Customer'
                };
                await createIpaymuInvoice(paymentData);
                showToast('Redirecting to iPaymu for payment. Please complete payment to proceed.', 'info');
                payModal.style.display = 'none'; 
                payModal.remove();
            } else {
                await updateBookingStatus(bookingToPay.id, bookingToPay.bookingStatus, {
                    paymentMethod: 'cod_on_site',
                    paymentStatus: 'unpaid_on_site'
                });
                showToast('You have selected Cash On Site. Please wait for admin confirmation to check in.', 'success');
                payModal.style.display = 'none';
                payModal.remove();
            }
        } catch (error) {
            console.error('Error processing payment for check-in:', error);
            showToast('Failed to process payment. Please try again.', 'error');
        } finally {
            showLoader(false);
        }
    });
}

async function showCourierDetailsModal(booking) {
    if (!booking.courierId) {
        showToast("No courier has been assigned yet.", "info");
        return;
    }
    
    showLoader(true, 'Fetching courier details...');
    try {
        const courierData = await fetchCourierData(booking.courierId);
        
        if (!courierData) {
            showToast("Failed to retrieve courier details.", "error");
            return;
        }

        const modalContent = `
            <div class="booking-details-modal-header">
                <h3 class="modal-title">Pickup Details</h3>
                <button type="button" class="close-modal-btn">&times;</button>
            </div>
            <div class="booking-details-modal-body">
                <p><strong>Courier Name:</strong> ${courierData.name || 'N/A'}</p>
                <p><strong>Courier Phone:</strong> <a href="tel:${courierData.phone}">${courierData.phone || 'N/A'}</a></p>
                <p><strong>Status:</strong> <span class="booking-status-badge status-active">On the way</span></p>
                <div class="booking-detail-actions mt-3">
                    <button id="chat-courier-btn" class="btn btn-primary" data-courier-id="${booking.courierId}">Chat Courier</button>
                </div>
            </div>
        `;

        let detailsModal = document.getElementById('courierDetailsModal');
        if (!detailsModal) {
            detailsModal = document.createElement('div');
            detailsModal.id = 'courierDetailsModal';
            detailsModal.classList.add('booking-details-modal-overlay');
            document.body.appendChild(detailsModal);
        }
        detailsModal.innerHTML = `<div class="booking-details-modal-content">${modalContent}</div>`;
        detailsModal.style.display = 'flex';

        detailsModal.querySelector('.close-modal-btn').addEventListener('click', () => {
            detailsModal.style.display = 'none';
            detailsModal.remove();
        });

        detailsModal.querySelector('#chat-courier-btn').addEventListener('click', async () => {
             const user = getCurrentUser();
             const courierId = detailsModal.querySelector('#chat-courier-btn').dataset.courierId;
             if (!user || !courierId) {
                 showToast("Please log in to chat or courier is not assigned.", 'error');
                 return;
             }
             
             showLoader(true, 'Creating chat message...');
             try {
                const message = `Hello ${courierData.name}, I would like to ask about my pickup order.\n\nOrder Details:\n- Booking ID: ${booking.id}\n- Location: ${booking.locationName}\n- Pickup Time: ${booking.pickupTime}`;
                await sendMessageToCourierAndAdmin(user.uid, courierId, message);
                showToast('Message sent successfully!', 'success');
                detailsModal.style.display = 'none';
                detailsModal.remove();
             } catch (error) {
                console.error("Error sending message:", error);
                showToast('Failed to send message.', 'error');
             } finally {
                showLoader(false);
             }
        });

    } catch(error) {
        console.error("Error fetching courier data:", error);
        showToast("Failed to retrieve courier details. Please try again.", "error");
    } finally {
        showLoader(false);
    }
}

async function renderBookingsList(bookings) {
    const container = document.getElementById('bookings-list-container');
    if (!container) return;

    if (bookings.length === 0) {
        container.innerHTML = `<p class="no-bookings-message">You have no active or past bookings.</p>`;
        return;
    }

    const bookingHtmlPromises = bookings.map(async booking => {
        const statusNotificationHtml = await getBookingStatusNotification(booking);
        const actionButtons = await getBookingCardActionButtons(booking);
        const formattedCreationDate = formatBookingCreationDate(booking.createdAt);
        
        let pickupStatusBadgeHtml = '';
        if (booking.serviceType === 'pickup' && !['checked_in', 'completed', 'cancelled'].includes(booking.bookingStatus)) {
            let statusText = (booking.pickupStatus || 'requested').replace(/_/g, ' ');
            statusText = statusText.charAt(0).toUpperCase() + statusText.slice(1);
            
            const statusClass = `status-${booking.pickupStatus || 'requested'}`;

            pickupStatusBadgeHtml = `
                <div class="pickup-status-display ${statusClass}">
                    <i class="fas fa-truck"></i>
                    <span>${statusText}</span>
                </div>
            `;
        }

        return `
            <div class="booking-card">
                <div class="booking-card-content">
                    <div class="booking-card-header">
                        <div>
                            <h4 class="booking-card-title">${booking.locationName}</h4>
                            <p class="booking-card-info">${booking.storageType} - ${booking.duration}</p>
                            <p class="booking-card-info"><b>${formatDate(booking.startDate)}</b> to <b>${formatDate(booking.endDate)}</b></p>
                            ${statusNotificationHtml}
                        </div>
                        <div style="text-align: right; flex-shrink: 0; margin-left: 1rem;">
                            <span class="booking-status-badge status-${booking.bookingStatus || 'active'}">
                                ${(booking.bookingStatus || 'active').replace(/_/g, ' ')}
                            </span>
                            <p class="booking-card-info" style="font-size: 0.8rem; color: #6B7280; margin-top: 0.5rem; margin-bottom: 0.25rem;">
                                Booked: ${formattedCreationDate}
                            </p>
                            <p class="booking-card-info" style="font-size: 0.8rem; color: #6B7280; margin: 0; font-family: monospace;">
                                ID: ${booking.id.slice(-8).toUpperCase()}
                            </p>
                        </div>
                    </div>
                    <div class="booking-actions">
                        <div class="action-buttons-group">
                            ${actionButtons}
                        </div>
                        ${pickupStatusBadgeHtml}
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = (await Promise.all(bookingHtmlPromises)).join('');

    document.querySelectorAll('.booking-actions button[data-action]').forEach(button => {
        button.addEventListener('click', async (event) => {
            const bookingId = event.target.closest('button').dataset.bookingId;
            const action = event.target.closest('button').dataset.action;
            const selectedBooking = bookings.find(b => b.id === bookingId);

            if (!selectedBooking) return;

            switch (action) {
                case 'details':
                    showBookingDetailsModal(selectedBooking);
                    break;
                case 'extend':
                    renderExtendBookingModal(selectedBooking);
                    break;
                case 'checkin':
                    await updateBookingStatus(bookingId, 'checked_in', { checkInTime: Date.now() });
                    showToast('Check-in successful!', 'success');
                    break;
                case 'pay_to_checkin':
                    renderPayToCheckInModal(selectedBooking);
                    break;
                case 'review':
                    showReviewModal(selectedBooking);
                    break;
            }
        });
    });
}

const initializeBookingsPage = () => {
    const user = getCurrentUser();
    if (!user) {
        location.hash = '#/auth';
        return;
    }
    
    showLoader(true, 'Fetching your bookings...');
    
    if (bookingsListener) {
        bookingsListener.off();
    }

    bookingsListener = listenForUserBookings(user.uid, (bookings) => {
        showLoader(false);
        renderBookingsList(bookings);
    });
};

export default {
    render: async () => {
        return `
            <div class="page-header">
                <h2 class="page-title">My Bookings</h2>
            </div>
            <div id="bookings-list-container" class="booking-list-container"></div>
        `;
    },
    afterRender: async () => {
        initializeBookingsPage();
    },
    beforeUnmount: () => {
        if (bookingsListener) {
            bookingsListener.off();
        }
    }
};