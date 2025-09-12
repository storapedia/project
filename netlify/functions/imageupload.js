// File: netlify/functions/imageupload.js
import { getStore } from '@netlify/blobs';
import busboy from 'busboy';

// Helper: parsing multipart form
const parseMultipartForm = (event) => {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: event.headers });
    const files = {};

    bb.on('file', (name, file, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => {
        files[name] = { filename, mimeType, content: Buffer.concat(chunks) };
      });
    });

    bb.on('error', reject);
    bb.on('close', () => resolve({ files }));

    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body);
    bb.end(bodyBuffer);
  });
};

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { files } = await parseMultipartForm(event);
    const uploadedFile = files.file;
    if (!uploadedFile) {
      return { statusCode: 400, body: 'No file uploaded' };
    }

const store = getStore({
  name: 'images',
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_API_TOKEN,
});
    const key = `${Date.now()}-${uploadedFile.filename}`;
    await store.set(key, uploadedFile.content, { type: uploadedFile.mimeType });

    const siteUrl = process.env.URL || `https://${process.env.DEPLOY_PRIME_URL}`;
    const finalUrl = `${siteUrl}/.netlify/functions/get-photo?key=${encodeURIComponent(key)}`;

    return {
      statusCode: 200,
      body: JSON.stringify({ url: finalUrl }),
    };
  } catch (error) {
    console.error('Upload Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
