// Variabel global untuk menyimpan instance Firebase
let firebaseApp;
let auth;
let db;
let storage;
let googleAuthProvider;

/**
 * Mengambil seluruh konfigurasi dari Netlify Function.
 */
async function fetchConfigFromServer() {
    try {
        const response = await fetch('/.netlify/functions/config');
        if (!response.ok) {
            throw new Error(`Failed to fetch config, status: ${response.status}`);
        }
        const configData = await response.json();
        return configData;
    } catch (error) {
        console.error('CRITICAL: Could not fetch application config.', error);
        document.body.innerHTML = `
            <div style="text-align: center; padding: 50px; font-family: sans-serif; color: #333;">
                <h1>Application Error</h1>
                <p>Could not load application settings. Please check your internet connection and try again.</p>
            </div>`;
        return null;
    }
}

/**
 * Fungsi inisialisasi utama untuk Firebase.
 * Harus dipanggil dengan 'await' di main.js.
 */
async function initializeFirebase() {
    // Hindari inisialisasi ganda
    if (firebaseApp) {
        return;
    }

    console.log("Fetching remote configuration...");
    const configData = await fetchConfigFromServer();

    // Hentikan jika konfigurasi gagal dimuat
    if (!configData) {
        throw new Error("Firebase initialization failed because config could not be loaded.");
    }
    
    // ========================================================================
    // PERBAIKAN KUNCI #1: Simpan seluruh config ke window object.
    // Ini membuat MAPS_API_KEY tersedia secara global untuk main.js
    window.APP_CONFIG = configData;
    console.log("✅ Configuration loaded and set globally in window.APP_CONFIG.");
    // ========================================================================

    try {
        // PERBAIKAN KUNCI #2: Buat objek firebaseConfig secara manual
        // dari data config yang "datar", sesuai kode asli Anda.
        const firebaseConfig = {
            apiKey: configData.STORAPEDIA_API_KEY,
            authDomain: configData.STORAPEDIA_AUTH_DOMAIN,
            databaseURL: configData.STORAPEDIA_DATABASE_URL,
            projectId: configData.STORAPEDIA_PROJECT_ID,
            storageBucket: configData.STORAPEDIA_STORAGE_BUCKET,
            messagingSenderId: configData.STORAPEDIA_MESSAGING_SENDER_ID,
            appId: configData.STORAPEDIA_APP_ID,
        };

        // Inisialisasi Firebase menggunakan sintaks v8
        firebaseApp = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.database();
        storage = firebase.storage();
        googleAuthProvider = new firebase.auth.GoogleAuthProvider();
        
        console.log("✅ Firebase v8 initialized successfully.");

    } catch (error) {
        console.error('CRITICAL: Firebase initialization error.', error);
        document.body.innerHTML = `
          <div style="text-align: center; padding: 50px; font-family: sans-serif; color: #333;">
            <h1>Firebase Initialization Error</h1>
            <p>The application could not connect to its services. Please contact support.</p>
          </div>`;
    }
}

// Ekspor semua instance yang dibutuhkan oleh file lain
export {
    initializeFirebase,
    auth,
    db,
    storage,
    googleAuthProvider,
    firebaseApp
};