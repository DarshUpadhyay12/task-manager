import { apiRequest } from "./js/api.js";

const usersContainer = document.querySelector("#admin-users");
const summary = document.querySelector("#admin-summary");
const feedback = document.querySelector("#admin-feedback");

function addCellText(parent, tag, className, text) {
    const element = document.createElement(tag);
    if (className) {
        element.className = className;
    }
    element.textContent = text;
    parent.append(element);
    return element;
}

function renderUsers(users) {
    usersContainer.replaceChildren();
    const taskCount = users.reduce((count, user) => count + user.tasks.length, 0);
    summary.textContent = `${users.length} ${users.length === 1 ? "user" : "users"} · ${taskCount} ${taskCount === 1 ? "task" : "tasks"}`;

    if (users.length === 0) {
        addCellText(usersContainer, "p", "admin-empty", "No users found.");
        return;
    }

    for (const user of users) {
        const card = document.createElement("article");
        card.className = "user-card";

        const header = document.createElement("header");
        header.className = "user-card-header";
        const identity = document.createElement("div");
        addCellText(identity, "h2", "user-name", user.name);
        addCellText(identity, "p", "user-email", user.email);
        const userId = addCellText(header, "span", "user-id", `User #${user.id}`);
        if (user.isAdmin) {
            userId.classList.add("admin-badge");
            userId.textContent = `User #${user.id} · Admin`;
        }
        header.prepend(identity);
        card.append(header);

        const taskHeading = document.createElement("h3");
        taskHeading.className = "user-task-heading";
        taskHeading.textContent = `Tasks (${user.tasks.length})`;
        card.append(taskHeading);

        if (user.tasks.length === 0) {
            addCellText(card, "p", "admin-empty", "No tasks");
        } else {
            const taskList = document.createElement("ul");
            taskList.className = "admin-task-list";
            for (const task of user.tasks) {
                const item = document.createElement("li");
                item.className = "admin-task-item";
                const details = document.createElement("div");
                details.className = "admin-task-details";
                addCellText(details, "p", "admin-task-title", task.title);
                if (task.description) {
                    addCellText(details, "p", "admin-task-description", task.description);
                }
                const status = addCellText(
                    item,
                    "span",
                    `admin-task-status${task.completed ? " is-completed" : ""}`,
                    task.completed ? "Done" : "To do"
                );
                item.prepend(details);
                addCellText(item, "span", "admin-task-id", `#${task.id}`);
                item.append(status);
                taskList.append(item);
            }
            card.append(taskList);
        }

        usersContainer.append(card);
    }
}

async function loadDashboard() {
    try {
        let users;
        try {
            users = await apiRequest("/admin/api/users", {
                headers: { Accept: "application/json" }
            });
        } catch (error) {
            if (error.status === 401 || error.status === 403) {
                window.location.replace("/");
                return;
            }
            throw error;
        }

        renderUsers(users);
    } catch (error) {
        feedback.textContent = error.message;
        feedback.hidden = false;
    }
}

loadDashboard();
