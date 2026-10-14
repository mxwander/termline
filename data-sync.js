// Keeps the signed-in person's classes and tasks in sync with Firebase.
// Their data lives at  users/{their id}/classes/...  and  users/{their id}/tasks/...
// The security rules only let each person read and write their own folder.
import { auth, db, onAuthStateChanged, collection, doc, onSnapshot, writeBatch } from "./firebase.js";

const KEYS = ["classes", "tasks"];
let started = false;

onAuthStateChanged(auth, async (user) => {
    if (!user || !user.emailVerified || started) return;   // account.js handles redirects
    started = true;

    // Right after verifying an email, the sign-in pass sent to the database can still
    // say "not verified" for up to an hour. Get a fresh one so the rules let us in.
    try {
        const token = await user.getIdTokenResult();
        if (!token.claims.email_verified) await user.getIdToken(true);
    } catch (error) {
        console.warn("Couldn't refresh sign-in (offline?):", error);
    }

    // 1. Listen to their classes and tasks. Firebase sends the current data right away
    //    (from the offline copy if there's no internet) and again whenever it changes.
    const arrived = new Set();
    for (const key of KEYS) {
        onSnapshot(
            collection(db, "users", user.uid, key),
            (snapshot) => {
                receiveData(key, snapshot.docs.map(d => d.data()));
                arrived.add(key);
                if (arrived.size === KEYS.length) dataUpdated();
            },
            (error) => {
                console.error(error);
                showToast("Couldn't load your data. Try refreshing.", "error");
            }
        );
    }

    // 2. When a page saves, send just the changes. Offline, Firebase holds them and
    //    uploads automatically once the connection is back.
    //    Returns a promise that finishes once Firebase confirms everything was saved.
    setCloudWriter((key, changes) => {
        const commits = [];

        // A batch can hold at most 500 changes, so split big ones (like Clear everything)
        for (let i = 0; i < changes.length; i += 400) {
            const batch = writeBatch(db);
            for (const change of changes.slice(i, i + 400)) {
                const id = change.type === "set" ? change.item.id : change.id;
                const ref = doc(db, "users", user.uid, key, id);
                if (change.type === "set") {
                    batch.set(ref, change.item);
                } else {
                    batch.delete(ref);
                }
            }
            commits.push(batch.commit());
        }

        const allSaved = Promise.all(commits);
        allSaved.catch((error) => {
            console.error(error);
            showToast("Couldn't save that change. Try again.", "error");
        });
        return allSaved;
    });

    // 3. The first time someone signs in on this device, move over any classes and
    //    tasks saved here from before accounts existed
    whenDataReady(moveOldDeviceData);
});


async function moveOldDeviceData() {
    const moved = {};

    for (const key of KEYS) {
        const saved = localStorage.getItem(key);
        if (!saved) continue;

        let oldItems = [];
        try {
            oldItems = JSON.parse(saved);
        } catch {
            localStorage.removeItem(key);   // unreadable, nothing to move
            continue;
        }

        const current = loadData(key);
        const existingIds = new Set(current.map(item => item.id));
        const toAdd = oldItems.filter(item => item && item.id && !existingIds.has(item.id));

        try {
            if (toAdd.length > 0) {
                await saveData(key, current.concat(toAdd));   // waits for Firebase to confirm
                moved[key] = toAdd.length;
            }
            // Only now is it safe to remove this device's copy
            localStorage.removeItem(key);
        } catch (error) {
            // Not saved, so keep the device copy and try again next time
            console.error("Moving old data failed; will retry next time:", error);
            return;
        }
    }

    if (moved.classes || moved.tasks) {
        const parts = [];
        if (moved.classes) parts.push(plural(moved.classes, "class", "classes"));
        if (moved.tasks) parts.push(plural(moved.tasks, "task"));
        showToast(`Added ${parts.join(" and ")} from this device to your account.`);
    }
}