function normalizeBaseUrl(value) {
    if (typeof value !== "string" || value.trim() === "") {
        return null;
    }

    try {
        const parsed = new URL(value);
        if (!["http:", "https:"].includes(parsed.protocol)) {
            return null;
        }
        return parsed.origin;
    } catch {
        return null;
    }
}

const DEFAULT_SERVICE_URLS = {
    AUTH_SERVICE_URL: "http://localhost:5001",
    TASK_SERVICE_URL: "http://localhost:5002",
    ADMIN_SERVICE_URL: "http://localhost:5003"
};

function matchesRoute(pathname, prefix) {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function routeForRequest(pathname) {
    const path = typeof pathname === "string" ? pathname : "/";
    const normalizedPath = path.split("?")[0] || "/";

    if (matchesRoute(normalizedPath, "/auth")) {
        return normalizeBaseUrl(process.env.AUTH_SERVICE_URL || DEFAULT_SERVICE_URLS.AUTH_SERVICE_URL);
    }

    if (matchesRoute(normalizedPath, "/tasks")) {
        return normalizeBaseUrl(process.env.TASK_SERVICE_URL || DEFAULT_SERVICE_URLS.TASK_SERVICE_URL);
    }

    if (matchesRoute(normalizedPath, "/admin")) {
        return normalizeBaseUrl(process.env.ADMIN_SERVICE_URL || DEFAULT_SERVICE_URLS.ADMIN_SERVICE_URL);
    }

    return null;
}

function buildUpstreamUrl(baseUrl, requestUrl) {
    const safeBaseUrl = normalizeBaseUrl(baseUrl) || "http://localhost";
    const input = typeof requestUrl === "string" ? requestUrl : "/";
    const parsedRequestUrl = new URL(input, "http://localhost");
    const target = new URL(safeBaseUrl);
    target.pathname = parsedRequestUrl.pathname || "/";
    target.search = parsedRequestUrl.search;
    target.hash = "";
    return target.toString();
}

function getSafeForwardHeaders(headers = {}, method = "GET") {
    const forwardedHeaders = {};
    const allowedHeaders = new Set([
        "accept",
        "accept-language",
        "accept-encoding",
        "authorization",
        "content-type",
        "cookie",
        "origin",
        "referer",
        "user-agent",
        "x-requested-with"
    ]);
    const blockedHeaders = new Set([
        "host",
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "x-forwarded-for",
        "x-forwarded-host",
        "x-forwarded-port",
        "x-forwarded-proto",
        "x-user-id",
        "x-user-email",
        "x-is-admin",
        "x-user-name",
        "x-admin",
        "x-role",
        "x-authenticated",
        "x-session-user"
    ]);

    for (const [key, value] of Object.entries(headers)) {
        const normalizedKey = key.toLowerCase();
        if (blockedHeaders.has(normalizedKey)) {
            continue;
        }

        if (normalizedKey.startsWith("x-forwarded-")) {
            continue;
        }

        if (normalizedKey.startsWith("x-") && !allowedHeaders.has(normalizedKey)) {
            continue;
        }

        if (!allowedHeaders.has(normalizedKey) && normalizedKey !== "cookie") {
            continue;
        }

        if ((method === "GET" || method === "HEAD") && normalizedKey === "content-type") {
            continue;
        }

        forwardedHeaders[key] = value;
    }

    return forwardedHeaders;
}

module.exports = {
    routeForRequest,
    buildUpstreamUrl,
    getSafeForwardHeaders,
    normalizeBaseUrl
};
