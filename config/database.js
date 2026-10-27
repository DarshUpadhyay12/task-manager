const { Sequelize } = require("sequelize");

if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
    throw new Error("DB_USER and DB_PASSWORD must be configured.");
}

const sequelize = new Sequelize(
    process.env.DB_NAME || "api_practice",
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST || "127.0.0.1",
        port: Number(process.env.DB_PORT || 5433),
        dialect: "postgres",
        logging: false
    }
);

module.exports = sequelize;