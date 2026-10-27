const { Router } = require("express");
const Task = require("../models/task");
const { taskOwnerInclude, findOwnedTask } = require("../microservices/shared/session");
const validateTaskInput = require("../microservices/shared/task-validation");

const router = Router();

function parseTaskId(value) {
    if (!/^[1-9]\d*$/.test(value)) {
        return null;
    }

    const id = Number(value);
    return Number.isSafeInteger(id) ? id : null;
}

router.get("/", async (req, res) => {
    const tasks = await Task.findAll({
        where: { userId: req.user.id },
        include: [taskOwnerInclude()],
        order: [["createdAt", "DESC"], ["id", "DESC"]]
    });

    res.json(tasks);
});

router.get("/:id", async (req, res) => {
    const id = parseTaskId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: "Task ID must be a positive integer." });
    }

    const task = await findOwnedTask(id, req.user.id);
    if (!task) {
        return res.status(404).json({ error: "Task not found." });
    }

    return res.json(task);
});

router.post("/", async (req, res) => {
    const result = validateTaskInput(req.body);
    if (result.errors) {
        return res.status(400).json({ errors: result.errors });
    }

    const task = await Task.create({
        ...result.values,
        userId: req.user.id
    });

    await task.reload({ include: [taskOwnerInclude()] });
    return res.status(201).json(task);
});

router.put("/:id", async (req, res) => {
    const id = parseTaskId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: "Task ID must be a positive integer." });
    }

    const result = validateTaskInput(req.body);
    if (result.errors) {
        return res.status(400).json({ errors: result.errors });
    }

    const task = await findOwnedTask(id, req.user.id);
    if (!task) {
        return res.status(404).json({ error: "Task not found." });
    }

    await task.update(result.values);
    await task.reload({ include: [taskOwnerInclude()] });
    return res.json(task);
});

router.patch("/:id", async (req, res) => {
    const id = parseTaskId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: "Task ID must be a positive integer." });
    }

    const result = validateTaskInput(req.body, { partial: true });
    if (result.errors) {
        return res.status(400).json({ errors: result.errors });
    }

    const task = await findOwnedTask(id, req.user.id);
    if (!task) {
        return res.status(404).json({ error: "Task not found." });
    }

    await task.update(result.values);
    await task.reload({ include: [taskOwnerInclude()] });
    return res.json(task);
});

router.delete("/:id", async (req, res) => {
    const id = parseTaskId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: "Task ID must be a positive integer." });
    }

    const task = await findOwnedTask(id, req.user.id);
    if (!task) {
        return res.status(404).json({ error: "Task not found." });
    }

    await task.destroy();
    return res.status(204).end();
});

module.exports = router;
