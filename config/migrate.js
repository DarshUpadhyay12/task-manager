const { DataTypes } = require("sequelize");
const sequelize = require("./database");

async function ensureColumn(queryInterface, tableName, columnName, definition) {
    const columns = await queryInterface.describeTable(tableName);
    if (!columns[columnName]) {
        await queryInterface.addColumn(tableName, columnName, definition);
    }
}

async function ensureIndex(queryInterface, tableName, columnName, options = {}) {
    const indexes = await queryInterface.showIndex(tableName);
    const exists = indexes.some((index) => index.fields.some((field) =>
        field.attribute === columnName || field.name === columnName
    ) && (!options.unique || index.unique));

    if (!exists) {
        await queryInterface.addIndex(tableName, [columnName], options);
    }
}

async function migrateSchema() {
    const queryInterface = sequelize.getQueryInterface();

    await ensureColumn(queryInterface, "Users", "email", {
        type: DataTypes.STRING,
        allowNull: true
    });
    await ensureColumn(queryInterface, "Users", "passwordHash", {
        type: DataTypes.STRING,
        allowNull: true
    });
    await ensureColumn(queryInterface, "Users", "isAdmin", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    });
    await queryInterface.changeColumn("Users", "age", {
        type: DataTypes.INTEGER,
        allowNull: true
    });
    await queryInterface.changeColumn("Users", "city", {
        type: DataTypes.STRING,
        allowNull: true
    });
    await ensureIndex(queryInterface, "Users", "email", {
        name: "users_email_unique",
        unique: true
    });

    await ensureColumn(queryInterface, "Tasks", "userId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: "Users",
            key: "id"
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
    });
    await ensureColumn(queryInterface, "Tasks", "dueAt", {
        type: DataTypes.DATE,
        allowNull: true
    });
    await ensureIndex(queryInterface, "Tasks", "userId", {
        name: "tasks_user_id"
    });

    if (process.env.ADMIN_EMAIL) {
        const adminEmail = process.env.ADMIN_EMAIL.trim().toLowerCase();
        const [existingUser] = await sequelize.query(
            'SELECT id FROM "Users" WHERE lower(email) = :email LIMIT 1',
            {
                replacements: { email: adminEmail },
                type: sequelize.QueryTypes.SELECT
            }
        );

        if (!existingUser) {
            console.warn(
                `ADMIN_EMAIL does not match an existing account: ${process.env.ADMIN_EMAIL}. Continuing without admin promotion.`
            );
            return;
        }

        await queryInterface.bulkUpdate(
            "Users",
            { isAdmin: true },
            { email: adminEmail }
        );
    }
}

module.exports = migrateSchema;
