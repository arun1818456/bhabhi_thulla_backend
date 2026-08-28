 import { onlineUsers } from "../../data/onlineUsers.js";
import { lobbies } from "../../data/match_lobbies.js";

export const handleLeaveLobby = async (io, socket, lobbyId) => {
    const user = onlineUsers.get(socket.userId);

    if (!user?.lobbyId) return;

    const lobby = lobbies.get(user.lobbyId);

    if (!lobby) return;

    lobby.members = lobby.members.filter(
        (id) => id !== socket.userId
    );

    socket.leave(user.lobbyId);

    io.to(user.lobbyId).emit("lobbyUpdated", {
        lobbyId: user.lobbyId,
        members: lobby.members,
    });

    if (lobby.members.length === 0) {
        lobbies.delete(user.lobbyId);
    }

    user.lobbyId = null;
}