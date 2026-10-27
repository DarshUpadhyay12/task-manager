require("dotenv").config();

const express = require("express");
const path = require("node:path");
const { routeForRequest, buildUpstreamUrl, getSafeForwardHeaders } = require("./router");

const app = express();
const PORT = Number(process.env.GATEWAY_PORT || 5005);
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const ALLOWED_PROXY_PATH_PREFIXES = ["/auth", "/tasks", "/admin"];

function getRequestTimeoutMs() {
    const configuredTimeout = Number(process.env.GATEWAY_REQUEST_TIMEOUT_MS);
    return Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_REQUEST_TIMEOUT_MS;
}

app.get("/api/health", (req, res) => {
    res.json({ service: "gateway", status: "ok" });
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "../../public/admin.html"));
});

app.use(express.static(path.join(__dirname, "../../public")));

function hasAllowedGatewayPath(pathname) {
    if (!pathname || typeof pathname !== "string") {
        return false;
    }

    return ALLOWED_PROXY_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function sendProxyError(res, statusCode, message) {
    if (!res.destroyed && !res.headersSent) {
        res.status(statusCode).json({ error: message });
    }
}

app.use(async (req, res) => {
    const requestPath = req.originalUrl || req.url || "/";
    const pathname = requestPath.split("?")[0] || "/";

    if (!hasAllowedGatewayPath(pathname)) {
        return res.status(404).json({ error: "Route not found by gateway." });
    }

    const baseUrl = routeForRequest(pathname);
    if (!baseUrl) {
        return res.status(404).json({ error: "Route not found by gateway." });
    }

    const upstreamUrl = buildUpstreamUrl(baseUrl, requestPath);
    const safeHeaders = getSafeForwardHeaders(req.headers, req.method);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), getRequestTimeoutMs());
    const hasBody = !["GET", "HEAD"].includes(req.method);

    try {
        const response = await fetch(upstreamUrl, {
            method: req.method,
            headers: safeHeaders,
            body: hasBody ? req : undefined,
            ...(hasBody ? { duplex: "half" } : {}),
            signal: controller.signal,
            redirect: "manual"
        });

        const payload = await response.arrayBuffer();
        res.status(response.status);
        for (const [key, value] of response.headers.entries()) {
            if (["content-length", "transfer-encoding", "connection", "content-encoding", "set-cookie"].includes(key.toLowerCase())) {
                continue;
            }
            res.setHeader(key, value);
        }

        const setCookieValues = response.headers.getSetCookie
            ? response.headers.getSetCookie()
            : [response.headers.get("set-cookie")].filter(Boolean);
        for (const cookieValue of setCookieValues) {
            res.append("Set-Cookie", cookieValue);
        }

        if (req.method === "HEAD" || [204, 304].includes(response.status)) {
            return res.end();
        }

        return res.send(Buffer.from(payload));
    } catch (error) {
        if (controller.signal.aborted || (error && error.name === "AbortError")) {
            return sendProxyError(res, 504, "The upstream service timed out.");
        }

        console.error("Gateway error:", error);
        return sendProxyError(res, 502, "Gateway could not reach the backend service.");
    } finally {
        clearTimeout(timer);
    }
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Gateway running on http://localhost:${PORT}`);
    });
}

module.exports = app;
