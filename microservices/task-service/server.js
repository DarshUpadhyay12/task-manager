require("dotenv").config();

const express = require("express");
const { createSessionMiddleware, requireAuthentication } = require("../shared/session");
const taskRoutes = require("../../routes/tasks");
const app = express();
const PORT = Number(process.env.TASK_SERVICE_PORT || 5002);

app.use(express.json());
app.use(createSessionMiddleware());

app.get("/api/health", (req, res) => {
    res.json({ service: "task-service", status: "ok" });
});

app.use("/tasks", requireAuthentication, taskRoutes);

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }
    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Request body contains invalid JSON." });
    }
    console.error("Task service error:", error);
    return res.status(500).json({ error: "An unexpected server error occurred." });
});

const sequelize = require("../../config/database");
(async () => {
    try {
        await sequelize.authenticate();
        app.listen(PORT, () => {
            console.log(`Task service running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Task service failed to start:", error.message);
        process.exitCode = 1;
    }
})();
    