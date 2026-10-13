// Runs on Home, Calendar, and Edit:
// 1. Sends anyone who isn't signed in (or hasn't verified their email) to the sign-in page
// 2. Adds the account button (their initial) at the bottom of the sidebar
import { auth, onAuthStateChanged, signOut } from "./firebase.js";

onAuthStateChanged(auth, (user) => {
    if (!user || !user.emailVerified) {
        window.location.replace("signin.html");
        return;
    }
    addAccountButton(user);
    document.documentElement.classList.remove("auth-pending");   // show the page
});


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
    signOutButton.addEventListener("click", () => signOut(auth));   // the check above then redirects
    menu.append(signOutButton);

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