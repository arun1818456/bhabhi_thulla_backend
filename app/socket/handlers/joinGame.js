import onlinePlayers from "../../data/online_players.js";
import { emitFriendsPresence, notifyFriendPresence } from "../handlers/presence.js";

export const handleJoinGame = async (io, socket, playerData) => {
  const { userId, name } = playerData;

  console.log(`Player joined:---- ${name} (ID: ${userId})`);

  onlinePlayers.set(userId, {
    userId,
    name,
    socketId: socket.id,
  });

  await emitFriendsPresence(io, userId);
  await notifyFriendPresence(io, userId, true);

  console.log(
    "Online Players:",
    Array.from(onlinePlayers.values()).length,
  );
};