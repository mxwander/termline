// Termline's service worker: keeps a copy of the app's files on the device so it
// opens even with no internet. (Your classes and tasks are kept offline by Firebase.)
//
// - Termline's own files: try the internet first so you always get the newest
//   version, and fall back to the saved copy when offline or the network is slow.
// - Firebase's code and the fonts never change at the same address, so use the
//   saved copy first.

const CACHE = "termline";

const APP_FILES = [
    "./",
    "index.html",
    "calendar.html",
    "edit.html",
    "signin.html",
    "styles.css",
    "theme.js",
    "storage.js",
    "task-details.js",
    "home.js",
    "calendar.js",
    "edit.js",
    "account.js",
    "data-sync.js",
    "firebase.js",
    "firebase-config.js",
    "signin.js",
    "manifest.webmanifest",
    "icons/icon.svg",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/apple-touch-icon.png",
    "icons/favicon-32.png",
    "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js",
    "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js",
    "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js",
];

// 1. When installed, save every file, then take over right away
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => cache.addAll(APP_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

// 2. Answer each request for a file
self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    const isOwnFile = url.origin === self.location.origin;
    const neverChanges = url.hostname === "www.gstatic.com"
        || url.hostname === "fonts.googleapis.com"
        || url.hostname === "fonts.gstatic.com";

    // Anything else (like Firebase saving and loading data) goes straight to the internet
    if (isOwnFile) {
        event.respondWith(internetFirst(request));
    } else if (neverChanges) {
        event.respondWith(savedCopyFirst(request));
    }
});

async function internetFirst(request) {
    const cache = await caches.open(CACHE);
    const download = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());   // keep the newest copy
        return response;
    });
    download.catch(() => {});   // offline is expected; don't log it as an error

    // Wait up to 4 seconds for the internet (school Wi-Fi can be slow), then use the saved copy
    const slow = new Promise(resolve => setTimeout(resolve, 4000));
    try {
        const winner = await Promise.race([download, slow]);
        if (winner) return winner;
    } catch {
        // No internet: fall through to the saved copy
    }

    const saved = await cache.match(request, { ignoreSearch: true });
    return saved || download;
}

async function savedCopyFirst(request) {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(request);
    if (saved) return saved;

    const response = await fetch(request);
    if (response.ok || response.type === "opaque") cache.put(request, response.clone());
    return response;
}