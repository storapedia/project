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
        const { totalPrice, paymentMethod, paymentChannel, orderId, name, email, phone } = JSON.parse(event.body);

        const ipaymuVa = process.env.IPAYMU_VA;
        const ipaymuApiKey = process.env.IPAYMU_API_KEY;
        const notifyUrl = 'https://storapedia.com/.netlify/functions/ipaymu-webhook'; // Ganti dengan URL webhook Anda

        if (!ipaymuVa || !ipaymuApiKey) {
            console.error('CRITICAL: iPaymu environment variables are not set.');
            return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error.' }) };
        }

        const numericPrice = parseInt(totalPrice, 10);
        if (isNaN(numericPrice)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid totalPrice value. Must be a number.' })
            };
        }

        const body = {
            name: name,
            phone: phone,
            email: email,
            amount: numericPrice,
            notifyUrl: notifyUrl,
            referenceId: orderId,
            paymentMethod: paymentMethod,
            paymentChannel: paymentChannel,
        };

        const bodyJson = JSON.stringify(body);
        const requestBody = crypto.createHash('sha256').update(bodyJson).digest('hex').toLowerCase();

        const now = new Date();
        const timestamp =
            now.getFullYear().toString() +
            pad(now.getMonth() + 1) +
            pad(now.getDate()) +
            pad(now.getHours()) +
            pad(now.getMinutes()) +
            pad(now.getSeconds());

        const stringToSign = `POST:${ipaymuVa}:${requestBody}:${ipaymuApiKey}`;
        const signature = crypto.createHmac('sha256', ipaymuApiKey).update(stringToSign).digest('hex');

        const response = await fetch('https://sandbox.ipaymu.com/api/v2/payment/direct', {
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

        if (result.Status === 200 && result.Data) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    paymentDetails: result.Data,
                    message: result.Message
                })
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