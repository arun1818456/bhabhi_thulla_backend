import onlinePlayers from "../../data/online_players.js";
import {  notifyFriendPresence } from "../handlers/presence.js";

export const handleJoinGame = async (io, socket, playerData) => {
  const { userId } = playerData;

  console.log(`Player joined:---- ${userId}`);

  onlinePlayers.set(userId, {
    userId,
    socketId: socket.id,
  });

  // await emitFriendsPresence(io, userId);
  await notifyFriendPresence(io, userId, true);

  console.log(
    "Online Players:",
    Array.from(onlinePlayers.values()).length,
  );
};