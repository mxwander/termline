import {
    auth,
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
} from "./firebase.js";

const form = document.getElementById("auth-form");
const nameField = document.getElementById("name-field");
const submitButton = document.getElementById("submit-button");
const forgotButton = document.getElementById("forgot-button");
const errorBox = document.getElementById("auth-error");
const formsBox = document.getElementById("auth-forms");
const verifyScreen = document.getElementById("verify-screen");
const verifyError = document.getElementById("verify-error");

let mode = "signin";   // "signin" or "signup"

// After clicking the link in the verification email, Firebase offers a button back to here
const VERIFY_SETTINGS = { url: new URL("signin.html", window.location.href).href };


// ===== Switching between Sign in and Create account =====

function setMode(newMode) {
    mode = newMode;
    const signingUp = mode === "signup";

    nameField.hidden = !signingUp;
    form.elements.name.required = signingUp;
    form.elements.password.autocomplete = signingUp ? "new-password" : "current-password";
    forgotButton.hidden = signingUp;
    submitButton.textContent = signingUp ? "Create account" : "Sign in";
    document.getElementById("switch-text").textContent = signingUp ? "Already have an account?" : "New to Termline?";
    document.getElementById("switch-button").textContent = signingUp ? "Sign in" : "Create an account";
    hideError();
}

document.getElementById("switch-button").addEventListener("click", () => {
    setMode(mode === "signin" ? "signup" : "signin");
});


// ===== Error messages people can understand =====

function friendlyError(error) {
    const messages = {
        "auth/invalid-credential": "That email or password is incorrect.",
        "auth/invalid-email": "That doesn't look like a valid email address.",
        "auth/email-already-in-use": "There's already an account with that email. Try signing in.",
        "auth/weak-password": "Passwords need at least 6 characters.",
        "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
        "auth/network-request-failed": "Couldn't connect. Check your internet and try again.",
        "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups and try again.",
    };
    return messages[error.code] || "Something went wrong. Please try again.";
}

function showError(message, box = errorBox) {
    box.textContent = message;
    box.hidden = false;
}

function hideError() {
    errorBox.hidden = true;
    verifyError.hidden = true;
}

function setBusy(busy) {
    document.querySelectorAll(".auth-card button").forEach(b => b.disabled = busy);
}


// ===== Email sign in / create account =====

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideError();

    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;

    setBusy(true);
    try {
        if (mode === "signup") {
            const name = form.elements.name.value.trim();
            const result = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(result.user, { displayName: name });
            await sendEmailVerification(result.user, VERIFY_SETTINGS);
            showVerifyScreen(result.user);
        } else {
            await signInWithEmailAndPassword(auth, email, password);
            // onAuthStateChanged (below) decides where to go next
        }
    } catch (error) {
        showError(friendlyError(error));
    } finally {
        setBusy(false);
    }
});


// ===== Google sign in =====

document.getElementById("google-button").addEventListener("click", async () => {
    hideError();
    try {
        await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
        const closedOnPurpose = ["auth/popup-closed-by-user", "auth/cancelled-popup-request"];
        if (!closedOnPurpose.includes(error.code)) showError(friendlyError(error));
    }
});


// ===== Forgot password =====

forgotButton.addEventListener("click", async () => {
    hideError();
    const email = form.elements.email.value.trim();
    if (!email) {
        showError("Type your email above first, then click \"Forgot password?\" again.");
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        // Same message whether or not an account exists, so strangers can't check who has one
        showToast("If there's an account for that email, a reset link is on its way.");
    } catch (error) {
        showError(friendlyError(error));
    }
});


// ===== "Verify your email" screen =====

function showVerifyScreen(user) {
    document.getElementById("verify-email").textContent = user.email;
    formsBox.hidden = true;
    verifyScreen.hidden = false;
}

function showForms() {
    verifyScreen.hidden = true;
    formsBox.hidden = false;
}

document.getElementById("verified-button").addEventListener("click", async () => {
    hideError();
    await reload(auth.currentUser);   // ask Firebase for the latest verified status
    if (auth.currentUser.emailVerified) {
        window.location.replace("index.html");
    } else {
        showError("Not verified yet. Click the link in the email, then try again.", verifyError);
    }
});

document.getElementById("resend-button").addEventListener("click", async () => {
    hideError();
    try {
        await sendEmailVerification(auth.currentUser, VERIFY_SETTINGS);
        showToast("Verification email sent.");
    } catch (error) {
        showError(friendlyError(error), verifyError);
    }
});

document.getElementById("different-button").addEventListener("click", async () => {
    await signOut(auth);
    form.reset();
    showForms();
});


// ===== Where to go when the page opens or someone signs in =====

onAuthStateChanged(auth, (user) => {
    if (user && user.emailVerified) {
        window.location.replace("index.html");
        return;
    }
    if (user) {
        showVerifyScreen(user);
    } else {
        showForms();
    }
    document.documentElement.classList.remove("auth-pending");   // show the page
});