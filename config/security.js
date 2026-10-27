const rateLimit = require("express-rate-limit");

function createRateLimiter(limit, error) {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        limit,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: { error }
    });
}

const publicApiLimiter = createRateLimiter(600, "Too many requests. Please try again later.");
const authenticationLimiter = createRateLimiter(10, "Too many authentication attempts. Please try again later.");

function configureTrustProxy(app, hops = process.env.TRUST_PROXY_HOPS || "0") {
    const parsedHops = Number(hops);
    if (!Number.isSafeInteger(parsedHops) || parsedHops < 0) {
        throw new Error("TRUST_PROXY_HOPS must be a non-negative integer.");
    }

    app.set("trust proxy", parsedHops);
}

function requireHttps(req, res, next) {
    if (process.env.NODE_ENV !== "production" || req.path === "/api/health") {
        return next();
    }

    if (!req.secure) {
        return res.status(426).json({ error: "HTTPS is required." });
    }

    res.setHeader("Strict-Transport-Security", "max-age=31536000");
    next();
}

module.exports = {
    createRateLimiter,
    publicApiLimiter,
    authenticationLimiter,
    configureTrustProxy,
    requireHttps
};
