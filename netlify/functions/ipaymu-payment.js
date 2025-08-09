import fetch from 'node-fetch';

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: 'Method Not Allowed'
        };
    }

    try {
        const { amount, bookingId, userEmail, userName } = JSON.parse(event.body);

        const ipaymuVa = process.env.IPAYMU_VA;
        const ipaymuApiKey = process.env.IPAYMU_API_KEY;

        if (!ipaymuVa || !ipaymuApiKey) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'iPaymu credentials not set in environment variables.' })
            };
        }

        const data = {
            product: ['Pembayaran Booking'],
            qty: [1],
            price: [amount],
            returnUrl: 'https://storapedia.com/#/bookings',
            notifyUrl: 'https://storapedia.com/.netlify/functions/ipaymu-webhook',
            comments: `Booking ID: ${bookingId}`,
            buyerName: userName,
            buyerEmail: userEmail,
            va: ipaymuVa,
            apiKey: ipaymuApiKey
        };
        
        const formBody = Object.keys(data)
            .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(data[key]))
            .join('&');

        const response = await fetch('https://sandbox.ipaymu.com/api/v2/payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'va': ipaymuVa,
                'apiKey': ipaymuApiKey
            },
            body: formBody
        });

        const result = await response.json();

        if (result.status === 200 && result.data && result.data.url) {
            return {
                statusCode: 200,
                body: JSON.stringify({ invoice_url: result.data.url })
            };
        } else {
            console.error('iPaymu API Error:', result);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to create iPaymu invoice.' })
            };
        }
    } catch (error) {
        console.error('Server Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
};
