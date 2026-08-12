import express from "express";
import http from "http";
import cors from "cors";

import { initSocketIO } from "./app/socket/socket_io.js";

const app = express();

app.use(cors());

const server = http.createServer(app);

// Initialize Socket.IO
initSocketIO(server);

app.get("/", (req, res) => {
  res.send("Bhabhi Thulla Backend is running!");
});

const PORT = 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});