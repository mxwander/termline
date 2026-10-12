const TODO_DAYS = 10;


// ===== Shared by Today and To-Do: one task row =====

function makeTodoItem(task, classById, now) {
    const status = taskStatus(task, now);
    const savedClass = classById.get(task.classId);

    const row = el("li", `todo-item status-${status}`);
    row.dataset.id = task.id;

    const check = el("input", "todo-check");
    check.type = "checkbox";
    check.checked = task.completed;
    check.setAttribute("aria-label", `Mark "${task.name}" complete`);

    const dot = el("span", "dot");
    if (savedClass) {
        dot.style.background = savedClass.color;
    } else {
        dot.style.visibility = "hidden";   // keeps rows lined up
    }

    // Line 1: name · class
    const info = el("div", "item-info");
    const title = el("span", "item-title", task.name);
    if (savedClass) {
        title.append(el("span", "todo-class", ` · ${savedClass.code}`));
    }

    // Line 2: type · due date · estimated time
    const meta = [taskTypeLabel(task), `Due ${formatDue(task)}`];
    if (task.estMinutes) meta.push(`Est. ${formatDuration(task.estMinutes)}`);
    info.append(title, el("span", "item-sub mono", meta.join(" · ")));

    row.append(check, dot, info);

    if (task.priority) {
        row.append(el("span", `priority priority-${task.priority.toLowerCase()}`, task.priority));
    }
    return row;
}

// Overdue first (most overdue on top), then upcoming (soonest first), then completed
const STATUS_ORDER = { overdue: 0, upcoming: 1, done: 2, late: 2 };

function sortForChecklist(tasks, now) {
    return tasks.sort((a, b) =>
        STATUS_ORDER[taskStatus(a, now)] - STATUS_ORDER[taskStatus(b, now)]
        || taskDueDate(a) - taskDueDate(b)
    );
}


// ===== Today: classes =====

function renderTodayClasses(now) {
    const box = document.getElementById("today-classes");
    box.innerHTML = "";

    const classes = loadData("classes");
    if (classes.length === 0) {
        box.append(el("p", null, "No classes yet. Add them on the Edit page."));
        return;
    }

    // Every meeting that happens today, earliest first
    const todayLetter = DAY_LETTERS[now.getDay()];
    const meetings = [];
    for (const savedClass of classes) {
        for (const meeting of savedClass.meetings) {
            if (meeting.days.includes(todayLetter)) {
                meetings.push({ savedClass, meeting });
            }
        }
    }
    meetings.sort((a, b) => toMinutes(a.meeting.start) - toMinutes(b.meeting.start));

    if (meetings.length === 0) {
        box.append(el("p", null, "No classes today."));
        return;
    }

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const next = meetings.find(m => toMinutes(m.meeting.start) > nowMinutes);

    const list = el("ul", "item-list");
    for (const item of meetings) {
        const { savedClass, meeting } = item;
        const start = toMinutes(meeting.start);
        const end = toMinutes(meeting.end);

        const row = el("li", "item class-item");
        if (end <= nowMinutes) row.classList.add("ended");

        const dot = el("span", "dot");
        dot.style.background = savedClass.color;

        // Line 1: code · meeting type
        const info = el("div", "item-info");
        const title = el("span", "item-title", savedClass.code);
        title.append(el("span", "todo-class", ` · ${meeting.type}`));

        // Line 2: time · location · instructor
        const meta = [`${formatTime(meeting.start)} – ${formatTime(meeting.end)}`];
        if (savedClass.location) meta.push(savedClass.location);
        if (savedClass.instructor) meta.push(savedClass.instructor);
        info.append(title, el("span", "item-sub mono", meta.join(" · ")));

        row.append(dot, info);

        if (start <= nowMinutes && nowMinutes < end) {
            row.append(el("span", "tag tag-now", "Now"));
        } else if (item === next) {
            row.append(el("span", "tag tag-next", "Next"));
        }
        list.append(row);
    }
    box.append(list);
}


// ===== Today: tasks due today =====

function renderTodayTasks(now) {
    const box = document.getElementById("today-tasks");
    box.innerHTML = "";

    const today = dateKey(now);
    const classById = new Map(loadData("classes").map(c => [c.id, c]));
    const tasks = sortForChecklist(
        loadData("tasks").filter(task => task.dueDate === today && !isTaskFinished(task)),
        now
    );

    if (tasks.length === 0) {
        box.append(el("p", null, "No tasks due today."));
        return;
    }

    const list = el("ul", "item-list");
    for (const task of tasks) {
        list.append(makeTodoItem(task, classById, now));
    }
    box.append(list);
}


// ===== To-Do checklist =====

function renderTodo(now) {
    const box = document.getElementById("todo-list");
    box.innerHTML = "";

    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + TODO_DAYS);
    windowEnd.setHours(23, 59, 59, 999);

    const classById = new Map(loadData("classes").map(c => [c.id, c]));

    // Tasks that belong on the checklist right now
    const tasks = sortForChecklist(
        loadData("tasks")
            .filter(task => !isTaskFinished(task))
            .filter(task => taskStatus(task, now) === "overdue" || taskDueDate(task) <= windowEnd),
        now
    );

    if (tasks.length === 0) {
        box.append(el("p", null, `Nothing due in the next ${TODO_DAYS} days.`));
        return;
    }

    const groups = [
        ["Overdue", ["overdue"]],
        ["Upcoming", ["upcoming"]],
        ["Completed", ["done", "late"]],
    ];

    for (const [label, statuses] of groups) {
        const groupTasks = tasks.filter(task => statuses.includes(taskStatus(task, now)));
        if (groupTasks.length === 0) continue;

        box.append(el("h3", null, label));
        const list = el("ul", "item-list");
        for (const task of groupTasks) {
            list.append(makeTodoItem(task, classById, now));
        }
        box.append(list);
    }
}


// ===== Draw everything =====

function renderAll() {
    const now = new Date();
    document.getElementById("today-date").textContent =
        now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    renderTodayClasses(now);
    renderTodayTasks(now);
    renderTodo(now);
}

// Checkbox click = check off / uncheck. Click anywhere else on a task = details pop-up.
// Works for both the Today tasks and the To-Do list.
function handleTaskClick(event) {
    const row = event.target.closest(".todo-item");
    if (!row) return;

    if (event.target.classList.contains("todo-check")) {
        setTaskCompleted(row.dataset.id, event.target.checked);
        renderAll();
    } else {
        openTaskDetails(row.dataset.id, renderAll);
    }
}

document.getElementById("today-tasks").addEventListener("click", handleTaskClick);
document.getElementById("todo-list").addEventListener("click", handleTaskClick);


// ===== When the page opens =====

renderAll();

// Re-check every minute so "Now"/"Next" move along and tasks turn red without a refresh
setInterval(renderAll, 60 * 1000);