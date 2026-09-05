import onlinePlayers from "../../data/online_players.js";
import matchLobbies from "../../data/match_lobbies.js";
import { findUserIdBySocket } from "../../utils/getUserIdBySocket.js";
import User from "../../modules/user/model.js";

export const handleInvitePlayer = async (io, socket, data) => {
    try {
        const targetUserId = typeof data === "object"
            ? data?.id
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

        const targetLobby = [...matchLobbies.values()].find((currentLobby) =>
            currentLobby.players.some(
                (player) => String(player.userId) === String(targetUserId)
            )
        );

        if (targetLobby) {
            socket.emit("inviteFailed", "Player already in lobby");
            return;
        }
        const userData = await User.findById(senderUserId)
            .select("name avatar flag level")
            .lean();
         const  sendData = {
            ...userData,
            lobbyId: lobby.lobbyId,
            ownerId: senderUserId,
           
        };

        io.to(target.socketId).emit("lobby_invite", sendData);

        console.log(`Invitation sent from ${socket.id} to ${targetUserId}`);
    } catch (error) {
        console.error("Error inviting player:", error);
    }
}