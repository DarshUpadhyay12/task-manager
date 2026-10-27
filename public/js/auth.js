import { apiRequest } from "./api.js";

export function getCurrentUser() {
    return apiRequest("/auth/me");
}

export function authenticate(mode, credentials) {
    return apiRequest(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(credentials)
    });
}

export function logout() {
    return apiRequest("/auth/logout", { method: "POST" });
}
