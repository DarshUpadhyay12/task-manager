const test = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

async function loadReminderModule() {
    const source = await readFile(path.join(__dirname, "..", "public", "js", "reminders.js"), "utf8");
    return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

test("reminder module keeps due filtering and five-minute snooze duration", async () => {
    const { getDueTasks, SNOOZE_DURATION_MS } = await loadReminderModule();
    const due = { id: 1, dueAt: "2025-01-01T00:00:00.000Z", completed: false };
    const future = { id: 2, dueAt: "2030-01-01T00:00:00.000Z", completed: false };
    const completed = { id: 3, dueAt: due.dueAt, completed: true };

    assert.equal(SNOOZE_DURATION_MS, 5 * 60 * 1000);
    assert.deepEqual(getDueTasks([due, future, completed], Date.parse("2026-01-01T00:00:00.000Z")), [due]);
});

test("reminder snoozes persist and are removed when tasks are no longer due", async () => {
    const { createReminderSnoozes } = await loadReminderModule();
    const stored = new Map();
    globalThis.window = {
        localStorage: {
            getItem(key) {
                return stored.get(key) || null;
            },
            setItem(key, value) {
                stored.set(key, value);
            }
        }
    };

    try {
        const snoozes = createReminderSnoozes(assert.fail);
        snoozes.snooze("1:2025-01-01", 12345);
        assert.equal(snoozes.until("1:2025-01-01"), 12345);
        assert.deepEqual(JSON.parse(stored.get("task-manager-reminder-snoozes")), {
            "1:2025-01-01": 12345
        });

        snoozes.removeExcept(new Set());
        assert.equal(snoozes.until("1:2025-01-01"), undefined);
        assert.deepEqual(JSON.parse(stored.get("task-manager-reminder-snoozes")), {});
    } finally {
        delete globalThis.window;
    }
});
