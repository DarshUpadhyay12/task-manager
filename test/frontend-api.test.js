const test = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

async function loadApiModule() {
    const source = await readFile(path.join(__dirname, "..", "public", "js", "api.js"), "utf8");
    return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

test("frontend API helper forwards gateway URL, JSON body and session credentials", async () => {
    const { apiRequest } = await loadApiModule();
    const originalFetch = globalThis.fetch;
    const originalDocument = globalThis.document;
    const originalApiBase = globalThis.TASK_MANAGER_API_BASE;
    let call;
    globalThis.TASK_MANAGER_API_BASE = "";
    globalThis.document = {
        querySelector: () => ({ content: "http://gateway.test" })
    };
    globalThis.fetch = async (url, options) => {
        call = { url, options };
        return new Response('{"ok":true}', {
            status: 200,
            headers: { "content-type": "application/json" }
        });
    };

    try {
        assert.deepEqual(await apiRequest("/tasks", {
            method: "POST",
            body: JSON.stringify({ title: "Task" })
        }), { ok: true });
        assert.equal(call.url, "http://gateway.test/tasks");
        assert.equal(call.options.credentials, "include");
        assert.equal(call.options.headers["Content-Type"], "application/json");
        assert.equal(call.options.body, '{"title":"Task"}');
    } finally {
        globalThis.fetch = originalFetch;
        globalThis.document = originalDocument;
        if (originalApiBase === undefined) {
            delete globalThis.TASK_MANAGER_API_BASE;
        } else {
            globalThis.TASK_MANAGER_API_BASE = originalApiBase;
        }
    }
});

test("frontend API helper retains status codes for authorization handling", async () => {
    const { apiRequest } = await loadApiModule();
    const originalFetch = globalThis.fetch;
    const originalDocument = globalThis.document;
    globalThis.document = { querySelector: () => ({ content: "" }) };
    globalThis.fetch = async () => new Response('{"error":"Administrator access is required."}', {
        status: 403,
        headers: { "content-type": "application/json" }
    });

    try {
        await assert.rejects(apiRequest("/admin/api/users"), (error) => {
            assert.equal(error.status, 403);
            assert.equal(error.message, "Administrator access is required.");
            return true;
        });
    } finally {
        globalThis.fetch = originalFetch;
        globalThis.document = originalDocument;
    }
});
