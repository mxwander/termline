let monthOffset = 0;   // 0 = this month, -1 = last month, 1 = next month, ...

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];


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

    // Row of weekday names
    for (const name of WEEKDAY_NAMES) {
        grid.append(el("div", "month-dow", name));
    }

    // One box per day
    for (let i = 0; i < totalDays; i++) {
        const day = new Date(gridStart);
        day.setDate(gridStart.getDate() + i);
        const key = dateKey(day);

        const cell = el("div", "month-day");
        cell.dataset.date = key;
        if (day.getMonth() !== firstOfMonth.getMonth()) cell.classList.add("other-month");
        if (key === todayKey) cell.classList.add("is-today");

        cell.append(el("span", "month-num", String(day.getDate())));

        const dayTasks = (tasksByDate.get(key) || [])
            .sort((a, b) => taskDueDate(a) - taskDueDate(b));

        for (const task of dayTasks) {
            const chip = el("button", `week-task month-task status-${taskStatus(task, now)}`, task.name);
            chip.type = "button";
            chip.dataset.id = task.id;
            chip.title = `${task.name} · Due ${formatTime(task.dueTime)}`;

            const savedClass = classById.get(task.classId);
            if (savedClass) {
                chip.style.setProperty("--class-color", savedClass.color);
                chip.append(el("span", "chip-class", ` · ${savedClass.code}`));
            }
            cell.append(chip);
        }

        grid.append(cell);
    }
}


// ===== Clicks =====

// A task opens its details. Anywhere else in a day adds a new task on that date.
document.getElementById("month-grid").addEventListener("click", (event) => {
    const chip = event.target.closest(".month-task");
    if (chip) {
        openTaskDetails(chip.dataset.id, renderMonth);
        return;
    }

    const cell = event.target.closest(".month-day");
    if (cell) {
        window.location.href = `edit.html?newTask=${cell.dataset.date}&from=calendar.html`;
    }
});

document.getElementById("month-prev").addEventListener("click", () => {
    monthOffset -= 1;
    renderMonth();
});

document.getElementById("month-next").addEventListener("click", () => {
    monthOffset += 1;
    renderMonth();
});

document.getElementById("month-today").addEventListener("click", () => {
    monthOffset = 0;
    renderMonth();
});


// ===== When the page opens =====

renderMonth();

// Re-check every minute so task colors stay current
setInterval(renderMonth, 60 * 1000);