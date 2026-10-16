// ===== Class details pop-up (opens when you click a class on the Home page) =====

const DAY_ORDER = ["M", "T", "W", "H", "F", "S", "U"];
const DAY_NAMES = { M: "Mon", T: "Tue", W: "Wed", H: "Thu", F: "Fri", S: "Sat", U: "Sun" };

// "TH" -> "Tue, Thu"
function dayNames(days) {
    return DAY_ORDER.filter(d => days.includes(d)).map(d => DAY_NAMES[d]).join(", ");
}

// Open the pop-up for one class.
// meetingIndex: which meeting was clicked (null for online classes)
// date: the day that was clicked, as "2026-10-14"
function openClassDetails(classId, meetingIndex, date) {
    const dialog = document.getElementById("details-dialog");
    const savedClass = loadData("classes").find(c => c.id === classId);
    if (!savedClass) return;

    // Header: course code and an X button
    const closeX = el("button", "details-close", "×");
    closeX.type = "button";
    closeX.setAttribute("aria-label", "Close");
    closeX.addEventListener("click", () => dialog.close());

    const header = el("div", "details-header");
    header.append(el("h2", null, savedClass.code), closeX);

    // Colored dot and the course title
    const classLine = el("div", "details-class");
    const dot = el("span", "dot");
    dot.style.background = savedClass.color;
    classLine.append(dot, savedClass.title || savedClass.code);

    // The meeting that was clicked, plus location and instructor
    const meeting = meetingIndex === null ? null : savedClass.meetings[meetingIndex];
    let thisMeeting = "Online class";
    if (meeting) {
        const day = new Date(`${date}T00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        thisMeeting = `${meeting.type} · ${day} · ${formatTime(meeting.start)} – ${formatTime(meeting.end)}`;
    }

    const details = el("dl", "details-list");
    const rows = [
        ["This class", thisMeeting],
        ["Location", savedClass.location],
        ["Instructor", savedClass.instructor],
    ];
    for (const [label, value] of rows) {
        if (value) details.append(el("dt", null, label), el("dd", null, value));
    }

    // Every meeting time for this class
    if (savedClass.meetings.length > 0) {
        const list = el("div", "details-meetings");
        for (const m of savedClass.meetings) {
            list.append(el("span", null, `${m.type} · ${dayNames(m.days)} · ${formatTime(m.start)} – ${formatTime(m.end)}`));
        }
        details.append(el("dt", null, "Meets"), el("dd", null));
        details.lastChild.append(list);
    }

    // The next few tasks for this class (overdue ones included)
    const tasks = loadData("tasks")
        .filter(t => t.classId === classId && !t.completed)
        .sort((a, b) => taskDueDate(a) - taskDueDate(b))
        .slice(0, 4);

    const taskBox = el("div", "details-tasks");
    if (tasks.length === 0) {
        taskBox.append(el("span", "details-empty", "No upcoming tasks."));
    }
    for (const task of tasks) {
        const button = el("button", `details-task status-${taskStatus(task)}`);
        button.type = "button";
        button.append(el("span", null, task.name), el("span", "details-task-due", formatDue(task)));
        button.addEventListener("click", () => {
            dialog.close();
            openTaskDetails(task.id, renderAll);
        });
        taskBox.append(button);
    }
    details.append(el("dt", null, "Tasks"), el("dd", null));
    details.lastChild.append(taskBox);

    // Buttons: Edit class, Add task
    const id = encodeURIComponent(classId);
    const editLink = el("a", "btn btn-secondary", "Edit class");
    editLink.href = `edit.html?editClass=${id}&from=index.html`;

    const addLink = el("a", "btn btn-primary", "Add task");
    addLink.href = `edit.html?newTaskFor=${id}&from=index.html`;

    const actions = el("div", "dialog-actions");
    actions.append(editLink, addLink);

    dialog.replaceChildren(header, classLine, details, actions);
    dialog.showModal();
}

// Clicking the dimmed area outside the pop-up closes it
document.getElementById("details-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
});