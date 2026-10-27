const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const User = require("../../models/user");
const Task = require("../../models/task");
const { literal } = require("sequelize");

function getDbConfig() {
    if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
        throw new Error("DB_USER and DB_PASSWORD must be configured.");
    }

    return {
        host: process.env.DB_HOST || "127.0.0.1",
        port: Number(process.env.DB_PORT || 5433),
        database: process.env.DB_NAME || "api_practice",
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    };
}

function createSessionMiddleware() {
    if (!process.env.SESSION_SECRET) {
        throw new Error("SESSION_SECRET must be configured for the microservices.");
    }

    return session({
        name: "task_manager.sid",
        secret: process.env.SESSION_SECRET,
        store: new pgSession({
            conObject: getDbConfig(),
            tableName: "user_sessions",
            createTableIfMissing: true
        }),
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
    });
}

const userFields = ["id", "name", "email", "isAdmin"];

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

async function requireAuthentication(req, res, next) {
    if (!req.session?.userId) {
        return res.status(401).json({ error: "Please log in to manage your tasks." });
    }

    const user = await User.findByPk(req.session.userId, { attributes: userFields });
    if (!user) {
        return req.session.destroy((error) => {
            if (error) {
                return next(error);
            }
            res.clearCookie("task_manager.sid");
            res.status(401).json({ error: "Please log in to manage your tasks." });
        });
    }

    req.user = user;
    next();
}

function requireAdmin(req, res, next) {
    if (!req.user?.isAdmin) {
        return res.status(403).json({ error: "Administrator access is required." });
    }
    next();
}

function taskOwnerInclude() {
    return {
        model: User,
        as: "owner",
        attributes: ["id", "name", "email"]
    };
}

async function findOwnedTask(id, userId) {
    return Task.findOne({
        where: { id, userId },
        include: [taskOwnerInclude()]
    });
}

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

module.exports = {
    createSessionMiddleware,
    requireAuthentication,
    requireAdmin,
    taskOwnerInclude,
    findOwnedTask,
    userFields,
    userWithTasksQueryOptions,
    regenerateSession,
    saveSession,
    getDbConfig
};
