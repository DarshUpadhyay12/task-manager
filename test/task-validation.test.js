const test = require("node:test");
const assert = require("node:assert/strict");
const validateTaskInput = require("../microservices/shared/task-validation");

test("task validation accepts a valid scheduled due date", () => {
    const result = validateTaskInput({
        title: "Finish report",
        dueAt: "2026-10-15T09:30:00.000Z"
    });

    assert.deepEqual(result, {
        values: {
            title: "Finish report",
            description: null,
            completed: false,
            dueAt: "2026-10-15T09:30:00.000Z"
        }
    });
});

test("task validation accepts clearing a due date in a partial update", () => {
    assert.deepEqual(validateTaskInput({ dueAt: null }, { partial: true }), {
        values: { dueAt: null }
    });
});

test("task validation rejects malformed and impossible due dates", () => {
    for (const dueAt of ["tomorrow", "2026-02-30T09:30:00.000Z", "2026-10-15T09:30:00Z"]) {
        assert.deepEqual(validateTaskInput({ dueAt }, { partial: true }), {
            errors: { dueAt: "Due date must be a valid ISO 8601 timestamp or null." }
        });
    }
});

test("full replacement clears an omitted due date while a partial update preserves it", () => {
    const fullReplacement = validateTaskInput({ title: "Updated task" });
    const partialUpdate = validateTaskInput({ title: "Updated task" }, { partial: true });

    assert.equal(fullReplacement.values.dueAt, null);
    assert.equal(Object.hasOwn(partialUpdate.values, "dueAt"), false);
});
