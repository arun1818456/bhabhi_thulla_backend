import onlinePlayers from "../../data/online_players.js";
import matchmakingQueue from "../../data/matchmaking_queue.js";
import { notifyFriendPresence } from "../presence.js";

export const handleDisconnect = async (io, socket) => {
  console.log("Player disconnected!");
  console.log("Socket ID:", socket.id);

  for (const [userId, player] of onlinePlayers.entries()) {
    if (player.socketId !== socket.id) {
      continue;
    }

    onlinePlayers.delete(userId);

    await notifyFriendPresence(io, userId, false);

    for (const [queueKey, queue] of matchmakingQueue.entries()) {
      const queueIndex = queue.indexOf(userId);

      if (queueIndex !== -1) {
        queue.splice(queueIndex, 1);
      }

      if (queue.length === 0) {
        matchmakingQueue.delete(queueKey);
      }
    }

    console.log(`Player ${player.name} removed from online players.`);
    break;
  }
};