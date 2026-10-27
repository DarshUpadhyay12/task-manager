export async function apiRequest(path, options = {}) {
    const configuredBase = globalThis.TASK_MANAGER_API_BASE
        || document.querySelector('meta[name="api-base"]')?.content
        || "";
    const apiBase = (typeof configuredBase === "string" ? configuredBase.trim() : "").replace(/\/+$/, "");
    const headers = {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
    };

    let response;
    try {
        response = await fetch(`${apiBase}${path}`, {
            ...options,
            headers,
            credentials: "include"
        });
    } catch {
        throw new Error("Can't reach the API. Make sure the server is running and try again.");
    }

    if (response.status === 204) {
        return null;
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const message = data?.error
            || Object.values(data?.errors || {})[0]
            || "Something went wrong. Please try again.";
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    return data;
}
