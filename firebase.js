// Loads Firebase from Google's servers and sets it up for Termline.
// Every other file gets Firebase from here, so the version number lives in one place.
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// The database, with an offline copy on the device that works across open tabs.
// Long polling uses ordinary web requests instead of one long-lasting connection,
// which school, work, and public Wi-Fi networks often cut off.
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    experimentalForceLongPolling: true,
});

// Pass along the database functions the other files need
export {
    collection,
    doc,
    onSnapshot,
    writeBatch,
    terminate,
    clearIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

// Pass along the sign-in functions the other files need
export {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    sendEmailVerification,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    reload,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";