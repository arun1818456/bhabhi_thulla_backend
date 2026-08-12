import { Server } from "socket.io";

import onlinePlayers from "../data/online_players.js";
import matchmakingQueue from "../data/matchmaking_queue.js";
import rooms from "../data/game_rooms.js";
export const initSocketIO = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    console.log("Player connected!");
    console.log("Socket ID:", socket.id);

    // =========================
    // JOIN GAME
    // =========================
    socket.on("join_game", (playerData) => {
      const { userId, name } = playerData;

      onlinePlayers.set(userId, {
        userId,
        name,
        socketId: socket.id,
        status: "online",
      });

      console.log("Player joined:");
      console.log(onlinePlayers);
    });

    // =========================
    // FIND MATCH
    // =========================
    socket.on("find_match", () => {
      console.log("Player wants to find a match");

      let currentUserId = null;

      // Find user by socket ID
      for (const [userId, player] of onlinePlayers.entries()) {
        if (player.socketId === socket.id) {
          currentUserId = userId;
          break;
        }
      }

      if (!currentUserId) {
        console.log("Player not found!");
        return;
      }

      // Already searching?
      if (matchmakingQueue.includes(currentUserId)) {
        console.log("Player already in queue!");

        socket.emit("match_status", {
          status: "searching",
          players: matchmakingQueue.length,
          requiredPlayers: 4,
        });

        return;
      }

      // Add player
      matchmakingQueue.push(currentUserId);

      console.log("Matchmaking Queue:");
      console.log(matchmakingQueue);

      // Send queue status to everyone
      io.emit("match_status", {
        status: "searching",
        players: matchmakingQueue.length,
        requiredPlayers: 4,
      });

      // =========================
      // MATCH FOUND
      // =========================
      if (matchmakingQueue.length === 4) {
        console.log("=================================");
        console.log("4 PLAYERS FOUND!");
        console.log("=================================");

        const roomPlayers = matchmakingQueue.splice(0, 4);

        const roomId = `room_${Date.now()}`;

        console.log("Room ID:", roomId);
        console.log("Room Players:", roomPlayers);

        // Create players with seats
        const players = roomPlayers.map((userId, index) => {
          const player = onlinePlayers.get(userId);

          return {
            userId: userId,
            name: player.name,
            socketId: player.socketId,
            seat: index,
          };
        });

        // Create room
        const room = {
          roomId: roomId,
          players: players,
          status: "waiting",
        };

        // Save room
        rooms.set(roomId, room);

        console.log("Room created:");
        console.log(room);

        // Send room information to each player
        for (const player of players) {
          const playerSocket = io.sockets.sockets.get(
            player.socketId,
          );

          if (!playerSocket) {
            continue;
          }

          // Join Socket.IO room
          playerSocket.join(roomId);

          // Send player his seat
          playerSocket.emit("match_started", {
            roomId: roomId,
            yourUserId: player.userId,
            yourSeat: player.seat,

            players: players.map((p) => ({
              userId: p.userId,
              name: p.name,
              seat: p.seat,
            })),
          });
        }

        console.log("=================================");
        console.log("MATCH STARTED!");
        console.log("Room:", roomId);
        console.log("Players:", players);
        console.log("Queue after match:", matchmakingQueue);
        console.log("=================================");
      }
    });

    // =========================
    // DISCONNECT
    // =========================
    socket.on("disconnect", () => {
      console.log("Player disconnected!");
      console.log("Socket ID:", socket.id);

      for (const [userId, player] of onlinePlayers.entries()) {
        if (player.socketId === socket.id) {
          onlinePlayers.delete(userId);

          // Remove from matchmaking queue
          const queueIndex =
            matchmakingQueue.indexOf(userId);

          if (queueIndex !== -1) {
            matchmakingQueue.splice(queueIndex, 1);
          }

          console.log(
            `Player ${player.name} removed from online players.`,
          );

          break;
        }
      }

      console.log("Current online players:");
      console.log(onlinePlayers);

      console.log("Current matchmaking queue:");
      console.log(matchmakingQueue);
    });
  });

  return io;
};