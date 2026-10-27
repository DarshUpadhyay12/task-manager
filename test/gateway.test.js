const test = require("node:test");
const assert = require("node:assert/strict");
const { routeForRequest, buildUpstreamUrl, getSafeForwardHeaders } = require("../microservices/gateway/router");

const gatewayPath = require.resolve("../microservices/gateway/server");

function startApp(app) {
    return new Promise((resolve) => {
        const server = app.listen(0, () => resolve(server));
    });
}

function closeServer(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}

function loadGateway() {
    delete require.cache[gatewayPath];
    return require(gatewayPath);
}

async function withFetch(mockFetch, callback) {
    const originalFetch = global.fetch;
    global.fetch = mockFetch;
    try {
        return await callback(originalFetch);
    } finally {
        global.fetch = originalFetch;
    }
}

async function withEnvironment(values, callback) {
    const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
    for (const [key, value] of Object.entries(values)) {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }

    try {
        return await callback();
    } finally {
        for (const [key, value] of previous) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
}

test("routes only the configured service namespaces and joins paths and queries once", async () => {
    await withEnvironment({
        AUTH_SERVICE_URL: "https://auth.internal:8443/base/path",
        TASK_SERVICE_URL: "http://tasks.internal:5002",
        ADMIN_SERVICE_URL: "http://admin.internal:5003"
    }, () => {
        assert.equal(routeForRequest("/auth/register"), "https://auth.internal:8443");
        assert.equal(routeForRequest("/authentic"), null);
        assert.equal(routeForRequest("/tasks/42"), "http://tasks.internal:5002");
        assert.equal(routeForRequest("/tasks-admin"), null);
        assert.equal(routeForRequest("/admin/users"), "http://admin.internal:5003");
        assert.equal(routeForRequest("/admin/api/users"), "http://admin.internal:5003");
        assert.equal(routeForRequest("/api/health"), null);
        assert.equal(routeForRequest("/unknown"), null);
        assert.equal(buildUpstreamUrl("http://localhost:5001", "/auth/register?x=1&x=2"), "http://localhost:5001/auth/register?x=1&x=2");
        assert.equal(buildUpstreamUrl("http://localhost:5002/base", "/tasks/5?filter=done"), "http://localhost:5002/tasks/5?filter=done");
    });
});

test("forwarded headers preserve cookies and remove untrusted identity and hop-by-hop headers", () => {
    const forwarded = getSafeForwardHeaders({
        host: "localhost:5005",
        cookie: "task_manager.sid=abc",
        authorization: "Bearer token",
        "x-user-id": "42",
        "x-user-email": "spoofed@example.com",
        "x-is-admin": "true",
        "x-forwarded-for": "127.0.0.1",
        "content-type": "application/json"
    }, "POST");

    assert.equal(forwarded.cookie, "task_manager.sid=abc");
    assert.equal(forwarded.authorization, "Bearer token");
    assert.equal(forwarded["content-type"], "application/json");
    for (const name of ["host", "x-user-id", "x-user-email", "x-is-admin", "x-forwarded-for"]) {
        assert.equal(forwarded[name], undefined, `${name} should not be forwarded`);
    }
});

test("gateway forwards method, raw body, query, session cookie, status, and multiple Set-Cookie headers", async () => {
    await withEnvironment({
        AUTH_SERVICE_URL: "http://auth.test:5001",
        GATEWAY_REQUEST_TIMEOUT_MS: "1000"
    }, async () => withFetch(async (url, options) => {
        const chunks = [];
        for await (const chunk of options.body) {
            chunks.push(Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks);

        assert.equal(url, "http://auth.test:5001/auth/login?email=test%40example.com&tag=a&tag=b");
        assert.equal(options.method, "PATCH");
        assert.equal(options.headers.cookie, "task_manager.sid=original");
        assert.equal(options.headers["x-user-id"], undefined);
        assert.equal(options.headers["x-user-email"], undefined);
        assert.equal(options.headers["x-is-admin"], undefined);
        assert.equal(body.toString("utf8"), '{"email":"test@example.com","password":"secret"}');

        const headers = new Headers({ "content-type": "application/json" });
        headers.append("set-cookie", "task_manager.sid=upstream; HttpOnly; Path=/");
        headers.append("set-cookie", "csrf=token; SameSite=Lax; Path=/");
        return new Response('{"ok":true}', { status: 207, headers });
    }, async (requestFetch) => {
        const gatewayApp = loadGateway();
        const server = await startApp(gatewayApp);

        try {
            const response = await requestFetch(`http://127.0.0.1:${server.address().port}/auth/login?email=test%40example.com&tag=a&tag=b`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "task_manager.sid=original",
                    "x-user-id": "attacker",
                    "x-user-email": "attacker@example.com",
                    "x-is-admin": "true"
                },
                body: '{"email":"test@example.com","password":"secret"}'
            });

            assert.equal(response.status, 207);
            assert.deepEqual(await response.json(), { ok: true });
            const cookies = response.headers.getSetCookie
                ? response.headers.getSetCookie()
                : [response.headers.get("set-cookie")];
            assert.equal(cookies.length, 2);
            assert.match(cookies[0], /task_manager\.sid=upstream/);
            assert.match(cookies[1], /csrf=token/);
        } finally {
            await closeServer(server);
        }
    }));
});

test("gateway serves the existing frontend and handles only intended proxy paths", async () => {
    let upstreamCalls = 0;
    await withFetch(async () => {
        upstreamCalls += 1;
        return new Response("unexpected", { status: 200 });
    }, async (requestFetch) => {
        const gatewayApp = loadGateway();
        const server = await startApp(gatewayApp);

        try {
            const home = await requestFetch(`http://127.0.0.1:${server.address().port}/`);
            assert.equal(home.status, 200);
            assert.match(await home.text(), /type="module" src="\/app\.js"/);

            const adminPage = await requestFetch(`http://127.0.0.1:${server.address().port}/admin`);
            assert.equal(adminPage.status, 200);
            assert.match(await adminPage.text(), /type="module" src="\/admin\.js"/);

            const apiModule = await requestFetch(`http://127.0.0.1:${server.address().port}/js/api.js`);
            assert.equal(apiModule.status, 200);
            assert.match(await apiModule.text(), /export async function apiRequest/);

            const health = await requestFetch(`http://127.0.0.1:${server.address().port}/api/health`);
            assert.equal(health.status, 200);
            assert.deepEqual(await health.json(), { service: "gateway", status: "ok" });

            for (const path of ["/authentication", "/tasks-admin", "/api/health/extra", "/unknown"]) {
                const response = await requestFetch(`http://127.0.0.1:${server.address().port}${path}`);
                assert.equal(response.status, 404, `${path} should not be routed`);
            }
            assert.equal(upstreamCalls, 0);
        } finally {
            await closeServer(server);
        }
    });
});

test("gateway returns a safe 504 response when the upstream times out", async () => {
    await withEnvironment({ GATEWAY_REQUEST_TIMEOUT_MS: "20" }, async () => withFetch((_url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
        }, { once: true });
    }), async (requestFetch) => {
        const gatewayApp = loadGateway();
        const server = await startApp(gatewayApp);

        try {
            const response = await requestFetch(`http://127.0.0.1:${server.address().port}/tasks`);
            assert.equal(response.status, 504);
            assert.deepEqual(await response.json(), { error: "The upstream service timed out." });
        } finally {
            await closeServer(server);
        }
    }));
});

test("gateway returns a safe 502 response when the upstream is unavailable", async () => {
    await withFetch(async () => {
        throw new Error("upstream details must not be exposed");
    }, async (requestFetch) => {
        const gatewayApp = loadGateway();
        const server = await startApp(gatewayApp);

        try {
            const response = await requestFetch(`http://127.0.0.1:${server.address().port}/admin/users`);
            assert.equal(response.status, 502);
            assert.deepEqual(await response.json(), { error: "Gateway could not reach the backend service." });
        } finally {
            await closeServer(server);
        }
    });
});
