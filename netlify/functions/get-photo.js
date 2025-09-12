// File: netlify/functions/get-photo.js
import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  try {
    const url = new URL(event.rawUrl);
    const key = url.searchParams.get('key');

    if (!key) {
      return { statusCode: 400, body: 'Missing photo key' };
    }

const store = getStore({
  name: 'images',
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_API_TOKEN,
});
    const blob = await store.get(key, { type: 'blob' });

    if (!blob) {
      return { statusCode: 404, body: 'Photo not found' };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      body: Buffer.from(await blob.arrayBuffer()).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error("Get-photo Error:", err);
    return { statusCode: 500, body: `Server Error: ${err.message}` };
  }
};
