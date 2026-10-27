function validateTaskInput(body, { partial = false } = {}) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { errors: { body: "Request body must be a JSON object." } };
    }

    const errors = {};
    const values = {};
    const allowedFields = ["title", "description", "completed", "dueAt"];

    for (const field of Object.keys(body)) {
        if (!allowedFields.includes(field)) {
            errors[field] = "This field is not supported.";
        }
    }

    if (!partial || Object.hasOwn(body, "title")) {
        if (typeof body.title !== "string" || body.title.trim().length === 0) {
            errors.title = "Title is required and must be a non-empty string.";
        } else {
            values.title = body.title.trim();
        }
    }

    if (Object.hasOwn(body, "description")) {
        if (body.description !== null && typeof body.description !== "string") {
            errors.description = "Description must be a string or null.";
        } else {
            values.description = body.description;
        }
    } else if (!partial) {
        values.description = null;
    }

    if (Object.hasOwn(body, "completed")) {
        if (typeof body.completed !== "boolean") {
            errors.completed = "Completed must be a boolean.";
        } else {
            values.completed = body.completed;
        }
    } else if (!partial) {
        values.completed = false;
    }

    if (Object.hasOwn(body, "dueAt")) {
        const dueAt = body.dueAt;
        const date = typeof dueAt === "string" ? new Date(dueAt) : null;
        const isValidDate = date
            && !Number.isNaN(date.valueOf())
            && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(dueAt)
            && date.toISOString() === dueAt;

        if (dueAt !== null && !isValidDate) {
            errors.dueAt = "Due date must be a valid ISO 8601 timestamp or null.";
        } else {
            values.dueAt = dueAt;
        }
    } else if (!partial) {
        values.dueAt = null;
    }

    if (partial && Object.keys(body).length === 0) {
        errors.body = "Provide at least one field to update.";
    }

    return Object.keys(errors).length > 0 ? { errors } : { values };
}

module.exports = validateTaskInput;
