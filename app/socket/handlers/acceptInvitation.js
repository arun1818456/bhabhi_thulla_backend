import onlineUsers from "../../data/online_players.js";
import matchLobbies from "../../data/match_lobbies.js";
import { findUserIdBySocket } from "../../utils/getUserIdBySocket.js";

const PLAYERS_COUNT = 4;

export const handleAcceptInvite = async (io, socket, data) => {
    try {
        const lobbyId = data?.lobbyId;
        const userId = findUserIdBySocket(socket.id);

        console.log(
            `handleAcceptInvite called with lobbyId: ${lobbyId} for socket: ${socket.id}`
        );

        // ------------------------------------
        // 1. Validate lobbyId
        // ------------------------------------
        if (!lobbyId) {
            socket.emit("lobby_error", {
                type: "INVALID_LOBBY",
                message: "Lobby ID is required",
            });
            return;
        }

        // ------------------------------------
        // 2. Find online user
        // ------------------------------------
        const user = userId && onlineUsers.get(userId);

        if (!user) {
            socket.emit("lobby_error", {
                type: "USER_NOT_FOUND",
                message: "User not found",
            });
            return;
        }

        // ------------------------------------
        // 3. Find target lobby
        // ------------------------------------
        const newLobby = matchLobbies.get(lobbyId);

        if (!newLobby) {
            socket.emit("lobby_error", {
                type: "LOBBY_NOT_FOUND",
                message: "Lobby not found",
            });
            return;
        }

        // ------------------------------------
        // 4. Check lobby status
        // ------------------------------------
        if (newLobby.status !== "waiting") {
            socket.emit("lobby_error", {
                type: "LOBBY_STARTED",
                message: "Match has already started",
            });
            return;
        }

        // ------------------------------------
        // 5. Check already joined
        // ------------------------------------
        const alreadyJoined = newLobby.players.some(
            (player) => player.userId === userId
        );

        if (alreadyJoined) {
            // Make sure socket is inside lobby room
            await socket.join(lobbyId);

            console.log(
                `User ${userId} was already in lobby ${lobbyId}`
            );

            // Send current lobby state directly to this user
            socket.emit("lobby_state", {
                lobbyId,
                players: newLobby.players,
                totalPlayers: newLobby.players.length,
                requiredPlayers: PLAYERS_COUNT,
                entryFee: newLobby.entryFee,
                status: newLobby.status,
            });

            return;
        }

        // ------------------------------------
        // 6. Check lobby full
        // ------------------------------------
        if (newLobby.players.length >= PLAYERS_COUNT) {
            socket.emit("lobby_error", {
                type: "LOBBY_FULL",
                message: "Lobby is full",
            });
            return;
        }

        // ------------------------------------
        // 7. Check user already in another lobby
        // ------------------------------------
        const currentLobby = [...matchLobbies.values()].find(
            (lobby) =>
                lobby.players.some(
                    (player) => player.userId === userId
                )
        );

        if (currentLobby) {
            socket.emit("lobby_error", {
                type: "ALREADY_IN_LOBBY",
                message: "You are already in another lobby",
            });
            return;
        }

        // ------------------------------------
        // 8. Update user's lobbyId
        // ------------------------------------
        user.lobbyId = lobbyId;

        // ------------------------------------
        // 9. Join Socket.IO room
        // ------------------------------------
        await socket.join(lobbyId);

        console.log(
            `User ${userId} joined socket room ${lobbyId}`
        );

        // ------------------------------------
        // 10. Add player to lobby
        // ------------------------------------
        newLobby.players.push({
            userId: userId,
            name: user.name,
            socketId: socket.id,
            seat: newLobby.players.length + 1,
        });

        // ------------------------------------
        // 11. Save updated lobby
        // ------------------------------------
        matchLobbies.set(lobbyId, newLobby);

        console.log(
            `User ${userId} joined lobby ${lobbyId}`
        );

        console.log(
            `Lobby ${lobbyId} players:`,
            newLobby.players
        );

        // ------------------------------------
        // 12. Send lobby state directly to
        //     newly accepted player
        // ------------------------------------
        socket.emit("lobby_state", {
            lobbyId,
            players: newLobby.players,
            totalPlayers: newLobby.players.length,
            requiredPlayers: PLAYERS_COUNT,
            entryFee: newLobby.entryFee,
            status: newLobby.status,
        });

        // ------------------------------------
        // 13. Send updated lobby to all
        //     players inside this lobby
        // ------------------------------------
        io.to(lobbyId).emit("lobby_updated", {
            lobbyId,
            players: newLobby.players,
            totalPlayers: newLobby.players.length,
            requiredPlayers: PLAYERS_COUNT,
            entryFee: newLobby.entryFee,
            status: newLobby.status,
        });

        console.log(
            `lobby_updated emitted to room ${lobbyId}`
        );

    } catch (error) {
        console.error(
            "Error accepting invitation:",
            error
        );

        socket.emit("lobby_error", {
            type: "SERVER_ERROR",
            message: "Something went wrong while accepting invitation",
        });
    }
};