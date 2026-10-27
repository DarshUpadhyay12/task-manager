process.env.DB_PASSWORD ||= "unit-test-only";
process.env.DB_USER ||= "unit-test-user";

const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../models/user");
const Task = require("../models/task");
const { requireAuthentication, requireAdmin, findOwnedTask } = require("../microservices/shared/session");

function createResponse() {
    return {
        statusCode: 200,
        body: undefined,
        clearedCookies: [],
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        clearCookie(name) {
            this.clearedCookies.push(name);
            return this;
        }
    };
}

test("authentication uses the server-side session user, not client identity headers", async () => {
    const originalFindByPk = User.findByPk;
    User.findByPk = async (id) => ({ id, name: "Session user", isAdmin: false });

    try {
        const req = {
            session: { userId: 17 },
            headers: { "x-user-id": "99", "x-is-admin": "true" }
        };
        const res = createResponse();
        let continued = false;

        await requireAuthentication(req, res, () => {
            continued = true;
        });

        assert.equal(continued, true);
        assert.equal(req.user.id, 17);
        assert.equal(req.user.isAdmin, false);
    } finally {
        User.findByPk = originalFindByPk;
    }
});

test("authentication rejects missing or stale sessions", async () => {
    const originalFindByPk = User.findByPk;
    User.findByPk = async () => null;

    try {
        const missingResponse = createResponse();
        await requireAuthentication({ session: {} }, missingResponse, () => {
            assert.fail("Unauthenticated request must not continue.");
        });
        assert.equal(missingResponse.statusCode, 401);

        const staleResponse = createResponse();
        const req = {
            session: {
                userId: 17,
                destroy(callback) {
                    callback(null);
                }
            }
        };
        await requireAuthentication(req, staleResponse, () => {
            assert.fail("Stale session must not continue.");
        });
        assert.equal(staleResponse.statusCode, 401);
        assert.deepEqual(staleResponse.clearedCookies, ["task_manager.sid"]);
    } finally {
        User.findByPk = originalFindByPk;
    }
});

test("admin middleware allows administrators and rejects regular users", () => {
    const deniedResponse = createResponse();
    let continued = false;
    requireAdmin({ user: { isAdmin: false } }, deniedResponse, () => {
        continued = true;
    });
    assert.equal(deniedResponse.statusCode, 403);
    assert.equal(continued, false);

    requireAdmin({ user: { isAdmin: true } }, createResponse(), () => {
        continued = true;
    });
    assert.equal(continued, true);
});

test("task ownership lookup always scopes the database query to the session user", async () => {
    const originalFindOne = Task.findOne;
    const ownedTask = { id: 42, userId: 17 };
    let query;
    Task.findOne = async (options) => {
        query = options;
        return options.where.id === ownedTask.id && options.where.userId === ownedTask.userId
            ? ownedTask
            : null;
    };

    try {
        assert.equal(await findOwnedTask(42, 17), ownedTask);
        assert.deepEqual(query.where, { id: 42, userId: 17 });
        assert.equal(await findOwnedTask(42, 23), null);
    } finally {
        Task.findOne = originalFindOne;
    }
});
