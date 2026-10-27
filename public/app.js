import { authenticate, getCurrentUser, logout } from "./js/auth.js";
import { createTask, deleteTaskRequest, listTasks, patchTask } from "./js/tasks.js";
import {
    createReminderSnoozes,
    getDueTasks,
    reminderKey,
    SNOOZE_DURATION_MS
} from "./js/reminders.js";

const form = document.querySelector("#task-form");
const titleInput = document.querySelector("#task-title");
const descriptionInput = document.querySelector("#task-description");
const dueDateInput = document.querySelector("#task-due-date");
const dueTimeInput = document.querySelector("#task-due-time");
const submitButton = document.querySelector("#submit-task");
const submitLabel = document.querySelector("#submit-label");
const cancelEditButton = document.querySelector("#cancel-edit");
const formKicker = document.querySelector("#form-kicker");
const formTitle = document.querySelector("#form-title");
const taskList = document.querySelector("#task-list");
const taskCount = document.querySelector("#task-count");
const emptyState = document.querySelector("#empty-state");
const emptyCopy = document.querySelector("#empty-copy");
const feedback = document.querySelector("#feedback");
const filterButtons = document.querySelectorAll(".filter-button");
const authPanel = document.querySelector("#auth-panel");
const authForm = document.querySelector("#auth-form");
const authTitle = document.querySelector("#auth-title");
const authDescription = document.querySelector("#auth-description");
const authNameField = document.querySelector("#auth-name-field");
const authNameInput = document.querySelector("#auth-name");
const authEmailInput = document.querySelector("#auth-email");
const authPasswordInput = document.querySelector("#auth-password");
const authFeedback = document.querySelector("#auth-feedback");
const authSubmit = document.querySelector("#auth-submit");
const authSwitch = document.querySelector("#auth-switch");
const accountBar = document.querySelector("#account-bar");
const accountName = document.querySelector("#account-name");
const logoutButton = document.querySelector("#logout-button");
const adminLink = document.querySelector("#admin-link");
const taskPanel = document.querySelector("#task-panel");
const reminderPanel = document.querySelector("#reminder-panel");
const reminderList = document.querySelector("#reminder-list");
const desktopReminders = document.querySelector("#desktop-reminders");
const enableNotificationsButton = document.querySelector("#enable-notifications");

let tasks = [];
let activeFilter = "all";
let authMode = "login";
let editingTaskId = null;
let editingTaskHadDueAt = false;
let feedbackTimer;
let audioContext = null;
const reminderSnoozes = createReminderSnoozes(showFeedback);
const activeReminderKeys = new Set();
const dismissedReminderKeys = new Set();

function playReminderSound() {
    if (!audioContext || audioContext.state !== "running") {
        return;
    }

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const volume = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(660, now + 0.16);
    volume.gain.setValueAtTime(0.0001, now);
    volume.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    oscillator.connect(volume);
    volume.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.43);
}

function notifyBrowser(task) {
    if (!("Notification" in window) || Notification.permission !== "granted") {
        return;
    }

    try {
        new Notification("TASK REMINDER — DUE NOW", {
            body: task.title,
            tag: `task-reminder-${reminderKey(task)}`
        });
    } catch (error) {
        showFeedback(`Could not show browser alert: ${error.message}`);
    }
}

function updateNotificationButton() {
    if (!("Notification" in window)) {
        enableNotificationsButton.textContent = "Browser alerts unavailable";
        enableNotificationsButton.disabled = true;
    } else if (Notification.permission === "granted") {
        enableNotificationsButton.textContent = "Browser alerts enabled";
        enableNotificationsButton.disabled = true;
    } else if (Notification.permission === "denied") {
        enableNotificationsButton.textContent = "Allow alerts in browser settings";
        enableNotificationsButton.disabled = true;
    } else {
        enableNotificationsButton.textContent = "Enable browser alerts";
        enableNotificationsButton.disabled = false;
    }
}

function renderDesktopReminders(dueTasks) {
    const now = Date.now();
    let hasNewReminder = false;
    const visibleTasks = dueTasks.filter((task) => {
        const key = reminderKey(task);
        const snoozeUntil = reminderSnoozes.until(key);

        if (snoozeUntil > now) {
            activeReminderKeys.delete(key);
            return false;
        }
        if (snoozeUntil) {
            reminderSnoozes.clear(key);
            activeReminderKeys.delete(key);
        }

        if (!activeReminderKeys.has(key) && !dismissedReminderKeys.has(key)) {
            activeReminderKeys.add(key);
            hasNewReminder = true;
            notifyBrowser(task);
        }

        return activeReminderKeys.has(key);
    });

    const dueKeys = new Set(dueTasks.map(reminderKey));
    reminderSnoozes.removeExcept(dueKeys);

    for (const key of activeReminderKeys) {
        if (!dueKeys.has(key)) {
            activeReminderKeys.delete(key);
        }
    }
    for (const key of dismissedReminderKeys) {
        if (!dueKeys.has(key)) {
            dismissedReminderKeys.delete(key);
        }
    }
    if (hasNewReminder) {
        playReminderSound();
    }

    desktopReminders.replaceChildren(...visibleTasks.map((task) => {
        const key = reminderKey(task);
        const popup = document.createElement("section");
        popup.className = "desktop-reminder";
        popup.setAttribute("role", "alert");

        const kicker = document.createElement("p");
        kicker.className = "desktop-reminder-kicker";
        kicker.textContent = "Task reminder";

        const heading = document.createElement("h2");
        heading.textContent = "This task is due";

        const message = document.createElement("p");
        message.className = "desktop-reminder-message";
        message.textContent = task.title;

        const dueTime = document.createElement("p");
        dueTime.className = "desktop-reminder-time";
        dueTime.textContent = new Date(task.dueAt).toLocaleString();

        const actions = document.createElement("div");
        actions.className = "desktop-reminder-actions";

        const snoozeButton = document.createElement("button");
        snoozeButton.className = "button button-primary";
        snoozeButton.type = "button";
        snoozeButton.textContent = "Remind me in 5 minutes";
        snoozeButton.addEventListener("click", () => {
            reminderSnoozes.snooze(key, Date.now() + SNOOZE_DURATION_MS);
            activeReminderKeys.delete(key);
            renderReminders();
        });

        const dismissButton = document.createElement("button");
        dismissButton.className = "button button-quiet";
        dismissButton.type = "button";
        dismissButton.textContent = "Dismiss";
        dismissButton.addEventListener("click", () => {
            activeReminderKeys.delete(key);
            dismissedReminderKeys.add(key);
            renderReminders();
        });

        actions.append(snoozeButton, dismissButton);
        popup.append(kicker, heading, message, dueTime, actions);
        return popup;
    }));
}

function enableBrowserNotifications() {
    if (!("Notification" in window) || Notification.permission !== "default") {
        updateNotificationButton();
        return;
    }

    Notification.requestPermission()
        .then((permission) => {
            updateNotificationButton();
            if (permission === "granted") {
                const dueTasks = getDueTasks(tasks);
                dueTasks.forEach(notifyBrowser);
            }
            renderReminders();
        })
        .catch((error) => {
            showFeedback(`Could not enable browser alerts: ${error.message}`);
        });
}

function showFeedback(message, type = "error") {
    window.clearTimeout(feedbackTimer);
    feedback.textContent = message;
    feedback.classList.toggle("is-success", type === "success");
    feedback.hidden = false;

    if (type === "success") {
        feedbackTimer = window.setTimeout(() => {
            feedback.hidden = true;
        }, 3500);
    }
}

function clearFeedback() {
    window.clearTimeout(feedbackTimer);
    feedback.hidden = true;
    feedback.textContent = "";
    feedback.classList.remove("is-success");
}

function getVisibleTasks() {
    if (activeFilter === "active") {
        return tasks.filter((task) => !task.completed);
    }
    if (activeFilter === "completed") {
        return tasks.filter((task) => task.completed);
    }
    return tasks;
}

function toLocalDateAndTimeInputValues(value) {
    if (!value) {
        return { date: "", time: "" };
    }

    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return {
        date: `${year}-${month}-${day}`,
        time: `${hours}:${minutes}`
    };
}

function createTaskElement(task) {
    const item = document.createElement("li");
    item.className = `task-item${task.completed ? " is-completed" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.className = "task-checkbox";
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", `${task.completed ? "Mark" : "Complete"} ${task.title}`);
    checkbox.addEventListener("change", () => updateTask(task.id, { completed: checkbox.checked }));

    const content = document.createElement("div");
    content.className = "task-content";

    const title = document.createElement("p");
    title.className = "task-title";
    title.textContent = task.title;
    content.append(title);

    if (task.description) {
        const description = document.createElement("p");
        description.className = "task-description";
        description.textContent = task.description;
        content.append(description);
    }

    if (task.dueAt) {
        const dueAt = new Date(task.dueAt);
        const dueDate = document.createElement("p");
        dueDate.className = "task-due-date";
        dueDate.textContent = `${dueAt.getTime() <= Date.now() && !task.completed ? "Overdue" : "Due"} ${dueAt.toLocaleString()}`;
        content.append(dueDate);
    }

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const editButton = document.createElement("button");
    editButton.className = "icon-button";
    editButton.type = "button";
    editButton.textContent = "✎";
    editButton.setAttribute("aria-label", `Edit ${task.title}`);
    editButton.title = "Edit task";
    editButton.addEventListener("click", () => beginEdit(task));

    const deleteButton = document.createElement("button");
    deleteButton.className = "icon-button delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "×";
    deleteButton.setAttribute("aria-label", `Delete ${task.title}`);
    deleteButton.title = "Delete task";
    deleteButton.addEventListener("click", () => deleteTask(task));

    actions.append(editButton, deleteButton);
    item.append(checkbox, content, actions);
    return item;
}

function renderReminders() {
    const dueTasks = getDueTasks(tasks);

    reminderPanel.hidden = dueTasks.length === 0;
    reminderList.replaceChildren(...dueTasks.map((task) => {
        const item = document.createElement("li");
        item.textContent = task.title;
        return item;
    }));

    renderDesktopReminders(dueTasks);
}

function renderTasks() {
    const visibleTasks = getVisibleTasks();
    taskList.replaceChildren(...visibleTasks.map(createTaskElement));
    renderReminders();

    taskCount.textContent = String(tasks.length);
    emptyState.hidden = visibleTasks.length > 0;

    if (activeFilter === "active") {
        emptyCopy.textContent = "No tasks to do.";
    } else if (activeFilter === "completed") {
        emptyCopy.textContent = "No completed tasks.";
    } else {
        emptyCopy.textContent = "No tasks yet.";
    }
}

function selectFilter(filter) {
    activeFilter = filter;
    filterButtons.forEach((button) => {
        const isActive = button.dataset.filter === filter;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });
}

function setAuthMode(mode) {
    authMode = mode;
    const isRegistering = mode === "register";
    authTitle.textContent = isRegistering ? "Create account" : "Log in";
    authDescription.textContent = isRegistering
        ? "Create an account to keep your tasks private."
        : "Log in to see and manage your tasks.";
    authNameField.hidden = !isRegistering;
    authNameInput.required = isRegistering;
    authPasswordInput.autocomplete = isRegistering ? "new-password" : "current-password";
    authSubmit.textContent = isRegistering ? "Create account" : "Log in";
    authSwitch.textContent = isRegistering ? "Already have an account? Log in" : "Create an account";
    authFeedback.hidden = true;
    authFeedback.textContent = "";
}

function showAuthenticatedApp(user) {
    authPanel.hidden = true;
    accountBar.hidden = false;
    accountName.textContent = user.name;
    adminLink.hidden = !user.isAdmin;
    taskPanel.hidden = false;
    void loadTasks();
}

function showLoginPanel() {
    tasks = [];
    taskList.replaceChildren();
    desktopReminders.replaceChildren();
    activeReminderKeys.clear();
    dismissedReminderKeys.clear();
    taskCount.textContent = "0";
    taskPanel.hidden = true;
    accountBar.hidden = true;
    adminLink.hidden = true;
    authPanel.hidden = false;
    authForm.reset();
    setAuthMode("login");
}

async function loadTasks() {
    taskList.setAttribute("aria-busy", "true");
    try {
        tasks = await listTasks();
        renderTasks();
        return true;
    } catch (error) {
        showFeedback(error.message);
        return false;
    } finally {
        taskList.removeAttribute("aria-busy");
    }
}

function resetForm() {
    editingTaskId = null;
    editingTaskHadDueAt = false;
    form.reset();
    formKicker.textContent = "YOUR NEXT STEP";
    formTitle.textContent = "Add a task";
    submitLabel.textContent = "Add task";
    cancelEditButton.hidden = true;
}

function beginEdit(task) {
    editingTaskId = task.id;
    editingTaskHadDueAt = Boolean(task.dueAt);
    titleInput.value = task.title;
    descriptionInput.value = task.description || "";
    const dueDateTime = toLocalDateAndTimeInputValues(task.dueAt);
    dueDateInput.value = dueDateTime.date;
    dueTimeInput.value = dueDateTime.time;
    formKicker.textContent = "MAKE IT YOURS";
    formTitle.textContent = "Edit task";
    submitLabel.textContent = "Save changes";
    cancelEditButton.hidden = false;
    clearFeedback();
    titleInput.focus();
    form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function updateTask(id, values) {
    clearFeedback();
    try {
        const updatedTask = await patchTask(id, values);

        tasks = tasks.map((task) => task.id === id ? updatedTask : task);
        if (values.completed !== undefined) {
            selectFilter(values.completed ? "completed" : "active");
        }
        renderTasks();

        if (values.completed !== undefined) {
            showFeedback(values.completed ? "Task moved to Done." : "Task moved to To do.", "success");
        }
    } catch (error) {
        showFeedback(error.message);
        await loadTasks();
    }
}

async function deleteTask(task) {
    if (!window.confirm(`Delete "${task.title}"? This can't be undone.`)) {
        return;
    }

    clearFeedback();
    try {
        await deleteTaskRequest(task.id);
        tasks = tasks.filter((item) => item.id !== task.id);
        if (editingTaskId === task.id) {
            resetForm();
        }
        renderTasks();
        showFeedback("Task deleted.", "success");
    } catch (error) {
        showFeedback(error.message);
    }
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFeedback();

    const hasDueDate = Boolean(dueDateInput.value);
    const hasDueTime = Boolean(dueTimeInput.value);
    dueDateInput.setCustomValidity(hasDueTime && !hasDueDate ? "Choose a date for this reminder." : "");
    dueTimeInput.setCustomValidity(hasDueDate && !hasDueTime ? "Choose a time for this reminder." : "");
    if (!form.reportValidity()) {
        return;
    }

    submitButton.disabled = true;

    const isEditing = editingTaskId !== null;
    const values = {
        title: titleInput.value.trim(),
        description: descriptionInput.value.trim() || null
    };
    if (hasDueDate && hasDueTime) {
        values.dueAt = new Date(`${dueDateInput.value}T${dueTimeInput.value}`).toISOString();
    } else if (isEditing && editingTaskHadDueAt) {
        values.dueAt = null;
    }

    try {
        if (isEditing) {
            await patchTask(editingTaskId, values);
        } else {
            await createTask(values);
        }
        resetForm();
        if (!await loadTasks()) {
            return;
        }
        showFeedback(isEditing ? "Your changes have been saved." : "Task added to your list.", "success");
    } catch (error) {
        showFeedback(error.message);
    } finally {
        submitButton.disabled = false;
    }
});

dueDateInput.addEventListener("input", () => dueDateInput.setCustomValidity(""));
dueTimeInput.addEventListener("input", () => dueTimeInput.setCustomValidity(""));

cancelEditButton.addEventListener("click", () => {
    resetForm();
    clearFeedback();
});

filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
        selectFilter(button.dataset.filter);
        renderTasks();
    });
});

authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    authSubmit.disabled = true;
    authFeedback.hidden = true;

    const values = {
        email: authEmailInput.value.trim(),
        password: authPasswordInput.value
    };
    if (authMode === "register") {
        values.name = authNameInput.value.trim();
    }

    try {
        const result = await authenticate(authMode, values);
        authForm.reset();
        showAuthenticatedApp(result.user);
    } catch (error) {
        authFeedback.textContent = error.message;
        authFeedback.hidden = false;
    } finally {
        authSubmit.disabled = false;
    }
});

authSwitch.addEventListener("click", () => {
    setAuthMode(authMode === "login" ? "register" : "login");
});

logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
        await logout();
        showLoginPanel();
    } catch (error) {
        showFeedback(error.message);
    } finally {
        logoutButton.disabled = false;
    }
});

enableNotificationsButton.addEventListener("click", enableBrowserNotifications);
updateNotificationButton();

document.addEventListener("pointerdown", () => {
    if (!audioContext && ("AudioContext" in window || "webkitAudioContext" in window)) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContextClass();
    }
    if (audioContext?.state === "suspended") {
        void audioContext.resume().catch((error) => {
            showFeedback(`Could not enable reminder sound: ${error.message}`);
        }).then(() => {
            if (activeReminderKeys.size > 0) {
                playReminderSound();
            }
        });
    } else if (activeReminderKeys.size > 0) {
        playReminderSound();
    }
}, { once: true });

async function initializeApp() {
    showLoginPanel();
    try {
        const result = await getCurrentUser();
        if (result.user) {
            showAuthenticatedApp(result.user);
        }
    } catch (error) {
        authFeedback.textContent = error.message;
        authFeedback.hidden = false;
    }
}

initializeApp();
window.setInterval(() => {
    if (!taskPanel.hidden) {
        renderReminders();
    }
}, 30_000);
