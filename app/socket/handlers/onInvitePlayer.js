import onlinePlayers from "../../data/online_players.js";
import matchLobbies from "../../data/match_lobbies.js";
import { findUserIdBySocket } from "../../utils/getUserIdBySocket.js";


export const handleInvitePlayer = async (io, socket, data) => {
    try {
        const targetUserId = typeof data === "object"
            ? data?.targetUserId
            : data;
        const senderUserId = findUserIdBySocket(socket.id);
        const sender = senderUserId && onlinePlayers.get(senderUserId);
        const lobby = senderUserId
            && [...matchLobbies.values()].find((currentLobby) =>
                currentLobby.players.some((player) => player.userId === senderUserId)
            );

        if (!sender || !lobby) {
            socket.emit("rejoin_lobby", "Join a lobby before inviting players");
            return;
        }

        if (!targetUserId) {
            socket.emit("inviteFailed", "Target user ID is required");
            return;
        }

        const target = onlinePlayers.get(String(targetUserId));

        if (!target) {
            socket.emit("inviteFailed", "Player offline");
            return;
        }

        if (target.lobbyId || target.pendingJoin) {
            socket.emit("inviteFailed", "Player already in lobby");
            return;
        }

        io.to(target.socketId).emit("lobbyInvite", {
            lobbyId: lobby.lobbyId,
            ownerId: senderUserId,
        });

        console.log(`Invitation sent from ${socket.id} to ${targetUserId}`);
    } catch (error) {
        console.error("Error inviting player:", error);
    }
}