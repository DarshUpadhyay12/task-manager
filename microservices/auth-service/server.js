require("dotenv").config();

const express = require("express");
const sequelize = require("../../config/database");
const { createSessionMiddleware } = require("../shared/session");
const authRoutes = require("../../routes/auth");
const migrateSchema = require("../../config/migrate");

const app = express();
const PORT = Number(process.env.AUTH_SERVICE_PORT || 5001);

app.use(express.json());
app.use(createSessionMiddleware());

app.get("/api/health", (req, res) => {
    res.json({ service: "auth-service", status: "ok" });
});

app.use("/auth", authRoutes);

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Request body contains invalid JSON." });
    }

    console.error("Auth service error:", error);
    return res.status(500).json({ error: "An unexpected server error occurred." });
});

async function start() {
    try {
        await sequelize.authenticate();
        await sequelize.sync();
        await migrateSchema();
        app.listen(PORT, () => {
            console.log(`Auth service running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Auth service failed to start:", error.message);
        process.exitCode = 1;
    }
}

start();
