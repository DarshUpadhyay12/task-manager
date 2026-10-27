export const SNOOZE_DURATION_MS = 5 * 60 * 1000;

export function reminderKey(task) {
    return `${task.id}:${task.dueAt}`;
}

export function getDueTasks(tasks, now = Date.now()) {
    return tasks.filter((task) =>
        !task.completed && task.dueAt && new Date(task.dueAt).getTime() <= now
    );
}

function loadSnoozes() {
    try {
        const storedSnoozes = JSON.parse(window.localStorage.getItem("task-manager-reminder-snoozes") || "{}");
        return Object.fromEntries(
            Object.entries(storedSnoozes).filter(([, until]) => Number.isFinite(until) && until > Date.now())
        );
    } catch {
        return {};
    }
}

export function createReminderSnoozes(onStorageError) {
    const snoozedUntil = loadSnoozes();

    function save() {
        try {
            window.localStorage.setItem("task-manager-reminder-snoozes", JSON.stringify(snoozedUntil));
        } catch {
            onStorageError("Your five-minute snooze could not be saved across page reloads.");
        }
    }

    return {
        until(key) {
            return snoozedUntil[key];
        },
        snooze(key, until) {
            snoozedUntil[key] = until;
            save();
        },
        clear(key) {
            delete snoozedUntil[key];
            save();
        },
        removeExcept(keys) {
            let changed = false;
            for (const key of Object.keys(snoozedUntil)) {
                if (!keys.has(key)) {
                    delete snoozedUntil[key];
                    changed = true;
                }
            }
            if (changed) {
                save();
            }
        }
    };
}
