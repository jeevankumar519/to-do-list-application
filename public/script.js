const taskInput = document.getElementById("taskInput");
const priority = document.getElementById("priority");
const dueDate = document.getElementById("dueDate");
const dueTime = document.getElementById("dueTime");
const reminderMinutes = document.getElementById("reminderMinutes");
const reminderType = document.getElementById("reminderType");
const contact = document.getElementById("contact");
const addBtn = document.getElementById("addBtn");

const taskList = document.getElementById("taskList");
const searchInput = document.getElementById("searchInput");

const totalTasks = document.getElementById("totalTasks");
const activeTasks = document.getElementById("activeTasks");
const completedTasks = document.getElementById("completedTasks");

const emptyMessage = document.getElementById("emptyMessage");
const clearCompleted = document.getElementById("clearCompleted");
const storageNotice = document.getElementById("storageNotice");

let tasks = [];
let currentFilter = "all";
const isGitHubPages = window.location.hostname.endsWith(".github.io");
const localTasksKey = "onlineTodoTasks";

addBtn.addEventListener("click", addTask);

if (isGitHubPages) {
  storageNotice.hidden = false;
  storageNotice.textContent = "GitHub Pages mode: tasks are saved only in this browser. Email reminders and syncing are unavailable.";
  reminderType.value = "message";
  reminderType.querySelector('option[value="email"]').disabled = true;
  contact.closest("label").hidden = true;
}

taskInput.addEventListener("keypress", function (event) {
  if (event.key === "Enter") {
    addTask();
  }
});

reminderType.addEventListener("change", () => {
  const isEmail = reminderType.value === "email";
  contact.placeholder = isEmail ? "Enter email address" : "Enter mobile or message address";
  contact.title = isEmail ? "Receiver email" : "Message destination";
  if (isEmail) {
    contact.setAttribute("type", "email");
  } else {
    contact.setAttribute("type", "text");
  }
});

async function addTask() {
  const title = taskInput.value.trim();

  if (!title) {
    alert("Please enter a task.");
    return;
  }

  if (isGitHubPages) {
    try {
      tasks.unshift({
        _id: crypto.randomUUID(),
        title,
        priority: priority.value,
        dueDate: dueDate.value || null,
        dueTime: dueTime.value || null,
        reminderMinutes: Number(reminderMinutes.value) || 15,
        reminderType: "message",
        contact: "",
        completed: false,
        reminderSent: false,
        createdAt: new Date().toISOString(),
      });
      saveLocalTasks();
      resetTaskForm();
      displayTasks();
    } catch (error) {
      alert(`Could not save task in this browser: ${error.message}`);
    }
    return;
  }

  if (reminderType.value === "email" && (!contact.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.value.trim()))) {
    alert("Please enter a valid email address for email reminders.");
    return;
  }

  try {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        priority: priority.value,
        dueDate: dueDate.value || null,
        dueTime: dueTime.value || null,
        reminderMinutes: Number(reminderMinutes.value) || 15,
        reminderType: reminderType.value,
        contact: contact.value.trim(),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to create task");
    }

    resetTaskForm();
    await loadTasks();
  } catch (error) {
    alert(error.message);
  }
}

function resetTaskForm() {
  taskInput.value = "";
  dueDate.value = "";
  dueTime.value = "";
  priority.value = "Medium";
  reminderMinutes.value = "15";
  reminderType.value = isGitHubPages ? "message" : "email";
  contact.value = "";
  contact.placeholder = "Enter email address";
  contact.setAttribute("type", "email");
}

function saveLocalTasks() {
  window.localStorage.setItem(localTasksKey, JSON.stringify(tasks));
}

async function loadTasks() {
  if (isGitHubPages) {
    try {
      const storedTasks = window.localStorage.getItem(localTasksKey);
      tasks = storedTasks ? JSON.parse(storedTasks) : [];
      if (!Array.isArray(tasks)) {
        throw new Error("Saved task data is invalid.");
      }
      displayTasks();
      checkBrowserNotifications();
    } catch (error) {
      storageNotice.textContent = `Could not load tasks saved in this browser: ${error.message}`;
      console.error("Failed to load locally saved tasks:", error);
    }
    return;
  }

  try {
    const response = await fetch("/api/tasks");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to load tasks");
    }

    tasks = Array.isArray(data) ? data : [];
    displayTasks();
    checkBrowserNotifications();
  } catch (error) {
    console.error(error);
    tasks = [];
    displayTasks();
  }
}

function displayTasks() {
  taskList.innerHTML = "";

  const searchText = searchInput.value.toLowerCase();

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(searchText);

    if (currentFilter === "active") {
      return !task.completed && matchesSearch;
    }

    if (currentFilter === "completed") {
      return task.completed && matchesSearch;
    }

    return matchesSearch;
  });

  filteredTasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = "task";

    if (task.completed) {
      li.classList.add("completed");
    }

    li.innerHTML = `
      <input
        type="checkbox"
        class="check"
        ${task.completed ? "checked" : ""}
        onchange="toggleTask('${task._id}')"
      >

      <div class="task-content">
        <div class="task-title">${escapeHTML(task.title)}</div>

        <div class="task-info">
          <span class="priority ${task.priority}">${task.priority}</span>
          ${task.dueDate ? `<span>📅 ${formatDate(task.dueDate, task.dueTime)}</span>` : ""}
          ${task.reminderMinutes ? `<span>⏰ ${task.reminderMinutes}m before</span>` : ""}
          ${task.reminderType ? `<span>🔔 ${task.reminderType}</span>` : ""}
        </div>
      </div>

      <button class="delete-btn" onclick="deleteTask('${task._id}')">Delete</button>
    `;

    taskList.appendChild(li);
  });

  updateStats();
  emptyMessage.style.display = filteredTasks.length === 0 ? "block" : "none";
}

async function toggleTask(id) {
  if (isGitHubPages) {
    tasks = tasks.map((task) =>
      task._id === id ? { ...task, completed: !task.completed } : task
    );
    try {
      saveLocalTasks();
      displayTasks();
    } catch (error) {
      alert(`Could not save task changes in this browser: ${error.message}`);
    }
    return;
  }

  try {
    const response = await fetch(`/api/tasks/${id}/toggle`, {
      method: "PATCH",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to update task");
    }

    await loadTasks();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteTask(id) {
  if (isGitHubPages) {
    tasks = tasks.filter((task) => task._id !== id);
    try {
      saveLocalTasks();
      displayTasks();
    } catch (error) {
      alert(`Could not save task changes in this browser: ${error.message}`);
    }
    return;
  }

  try {
    const response = await fetch(`/api/tasks/${id}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to delete task");
    }

    await loadTasks();
  } catch (error) {
    alert(error.message);
  }
}

clearCompleted.addEventListener("click", async function () {
  if (isGitHubPages) {
    tasks = tasks.filter((task) => !task.completed);
    try {
      saveLocalTasks();
      displayTasks();
    } catch (error) {
      alert(`Could not save task changes in this browser: ${error.message}`);
    }
    return;
  }

  try {
    const response = await fetch("/api/tasks", {
      method: "DELETE",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to clear completed tasks");
    }

    await loadTasks();
  } catch (error) {
    alert(error.message);
  }
});

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", function () {
    document.querySelectorAll(".filter").forEach((btn) => btn.classList.remove("active"));
    this.classList.add("active");
    currentFilter = this.dataset.filter;
    displayTasks();
  });
});

searchInput.addEventListener("input", displayTasks);

function updateStats() {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  const active = total - completed;

  totalTasks.textContent = total;
  activeTasks.textContent = active;
  completedTasks.textContent = completed;
}

function buildTaskDate(task) {
  if (!task.dueDate) return null;

  const dueDateObj = new Date(task.dueDate);

  if (!task.dueTime) {
    return dueDateObj;
  }

  const [hours, minutes] = String(task.dueTime).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return dueDateObj;
  }

  dueDateObj.setHours(hours, minutes, 0, 0);
  return dueDateObj;
}

function formatDate(date, time) {
  const d = new Date(date);

  if (time) {
    const [hours, minutes] = time.split(":").map(Number);
    d.setHours(hours, minutes, 0, 0);
  }

  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHTML(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getReminderTarget(task) {
  const dueDateObj = buildTaskDate(task);
  if (!dueDateObj) return null;

  const reminderMs = Number(task.reminderMinutes || 0) * 60000;
  return new Date(dueDateObj.getTime() - reminderMs);
}

async function showBrowserReminder(task) {
  const title = "Task reminder";
  const message = `"${task.title}" is due soon.`;

  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(title, { body: message });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          new Notification(title, { body: message });
        }
      });
    }
  }

  const toast = document.createElement("div");
  toast.className = "toast-message";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 5000);

  try {
    if (isGitHubPages) {
      task.reminderSent = true;
      saveLocalTasks();
    } else {
      await fetch(`/api/tasks/${task._id}/reminder`, { method: "PATCH" });
    }
  } catch (error) {
    console.error("Failed to mark reminder sent:", error.message);
  }
}

function checkBrowserNotifications() {
  if (!tasks || tasks.length === 0) return;

  tasks.forEach((task) => {
    if (task.completed || task.reminderSent || task.reminderType !== "message" || !task.dueDate) return;

    const reminderTarget = getReminderTarget(task);
    if (!reminderTarget) return;

    if (Date.now() >= reminderTarget.getTime()) {
      showBrowserReminder(task);
    }
  });
}

if ("Notification" in window) {
  Notification.requestPermission().catch(() => {});
}

setInterval(() => {
  loadTasks();
}, 30000);

loadTasks();
