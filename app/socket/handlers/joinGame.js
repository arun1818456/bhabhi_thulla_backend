import onlinePlayers from "../../data/online_players.js";

export const handleJoinGame = (socket, playerData) => {
  const { userId, name } = playerData;

  console.log(`Player joined:---- ${name} (ID: ${userId})`);

  onlinePlayers.set(userId, {
    userId,
    name,
    socketId: socket.id,
  });

  console.log(
    "Online Players:",
    Array.from(onlinePlayers.values()).length,
  );
};