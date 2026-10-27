const { Router } = require("express");
const bcrypt = require("bcryptjs");
const { UniqueConstraintError } = require("sequelize");
const sequelize = require("../config/database");
const Task = require("../models/task");
const User = require("../models/user");

const router = Router();
const userFields = ["id", "name", "email", "isAdmin"];

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((error) => error ? reject(error) : resolve());
    });
}

function saveSession(req) {
    return new Promise((resolve, reject) => {
        req.session.save((error) => error ? reject(error) : resolve());
    });
}

router.get("/me", async (req, res) => {
    if (!req.session.userId) {
        return res.json({ user: null });
    }

    const user = await User.findByPk(req.session.userId, { attributes: userFields });
    if (!user) {
        return req.session.destroy((error) => {
            if (error) {
                return res.status(500).json({ error: "Unable to clear the invalid session." });
            }
            res.clearCookie("task_manager.sid");
            res.json({ user: null });
        });
    }

    res.json({ user });
});

router.post("/register", async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ error: "Provide your name, email, and password." });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = body.password;

    if (!name || name.length > 100) {
        return res.status(400).json({ error: "Name is required and must be 100 characters or fewer." });
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (typeof password !== "string" || Buffer.byteLength(password, "utf8") < 8 || Buffer.byteLength(password, "utf8") > 72) {
        return res.status(400).json({ error: "Password must be between 8 and 72 bytes." });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 12);
        const user = await sequelize.transaction(async (transaction) => {
            const isFirstUser = await User.count({ transaction }) === 0;
            const newUser = await User.create({ name, email, passwordHash }, { transaction });

            if (isFirstUser) {
                await Task.update(
                    { userId: newUser.id },
                    { where: { userId: null }, transaction }
                );
            }

            return newUser;
        });

        await regenerateSession(req);
        req.session.userId = user.id;
        await saveSession(req);
        res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
    } catch (error) {
        if (error instanceof UniqueConstraintError) {
            return res.status(409).json({ error: "An account with that email already exists." });
        }
        throw error;
    }
});

router.post("/login", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = req.body?.password;

    if (!email || typeof password !== "string") {
        return res.status(400).json({ error: "Enter your email and password." });
    }

    const user = await User.findOne({ where: { email } });
    const passwordMatches = user?.passwordHash
        ? await bcrypt.compare(password, user.passwordHash)
        : false;

    if (!passwordMatches) {
        return res.status(401).json({ error: "Email or password is incorrect." });
    }

    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);
    res.json({ user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
});

router.post("/logout", (req, res, next) => {
    if (!req.session) {
        res.clearCookie("task_manager.sid");
        return res.status(204).end();
    }

    req.session.destroy((error) => {
        if (error) {
            return next(error);
        }
        res.clearCookie("task_manager.sid");
        res.status(204).end();
    });
});

module.exports = router;
