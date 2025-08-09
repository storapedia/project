const QRCode = require('qrcode');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  const dataToEncode = event.queryStringParameters.text || (event.body ? JSON.parse(event.body).text : null);

  if (!dataToEncode) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing "text" parameter to encode.' }),
    };
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(dataToEncode);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ qrCodeImage: qrDataUrl }),
    };
  } catch (error) {
    console.error('Error generating QR code:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to generate QR code.', error: error.message }),
    };
  }
};