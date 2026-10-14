// ===== App data: an in-memory copy, kept in sync with the signed-in account =====
//
// data-sync.js fills this copy from Firebase and keeps it up to date.
// Pages read and change it with loadData() and saveData(), just like before,
// and saveData() sends only what changed up to Firebase.

const dataCache = { classes: [], tasks: [] };
let dataReady = false;
const readyCallbacks = [];
const changeCallbacks = [];
let cloudWriter = null;   // set by data-sync.js once someone is signed in

// Get a copy of a list ("classes" or "tasks")
function loadData(key) {
    return structuredClone(dataCache[key] || []);
}

// Save a whole list. Works out which items were added, changed, or removed,
// and sends just those to the account.
function saveData(key, items) {
    const before = new Map((dataCache[key] || []).map(item => [item.id, item]));
    const after = new Set(items.map(item => item.id));
    const changes = [];

    for (const item of items) {
        if (!sameData(before.get(item.id), item)) changes.push({ type: "set", item });
    }
    for (const id of before.keys()) {
        if (!after.has(id)) changes.push({ type: "delete", id });
    }

    dataCache[key] = structuredClone(items);

    // Returns a promise that finishes once Firebase confirms the save
    if (cloudWriter && changes.length > 0) return cloudWriter(key, changes);
    return Promise.resolve();
}

// True if two items hold the same data (ignores the order of their fields)
function sameData(a, b) {
    const sorted = (value) => {
        if (Array.isArray(value)) return value.map(sorted);
        if (value && typeof value === "object") {
            return Object.keys(value).sort().reduce((out, k) => ({ ...out, [k]: sorted(value[k]) }), {});
        }
        return value;
    };
    return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

// Run something once the account's data has loaded (right away if it already has)
function whenDataReady(callback) {
    if (dataReady) {
        callback();
    } else {
        readyCallbacks.push(callback);
    }
}

// Run something whenever the data changes, including changes from another device
function onDataChange(callback) {
    changeCallbacks.push(callback);
}

// --- Used only by data-sync.js ---

function receiveData(key, items) {
    dataCache[key] = items;
}

function dataUpdated() {
    if (!dataReady) {
        dataReady = true;
        readyCallbacks.forEach(callback => callback());
    } else {
        changeCallbacks.forEach(callback => callback());
    }
}

function setCloudWriter(writer) {
    cloudWriter = writer;
}

// Make a unique ID so each class and task can be found later for editing or deleting
function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Show a short pop-up message at the top of the screen
function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    // If a pop-up window is open, show the message inside it so it isn't hidden behind it
    const host = document.querySelector("dialog[open]") || document.body;
    host.appendChild(toast);

    setTimeout(() => toast.classList.add("hide"), 2000);
    setTimeout(() => toast.remove(), 2300);
}


// ===== Task helpers =====

// The exact moment a task is due, as a JavaScript Date
function taskDueDate(task) {
    return new Date(`${task.dueDate}T${task.dueTime}`);
}

// A due date written out for people, like "Thu, Oct 9 at 11:59 PM"
function formatDue(task) {
    const due = taskDueDate(task);
    const day = due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const time = due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${day} at ${time}`;
}

// The task's type, using the typed-in name for "Other"
function taskTypeLabel(task) {
    return task.type === "Other" ? task.customType : task.type;
}

// True once a completed task should drop off the checklist and Saved Tasks list:
// - completed on time: after its due date and time passes
// - completed late: at midnight at the end of the day it was completed
function isTaskFinished(task) {
    if (!task.completed) {
        return false;
    }
    const due = taskDueDate(task);
    const completedAt = new Date(task.completedAt);

    let dropOff = due;
    if (completedAt > due) {
        dropOff = new Date(completedAt);
        dropOff.setHours(24, 0, 0, 0);
    }
    return new Date() >= dropOff;
}


// Where a task stands right now:
// "upcoming" (not done, not due yet), "overdue" (not done, past due),
// "done" (completed on time), or "late" (completed after it was due)
function taskStatus(task, now = new Date()) {
    const due = taskDueDate(task);
    if (!task.completed) {
        return due < now ? "overdue" : "upcoming";
    }
    return new Date(task.completedAt) > due ? "late" : "done";
}

// Check off a task (done = true) or uncheck it (done = false)
function setTaskCompleted(id, done) {
    const tasks = loadData("tasks");
    const task = tasks.find(t => t.id === id);
    task.completed = done;
    task.completedAt = done ? new Date().toISOString() : null;
    saveData("tasks", tasks);
}

// 90 -> "1 hr 30 min", 120 -> "2 hr", 45 -> "45 min"
function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const parts = [];
    if (hours > 0) parts.push(`${hours} hr`);
    if (mins > 0) parts.push(`${mins} min`);
    return parts.join(" ");
}


// ===== Page-building helpers =====

// Create an element with an optional class and text: el("span", "dot")
function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

// plural(1, "task") -> "1 task", plural(3, "class", "classes") -> "3 classes"
function plural(count, word, pluralWord = word + "s") {
    return `${count} ${count === 1 ? word : pluralWord}`;
}



// ===== Time and date helpers =====

// Day letters used in meeting times, indexed by JavaScript's getDay() (0 = Sunday)
const DAY_LETTERS = ["U", "M", "T", "W", "H", "F", "S"];

// "13:55" -> 835 (minutes after midnight), like to_minutes in your Python schedule builder
function toMinutes(hhmm) {
    const [hours, minutes] = hhmm.split(":").map(Number);
    return hours * 60 + minutes;
}

// "13:55" -> "1:55 PM"
function formatTime(hhmm) {
    const [hours, minutes] = hhmm.split(":").map(Number);
    const suffix = hours < 12 ? "AM" : "PM";
    return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

// A Date -> "2026-10-08", the same format tasks use for dueDate
function dateKey(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}