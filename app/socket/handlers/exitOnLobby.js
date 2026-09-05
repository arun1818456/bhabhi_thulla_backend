import matchLobbies from "../../data/match_lobbies.js";
import matchmakingQueue from "../../data/matchmaking_queue.js";
import { findUserIdBySocket } from "../../utils/getUserIdBySocket.js";

export const handleExitOnLobby = (io, socket, data) => {
    const userId = findUserIdBySocket(socket.id);
    let lobbyId = typeof data === "string" ? data : data?.lobbyId;

    if (!lobbyId && userId) {
        lobbyId = [...matchLobbies.entries()].find(([, lobby]) =>
            lobby.players.some((player) => player.userId === userId)
        )?.[0];
    }

    if (!lobbyId) {
        socket.emit("lobby_error", {
            type: "INVALID_LOBBY",
            message: "Lobby ID is required",
        });
        return;
    }

    if (!userId) {
        socket.emit("lobby_error", {
            type: "USER_NOT_FOUND",
            message: "User not found",
        });
        return;
    }

    const lobby = matchLobbies.get(lobbyId);

    if (!lobby) {
        socket.emit("lobby_error", {
            type: "LOBBY_NOT_FOUND",
            message: "Lobby not found",
        });
        return;
    }

    const playerIndex = lobby.players.findIndex(
        (player) => player.userId === userId
    );

    if (playerIndex === -1) {
        socket.emit("lobby_error", {
            type: "NOT_IN_LOBBY",
            message: "You are not in this lobby",
        });
        return;
    }

    lobby.players.splice(playerIndex, 1);
    socket.leave(lobbyId);

    for (const [queueKey, queue] of matchmakingQueue.entries()) {
        const queueIndex = queue.indexOf(lobbyId);

        if (queueIndex !== -1) {
            queue.splice(queueIndex, 1);
        }

        if (queue.length === 0) {
            matchmakingQueue.delete(queueKey);
        }
    }

    if (lobby.players.length === 0) {
        matchLobbies.delete(lobbyId);
        return;
    }

    if (lobby.ownerId === userId) {
        lobby.ownerId = lobby.players[0].userId;
    }


    io.to(lobbyId).emit("lobby_updated", {
        lobbyId,
        ownerId: lobby.ownerId,
        players: lobby.players,
        totalPlayers: lobby.players.length,
        status: lobby.status,
        entryFee: lobby.entryFee,
    });
};