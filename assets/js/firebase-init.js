let firebaseApp;
let auth;
let db;
let storage;
let googleAuthProvider;

let firebaseConfig = null;

async function fetchFirebaseConfig() {
  try {
    const response = await fetch('/.netlify/functions/config');
    if (!response.ok) {
      throw new Error('Gagal memuat konfigurasi dari Netlify Function');
    }
    const configData = await response.json();

    firebaseConfig = {
      apiKey: configData.STORAPEDIA_API_KEY,
      authDomain: configData.STORAPEDIA_AUTH_DOMAIN,
      databaseURL: configData.STORAPEDIA_DATABASE_URL,
      projectId: configData.STORAPEDIA_PROJECT_ID,
      storageBucket: configData.STORAPEDIA_STORAGE_BUCKET,
      messagingSenderId: configData.STORAPEDIA_MESSAGING_SENDER_ID,
      appId: configData.STORAPEDIA_APP_ID,
    };
  } catch (error) {
    document.body.innerHTML = `
      <div style="text-align: center; padding: 50px; font-family: sans-serif; color: #333;">
        <h1>Application Error</h1>
        <p>Gagal memuat konfigurasi aplikasi. Mohon periksa koneksi internet Anda atau coba lagi nanti.</p>
      </div>`;
    throw error;
  }
}

async function initializeFirebase() {
  if (firebaseApp) {
    return;
  }

  if (!firebaseConfig) {
    await fetchFirebaseConfig();
  }
  
  if (!firebaseConfig) {
      return;
  }

  try {
    firebaseApp = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.database();
    storage = firebase.storage();
    googleAuthProvider = new firebase.auth.GoogleAuthProvider();
  } catch (error) {
    document.body.innerHTML = `
      <div style="text-align: center; padding: 50px; font-family: sans-serif; color: #333;">
        <h1>Firebase Initialization Error</h1>
        <p>Aplikasi tidak dapat terhubung ke Firebase. Mohon periksa konfigurasi server.</p>
      </div>`;
  }
}

export {
  initializeFirebase,
  auth,
  db,
  storage,
  googleAuthProvider,
  firebaseApp
};
