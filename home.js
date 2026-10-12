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


// ===== Weekly Timeline =====

const HOUR_HEIGHT = 44;   // pixels for one hour on the timeline
let weekOffset = 0;       // Computer: 0 = this week, -1 = last week, 1 = next week, ...
let dayOffset = 0;        // Phone: 0 = starts today, 1 = starts tomorrow, ...

// True when the screen is phone-sized (matches the @media rule in styles.css)
const phoneQuery = window.matchMedia("(max-width: 700px)");

// The Sunday that starts the week containing this date, at midnight
function startOfWeek(date) {
    const sunday = new Date(date);
    sunday.setHours(0, 0, 0, 0);
    sunday.setDate(sunday.getDate() - sunday.getDay());
    return sunday;
}

// Hours to show: one hour before the earliest class to one hour after the latest
function timelineHours(classes) {
    const meetings = classes.flatMap(c => c.meetings);
    if (meetings.length === 0) return [8, 18];

    const earliest = Math.min(...meetings.map(m => toMinutes(m.start)));
    const latest = Math.max(...meetings.map(m => toMinutes(m.end)));
    return [
        Math.max(0, Math.floor(earliest / 60) - 1),
        Math.min(24, Math.ceil(latest / 60) + 1),
    ];
}

// "Oct 11 – 17, 2026" or "Oct 25 – Nov 1, 2026"
function weekLabel(first, last) {
    const sameMonth = first.getMonth() === last.getMonth();
    const start = first.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const end = last.toLocaleDateString("en-US", sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
    if (first.getFullYear() !== last.getFullYear()) {
        return `${start}, ${first.getFullYear()} – ${end}, ${last.getFullYear()}`;
    }
    return `${start} – ${end}, ${last.getFullYear()}`;
}

// 13 -> "1 PM", 9 -> "9 AM" (short labels for the timeline's hour column)
function hourLabel(hour) {
    return `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
}

// Computer: Sunday-Saturday of the chosen week. Phone: 3 days starting at the chosen day.
function visibleDays(now) {
    let first;
    let count;
    if (phoneQuery.matches) {
        first = new Date(now);
        first.setHours(0, 0, 0, 0);
        first.setDate(first.getDate() + dayOffset);
        count = 3;
    } else {
        first = startOfWeek(now);
        first.setDate(first.getDate() + weekOffset * 7);
        count = 7;
    }

    const days = [];
    for (let i = 0; i < count; i++) {
        const day = new Date(first);
        day.setDate(day.getDate() + i);
        days.push(day);
    }
    return days;
}

function renderWeek(now) {
    const grid = document.getElementById("week-grid");
    grid.innerHTML = "";

    const classes = loadData("classes");
    const tasks = loadData("tasks");
    const classById = new Map(classes.map(c => [c.id, c]));

    const [startHour, endHour] = timelineHours(classes);
    const pxPerMinute = HOUR_HEIGHT / 60;
    const bodyHeight = (endHour - startHour) * HOUR_HEIGHT;

    // The dates being shown (7 on a computer, 3 on a phone)
    const days = visibleDays(now);
    grid.style.gridTemplateColumns = `var(--hours-width) repeat(${days.length}, minmax(0, 1fr))`;

    const todayKey = dateKey(now);
    document.getElementById("week-label").textContent = weekLabel(days[0], days[days.length - 1]);

    // Row 1: day names and dates
    grid.append(el("div", "week-corner"));
    for (const day of days) {
        const head = el("div", "week-day-head");
        if (dateKey(day) === todayKey) head.classList.add("is-today");
        head.append(
            el("span", "week-dow", day.toLocaleDateString("en-US", { weekday: "short" })),
            el("span", "week-date", String(day.getDate())),
        );
        grid.append(head);
    }

    // Row 2: tasks due each day
    grid.append(el("div", "week-row-label", "Due"));
    for (const day of days) {
        const cell = el("div", "week-tasks");
        const dayTasks = tasks
            .filter(task => task.dueDate === dateKey(day))
            .sort((a, b) => taskDueDate(a) - taskDueDate(b));

        for (const task of dayTasks) {
            const chip = el("button", `week-task status-${taskStatus(task, now)}`, task.name);
            chip.type = "button";
            chip.dataset.id = task.id;
            chip.title = `${task.name} · Due ${formatTime(task.dueTime)}`;
            const savedClass = classById.get(task.classId);
            if (savedClass) chip.style.setProperty("--class-color", savedClass.color);
            cell.append(chip);
        }
        grid.append(cell);
    }

    // Row 3: hour labels, then one column per day with class blocks
    const hoursColumn = el("div", "week-hours");
    hoursColumn.style.height = `${bodyHeight}px`;
    for (let hour = startHour; hour < endHour; hour++) {
        const label = el("span", "week-hour", hourLabel(hour));
        label.style.top = `${(hour - startHour) * HOUR_HEIGHT}px`;
        hoursColumn.append(label);
    }
    grid.append(hoursColumn);

    for (const day of days) {
        const column = el("div", "week-col");
        column.style.height = `${bodyHeight}px`;
        column.style.setProperty("--hour-height", `${HOUR_HEIGHT}px`);

        const isToday = dateKey(day) === todayKey;
        if (isToday) column.classList.add("is-today");

        // Classes that meet on this day of the week
        const letter = DAY_LETTERS[day.getDay()];
        for (const savedClass of classes) {
            for (const meeting of savedClass.meetings) {
                if (!meeting.days.includes(letter)) continue;

                const start = toMinutes(meeting.start);
                const end = toMinutes(meeting.end);

                const block = el("div", "week-class");
                block.style.top = `${(start - startHour * 60) * pxPerMinute}px`;
                block.style.height = `${(end - start) * pxPerMinute}px`;
                block.style.setProperty("--class-color", savedClass.color);
                block.title = [
                    `${savedClass.code} · ${meeting.type}`,
                    `${formatTime(meeting.start)} – ${formatTime(meeting.end)}`,
                    savedClass.location,
                ].filter(Boolean).join("\n");

                block.append(
                    el("span", "week-class-code", savedClass.code),
                    el("span", "week-class-time", `${formatTime(meeting.start)} · ${meeting.type}`),
                );
                column.append(block);
            }
        }

        // Red "you are here" line on today's column
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        if (isToday && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60) {
            const line = el("div", "week-now");
            line.style.top = `${(nowMinutes - startHour * 60) * pxPerMinute}px`;
            column.append(line);
        }

        grid.append(column);
    }
}

// Arrows move one week on a computer, one day on a phone
function moveTimeline(step) {
    if (phoneQuery.matches) {
        dayOffset += step;
    } else {
        weekOffset += step;
    }
    renderWeek(new Date());
}

document.getElementById("week-prev").addEventListener("click", () => moveTimeline(-1));
document.getElementById("week-next").addEventListener("click", () => moveTimeline(1));

document.getElementById("week-today").addEventListener("click", () => {
    weekOffset = 0;
    dayOffset = 0;
    renderWeek(new Date());
});

// Redraw when the window crosses between phone and computer size
phoneQuery.addEventListener("change", () => renderWeek(new Date()));

// Click a task in the week view to open its details
document.getElementById("week-grid").addEventListener("click", (event) => {
    const chip = event.target.closest(".week-task");
    if (chip) openTaskDetails(chip.dataset.id, renderAll);
});

// ===== Draw everything =====

function renderAll() {
    const now = new Date();
    document.getElementById("today-date").textContent =
        now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    renderTodayClasses(now);
    renderTodayTasks(now);
    renderWeek(now);
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