const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const User = require("./user");

const Task = sequelize.define("Task", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    completed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    dueAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: User,
            key: "id"
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
    }
});

User.hasMany(Task, { as: "tasks", foreignKey: "userId" });
Task.belongsTo(User, { as: "owner", foreignKey: "userId" });

module.exports = Task;
