// ============================================================
// ENVIRONMENT CONFIGURATION
// ============================================================


// ============================================================
// IMPORTS
// ============================================================

import express from "express";
import http from "http";
import cors from "cors";
// Database connection
import  connectDB  from "./app/config/dbConnect.js";

// Routes
import userRoutes from "./app/modules/user/routes.js";

// Socket.IO
import { initSocketIO } from "./app/socket/socket_io.js";


// ============================================================
// APP INITIALIZATION
// ============================================================

const app = express();


// ============================================================
// MIDDLEWARE
// ============================================================

// Enable CORS
app.use(cors());

// Parse incoming JSON requests
app.use(express.json());

// Parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true }));


// ============================================================
// DATABASE CONNECTION
// ============================================================

connectDB();


// ============================================================
// API ROUTES
// ============================================================

// Authentication / User APIs
// Example:
// POST /api/auth/guest-login
// POST /api/auth/login
// POST /api/auth/register

app.use("/api/auth", userRoutes);


// ============================================================
// HEALTH CHECK API
// ============================================================

// Simple API to check whether the server is working
app.post("/", (req, res) => {
  console.log("✅ API HIT");

  res.status(200).send("Server is working!");
});


// ============================================================
// HTTP SERVER
// ============================================================

// Create HTTP server using Express app
const server = http.createServer(app);


// ============================================================
// SOCKET.IO
// ============================================================

// Initialize Socket.IO
// Used for real-time game communication
// Example: Thulla game, players, cards, rooms, etc.

initSocketIO(server);


// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("======================================");
  console.log("🚀 Server Started Successfully");
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
  console.log("======================================");
});


// ============================================================
// GLOBAL ERROR HANDLING
// ============================================================

// Handle unhandled Promise rejections
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Promise Rejection:");
  console.error(err);
});


// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:");
  console.error(err);
});