const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    dueDate: {
      type: Date,
      default: null,
    },
    dueTime: {
      type: String,
      default: null,
      trim: true,
    },
    reminderMinutes: {
      type: Number,
      default: 15,
      min: 0,
    },
    reminderType: {
      type: String,
      enum: ["email", "message"],
      default: "message",
    },
    contact: {
      type: String,
      default: "",
      trim: true,
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
    completed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Task", taskSchema);
