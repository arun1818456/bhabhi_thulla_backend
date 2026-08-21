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
      console.log(`Player joined:---- ${name} (ID: ${userId})`);
      onlinePlayers.set(userId, {
        userId,
        name,
        socketId: socket.id,
      });
      console.log("Online Players:", Array.from(onlinePlayers.values()).length);
    });


    // =========================
    // FIND MATCH
    // =========================
    socket.on("find_match", (matchData) => {
      const playersCount = matchData.playersCount || 4;
      const entryFee = matchData.entryFee || 0;

      console.log(`Find Match: ${playersCount} players, Entry: ${entryFee}`);

      let currentUserId = null;

      // Find user by socket ID
      for (const [userId, player] of onlinePlayers.entries()) {
        if (player.socketId === socket.id) {
          currentUserId = userId;
          break;
        }
      }

      if (!currentUserId) return;

      // Queue key (4 players + 100 entry = separate queue)
      const queueKey = `${playersCount}_${entryFee}`;

      if (!matchmakingQueue.has(queueKey)) {
        matchmakingQueue.set(queueKey, []);
      }

      const queue = matchmakingQueue.get(queueKey);

      if (queue.includes(currentUserId)) {
        socket.emit("match_status", {
          status: "searching",
          players: queue.length,
          requiredPlayers: playersCount,
          entryFee,
        });
        return;
      }

      queue.push(currentUserId);

      io.emit("match_status", {
        status: "searching",
        players: queue.length,
        requiredPlayers: playersCount,
        entryFee,
      });

      // Match complete
      if (queue.length >= playersCount) {
        const roomPlayers = queue.splice(0, playersCount);

        const roomId = `room_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        const deck = shuffleDeck(createDeck());
        const cardsPerPlayer = Math.floor(deck.length / playersCount);

        const players = roomPlayers
          .map((userId, index) => {
            const onlinePlayer = onlinePlayers.get(userId);

            if (!onlinePlayer) {
              return null;
            }

            return {
              userId,
              name: onlinePlayer.name,
              socketId: onlinePlayer.socketId,
              seat: index + 1,
              cards: deck.splice(0, cardsPerPlayer),
            };
          })
          .filter(Boolean);

        if (players.length !== playersCount) {
          console.error(`Could not create ${roomId}: player disconnected.`);

          for (const playerId of roomPlayers) {
            if (onlinePlayers.has(playerId)) {
              queue.push(playerId);
            }
          }

          return;
        }

        const room = {
          roomId,
          players,
          playersCount,
          entryFee,
          tableCards: [],
          currentTurn: 1,
          status: "started",
          createdAt: new Date(),
        };

        rooms.set(roomId, room);

        if (queue.length === 0) {
          matchmakingQueue.delete(queueKey);
        }

        const publicPlayers = players.map(({ userId, name, seat }) => ({
          userId,
          name,
          seat,
        }));

        for (const player of players) {
          const playerSocket = io.sockets.sockets.get(player.socketId);

          if (playerSocket) {
            playerSocket.join(roomId);
            playerSocket.emit("match_started", {
              roomId,
              yourUserId: player.userId,
              yourSeat: player.seat,
              players: publicPlayers,
              playersCount,
              entryFee,
              currentTurn: room.currentTurn,
            });
            playerSocket.emit("your_cards", {
              roomId,
              cards: player.cards,
            });
          }
        }

        console.log(
          `Room ${roomId} created with ${players.length} players.`,
        );
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
      // =========================
      // CHECK 4 CARDS
      // =========================

      if (room.tableCards.length === 4) {

        console.log("4 CARDS COMPLETED");

        // 2 seconds wait
        setTimeout(() => {

          // Room dobara check
          const currentRoom = rooms.get(roomId);

          if (!currentRoom) {
            return;
          }

          // Clear table cards
          currentRoom.tableCards = [];

          // Save updated room
          rooms.set(roomId, currentRoom);

          console.log("Table cards cleared");

          // Tell only this room
          io.to(roomId).emit("table_cleared", {
            roomId: roomId,
          });

        }, 2000);
      }


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

          // Remove from all matchmaking queues
          for (const [queueKey, queue] of matchmakingQueue.entries()) {
            const queueIndex = queue.indexOf(userId);

            if (queueIndex !== -1) {
              queue.splice(queueIndex, 1);
            }

            if (queue.length === 0) {
              matchmakingQueue.delete(queueKey);
            }
          }

          console.log(
            `Player ${player.name} removed from online players.`,
          );

          break;
        }
      }
    });
  });

  return io;
};