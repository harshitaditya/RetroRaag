require("dotenv").config();

const express = require("express");
const path = require("path");
const musicRoutes = require("./routes/musicRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

// One open EventSource connection = one browser tab currently on RetroRaag.
const activeClients = new Set();

function broadcastActiveUsers() {
  const payload = JSON.stringify({
    activeUsers: activeClients.size
  });

  for (const client of activeClients) {
    client.write(`data: ${payload}\n\n`);
  }
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------------------------
// FRONTEND
// ------------------------------------

// CHANGED: the frontend is now a React app built with Vite.
// Run `npm run build` inside /frontend — it outputs static files to
// /frontend/dist, which is what we serve here instead of the old
// plain Frontend/ folder.
const frontendPath = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// ------------------------------------
// HEALTH API
// ------------------------------------

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    service: "RetroRaag Backend"
  });
});

// ------------------------------------
// LIVE ACTIVE USERS
// ------------------------------------

app.get("/api/active-users", (req, res) => {
  res.json({
    activeUsers: activeClients.size
  });
});

app.get("/api/active-users/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  res.flushHeaders?.();
  res.write("retry: 3000\n\n");

  activeClients.add(res);
  broadcastActiveUsers();

  const heartbeat = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    activeClients.delete(res);
    broadcastActiveUsers();
  });
});

// ------------------------------------
// MUSIC APIs
// ------------------------------------

app.use("/", musicRoutes);

// ------------------------------------
// 404
// ------------------------------------

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found."
  });
});

// ------------------------------------
// ERROR HANDLER
// ------------------------------------

app.use((err, req, res, next) => {
  console.error("Error:", err.message);

  const statusCode = err.statusCode || err.response?.status || 500;
  const message = err.response?.data?.message ||
    err.response?.data?.error?.message ||
    err.message ||
    "Something went wrong.";

  res.status(statusCode).json({
    success: false,
    message
  });
});

// ------------------------------------
// SERVER
// ------------------------------------

app.listen(PORT, () => {
  console.log(`RetroRaag running on http://127.0.0.1:${PORT}`);
  console.log("Frontend + Backend connected successfully.");
});