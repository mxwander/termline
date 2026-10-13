// Loads Firebase from Google's servers and sets it up for Termline.
// Every other file gets Firebase from here, so the version number lives in one place.
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

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