import onlinePlayers from "../../data/online_players.js";
import matchmakingQueue from "../../data/matchmaking_queue.js";
import matchLobbies from "../../data/match_lobbies.js";
import rooms from "../../data/game_rooms.js";
import { createDeck, shuffleDeck, } from "../../game/cards.js";

import { findUserIdBySocket } from "../../utils/getUserIdBySocket.js";

const PLAYERS_COUNT = 4;





const buildRoom = (roomPlayers, entryFee) => {
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

  return { roomId, players, roomPlayers, entryFee };
};

const startRoom = (io, roomData) => {
  const { roomId, players, roomPlayers, entryFee } = roomData;

  if (players.length !== playersCount) {
    console.log(`Room ${roomId} cancelled - player disconnected`);

    for (const playerId of roomPlayers) {
      if (onlinePlayers.has(playerId)) {
        const queueKey = String(entryFee);
        const queue = matchmakingQueue.get(queueKey) || [];
        queue.push(playerId);
        matchmakingQueue.set(queueKey, queue);
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

  const publicPlayers = players.map(({ userId, name, seat }) => ({
    userId,
    name,
    seat,
  }));

  for (const player of players) {
    const playerSocket = io.sockets.sockets.get(player.socketId);

    if (!playerSocket) {
      continue;
    }

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

  console.log(
    `Room ${roomId} started | ${players.length} players | ${entryFee} coins`,
  );
};

export const handleFindMatch = (io, socket, matchData) => {
  const entryFee = Number(matchData?.entryFee || 0);
  const currentUserId = findUserIdBySocket(socket.id);

  console.log(`Find Match | Entry Fee: ${entryFee}`);

  if (!currentUserId) {
    console.log("User not found for socket:", socket.id);
    return;
  }

  const queueKey = String(entryFee);

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
  socket.emit("match_status", {
    status: "searching",
    players: queue.length,
    requiredPlayers: playersCount,
    entryFee,
  });

  if (queue.length < playersCount) {
    return;
  }

  const roomPlayers = queue.splice(0, playersCount);

  if (queue.length === 0) {
    matchmakingQueue.delete(queueKey);
  }

  startRoom(io, buildRoom(roomPlayers, entryFee));
};