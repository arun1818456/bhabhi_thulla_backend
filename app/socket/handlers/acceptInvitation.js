import  onlineUsers  from "../../data/online_players.js";
import  matchLobbies  from "../../data/match_lobbies.js";


export const handleAcceptInvite = async (io, socket, lobbyId) => {
    try {
        const user = onlineUsers.get(socket.userId);
        const newLobby = matchLobbies.get(lobbyId);

        if (!newLobby) {
            socket.emit("joinFailed", "Lobby not found");
            return;
        }

        // User ki current lobby check
        if (user.lobbyId) {
            const oldLobby = matchLobbies.get(user.lobbyId);

            if (oldLobby) {
                const isSoloLobby =
                    oldLobby.owner === socket.userId &&
                    oldLobby.members.length === 1;

                if (isSoloLobby) {
                    // Purani solo lobby delete
                    socket.leave(user.lobbyId);
                    matchLobbies.delete(user.lobbyId);
                    user.lobbyId = null;
                } else {
                    socket.emit("joinFailed", "Already in another lobby");
                    return;
                }
            }
        }

        // Target lobby full check
        if (newLobby.members.length >= 2) {
            socket.emit("joinFailed", "Lobby full");
            return;
        }

        // Join new lobby
        user.lobbyId = lobbyId;
        socket.join(lobbyId);

        newLobby.members.push(socket.userId);

        io.to(lobbyId).emit("lobbyUpdated", {
            lobbyId,
            members: newLobby.members,
        });
    } catch (error) {
        console.error("Error accepting invitation:", error);
    }
}