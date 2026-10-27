const { Router } = require("express");
const bcrypt = require("bcryptjs");
const { literal, UniqueConstraintError } = require("sequelize");
const Task = require("../models/task");
const User = require("../models/user");

const router = Router();

function parseUserId(value) {
    if (!/^[1-9]\d*$/.test(value)) {
        return null;
    }

    const id = Number(value);
    return Number.isSafeInteger(id) ? id : null;
}

function validateUserInput(body, { partial = false, replacing = false } = {}) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { errors: { body: "Request body must be a JSON object." } };
    }

    const errors = {};
    const values = {};
    const allowedFields = ["name", "email", "password", "isAdmin"];

    for (const field of Object.keys(body)) {
        if (!allowedFields.includes(field)) {
            errors[field] = "This field is not supported.";
        }
    }

    if (!partial || Object.hasOwn(body, "name")) {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name || name.length > 100) {
            errors.name = "Name is required and must be 100 characters or fewer.";
        } else {
            values.name = name;
        }
    }

    if (!partial || Object.hasOwn(body, "email")) {
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.email = "Enter a valid email address.";
        } else {
            values.email = email;
        }
    }

    if (!partial || Object.hasOwn(body, "password")) {
        const password = body.password;
        const required = !partial && !replacing;
        if (password === undefined && replacing) {
            // PUT replaces public account fields; password changes are optional.
        } else if (typeof password !== "string"
            || Buffer.byteLength(password, "utf8") < 8
            || Buffer.byteLength(password, "utf8") > 72) {
            errors.password = "Password must be between 8 and 72 bytes.";
        } else {
            values.password = password;
        }
        if (required && password === undefined) {
            errors.password = "Password is required and must be between 8 and 72 bytes.";
        }
    }

    if (!partial || Object.hasOwn(body, "isAdmin")) {
        if (body.isAdmin === undefined && !replacing) {
            values.isAdmin = false;
        } else if (typeof body.isAdmin !== "boolean") {
            errors.isAdmin = "isAdmin must be true or false.";
        } else {
            values.isAdmin = body.isAdmin;
        }
    }

    if (partial && Object.keys(body).length === 0) {
        errors.body = "Provide at least one field to update.";
    }

    return Object.keys(errors).length > 0 ? { errors } : { values };
}

function userWithTasksQueryOptions() {
    return {
        attributes: [
            "id",
            "name",
            "email",
            "isAdmin",
            "createdAt",
            [literal('(SELECT COUNT(*) FROM "Tasks" AS task_count WHERE task_count."userId" = "User"."id")'), "taskCount"]
        ],
        include: [{
            model: Task,
            as: "tasks",
            attributes: ["id", "title", "description", "completed", "createdAt"],
            required: false
        }]
    };
}

router.get("/users", async (req, res) => {
    const users = await User.findAll({
        ...userWithTasksQueryOptions(),
        order: [["id", "ASC"], [{ model: Task, as: "tasks" }, "createdAt", "DESC"]]
    });

    res.json(users);
});

router.get("/users/:id", async (req, res) => {
    const id = parseUserId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: "User ID must be a positive integer." });
    }

    const user = await User.findByPk(id, userWithTasksQueryOptions());
    if (!user) {
        return res.status(404).json({ error: "User not found." });
    }

    res.json(user);
});

router.post("/users", async (req, res) => {
    const result = validateUserInput(req.body);
    if (result.errors) {
        return res.status(400).json({ errors: result.errors });
    }

    const { password, ...values } = result.values;
    const user = await User.create({
        ...values,
        passwordHash: await bcrypt.hash(password, 12)
    });

    res.status(201).json({
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt
    });
});

router.put("/users/:id", async (req, res) => {
    const id = parseUserId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: "User ID must be a positive integer." });
    }

    const result = validateUserInput(req.body, { replacing: true });
    if (result.errors) {
        return res.status(400).json({ errors: result.errors });
    }

    const user = await User.findByPk(id);
    if (!user) {
        return res.status(404).json({ error: "User not found." });
    }

    if (user.isAdmin && result.values.isAdmin === false
        && await User.count({ where: { isAdmin: true } }) <= 1) {
        return res.status(409).json({ error: "The last administrator cannot be demoted." });
    }

    const { password, ...values } = result.values;
    if (password !== undefined) {
        values.passwordHash = await bcrypt.hash(password, 12);
    }
    await user.update(values);

    res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt
    });
});

router.patch("/users/:id", async (req, res) => {
    const id = parseUserId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: "User ID must be a positive integer." });
    }

    const result = validateUserInput(req.body, { partial: true });
    if (result.errors) {
        return res.status(400).json({ errors: result.errors });
    }

    const user = await User.findByPk(id);
    if (!user) {
        return res.status(404).json({ error: "User not found." });
    }

    if (user.isAdmin && result.values.isAdmin === false
        && await User.count({ where: { isAdmin: true } }) <= 1) {
        return res.status(409).json({ error: "The last administrator cannot be demoted." });
    }

    const { password, ...values } = result.values;
    if (password !== undefined) {
        values.passwordHash = await bcrypt.hash(password, 12);
    }
    await user.update(values);

    res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt
    });
});

router.delete("/users/:id", async (req, res) => {
    const id = parseUserId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: "User ID must be a positive integer." });
    }
    if (id === req.user.id) {
        return res.status(409).json({ error: "You cannot delete your own administrator account." });
    }

    const user = await User.findByPk(id);
    if (!user) {
        return res.status(404).json({ error: "User not found." });
    }

    if (user.isAdmin && await User.count({ where: { isAdmin: true } }) <= 1) {
        return res.status(409).json({ error: "The last administrator cannot be deleted." });
    }

    await user.destroy();
    res.status(204).end();
});

router.use((error, req, res, next) => {
    if (error instanceof UniqueConstraintError) {
        return res.status(409).json({ error: "An account with that email already exists." });
    }
    next(error);
});

module.exports = router;
