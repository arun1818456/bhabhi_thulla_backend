import matchLobbies from "../../data/match_lobbies.js";
import { findUserIdBySocket } from "../../utils/getUserIdBySocket.js";
import { getUser } from "../../utils/getUserDataById.js";

const PLAYERS_COUNT = 4;

export const handleJoinLobby = async (io, socket, data) => {
    try {
        // ==========================================
        // VALIDATE REQUEST
        // ==========================================

        const { lobbyId } = data || {};

        if (!lobbyId) {
            socket.emit("lobby_error", {
                type: "INVALID_LOBBY",
                message: "Lobby ID is required",
            });

            return;
        }

        // ==========================================
        // FIND USER
        // ==========================================

        const userId = findUserIdBySocket(socket.id);

        if (!userId) {
            socket.emit("lobby_error", {
                type: "USER_NOT_FOUND",
                message: "User not found",
            });

            return;
        }

        // ==========================================
        // FIND LOBBY
        // ==========================================

        const lobby = matchLobbies.get(lobbyId);

        if (!lobby) {
            socket.emit("lobby_error", {
                type: "LOBBY_NOT_FOUND",
                message: "Lobby not found",
            });

            return;
        }

        // ==========================================
        // CHECK LOBBY STATUS
        // ==========================================

        if (lobby.status !== "waiting") {
            socket.emit("lobby_error", {
                type: "LOBBY_STARTED",
                message: "Match has already started",
            });

            return;
        }

        // ==========================================
        // CHECK LOBBY FULL
        // ==========================================

        if (lobby.players.length >= PLAYERS_COUNT) {
            socket.emit("lobby_error", {
                type: "LOBBY_FULL",
                message: "Lobby is full",
            });

            return;
        }

        // ==========================================
        // CHECK ALREADY JOINED THIS LOBBY
        // ==========================================

        const alreadyJoined = lobby.players.some(
            (player) => player.userId === userId
        );

        if (alreadyJoined) {
            socket.join(lobbyId);

            socket.emit("lobby_state", {
                lobbyId,
                entryFee: lobby.entryFee,
                players: lobby.players,
                status: lobby.status,
            });

            return;
        }

        // ==========================================
        // CHECK USER IN ANOTHER LOBBY
        // ==========================================

        for (const otherLobby of matchLobbies.values()) {
            const exists = otherLobby.players.some(
                (player) => player.userId === userId
            );

            if (exists) {
                socket.emit("lobby_error", {
                    type: "ALREADY_IN_LOBBY",
                    message: "You are already in another lobby",
                });

                return;
            }
        }

        // ==========================================
        // GET USER FROM DATABASE
        // ==========================================

        const user = await getUser(userId);

        if (!user) {
            socket.emit("lobby_error", {
                type: "USER_NOT_FOUND",
                message: "User not found",
            });

            return;
        }

        // ==========================================
        // CHECK COINS
        // ==========================================

        const requiredCoins = Number(lobby.entryFee) || 0;
        const availableCoins = Number(user.coins) || 0;

        if (availableCoins < requiredCoins) {
            socket.emit("lobby_error", {
                type: "INSUFFICIENT_COINS",
                message: `You need ${requiredCoins} coins to join this lobby.`,
                requiredCoins,
                availableCoins,
            });

            return;
        }

        // ==========================================
        // CREATE PLAYER
        // ==========================================

        const player = {
            userId,
            name: user.name,
            avatar: user.avatar,
            flag: user.flag,
            level: user.level,
            socketId: socket.id,
            seat: lobby.players.length + 1,
        };

        // ==========================================
        // ADD PLAYER TO LOBBY
        // ==========================================

        lobby.players.push(player);

        socket.join(lobbyId);

        console.log(
            `🟢 ${user.name} (${userId}) joined lobby ${lobbyId}`
        );

        // ==========================================
        // SEND UPDATED LOBBY TO ALL PLAYERS
        // ==========================================

        io.to(lobbyId).emit("lobby_updated", {
            lobbyId,
            ownerId: lobby.ownerId,
            players: lobby.players,
            totalPlayers: lobby.players.length,
            requiredPlayers: PLAYERS_COUNT,
            entryFee: lobby.entryFee,
            status: lobby.status,
        });

    } catch (error) {
        console.error("❌ join_lobby error:", error);

        socket.emit("lobby_error", {
            type: "SERVER_ERROR",
            message: "Unable to join lobby",
        });
    }
};