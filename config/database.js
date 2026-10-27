const { Sequelize } = require("sequelize");

const isProduction = process.env.NODE_ENV === "production";
const useSsl = process.env.DB_SSL === "true" || (isProduction && Boolean(process.env.DATABASE_URL));

let sequelize;

if (process.env.DATABASE_URL) {
    sequelize = new Sequelize(process.env.DATABASE_URL, {
        dialect: "postgres",
        logging: false,
        dialectOptions: useSsl ? {
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        } : {}
    });
} else {
    if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
        throw new Error("DB_USER and DB_PASSWORD must be configured.");
    }

    sequelize = new Sequelize(
        process.env.DB_NAME || "api_practice",
        process.env.DB_USER,
        process.env.DB_PASSWORD,
        {
            host: process.env.DB_HOST || "127.0.0.1",
            port: Number(process.env.DB_PORT || 5433),
            dialect: "postgres",
            logging: false,
            dialectOptions: useSsl ? {
                ssl: {
                    require: true,
                    rejectUnauthorized: false
                }
            } : {}
        }
    );
}

module.exports = sequelize;