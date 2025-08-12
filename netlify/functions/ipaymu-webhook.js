const fetch = require('node-fetch');
const crypto = require('crypto');

function pad(number) {
    return number < 10 ? '0' + number : number;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { totalPrice, id, userEmail, userName } = JSON.parse(event.body);

        const ipaymuVa = process.env.IPAYMU_VA;
        const ipaymuApiKey = process.env.IPAYMU_API_KEY;

        if (!ipaymuVa || !ipaymuApiKey) {
            console.error('CRITICAL: iPaymu environment variables are not set.');
            return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error.' }) };
        }

        const body = {
            product: ['Storapedia Booking Payment'],
            qty: [1],
            price: [totalPrice],
            returnUrl: 'https://storapedia.com/#/bookings',
            notifyUrl: 'https://storapedia.com/.netlify/functions/ipaymu-webhook',
            referenceId: id,
            buyerName: userName,
            buyerEmail: userEmail,
        };
        const bodyJson = JSON.stringify(body);

        const now = new Date();
        const timestamp =
            now.getFullYear() +
            pad(now.getMonth() + 1) +
            pad(now.getDate()) +
            pad(now.getHours()) +
            pad(now.getMinutes()) +
            pad(now.getSeconds());

        const stringToSign = `POST:${ipaymuVa}:${timestamp}:${bodyJson}`;
        const signature = crypto.createHmac('sha256', ipaymuApiKey).update(stringToSign).digest('hex');
        
        const response = await fetch('https://my.ipaymu.com/api/v2/payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'va': ipaymuVa,
                'signature': signature,
                'timestamp': timestamp
            },
            body: bodyJson
        });

        const result = await response.json();

        if (result.Status === 200 && result.Data && result.Data.Url) {
            return {
                statusCode: 200,
                body: JSON.stringify({ invoice_url: result.Data.Url })
            };
        } else {
            console.error('iPaymu API returned an error:', result);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to create iPaymu invoice.', details: result.Message || 'Unknown error' })
            };
        }
    } catch (error) {
        console.error('--- FATAL ERROR OCCURRED ---', error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: 'Internal Server Error', details: error.message }) 
        };
    }
};
