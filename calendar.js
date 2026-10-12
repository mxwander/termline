let monthOffset = 0;        // 0 = this month, -1 = last month, 1 = next month, ...
let selectedDate = null;    // Phone: the day whose tasks are listed below the calendar

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// True when the screen is phone-sized (matches the @media rule in styles.css)
const phoneQuery = window.matchMedia("(max-width: 700px)");


// ===== One task chip (used in the month grid and the phone day list) =====

function makeTaskChip(task, classById, now) {
    const chip = el("button", `week-task month-task status-${taskStatus(task, now)}`, task.name);
    chip.type = "button";
    chip.dataset.id = task.id;
    chip.title = `${task.name} · Due ${formatTime(task.dueTime)}`;

    const savedClass = classById.get(task.classId);
    if (savedClass) {
        chip.style.setProperty("--class-color", savedClass.color);
        chip.append(el("span", "chip-class", ` · ${savedClass.code}`));
    }
    return chip;
}


// ===== Draw the month =====

function renderMonth() {
    const grid = document.getElementById("month-grid");
    grid.innerHTML = "";

    const now = new Date();
    const todayKey = dateKey(now);

    // First and last day of the month being shown
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const lastOfMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0);

    document.getElementById("month-label").textContent =
        firstOfMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    // Phone: if no day is picked yet, pick today (this month) or the 1st (other months)
    if (!selectedDate) {
        selectedDate = monthOffset === 0 ? todayKey : dateKey(firstOfMonth);
    }

    // The grid starts on the Sunday on or before the 1st, and fills whole weeks
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(1 - firstOfMonth.getDay());
    const totalDays = Math.ceil((firstOfMonth.getDay() + lastOfMonth.getDate()) / 7) * 7;

    // Group tasks by due date so each day can find its tasks quickly
    const classById = new Map(loadData("classes").map(c => [c.id, c]));
    const tasksByDate = new Map();
    for (const task of loadData("tasks")) {
        if (!tasksByDate.has(task.dueDate)) tasksByDate.set(task.dueDate, []);
        tasksByDate.get(task.dueDate).push(task);
    }
    for (const list of tasksByDate.values()) {
        list.sort((a, b) => taskDueDate(a) - taskDueDate(b));
    }

    // Row of weekday names
    for (const name of WEEKDAY_NAMES) {
        grid.append(el("div", "month-dow", name));
    }

    // One box per day
    for (let i = 0; i < totalDays; i++) {
        const day = new Date(gridStart);
        day.setDate(gridStart.getDate() + i);
        const key = dateKey(day);
        const dayTasks = tasksByDate.get(key) || [];

        const cell = el("div", "month-day");
        cell.dataset.date = key;
        if (day.getMonth() !== firstOfMonth.getMonth()) cell.classList.add("other-month");
        if (key === todayKey) cell.classList.add("is-today");
        if (key === selectedDate) cell.classList.add("is-selected");

        cell.append(el("span", "month-num", String(day.getDate())));

        // Computer: task chips
        for (const task of dayTasks) {
            cell.append(makeTaskChip(task, classById, now));
        }

        // Phone: one colored dot per task (CSS shows these instead of the chips)
        const dots = el("div", "month-dots");
        for (const task of dayTasks) {
            const dot = el("span", "dot");
            const savedClass = classById.get(task.classId);
            dot.style.background = savedClass ? savedClass.color : "var(--muted)";
            dots.append(dot);
        }
        cell.append(dots);

        grid.append(cell);
    }

    renderDayPanel(tasksByDate, classById, now);
}


// ===== Phone: the picked day's tasks, below the calendar =====

function renderDayPanel(tasksByDate, classById, now) {
    const panel = document.getElementById("day-panel");
    panel.innerHTML = "";

    const [year, month, day] = selectedDate.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    const header = el("div", "list-header");
    header.append(el("h2", null, date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })));

    const addLink = el("a", "btn-small", "+ Add task");
    addLink.href = `edit.html?newTask=${selectedDate}&from=calendar.html`;
    header.append(addLink);
    panel.append(header);

    const dayTasks = tasksByDate.get(selectedDate) || [];
    if (dayTasks.length === 0) {
        panel.append(el("p", null, "Nothing due this day."));
        return;
    }

    const list = el("div", "day-panel-list");
    for (const task of dayTasks) {
        const chip = makeTaskChip(task, classById, now);
        chip.prepend(el("span", "chip-time", `${formatTime(task.dueTime)}  `));
        list.append(chip);
    }
    panel.append(list);
}


// ===== Clicks =====

// Computer: a task opens its details, anywhere else in a day adds a task on that date.
// Phone: tapping a day picks it and lists its tasks below.
document.getElementById("month-grid").addEventListener("click", (event) => {
    const cell = event.target.closest(".month-day");
    if (!cell) return;

    if (phoneQuery.matches) {
        selectedDate = cell.dataset.date;
        renderMonth();
        return;
    }

    const chip = event.target.closest(".month-task");
    if (chip) {
        openTaskDetails(chip.dataset.id, renderMonth);
    } else {
        window.location.href = `edit.html?newTask=${cell.dataset.date}&from=calendar.html`;
    }
});

document.getElementById("day-panel").addEventListener("click", (event) => {
    const chip = event.target.closest(".month-task");
    if (chip) openTaskDetails(chip.dataset.id, renderMonth);
});

function changeMonth(newOffset) {
    monthOffset = newOffset;
    selectedDate = null;
    renderMonth();
}

document.getElementById("month-prev").addEventListener("click", () => changeMonth(monthOffset - 1));
document.getElementById("month-next").addEventListener("click", () => changeMonth(monthOffset + 1));
document.getElementById("month-today").addEventListener("click", () => changeMonth(0));


// ===== When the page opens =====

renderMonth();

// Re-check every minute so task colors stay current
setInterval(renderMonth, 60 * 1000);