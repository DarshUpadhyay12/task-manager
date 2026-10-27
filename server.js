require("dotenv").config();

const express = require("express");
const crypto = require("node:crypto");
const path = require("node:path");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const sequelize = require("./config/database");
const migrateSchema = require("./config/migrate");
const User = require("./models/user");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const taskRoutes = require("./routes/tasks");
const { publicApiLimiter, configureTrustProxy, requireHttps } = require("./config/security");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const sessionSecret = process.env.SESSION_SECRET;

configureTrustProxy(app);
app.use(publicApiLimiter);
app.use(requireHttps);

if (process.env.NODE_ENV === "production" && !sessionSecret) {
    throw new Error("SESSION_SECRET must be configured in production.");
}

if (!sessionSecret) {
    console.warn("SESSION_SECRET is not set; login sessions will reset when the API restarts.");
}

app.use(express.json());
app.use(session({
    name: "task_manager.sid",
    secret: sessionSecret || crypto.randomBytes(32).toString("hex"),
    store: new pgSession({
        conObject: process.env.DATABASE_URL ? {
            connectionString: process.env.DATABASE_URL,
            ssl: (process.env.DB_SSL === "true" || process.env.NODE_ENV === "production") ? { rejectUnauthorized: false } : false
        } : {
            host: process.env.DB_HOST || "127.0.0.1",
            port: Number(process.env.DB_PORT || 5433),
            database: process.env.DB_NAME || "api_practice",
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ...(process.env.DB_SSL === "true" ? { ssl: { rejectUnauthorized: false } } : {})
        },
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
}));
app.get("/admin", requireAuthentication, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.use("/admin/api", requireAuthentication, requireAdmin, adminRoutes);
app.use(express.static(path.join(__dirname, "public")));
app.use("/auth", authRoutes);

async function requireAuthentication(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Please log in to manage your tasks." });
    }

    const user = await User.findByPk(req.session.userId, {
        attributes: ["id", "name", "email", "isAdmin"]
    });
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
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: "Administrator access is required." });
    }
    next();
}

app.get("/api/health", (req, res) => {
    res.json({
        message: "API Server is Running!"
    });
});

app.use("/api", requireAuthentication, requireAdmin, adminRoutes);

app.use("/tasks", requireAuthentication, taskRoutes);

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Request body contains invalid JSON." });
    }
    console.error("API error:", error);
    res.status(500).json({ error: "An unexpected server error occurred." });
});

async function startServer() {
    try {
        await sequelize.authenticate();

        console.log("PostgreSQL connected successfully!");

        await sequelize.sync();
        await migrateSchema();

        console.log("Database tables are ready!");

        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error("Database error:", error.message);
        process.exitCode = 1;
    }
}

startServer();  