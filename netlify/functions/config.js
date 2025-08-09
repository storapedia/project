exports.handler = async function(event, context) {
  return {
    statusCode: 200,
    body: JSON.stringify({
      Maps_API_KEY: process.env.MAPS_API_KEY,
      STORAPEDIA_API_KEY: process.env.STORAPEDIA_API_KEY,
      STORAPEDIA_AUTH_DOMAIN: process.env.STORAPEDIA_AUTH_DOMAIN,
      STORAPEDIA_PROJECT_ID: process.env.STORAPEDIA_PROJECT_ID,
      STORAPEDIA_STORAGE_BUCKET: process.env.STORAPEDIA_STORAGE_BUCKET,
      STORAPEDIA_MESSAGING_SENDER_ID: process.env.STORAPEDIA_MESSAGING_SENDER_ID,
      STORAPEDIA_APP_ID: process.env.STORAPEDIA_APP_ID,
      STORAPEDIA_DATABASE_URL: process.env.STORAPEDIA_DATABASE_URL,
      XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY,
    }),
  };
};