// storapedia/assets/js/pages/bookings.js

import { getStarRatingHTML } from '../ui/components.js';
import { showLoader, showToast } from '../ui/ui-helpers.js';
import { listenForUserBookings, updateBookingStatus, fetchUserData, submitReview, requestPickup, getBookingById, fetchStorageLocationData } from '../services/firebase-api.js';
import { getCurrentUser } from '../services/auth.js';
import { createIpaymuInvoice } from '../services/payment-handler.js';
// Import renderAddInventoryModal has been removed as it is no longer used.

let bookingsListener = null;

const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function getSmartButton(booking) {
    if (booking.bookingStatus === 'active' || booking.bookingStatus === 'extended') {
        if (booking.serviceType === 'self-dropoff' && (!booking.checkInTime || booking.checkInTime === 0)) {
            if (booking.paymentStatus === 'paid') {
                return `<button class="btn btn-primary btn-smart-action" data-action="checkin"><i class="fas fa-sign-in-alt"></i> Check In</button>`;
            } else if (booking.paymentStatus === 'unpaid_on_site' && booking.paymentMethod !== 'cod_on_site') {
                return `<button class="btn btn-warning btn-smart-action" data-action="pay_to_checkin"><i class="fas fa-dollar-sign"></i> Pay & Check In</button>`;
            }
        } else if (booking.serviceType === 'pickup' && (!booking.checkInTime || booking.checkInTime === 0)) {
            return `<button class="btn btn-info btn-smart-action" data-action="request_pickup"><i class="fas fa-truck-loading"></i> Request Pickup</button>`;
        }
    } else if (booking.bookingStatus === 'checked_in') {
        return `<button class="btn btn-info btn-smart-action" data-action="add_inventory" data-booking-id="${booking.id}"><i class="fas fa-box"></i> Add Inventory</button>`;
    } else if (booking.bookingStatus === 'completed') {
        return '';
    }
    return '';
}

function getBookingCardActionButtons(booking) {
    let buttonsHtml = `<button class="btn btn-secondary" data-booking-id="${booking.id}" data-action="details"><i class="fas fa-info-circle"></i> Details</button>`;
    const now = Date.now();
    const endDate = booking.endDate;

    if (booking.bookingStatus === 'active' || booking.bookingStatus === 'extended') {
        if (booking.serviceType === 'self-dropoff' && (!booking.checkInTime || booking.checkInTime === 0)) {
            if (booking.paymentStatus === 'paid') {
                buttonsHtml += `<button class="btn btn-primary check-in-btn" data-booking-id="${booking.id}" data-action="checkin"><i class="fas fa-sign-in-alt"></i> Check In</button>`;
            } else if (booking.paymentStatus === 'unpaid_on_site' && booking.paymentMethod !== 'cod_on_site') {
                buttonsHtml += `<button class="btn btn-warning pay-to-check-in-btn" data-booking-id="${booking.id}" data-action="pay_to_checkin"><i class="fas fa-dollar-sign"></i> Pay & Check In</button>`;
            }
        } else if (booking.serviceType === 'pickup' && (!booking.checkInTime || booking.checkInTime === 0)) {
            buttonsHtml += `<button class="btn btn-info request-pickup-btn" data-booking-id="${booking.id}" data-action="request_pickup"><i class="fas fa-truck-loading"></i> Request Pickup</button>`;
        }
    } else if (booking.bookingStatus === 'checked_in') {
        buttonsHtml += `<button class="btn btn-info add-inventory-btn" data-booking-id="${booking.id}" data-action="add_inventory"><i class="fas fa-box"></i> Add Inventory</button>`;
        if (booking.paymentStatus === 'paid' && now <= endDate) {
            buttonsHtml += `<button class="btn btn-warning extend-btn" data-booking-id="${booking.id}" data-action="extend"><i class="fas fa-calendar-plus"></i> Extend</button>`;
        }
    }

    if (booking.bookingStatus === 'completed' && !booking.reviewedAt) {
        buttonsHtml += `<button class="btn btn-primary" data-booking-id="${booking.id}" data-action="review"><i class="fas fa-star"></i> Review</button>`;
    }

    return buttonsHtml;
}

function generateInvoiceHtml(booking, userData) {
    const invoiceNumber = `SP-${booking.id.substring(1, 9).toUpperCase()}`;
    const invoiceDate = formatDate(Date.now());
    const customerName = userData?.name || 'Guest User';
    const customerEmail = userData?.email || 'N/A';
    const customerPhone = userData?.phone || 'N/A';
    const customerAddress = booking.serviceType === 'pickup' ? (booking.pickupAddress || 'N/A') : 'N/A';
    
    // Base64 encoded logo string is intentionally removed to keep the code clean
    const base64Logo = `...`; 

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Storapedia Invoice - ${invoiceNumber}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
            <style>
                /* New styles for invoice, moved from inline HTML */
                .invoice-container { max-width: 800px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 1.5rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08); border: 1px solid #e2e8f0; }
                .invoice-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #DBEAFE; }
                .invoice-header .logo { max-width: 180px; height: auto; }
                .invoice-header .company-info { text-align: right; font-size: 0.9em; }
                .invoice-header .company-info h1 { color: #1D4ED8; font-size: 2.2em; margin: 0 0 5px 0; font-weight: 800; }
                .invoice-header .company-info p { margin: 0; color: #64748B; }
                .invoice-details, .bill-to { display: flex; justify-content: space-between; margin-bottom: 30px; }
                .invoice-details div, .bill-to div { flex-basis: 48%; }
                .invoice-details h2, .bill-to h2 { font-size: 1.5em; color: #1E293B; margin-bottom: 10px; border-bottom: 2px solid #E2E8F0; padding-bottom: 5px; font-weight: 700; }
                .invoice-details p, .bill-to p { margin: 5px 0; font-size: 0.95em; }
                .invoice-details strong, .bill-to strong { color: #1E293B; }
                .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03); border-radius: 0.75rem; overflow: hidden; }
                .invoice-table th, .invoice-table td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
                .invoice-table th { background-color: #3B82F6; color: white; font-weight: 600; text-transform: uppercase; font-size: 0.85em; }
                .invoice-table tr:nth-child(even) { background-color: #F8FAFC; }
                .invoice-table .total-row td { background-color: #DBEAFE; color: #1D4ED8; font-weight: 700; font-size: 1.2em; border-top: 2px solid #3B82F6; }
                .invoice-table .total-row td:last-child { text-align: right; font-size: 1.5em; font-weight: 800; }
                .payment-info { margin-top: 30px; padding: 20px; background-color: #EFF6FF; border-radius: 0.75rem; border: 1px solid #DBEAFE; }
                .payment-info h3 { color: #1D4ED8; font-size: 1.2em; margin-bottom: 10px; font-weight: 700; }
                .payment-info p { margin: 5px 0; font-size: 0.9em; }
                .invoice-footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px dashed #CBD5E1; font-size: 0.85em; color: #64748B; }
                @media print {
                    body { background-color: #ffffff; }
                    .invoice-container { box-shadow: none; border: none; }
                }
                @media (max-width: 600px) {
                    .invoice-container { padding: 20px; }
                    .invoice-header { flex-direction: column; align-items: flex-start; }
                    .invoice-header .company-info { text-align: left; margin-top: 15px; }
                    .invoice-details, .bill-to { flex-direction: column; }
                    .invoice-details div, .bill-to div { flex-basis: 100%; margin-bottom: 20px; }
                    .invoice-table th, .invoice-table td { padding: 8px 10px; font-size: 0.8em; }
                    .invoice-table .total-row td { font-size: 1em; }
                    .invoice-table .total-row td:last-child { text-align: right; font-size: 1.2em; }
                }
            </style>
        </head>
        <body>
            <div class="invoice-container">
                <div class="invoice-header">
                    <img src="${base64Logo}" alt="Storapedia Logo" class="logo">
                    <div class="company-info">
                        <h1>STORAPEDIA</h1>
                        <p>Jl. Raya Utama No. 123</p>
                        <p>Denpasar, Bali, Indonesia</p>
                        <p>Email: info@storapedia.com</p>
                        <p>Phone: +62 812 3456 7890</p>
                    </div>
                </div>
                <div class="invoice-details">
                    <div>
                        <h2>INVOICE</h2>
                        <p><strong>Invoice No:</strong> ${invoiceNumber}</p>
                        <p><strong>Date:</strong> ${invoiceDate}</p>
                        <p><strong>Due Date:</strong> ${formatDate(booking.endDate)}</p>
                    </div>
                    <div>
                        <h2>BILL TO</h2>
                        <p><strong>Customer Name:</strong> ${customerName}</p>
                        <p><strong>Email:</strong> ${customerEmail}</p>
                        <p><strong>Phone:</strong> ${customerPhone}</p>
                        <p><strong>Address:</strong> ${customerAddress}</p>
                    </div>
                </div>
                <table class="invoice-table">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th>Location</th>
                            <th>Duration</th>
                            <th>Unit Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${booking.storageType}</td>
                            <td>${booking.locationName}</td>
                            <td>${booking.duration}</td>
                            <td>$${booking.totalPrice.toFixed(2)}</td>
                            <td>$${booking.totalPrice.toFixed(2)}</td>
                        </tr>
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="4" class="text-right invoice-subtotal-label">Subtotal</td>
                            <td class="text-right invoice-subtotal-price">$${booking.totalPrice.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td colspan="4" class="text-right invoice-discount-label">Discount (0%)</td>
                            <td class="text-right invoice-discount-price">$0.00</td>
                        </tr>
                        <tr class="total-row">
                            <td colspan="4" class="text-right invoice-total-label">TOTAL DUE</td>
                            <td class="text-right invoice-total-price">$${booking.totalPrice.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
                <div class="payment-info">
                    <h3>Payment Information</h3>
                    <p><strong>Payment Method:</strong> ${booking.paymentMethod.replace('_', ' ').toUpperCase()}</p>
                    <p><strong>Payment Status:</strong> ${booking.paymentStatus.replace('_', ' ').toUpperCase()}</p>
                    <p>If you have any questions about this invoice, please contact us.</p>
                </div>
                <div class="invoice-footer">
                    <p>Thank you for choosing Storapedia!</p>
                    <p>© 2025 Storapedia. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;
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

        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'fixed';
        tempDiv.style.top = '0';
        tempDiv.style.left = '0';
        tempDiv.style.width = '100vw';
        tempDiv.style.height = '100vh';
        tempDiv.style.opacity = '0';
        tempDiv.style.pointerEvents = 'none';
        tempDiv.style.zIndex = '-1';
        tempDiv.innerHTML = invoiceHtml;
        document.body.appendChild(tempDiv);

        await new Promise(resolve => setTimeout(resolve, 50));

        const opt = {
            margin: 15,
            filename: `invoice_${booking.id}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: false, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        await html2pdf().set(opt).from(tempDiv).output('datauristring').then(function(pdfDataUri) {
            const newWindow = window.open();
            if (newWindow) {
                newWindow.document.write('<iframe width=\'100%\' height=\'100%\' src=\'' + pdfDataUri + '\' frameborder=\'0\'></iframe>');
                newWindow.document.title = opt.filename;
                newWindow.document.body.style.margin = '0';
            } else {
                alert('Browser blocked opening a new tab. Please allow pop-ups to view the invoice.');
            }
        });

        document.body.removeChild(tempDiv);

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
    const isPickupService = booking.serviceType === 'pickup';
    const hasActualPickupTime = booking.actualPickupTime && booking.actualPickupTime > 0;
    
    let responseTimeHtml = '';
    if (isPickupService && hasActualPickupTime && booking.pickupTime && booking.createdAt) {
        const pickupRequestDate = new Date(booking.createdAt);
        const [hours, minutes] = booking.pickupTime.split(':').map(Number);
        pickupRequestDate.setHours(hours, minutes, 0, 0);

        const responseTimeMs = booking.actualPickupTime - pickupRequestDate.getTime();
        const responseTimeMinutes = Math.floor(responseTimeMs / (1000 * 60));
        
        responseTimeHtml = `
            <p class="booking-detail-item"><strong>Courier Pick up Response Time:</strong> ${Math.max(0, responseTimeMinutes)} minutes</p>
        `;
    }

    const modalContent = `
        <div class="booking-details-modal-header">
            <h3 class="modal-title">Booking Details: ${booking.locationName} - ${booking.storageType}</h3>
            <button type="button" class="close-modal-btn">&times;</button>
        </div>
        <div class="booking-details-modal-body">
            <div class="booking-detail-card">
                <h4 class="booking-details-title">Order Information</h4>
                <div class="booking-details-grid">
                    <p class="booking-detail-item"><strong>Booking ID:</strong> ${booking.id}</p>
                    <p class="booking-detail-item"><strong>Location:</strong> ${booking.locationName}</p>
                    <p class="booking-detail-item"><strong>Storage Type:</strong> ${booking.storageType}</p>
                    <p class="booking-detail-item"><strong>Duration:</strong> ${booking.duration}</p>
                    <p class="booking-detail-item"><strong>Status:</strong> <span class="booking-status-badge status-${booking.bookingStatus || 'active'}">${(booking.bookingStatus || 'active').replace(/_/g, ' ')}</span></p>
                    <p class="booking-detail-item"><strong>Service Type:</strong> ${booking.serviceType}</p>
                    <p class="booking-detail-item"><strong>Booking Date:</strong> ${formatDate(booking.startDate)}</p>
                    ${isPickupService ? `<p class="booking-detail-item"><strong>Pickup Address:</strong> ${booking.pickupAddress || 'Not Set'}</p>` : ''}
                    ${isPickupService ? `<p class="booking-detail-item"><strong>Pick up Request time:</strong> ${booking.pickupTime || 'Not Set'}</p>` : ''}
                    ${responseTimeHtml}
                    <p class="booking-detail-item"><strong>Total Price:</strong> <span class="booking-total-price">$${booking.totalPrice}</span></p>
                    <p class="booking-detail-item"><strong>Payment Status:</strong> ${booking.paymentStatus === 'unpaid_on_site' ? 'unpaid (on-site)' : booking.paymentStatus.replace(/_/g, ' ')}</p>
                    <p class="booking-detail-item"><strong>Payment Method:</strong> ${booking.paymentMethod === 'on_site' ? 'on-site' : booking.paymentMethod.replace(/_/g, ' ')}</p>
                    <p class="booking-detail-item"><strong>Booked On:</strong> ${formatDateTime(booking.createdAt)}</p>
                    <p class="booking-detail-item"><strong>Seal Code:</strong> ${booking.sealNumber || 'N/A'}</p>
                    <p class="booking-detail-item"><strong>Seal Photo:</strong> ${booking.sealPhotoUrl ? `<img src="${booking.sealPhotoUrl}" alt="Seal Photo" class="booking-seal-photo">` : 'N/A'}</p>
                </div>
                <div class="booking-check-status-grid">
                    <p class="check-in-status status-${booking.checkInTime ? 'done' : 'pending'}"><strong>Checked In:</strong> ${booking.checkInTime ? formatDateTime(booking.checkInTime) : 'N/A'}</p>
                    <p class="check-out-status status-${booking.checkOutTime ? 'done' : 'pending'}"><strong>Checked Out:</strong> ${booking.checkOutTime ? formatDateTime(booking.checkOutTime) : 'N/A'}</p>
                </div>
            </div>
            <div class="booking-detail-card">
                <h4 class="booking-details-title">QR Code</h4>
                <div class="booking-qrcode-container" id="qrcode-container"></div>
                <p class="booking-qrcode-caption">(Click QR Code to zoom)</p>
            </div>
            <div class="booking-detail-actions">
                ${getSmartButton(booking)}
                <button class="btn btn-secondary" data-action="download-invoice">Download Invoice</button>
            </div>
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

    if (typeof QRCode !== 'undefined') {
        new QRCode(document.getElementById("qrcode-container"), {
            text: booking.id,
            width: 128,
            height: 128,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        const qrcodeContainer = document.getElementById("qrcode-container");
        let isZoomed = false;
        
        qrcodeContainer.addEventListener('click', () => {
            if (!isZoomed) {
                qrcodeContainer.classList.add('zoomed');
                isZoomed = true;
            } else {
                qrcodeContainer.classList.remove('zoomed');
                isZoomed = false;
            }
        });

        document.addEventListener('click', (event) => {
            if (isZoomed && !qrcodeContainer.contains(event.target) && event.target !== qrcodeContainer) {
                qrcodeContainer.click();
            }
        });

    } else {
        console.error("QRCode.js library not loaded. Please ensure the script tag is included in your HTML.");
        document.getElementById("qrcode-container").innerHTML = "<p class='qrcode-error'>QR Code library not loaded.</p>";
    }

    modal.querySelector('[data-action="download-invoice"]').addEventListener('click', () => {
        downloadInvoice(booking);
    });
}

// Function showAddInventoryModal has been removed and replaced with a redirect in renderBookingsList

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
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let durationText = `${diffDays} Days`;
        let rateKey = 'Daily';
        if (diffDays >= 30) {
            durationText = 'Monthly';
            rateKey = 'Monthly';
        } else if (diffDays >= 7) {
            durationText = 'Weekly';
            rateKey = 'Weekly';
        } else if (diffDays >= 1) {
            durationText = 'Daily';
            rateKey = 'Daily';
        }

        const rate = rates.find(r => r.duration === rateKey)?.price || 0;
        const totalExtensionPrice = diffDays * rate;
        const newTotalPrice = originalBooking.totalPrice + totalExtensionPrice;
        
        return { durationText, newTotalPrice };
    };

    let { durationText, newTotalPrice } = calculatePriceAndDuration(minEndDate, minEndDate);

    const extendModalContent = `
        <div class="booking-details-modal-header">
            <h3 class="modal-title">Extend Booking: ${originalBooking.storageType}</h3>
            <button type="button" class="close-modal-btn">&times;</button>
        </div>
        <div class="booking-details-modal-body booking-extend-body">
            <h4>Original Booking</h4>
            <p><strong>ID:</strong> ${originalBooking.id}</p>
            <p><strong>Location:</strong> ${originalBooking.locationName}</p>
            <p><strong>Duration:</strong> ${originalBooking.duration}</p>
            <p><strong>Current End Date:</strong> ${formatDate(originalBooking.endDate)}</p>
            
            <h4 class="mt-1-5">Extension Details</h4>
            <div class="input-group">
                <label for="new-end-date-input">New End Date:</label>
                <input type="date" id="new-end-date-input" class="form-control" value="${minEndDateString}" min="${minEndDateString}">
            </div>
            <p><strong>New Duration:</strong> <span id="new-duration-span">${durationText}</span></p>
            <p><strong>New Total Price:</strong> <span id="new-total-price-span" class="booking-total-price">$${newTotalPrice.toFixed(2)}</span></p>

            <h4 class="mt-1-5">Payment Method</h4>
            <div class="payment-options">
                <label class="payment-option">
                    <input type="radio" name="paymentMethod" value="online" checked>
                    Online Payment (iPaymu)
                </label>
            </div>

            <div class="booking-detail-actions">
                <button class="btn btn-primary" id="confirm-extend-btn"><i class="fas fa-check-circle"></i> Confirm Extension</button>
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
    const newTotalPriceSpan = extendModal.querySelector('#new-total-price-span');

    newEndDateInput.addEventListener('change', (e) => {
        const newSelectedDate = new Date(e.target.value);
        const { durationText, newTotalPrice } = calculatePriceAndDuration(minEndDate, newSelectedDate);
        newDurationSpan.textContent = durationText;
        newTotalPriceSpan.textContent = `$${newTotalPrice.toFixed(2)}`;
    });

    extendModal.querySelector('.close-modal-btn').addEventListener('click', () => {
        extendModal.style.display = 'none';
        extendModal.remove();
    });

    extendModal.querySelector('#confirm-extend-btn').addEventListener('click', async () => {
        showLoader(true, 'Processing extension...');
        try {
            const newEndDateTimestamp = new Date(newEndDateInput.value).getTime();
            const selectedPaymentMethod = extendModal.querySelector('input[name="paymentMethod"]:checked').value;
            const finalPrice = parseFloat(newTotalPriceSpan.textContent.replace('$', ''));

            await updateBookingStatus(originalBooking.id, 'extended', {
                endDate: newEndDateTimestamp,
                totalPrice: finalPrice,
                paymentMethod: selectedPaymentMethod,
                paymentStatus: 'unpaid',
            });

            const userData = await fetchUserData(user.uid);
            const paymentData = {
                totalPrice: finalPrice,
                id: originalBooking.id,
                userEmail: userData?.email || 'customer@example.com',
                userName: userData?.name || 'Customer'
            };
            await createIpaymuInvoice(paymentData);

            showToast('Booking successfully extended. Redirecting to online payment.', 'success');
            
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
                <button class="btn btn-primary" id="confirm-pay-checkin-btn"><i class="fas fa-check-circle"></i> Confirm Payment & Check In</button>
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


async function renderBookingsList(bookings) {
    const container = document.getElementById('bookings-list-container');
    if (!container) return;

    if (bookings.length === 0) {
        container.innerHTML = `<p class="no-bookings-message">You have no active or past bookings.</p>`;
        return;
    }

    container.innerHTML = bookings.map(booking => {
        return `
            <div class="booking-card">
                <div class="booking-card-content">
                    <div class="booking-card-header">
                        <div>
                            <h4 class="booking-card-title">${booking.locationName}</h4>
                            <p class="booking-card-info">${booking.storageType} - ${booking.duration}</p>
                            <p class="booking-card-info"><b>${formatDate(booking.startDate)}</b> to <b>${formatDate(booking.endDate)}</b></p>
                        </div>
                        <span class="booking-status-badge status-${booking.bookingStatus || 'active'}">
                            ${(booking.bookingStatus || 'active').replace(/_/g, ' ')}
                        </span>
                    </div>
                    <div class="booking-actions">
                        ${getBookingCardActionButtons(booking)}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.booking-actions button[data-action]').forEach(button => {
        button.addEventListener('click', async (event) => {
            const bookingId = event.target.closest('.booking-actions').querySelector('button[data-booking-id]').dataset.bookingId;
            const action = event.target.dataset.action;
            const selectedBooking = bookings.find(b => b.id === bookingId);

            if (!selectedBooking) return;

            if (action === 'request_pickup') {
                    showLoader(false);
                    const user = getCurrentUser();
                    if (!user) {
                        showToast("Please log in to request a pickup.", 'error');
                        location.hash = '#/auth';
                        return;
                    }

                    const bookingCreatedAt = selectedBooking.createdAt;
                    const minPickupTime = new Date(bookingCreatedAt + 3 * 60 * 60 * 1000);
                    const now = new Date();

                    if (now > minPickupTime) {
                        minPickupTime.setTime(now.getTime() + 5 * 60 * 1000);
                    }

                    const minTime = minPickupTime.toTimeString().slice(0, 5);

                    Swal.fire({
                        title: 'Request Pickup Time',
                        html: `<p>Select a time for pickup. Minimum time is 3 hours after booking.</p>
                               <input type="time" id="pickup-time" class="swal2-input" min="${minTime}">`,
                        confirmButtonText: 'Confirm Pickup Time',
                        showCancelButton: true,
                        preConfirm: () => {
                            const pickupTime = document.getElementById('pickup-time').value;
                            if (!pickupTime) {
                                Swal.showValidationMessage('Please select a valid time.');
                                return false;
                            }
                            const [hours, minutes] = pickupTime.split(':');
                            const selectedDateTime = new Date();
                            selectedDateTime.setHours(hours, minutes, 0, 0);

                            if (selectedDateTime < minPickupTime) {
                                Swal.showValidationMessage(`Time cannot be in the past. Minimum time is ${minTime}.`);
                                return false;
                            }
                            return pickupTime;
                        }
                    }).then(async (result) => {
                        if (result.isConfirmed) {
                            const pickupTime = result.value;
                            showLoader(true, 'Processing your pickup request...');

                            try {
                                await updateBookingStatus(selectedBooking.id, selectedBooking.bookingStatus, { pickupTime: pickupTime, pickupStatus: 'requested' });
                                await requestPickup(selectedBooking.locationId, {
                                    bookingId: selectedBooking.id,
                                    userId: user.uid,
                                    pickupAddress: selectedBooking.pickupAddress,
                                    pickupTime: pickupTime,
                                    status: 'requested',
                                    locationName: selectedBooking.locationName,
                                    timestamp: Date.now()
                                });
                                showToast('Pickup request sent successfully!', 'success');

                            } catch (error) {
                                console.error('Error processing pickup request:', error);
                                showToast('Failed to send pickup request. Please try again.', 'error');
                            } finally {
                                showLoader(false);
                            }
                        }
                    });
            } else {
                showLoader(true, `Performing ${action} for booking ID: ${bookingId}...`);
                try {
                    if (action === 'checkin') {
                        await updateBookingStatus(bookingId, 'checked_in', { checkInTime: Date.now() });
                        showToast('Check-in successful!', 'success');
                    } else if (action === 'pay_to_checkin') {
                        showLoader(false);
                        showPayToCheckInModal(selectedBooking);
                        return;
                    } else if (action === 'checkout') {
                        await updateBookingStatus(bookingId, 'completed', { checkOutTime: Date.now() });
                        showToast('Check-out successful!', 'success');
                    } else if (action === 'add_inventory') {
                        showLoader(false);
                        localStorage.setItem('currentBookingId', bookingId);
                        location.hash = '#/add-inventory';
                        return;
                    } else if (action === 'extend') {
                        showLoader(false);
                        showExtendConfirmationModal(selectedBooking);
                        return;
                    } else if (action === 'details') {
                        showLoader(false);
                        showBookingDetailsModal(selectedBooking);
                        return;
                    } else if (action === 'review') {
                        showLoader(false);
                        showReviewModal(selectedBooking);
                        return;
                    }
                } catch (error) {
                    console.error(`Error performing ${action} for booking ${bookingId}:`, error);
                    showToast(`Failed to perform action "${action}". Please try again.`, 'error');
                } finally {
                    showLoader(false);
                }
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