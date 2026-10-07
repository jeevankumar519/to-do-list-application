const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
const nodemailer = require("nodemailer");
const Task = require("./models/Task");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/todoapp";

app.use(express.json());
app.use(express.static(publicDir));

function buildTaskDate(task) {
  if (!task.dueDate) return null;

  const dueDate = new Date(task.dueDate);

  if (!task.dueTime) {
    return dueDate;
  }

  const [hours, minutes] = String(task.dueTime).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return dueDate;
  }

  dueDate.setHours(hours, minutes, 0, 0);
  return dueDate;
}

function isReminderDue(task) {
  if (!task.dueDate || task.completed || task.reminderSent) {
    return false;
  }

  const dueDate = buildTaskDate(task);
  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    return false;
  }

  const reminderTime = new Date(dueDate.getTime() - Number(task.reminderMinutes || 0) * 60000);
  return Date.now() >= reminderTime.getTime();
}

async function sendEmailReminder(task) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log(`Reminder email not sent for "${task.title}": SMTP config missing.`);
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT || 587) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to: task.contact,
      subject: `Reminder: ${task.title}`,
      text: `This is a reminder for your task: "${task.title}". It is scheduled for ${new Date(buildTaskDate(task)).toLocaleString()}.`,
      html: `<p><strong>Task Reminder</strong></p><p>Your task <strong>${task.title}</strong> is scheduled for <strong>${new Date(buildTaskDate(task)).toLocaleString()}</strong>.</p>`,
    });

    console.log(`Email reminder sent for task: ${task.title}`);
    return true;
  } catch (error) {
    console.error(`Failed to send reminder email for task ${task.title}:`, error.message);
    return false;
  }
}

async function checkReminders() {
  try {
    const tasks = await Task.find({ completed: false, reminderSent: false });

    for (const task of tasks) {
      if (!isReminderDue(task)) {
        continue;
      }

      if (task.reminderType === "email") {
        const emailSent = await sendEmailReminder(task);
        if (emailSent) {
          task.reminderSent = true;
          await task.save();
        }
        continue;
      }

      task.reminderSent = true;
      await task.save();
      console.log(`Browser message reminder for task: ${task.title}`);
    }
  } catch (error) {
    console.error("Reminder check failed:", error.message);
  }
}

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "To-Do List API is running",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

app.get("/api/tasks", async (req, res) => {
  try {
    const tasks = await Task.find().sort({ createdAt: -1 });
    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch tasks",
      error: error.message,
    });
  }
});

app.post("/api/tasks", async (req, res) => {
  const { title, priority, dueDate, dueTime, reminderMinutes, reminderType, contact } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({
      success: false,
      message: "Task title is required",
    });
  }

  if (reminderType === "email" && (!contact || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact))) {
    return res.status(400).json({
      success: false,
      message: "A valid email address is required for email reminders.",
    });
  }

  try {
    const task = await Task.create({
      title: title.trim(),
      priority: priority || "Medium",
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      reminderMinutes: Number(reminderMinutes) || 15,
      reminderType: reminderType || "message",
      contact: contact ? contact.trim() : "",
      completed: false,
      reminderSent: false,
    });

    res.status(201).json({
      success: true,
      task,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create task",
      error: error.message,
    });
  }
});

app.patch("/api/tasks/:id/toggle", async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    task.completed = !task.completed;
    await task.save();

    res.status(200).json({
      success: true,
      task,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update task",
      error: error.message,
    });
  }
});

app.patch("/api/tasks/:id/reminder", async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    task.reminderSent = true;
    await task.save();

    res.status(200).json({
      success: true,
      task,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to mark reminder sent",
      error: error.message,
    });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete task",
      error: error.message,
    });
  }
});

app.delete("/api/tasks", async (req, res) => {
  try {
    const result = await Task.deleteMany({ completed: true });

    res.status(200).json({
      success: true,
      message: "Completed tasks cleared",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to clear completed tasks",
      error: error.message,
    });
  }
});

mongoose.set("strictQuery", true);

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB connected successfully");

    setInterval(checkReminders, 15000);

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    console.log("Starting server without MongoDB connection. Set MONGO_URI in .env to connect correctly.");

    setInterval(checkReminders, 15000);

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  });

