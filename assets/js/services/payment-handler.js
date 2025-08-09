import { showLoader, showToast } from '../ui/ui-helpers.js';

export async function createIpaymuInvoice(bookingData) {
    showLoader(true, 'Redirecting to payment...');
    try {
        const response = await fetch('/api/ipaymu-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: bookingData.totalPrice,
                bookingId: bookingData.id,
                userEmail: bookingData.userEmail,
                userName: bookingData.userName
            })
        });

        if (!response.ok) {
            throw new Error('Failed to create payment invoice.');
        }

        const invoice = await response.json();
        
        window.location.href = invoice.invoice_url;

    } catch (error) {
        console.error('iPaymu Invoice Error:', error);
        showToast('Could not proceed to payment. Please try again.', 'error');
        showLoader(false);
    }
}