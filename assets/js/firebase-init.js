let firebaseApp;
let auth;
let db;
let storage;
let googleAuthProvider;

let firebaseConfig = {
  apiKey: "AIzaSyCLn-I_DTXGIrmmrxnbLu0qO6ZxfToyZwM",
  authDomain: "storapedia-project.firebaseapp.com",
  databaseURL: "https://storapedia-project-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "storapedia-project",
  storageBucket: "storapedia-project.firebasestorage.app",
  messagingSenderId: "602982028442",
  appId: "1:602982028442:web:021b624608e7469fb87b23"
};

async function initializeFirebase() {
  if (firebaseApp) {
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