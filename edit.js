const CLASSES_KEY = "classes";
const TASKS_KEY = "tasks";

const classForm = document.getElementById("class-form");
const taskForm = document.getElementById("task-form");
const editDialog = document.getElementById("edit-dialog");
const confirmDialog = document.getElementById("confirm-dialog");

// Sort classes alphabetically by course code
const byCode = (a, b) => a.code.localeCompare(b.code);


// ===== Small helpers =====

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


// ===== Meeting time boxes (work in any class form) =====

function addMeetingBox(form) {
    const meetingsBox = form.querySelector(".meetings");
    const copy = meetingsBox.querySelector(".meeting").cloneNode(true);

    // Clear anything copied from the first meeting box
    copy.querySelectorAll("input[type='time']").forEach(input => input.value = "");
    copy.querySelectorAll("input[type='checkbox']").forEach(box => box.checked = false);
    copy.querySelector(".meeting-type").selectedIndex = 0;

    const removeButton = el("button", "btn btn-secondary remove-meeting", "Remove");
    removeButton.type = "button";
    copy.appendChild(removeButton);

    meetingsBox.appendChild(copy);
    return copy;
}

function removeExtraMeetings(form) {
    form.querySelectorAll(".meeting").forEach((box, index) => {
        if (index > 0) box.remove();
    });
}

function setupClassForm(form) {
    form.querySelector(".add-meeting").addEventListener("click", () => addMeetingBox(form));

    form.querySelector(".meetings").addEventListener("click", (event) => {
        if (event.target.classList.contains("remove-meeting")) {
            event.target.closest(".meeting").remove();
        }
    });
}


// ===== "Other" task type box (works in any task form) =====

function updateOtherField(form) {
    const isOther = form.elements.type.value === "Other";
    form.querySelector(".other-field").hidden = !isOther;
    form.elements.otherType.required = isOther;
}

function setupTaskForm(form) {
    form.elements.type.addEventListener("change", () => updateOtherField(form));
}


// ===== Read a form into an object, or fill a form from an object =====

function readClassForm(form) {
    const meetings = [];
    for (const box of form.querySelectorAll(".meeting")) {
        const days = [...box.querySelectorAll("input[type='checkbox']:checked")].map(b => b.value);
        const start = box.querySelector(".meeting-start").value;
        const end = box.querySelector(".meeting-end").value;

        if (days.length === 0) {
            showToast("Pick at least one day for each meeting time.", "error");
            return null;
        }
        if (end <= start) {
            showToast("Each meeting must end after it starts.", "error");
            return null;
        }

        meetings.push({ type: box.querySelector(".meeting-type").value, days, start, end });
    }

    const f = form.elements;
    return {
        code: f.code.value.trim(),
        title: f.title.value.trim(),
        instructor: f.instructor.value.trim(),
        location: f.location.value.trim(),
        color: f.color.value,
        meetings: meetings,
    };
}

function fillClassForm(form, savedClass) {
    const f = form.elements;
    f.code.value = savedClass.code;
    f.title.value = savedClass.title;
    f.instructor.value = savedClass.instructor;
    f.location.value = savedClass.location;
    f.color.value = savedClass.color;

    removeExtraMeetings(form);
    savedClass.meetings.forEach((meeting, index) => {
        const box = index === 0 ? form.querySelector(".meeting") : addMeetingBox(form);
        box.querySelector(".meeting-type").value = meeting.type;
        box.querySelector(".meeting-start").value = meeting.start;
        box.querySelector(".meeting-end").value = meeting.end;
        box.querySelectorAll("input[type='checkbox']").forEach(b => {
            b.checked = meeting.days.includes(b.value);
        });
    });
}

function readTaskForm(form) {
    const f = form.elements;
    const estMinutes = (Number(f.hours.value) || 0) * 60 + (Number(f.minutes.value) || 0);

    return {
        name: f.name.value.trim(),
        type: f.type.value,
        customType: f.type.value === "Other" ? f.otherType.value.trim() : "",
        classId: f.classId.value,
        dueDate: f.dueDate.value,
        dueTime: f.dueTime.value,
        estMinutes: estMinutes > 0 ? estMinutes : null,
        priority: f.priority.value,
        notes: f.notes.value.trim(),
    };
}

function fillTaskForm(form, task) {
    const f = form.elements;
    f.name.value = task.name;
    f.type.value = task.type;
    f.otherType.value = task.customType;
    f.classId.value = task.classId;
    f.dueDate.value = task.dueDate;
    f.dueTime.value = task.dueTime;
    f.hours.value = task.estMinutes ? Math.floor(task.estMinutes / 60) : "";
    f.minutes.value = task.estMinutes ? task.estMinutes % 60 : "";
    f.priority.value = task.priority;
    f.notes.value = task.notes;
    updateOtherField(form);
}


// ===== Select mode (for deleting several items at once) =====

const selectMode = { class: false, task: false };      // Is each list in select mode?
const selected = { class: new Set(), task: new Set() }; // IDs of checked items
const visibleIds = { class: [], task: [] };             // IDs currently shown in each list

function addSelectBox(row, kind, id) {
    const box = el("input", "select-box");
    box.type = "checkbox";
    box.dataset.kind = kind;
    box.dataset.id = id;
    box.checked = selected[kind].has(id);

    row.classList.add("selectable");
    row.classList.toggle("selected", box.checked);
    row.append(box);
}

function makeControl(select, text, extraClass) {
    const button = el("button", extraClass ? `btn-small ${extraClass}` : "btn-small", text);
    button.type = "button";
    button.dataset.select = select;
    return button;
}

// The buttons in each list's header: Select, or Select all / Delete N / Done
function renderControls(kind) {
    const box = document.querySelector(`.list-controls[data-kind="${kind}"]`);
    box.innerHTML = "";
    const ids = visibleIds[kind];

    if (!selectMode[kind]) {
        if (ids.length > 0) box.append(makeControl("start", "Select"));
        return;
    }

    const allSelected = ids.length > 0 && ids.every(id => selected[kind].has(id));
    const deleteButton = makeControl("delete", `Delete ${selected[kind].size}`, "btn-small-danger");
    deleteButton.disabled = selected[kind].size === 0;

    box.append(
        makeControl("all", allSelected ? "Deselect all" : "Select all"),
        deleteButton,
        makeControl("done", "Done"),
    );
}

function rememberVisible(kind, ids) {
    visibleIds[kind] = ids;
    // Forget selections for items that are no longer shown (for example, deleted)
    for (const id of selected[kind]) {
        if (!ids.includes(id)) selected[kind].delete(id);
    }
}

function exitSelectMode(kind) {
    selectMode[kind] = false;
    selected[kind].clear();
}

function renderList(kind) {
    if (kind === "class") {
        renderClasses();
    } else {
        renderTasks();
    }
}


// ===== Show the saved lists =====

function makeActions(kind, id) {
    const actions = el("div", "item-actions");
    for (const action of ["edit", "delete"]) {
        const button = el("button", "btn-small", action === "edit" ? "Edit" : "Delete");
        button.type = "button";
        button.dataset.action = action;
        button.dataset.kind = kind;
        button.dataset.id = id;
        actions.append(button);
    }
    return actions;
}

function renderClasses() {
    const box = document.getElementById("class-list");
    box.innerHTML = "";

    const classes = loadData(CLASSES_KEY).sort(byCode);
    rememberVisible("class", classes.map(c => c.id));
    renderControls("class");

    if (classes.length === 0) {
        box.append(el("p", null, "No classes saved yet."));
        return;
    }

    const list = el("ul", "item-list");
    for (const savedClass of classes) {
        const row = el("li", "item");
        if (selectMode.class) addSelectBox(row, "class", savedClass.id);

        const dot = el("span", "dot");
        dot.style.background = savedClass.color;

        const info = el("div", "item-info");
        info.append(el("span", "item-title", savedClass.code));
        if (savedClass.title) {
            info.append(el("span", "item-sub", savedClass.title));
        }

        row.append(dot, info);
        if (!selectMode.class) row.append(makeActions("class", savedClass.id));
        list.append(row);
    }
    box.append(list);
}

function renderTasks() {
    const box = document.getElementById("task-list");
    box.innerHTML = "";

    const classes = loadData(CLASSES_KEY).sort(byCode);
    const knownIds = new Set(classes.map(c => c.id));
    const tasks = loadData(TASKS_KEY)
        .filter(task => !isTaskFinished(task))
        .sort((a, b) => taskDueDate(a) - taskDueDate(b));

    rememberVisible("task", tasks.map(t => t.id));
    renderControls("task");

    if (tasks.length === 0) {
        box.append(el("p", null, "No tasks saved yet."));
        return;
    }

    // One group per class (alphabetical), then "No class" at the end
    const groups = classes.map(c => ({ id: c.id, name: c.code, color: c.color }));
    groups.push({ id: "", name: "No class", color: null });

    for (const group of groups) {
        const groupTasks = tasks.filter(task => {
            const classId = knownIds.has(task.classId) ? task.classId : "";
            return classId === group.id;
        });
        if (groupTasks.length === 0) continue;

        const header = el("h3", "group-title");
        if (group.color) {
            const dot = el("span", "dot");
            dot.style.background = group.color;
            header.append(dot);
        }
        header.append(group.name);
        box.append(header);

        const list = el("ul", "item-list");
        for (const task of groupTasks) {
            const row = el("li", "item");
            if (selectMode.task) addSelectBox(row, "task", task.id);

            const info = el("div", "item-info");
            info.append(el("span", "item-title", task.name));
            info.append(el("span", "item-sub mono", `${taskTypeLabel(task)} · Due ${formatDue(task)}`));

            row.append(info);
            if (!selectMode.task) row.append(makeActions("task", task.id));
            list.append(row);
        }
        box.append(list);
    }
}

function fillClassDropdown() {
    const select = taskForm.elements.classId;
    select.innerHTML = '<option value="">None</option>';
    for (const savedClass of loadData(CLASSES_KEY).sort(byCode)) {
        select.append(new Option(savedClass.code, savedClass.id));
    }
}

function refreshAll() {
    renderClasses();
    renderTasks();
    fillClassDropdown();
}


// ===== "Are you sure?" pop-up =====

let confirmAction = null;

function askConfirm(message, action) {
    document.getElementById("confirm-message").textContent = message;
    confirmAction = action;
    confirmDialog.showModal();
}

document.getElementById("confirm-no").addEventListener("click", () => confirmDialog.close());

document.getElementById("confirm-yes").addEventListener("click", () => {
    confirmDialog.close();
    if (confirmAction) confirmAction();
});


// ===== Edit pop-up (also used to add a task from another page) =====

// openEditor("task", id)          -> edit that saved task
// openEditor("task", null, date)  -> add a new task with the due date filled in
function openEditor(kind, id, presetDate) {
    const isClass = kind === "class";
    const isNew = !id;
    const key = isClass ? CLASSES_KEY : TASKS_KEY;
    const item = isNew ? null : loadData(key).find(x => x.id === id);

    // Copy the Add form so the editor has the exact same fields
    const form = (isClass ? classForm : taskForm).cloneNode(true);
    form.removeAttribute("id");
    form.reset();

    if (isClass) {
        setupClassForm(form);
        if (item) fillClassForm(form, item);
    } else {
        setupTaskForm(form);
        if (item) {
            fillTaskForm(form, item);
        } else {
            if (presetDate) form.elements.dueDate.value = presetDate;
            updateOtherField(form);
        }
    }

    // Replace the Save button with Cancel + Save/Update
    const saveButton = form.querySelector("button[type='submit']");
    const noun = isClass ? "Class" : "Task";
    saveButton.textContent = isNew ? `Save ${noun}` : `Update ${noun}`;

    const cancelButton = el("button", "btn btn-secondary", "Cancel");
    cancelButton.type = "button";
    cancelButton.addEventListener("click", () => editDialog.close());

    const actions = el("div", "dialog-actions");
    saveButton.replaceWith(actions);
    actions.append(cancelButton, saveButton);

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = isClass ? readClassForm(form) : readTaskForm(form);
        if (!data) return;

        const items = loadData(key);
        if (isNew) {
            const newItem = isClass
                ? { id: makeId(), ...data }
                : { id: makeId(), ...data, completed: false, completedAt: null };
            items.push(newItem);
        } else {
            Object.assign(items.find(x => x.id === id), data);
        }
        saveData(key, items);

        editDialog.close();
        refreshAll();
        showToast("Saved!");
    });

    editDialog.replaceChildren(el("h2", null, `${isNew ? "Add" : "Edit"} ${noun}`), form);
    editDialog.showModal();
}


// ===== Delete (one item or several selected items) =====

function deleteItems(kind, ids) {
    if (kind === "class") {
        const classes = loadData(CLASSES_KEY);
        const linkedCount = loadData(TASKS_KEY).filter(t => ids.includes(t.classId)).length;

        let message = ids.length === 1
            ? `Delete ${classes.find(c => c.id === ids[0]).code}?`
            : `Delete ${plural(ids.length, "class", "classes")}?`;
        if (linkedCount > 0) {
            message += ` This will also delete ${plural(linkedCount, "linked task")}.`;
        }

        askConfirm(message, () => {
            saveData(CLASSES_KEY, loadData(CLASSES_KEY).filter(c => !ids.includes(c.id)));
            saveData(TASKS_KEY, loadData(TASKS_KEY).filter(t => !ids.includes(t.classId)));
            exitSelectMode("class");
            refreshAll();
            showToast("Deleted.");
        });
    } else {
        const tasks = loadData(TASKS_KEY);
        const message = ids.length === 1
            ? `Delete "${tasks.find(t => t.id === ids[0]).name}"?`
            : `Delete ${plural(ids.length, "task")}?`;

        askConfirm(message, () => {
            saveData(TASKS_KEY, loadData(TASKS_KEY).filter(t => !ids.includes(t.id)));
            exitSelectMode("task");
            refreshAll();
            showToast("Deleted.");
        });
    }
}


// ===== Clicks inside the 2 x 2 grid =====

function handleSelectControl(kind, action) {
    if (action === "start") {
        selectMode[kind] = true;
    } else if (action === "done") {
        exitSelectMode(kind);
    } else if (action === "all") {
        const ids = visibleIds[kind];
        const allSelected = ids.every(id => selected[kind].has(id));
        if (allSelected) {
            selected[kind].clear();
        } else {
            ids.forEach(id => selected[kind].add(id));
        }
    } else if (action === "delete") {
        deleteItems(kind, [...selected[kind]]);
        return;
    }
    renderList(kind);
}

function toggleSelected(box) {
    const { kind, id } = box.dataset;
    if (box.checked) {
        selected[kind].add(id);
    } else {
        selected[kind].delete(id);
    }
    box.closest(".item").classList.toggle("selected", box.checked);
    renderControls(kind);
}

document.querySelector(".edit-grid").addEventListener("click", (event) => {
    // Select / Select all / Delete N / Done
    const control = event.target.closest("button[data-select]");
    if (control) {
        const kind = control.closest(".list-controls").dataset.kind;
        handleSelectControl(kind, control.dataset.select);
        return;
    }

    // Edit / Delete on a single row
    const button = event.target.closest("button[data-action]");
    if (button) {
        const { action, kind, id } = button.dataset;
        if (action === "edit") {
            openEditor(kind, id);
        } else {
            deleteItems(kind, [id]);
        }
        return;
    }

    // In select mode, clicking anywhere on a row checks or unchecks it
    const row = event.target.closest(".item.selectable");
    if (row) {
        const box = row.querySelector(".select-box");
        if (event.target !== box) box.checked = !box.checked;
        toggleSelected(box);
    }
});


// ===== Clear everything =====

const clearDialog = document.getElementById("clear-dialog");
const clearInput = document.getElementById("clear-input");
const clearYes = document.getElementById("clear-yes");

document.getElementById("clear-all").addEventListener("click", () => {
    clearInput.value = "";
    clearYes.disabled = true;
    clearDialog.showModal();
});

clearInput.addEventListener("input", () => {
    clearYes.disabled = clearInput.value !== "CLEAR";
});

document.getElementById("clear-no").addEventListener("click", () => clearDialog.close());

clearYes.addEventListener("click", () => {
    saveData(CLASSES_KEY, []);
    saveData(TASKS_KEY, []);
    exitSelectMode("class");
    exitSelectMode("task");
    clearDialog.close();
    refreshAll();
    showToast("Everything cleared.");
});


// ===== Save new items from the Add forms =====

classForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = readClassForm(classForm);
    if (!data) return;

    const classes = loadData(CLASSES_KEY);
    classes.push({ id: makeId(), ...data });
    saveData(CLASSES_KEY, classes);

    classForm.reset();
    removeExtraMeetings(classForm);
    refreshAll();
    showToast("Saved!");
});

taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = readTaskForm(taskForm);

    const tasks = loadData(TASKS_KEY);
    tasks.push({ id: makeId(), ...data, completed: false, completedAt: null });
    saveData(TASKS_KEY, tasks);

    taskForm.reset();
    updateOtherField(taskForm);
    refreshAll();
    showToast("Saved!");
});


// ===== When the page opens =====

setupClassForm(classForm);
setupTaskForm(taskForm);
refreshAll();


// Another page can send us here to edit or add a task:
//   edit.html?editTask=ID&from=index.html        -> edit that task
//   edit.html?newTask=2026-10-14&from=calendar.html -> add a task due that day
// When the pop-up closes, go back to the page we came from.
const params = new URLSearchParams(window.location.search);
const editTaskId = params.get("editTask");
const newTaskDate = params.get("newTask");
const returnTo = params.get("from");
let openedFromLink = false;

if (editTaskId && loadData(TASKS_KEY).some(t => t.id === editTaskId)) {
    openEditor("task", editTaskId);
    openedFromLink = true;
} else if (newTaskDate && /^\d{4}-\d{2}-\d{2}$/.test(newTaskDate)) {
    openEditor("task", null, newTaskDate);
    openedFromLink = true;
}

if (openedFromLink && ["index.html", "calendar.html"].includes(returnTo)) {
    editDialog.addEventListener("close", () => {
        window.location.href = returnTo;
    }, { once: true });
}