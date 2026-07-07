// ============================================================
//  FIREBASE CONFIG
//  1. Go to https://console.firebase.google.com  -> create project (free "Spark" plan)
//  2. Project settings -> "Your apps" -> Web app (</>) -> copy the config
//  3. Paste the values below, then set  ENABLED = true
//  Until ENABLED = true, the site runs on local sample data (data/sample.js)
// ============================================================

export const ENABLED = false;

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
