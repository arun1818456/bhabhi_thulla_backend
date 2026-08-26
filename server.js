// ============================================================
// ENVIRONMENT CONFIGURATION
// ============================================================
import dns from "node:dns/promises";

dns.setServers([
  "1.1.1.1",
  "8.8.8.8",
]);

import dotenv from "dotenv";
dotenv.config();

// ============================================================
// IMPORTS
// ============================================================

import express from "express";
import http from "http";
import cors from "cors";
import { sendResponse } from "./app/utils/sendResposeType.js";
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

app.use("/api/user", userRoutes);


// ============================================================
// HEALTH CHECK API
// ============================================================

// Simple API to check whether the server is working
app.post("/", (req, res) => {
  console.log("✅ API HIT");

  sendResponse(res, 200, true, "Server is working!", null);
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