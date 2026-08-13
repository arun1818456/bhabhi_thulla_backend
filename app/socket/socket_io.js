import { Server } from "socket.io";

import onlinePlayers from "../data/online_players.js";
import matchmakingQueue from "../data/matchmaking_queue.js";
import rooms from "../data/game_rooms.js";
import { createDeck, shuffleDeck } from "../game/cards.js";

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

        // =========================
        // CREATE PLAYERS + SEATS
        // =========================

        const players = roomPlayers.map((userId, index) => {
          const player = onlinePlayers.get(userId);

          return {
            userId: userId,
            name: player.name,
            socketId: player.socketId,
            seat: index,
            cards: [],
          };
        });

        // =========================
        // CREATE + SHUFFLE DECK
        // =========================

        const deck = createDeck();

        shuffleDeck(deck);

        console.log("Total cards:", deck.length);

        // =========================
        // DEAL 13 CARDS TO EACH PLAYER
        // =========================

        for (let i = 0; i < players.length; i++) {
          players[i].cards = deck.slice(
            i * 13,
            (i + 1) * 13,
          );
        }

        // Check cards
        console.log("Cards distributed:");

        for (const player of players) {
          console.log(
            `${player.name} | Seat: ${player.seat} | Cards: ${player.cards.length}`,
          );
        }

        // =========================
        // FIND 1 OF SPADES
        // =========================

        let startingSeat = null;

        for (const player of players) {
          const hasStartingCard = player.cards.some(
            (card) =>
              card.rank === 1 &&
              card.suit === "spades",
          );

          if (hasStartingCard) {
            startingSeat = player.seat;

            console.log(
              `1 of Spades belongs to ${player.name}`,
            );

            break;
          }
        }

        console.log(
          `Starting turn seat: ${startingSeat}`,
        );

        // =========================
        // CREATE ROOM
        // =========================

        const room = {
          roomId: roomId,
          players: players,
          status: "playing",
          currentTurn: startingSeat,
          tableCards: [],
        };

        // Save room
        rooms.set(roomId, room);

        console.log("Room created:");
        console.log(room);

        // =========================
        // JOIN PLAYERS + SEND DATA
        // =========================

        for (const player of players) {
          const playerSocket = io.sockets.sockets.get(
            player.socketId,
          );

          if (!playerSocket) {
            continue;
          }

          // Join Socket.IO room
          playerSocket.join(roomId);

          // =========================
          // PUBLIC ROOM DATA
          // =========================

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

          // =========================
          // PRIVATE CARDS
          // =========================

          playerSocket.emit("your_cards", {
            cards: player.cards,
          });
        }

        // =========================
        // INITIAL TURN
        // =========================

        io.to(roomId).emit("turn_changed", {
          roomId: roomId,
          currentTurn: startingSeat,
        });

        console.log("=================================");
        console.log("MATCH STARTED!");
        console.log("Room:", roomId);
        console.log("Starting Seat:", startingSeat);
        console.log("Queue after match:", matchmakingQueue);
        console.log("=================================");
      }
    });

    // =========================
    // PLAY CARD
    // =========================
    socket.on("play_card", (data) => {
      const { roomId, userId, card, } = data;

      console.log("Player wants to play card:");
      console.log(data);

      // =========================
      // CHECK ROOM
      // =========================

      const room = rooms.get(roomId);

      if (!room) {
        socket.emit("play_card_error", {
          message: "Room not found",
        });

        return;
      }

      // =========================
      // FIND PLAYER
      // =========================

      const player = room.players.find(
        (p) => p.userId === userId,
      );

      if (!player) {
        socket.emit("play_card_error", {
          message: "Player is not in this room",
        });

        return;
      }

      // =========================
      // CHECK SOCKET
      // =========================

      if (player.socketId !== socket.id) {
        socket.emit("play_card_error", {
          message: "Invalid player socket",
        });

        return;
      }

      // =========================
      // CHECK TURN
      // =========================

      if (room.currentTurn !== player.seat) {
        socket.emit("play_card_error", {
          message: "Not your turn",
        });

        console.log(
          `${player.name} tried to play but it is not their turn`,
        );

        return;
      }

      // =========================
      // CHECK CARD
      // =========================

      const cardIndex = player.cards.findIndex(
        (c) =>
          c.rank === card.rank &&
          c.suit === card.suit,
      );

      if (cardIndex === -1) {
        socket.emit("play_card_error", {
          message: "You do not have this card",
        });

        return;
      }

      // =========================
      // REMOVE CARD FROM HAND
      // =========================

      const playedCard =
        player.cards.splice(cardIndex, 1)[0];

      console.log(
        `${player.name} played:`,
        playedCard,
      );

      // =========================
      // SAVE TABLE CARD
      // =========================

      if (!room.tableCards) {
        room.tableCards = [];
      }

      room.tableCards.push({
        userId: player.userId,
        seat: player.seat,
        card: playedCard,
      });

      // =========================
      // NEXT TURN
      // =========================

      const currentIndex =
        room.players.findIndex(
          (p) => p.seat === room.currentTurn,
        );

      const nextIndex =
        (currentIndex + 1) %
        room.players.length;

      room.currentTurn =
        room.players[nextIndex].seat;

      // =========================
      // UPDATE ROOM
      // =========================

      rooms.set(roomId, room);

      // =========================
      // SEND TABLE CARD
      // =========================

      io.to(roomId).emit("card_played", {
        roomId: roomId,

        userId: player.userId,

        seat: player.seat,

        card: playedCard,
      });

      // =========================
      // SEND NEXT TURN
      // =========================

      io.to(roomId).emit("turn_changed", {
        roomId: roomId,

        currentTurn: room.currentTurn,
      });

      console.log(
        `Next turn: Seat ${room.currentTurn}`,
      );
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