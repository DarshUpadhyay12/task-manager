require("dotenv").config();

const express = require("express");
const sequelize = require("../../config/database");
const adminRoutes = require("../../routes/admin");
const { createSessionMiddleware, requireAuthentication, requireAdmin } = require("../shared/session");

const app = express();
const PORT = Number(process.env.ADMIN_SERVICE_PORT || 5003);

app.use(express.json());
app.use(createSessionMiddleware());

app.get("/api/health", (req, res) => {
    res.json({ service: "admin-service", status: "ok" });
});

app.use("/admin/api", requireAuthentication, requireAdmin, adminRoutes);

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }
    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Request body contains invalid JSON." });
    }
    console.error("Admin service error:", error);
    return res.status(500).json({ error: "An unexpected server error occurred." });
});

(async () => {
    try {
        await sequelize.authenticate();
        app.listen(PORT, () => {
            console.log(`Admin service running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Admin service failed to start:", error.message);
        process.exitCode = 1;
    }
})();
