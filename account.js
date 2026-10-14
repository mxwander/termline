// Runs on Home, Calendar, and Edit:
// 1. Sends anyone who isn't signed in (or hasn't verified their email) to the sign-in page
// 2. Adds the account button (their initial) at the bottom of the sidebar
// 3. Lets them sign out or delete their account
import {
    auth,
    db,
    onAuthStateChanged,
    signOut,
    terminate,
    clearIndexedDbPersistence,
    deleteUser,
    EmailAuthProvider,
    GoogleAuthProvider,
    reauthenticateWithCredential,
    reauthenticateWithPopup,
} from "./firebase.js";

let deleting = false;   // true while deleting the account, so we don't redirect too early

onAuthStateChanged(auth, (user) => {
    if (deleting) return;
    if (!user || !user.emailVerified) {
        window.location.replace("signin.html");
        return;
    }
    addAccountButton(user);
    addOfflineBanner();
    // Show the page once their classes and tasks have loaded
    whenDataReady(() => document.documentElement.classList.remove("auth-pending"));
});


// Sign out, and erase this device's offline copy of their data first
async function signOutAndErase() {
    try {
        await terminate(db);
        await clearIndexedDbPersistence(db);
    } catch (error) {
        // Can fail if Termline is open in another tab; signing out still works
        console.warn("Couldn't erase the offline copy:", error);
    }
    await signOut(auth);   // the check above then sends them to the sign-in page
}


function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function addAccountButton(user) {
    if (document.getElementById("account-button")) return;   // already added

    const name = user.displayName || user.email;

    // Round button with their first initial
    const button = make("button", "account-button", name.trim().charAt(0).toUpperCase());
    button.id = "account-button";
    button.type = "button";
    button.title = name;
    button.setAttribute("aria-label", "Account");

    // Small menu with their name, email, and Sign out
    const menu = make("div", "account-menu");
    menu.hidden = true;
    if (user.displayName) menu.append(make("span", "account-name", user.displayName));
    menu.append(make("span", "account-email", user.email));

    const signOutButton = make("button", "btn btn-secondary", "Sign out");
    signOutButton.type = "button";
    signOutButton.addEventListener("click", signOutAndErase);

    const deleteButton = make("button", "link-button delete-account", "Delete account");
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => {
        menu.hidden = true;
        openDeleteDialog(user);
    });

    menu.append(signOutButton, deleteButton);

    button.addEventListener("click", (event) => {
        event.stopPropagation();
        menu.hidden = !menu.hidden;
    });
    document.addEventListener("click", (event) => {
        if (!menu.contains(event.target)) menu.hidden = true;
    });

    // Put the account button and the theme button side by side at the bottom of the sidebar
    const themeButton = document.getElementById("theme-toggle");
    const footer = make("div", "sidebar-footer");
    themeButton.before(footer);
    footer.append(button, themeButton, menu);
}

// ===== "You're offline" banner =====

function addOfflineBanner() {
    if (document.getElementById("offline-banner")) return;   // already added

    const banner = make("div", "offline-banner", "Offline. Changes will sync when you're back online.");
    banner.id = "offline-banner";
    document.querySelector("main").prepend(banner);

    const update = () => banner.hidden = navigator.onLine;
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
}

// ===== Delete account =====

// Firebase only lets someone delete their account a few minutes after signing in.
// If it's been longer, they have to prove it's them again first.
function needsFreshSignIn(user) {
    const signedInAt = Date.parse(user.metadata.lastSignInTime);
    return Date.now() - signedInAt > 4 * 60 * 1000;
}

function usesPassword(user) {
    return user.providerData.some(provider => provider.providerId === "password");
}

function openDeleteDialog(user) {
    const askForPassword = needsFreshSignIn(user) && usesPassword(user);

    const dialog = make("dialog", "modal modal-small delete-dialog");
    dialog.append(make("h2", null, "Delete account?"));

    const intro = make("p");
    intro.append(
        "This permanently deletes your account and all of your classes and tasks. It can't be undone. Type ",
        make("strong", "mono", "DELETE"),
        " to confirm.",
    );
    const confirmInput = make("input");
    confirmInput.type = "text";
    confirmInput.placeholder = "DELETE";
    confirmInput.autocomplete = "off";
    dialog.append(intro, confirmInput);

    // Email accounts type their password again (Google accounts get a Google pop-up instead)
    let passwordInput = null;
    if (askForPassword) {
        const label = make("label", "field", "Password");
        passwordInput = make("input");
        passwordInput.type = "password";
        passwordInput.autocomplete = "current-password";
        label.append(passwordInput);
        dialog.append(label);
    }

    const errorBox = make("p", "auth-error");
    errorBox.hidden = true;

    const cancelButton = make("button", "btn btn-secondary", "Cancel");
    cancelButton.type = "button";
    const confirmButton = make("button", "btn btn-primary", "Delete account");
    confirmButton.type = "button";
    confirmButton.disabled = true;

    const actions = make("div", "dialog-actions");
    actions.append(cancelButton, confirmButton);
    dialog.append(errorBox, actions);

    confirmInput.addEventListener("input", () => {
        confirmButton.disabled = confirmInput.value !== "DELETE";
    });
    cancelButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove());
    confirmButton.addEventListener("click", () => deleteAccount(user, passwordInput, dialog, errorBox));

    document.body.append(dialog);
    dialog.showModal();
}

async function deleteAccount(user, passwordInput, dialog, errorBox) {
    const buttons = dialog.querySelectorAll("button");
    const showError = (message) => {
        errorBox.textContent = message;
        errorBox.hidden = false;
        buttons.forEach(button => button.disabled = false);
    };

    errorBox.hidden = true;
    if (passwordInput && !passwordInput.value) {
        showError("Enter your password.");
        return;
    }
    buttons.forEach(button => button.disabled = true);

    try {
        // 1. Prove it's really them, if they signed in a while ago
        if (needsFreshSignIn(user)) {
            if (passwordInput) {
                const credential = EmailAuthProvider.credential(user.email, passwordInput.value);
                await reauthenticateWithCredential(user, credential);
            } else {
                await reauthenticateWithPopup(user, new GoogleAuthProvider());
            }
        }

        // 2. Delete all of their classes and tasks
        await Promise.all([saveData("classes", []), saveData("tasks", [])]);

        // 3. Erase this device's offline copy
        deleting = true;
        await terminate(db);
        await clearIndexedDbPersistence(db).catch(() => {});

        // 4. Delete the account itself, then go to the sign-in page
        await deleteUser(user);
        window.location.replace("signin.html?deleted=1");
    } catch (error) {
        console.error(error);
        showError(deleteErrorMessage(error));
    }
}

function deleteErrorMessage(error) {
    const messages = {
        "auth/invalid-credential": "That password is incorrect.",
        "auth/wrong-password": "That password is incorrect.",
        "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
        "auth/network-request-failed": "Couldn't connect. Check your internet and try again.",
        "auth/popup-closed-by-user": "The Google window was closed before you finished. Try again.",
        "auth/cancelled-popup-request": "The Google window was closed before you finished. Try again.",
        "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups and try again.",
        "auth/user-mismatch": "Choose the same Google account you're signed in with.",
        "auth/requires-recent-login": "For your security, sign out, sign back in, and try again.",
    };
    return messages[error.code] || "Couldn't delete your account. Refresh the page and try again.";
}