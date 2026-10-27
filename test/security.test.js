const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const {
    createRateLimiter,
    configureTrustProxy,
    requireHttps
} = require("../config/security");

test("rate limiter rejects requests after the configured limit", async () => {
    const app = express();
    app.use(createRateLimiter(2, "Request limit reached."));
    app.get("/", (req, res) => res.sendStatus(200));

    const server = app.listen(0);
    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });

    try {
        const url = `http://127.0.0.1:${server.address().port}/`;
        assert.equal((await fetch(url)).status, 200);
        assert.equal((await fetch(url)).status, 200);
        const limited = await fetch(url);
        assert.equal(limited.status, 429);
        assert.deepEqual(await limited.json(), { error: "Request limit reached." });
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
});

test("proxy trust accepts only a non-negative hop count", () => {
    const app = { set(name, value) { this.setting = [name, value]; } };
    configureTrustProxy(app, "1");
    assert.deepEqual(app.setting, ["trust proxy", 1]);
    assert.throws(() => configureTrustProxy(app, "true"), /non-negative integer/);
});

test("production requests require HTTPS and receive HSTS when secure", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
        let nextCalled = false;
        const insecureResponse = {
            statusCode: 200,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(body) {
                this.body = body;
                return this;
            }
        };
        requireHttps({ path: "/", secure: false }, insecureResponse, () => {
            nextCalled = true;
        });
        assert.equal(insecureResponse.statusCode, 426);
        assert.deepEqual(insecureResponse.body, { error: "HTTPS is required." });
        assert.equal(nextCalled, false);

        const secureResponse = {
            headers: {},
            setHeader(name, value) {
                this.headers[name] = value;
            }
        };
        requireHttps({ path: "/", secure: true }, secureResponse, () => {
            nextCalled = true;
        });
        assert.equal(secureResponse.headers["Strict-Transport-Security"], "max-age=31536000");
        assert.equal(nextCalled, true);

        nextCalled = false;
        requireHttps({ path: "/api/health", secure: false }, {}, () => {
            nextCalled = true;
        });
        assert.equal(nextCalled, true);
    } finally {
        if (previousNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = previousNodeEnv;
        }
    }
});
