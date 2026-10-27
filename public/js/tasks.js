import { apiRequest } from "./api.js";

export function listTasks() {
    return apiRequest("/tasks");
}

export function createTask(values) {
    return apiRequest("/tasks", {
        method: "POST",
        body: JSON.stringify(values)
    });
}

export function patchTask(id, values) {
    return apiRequest(`/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(values)
    });
}

export function deleteTaskRequest(id) {
    return apiRequest(`/tasks/${id}`, { method: "DELETE" });
}
