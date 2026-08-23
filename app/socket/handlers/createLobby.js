import matchLobbies from "../../data/match_lobbies.js";
import { findUserIdBySocket } from "../../utils/getUserIdBySocket.js";
import { getUser } from "../../utils/getUserDataById.js";

const PLAYERS_COUNT = 4;

export const handleCreateLobby = async (io, socket, data) => {
    console.log("create_lobby event received:", data);

    try {
        const entryFee = Number(data?.entryFee || 0);
        if (!Number.isInteger(entryFee) || entryFee <= 0) {
            socket.emit("lobby_error", {
                type: "INVALID_ENTRY_FEE",
                message: "Invalid entry fee",
            });
            return;
        }


        const userId = findUserIdBySocket(socket.id);

        if (!userId) {
            socket.emit("lobby_error", {
                type: "USER_NOT_FOUND",
                message: "User not found",
            });
            return;
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
        // BALANCE CHECK
        // ==========================================

        if (user.coins < entryFee) {
            socket.emit("lobby_error", {
                type: "INSUFFICIENT_COINS",
                message: `You need ${entryFee} coins.`,
                requiredCoins: entryFee,
                availableCoins: user.coins,
            });

            return;
        }


        // ==========================================
        // CHECK EXISTING LOBBY
        // ==========================================
        for (const [lobbyId, lobby] of matchLobbies.entries()) {
            const playerIndex = lobby.players.findIndex(
                player => player.userId === userId
            );

            if (playerIndex !== -1) {
                // Remove player from old lobby
                lobby.players.splice(playerIndex, 1);

                // Leave Socket.IO room
                socket.leave(lobbyId);

                // Notify old lobby
                socket.to(lobbyId).emit("player_left_lobby", {
                    userId,
                    lobbyId,
                });

                console.log(
                    `🚪 User ${userId} left old lobby ${lobbyId}`
                );

                // If lobby becomes empty, delete it
                if (lobby.players.length === 0) {
                    matchLobbies.delete(lobbyId);

                    console.log(
                        `🗑️ Empty lobby deleted: ${lobbyId}`
                    );
                } else {
                    // Update remaining players
                    io.to(lobbyId).emit("lobby_updated", {
                        lobbyId,
                        players: lobby.players,
                    });
                }

                // User can now join the new lobby
                break;
            }
        }

        // ==========================================
        // CREATE LOBBY
        // ==========================================

        const lobbyId = `lobby_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;


        const lobby = {
            lobbyId,
            ownerId: userId,
            entryFee,
            status: "waiting",
            players: [
                {
                    userId,
                    name: user.name,
                    socketId: socket.id,
                    seat: 1,
                },

            ],

            createdAt: new Date(),
        };
        matchLobbies.set(lobbyId, lobby);


        socket.join(lobbyId);


        console.log(`🏠 Lobby created: ${lobbyId}`);


        socket.emit("lobby_created", {
            lobbyId,
            ownerId: userId,
            entryFee,
            playersCount: PLAYERS_COUNT,
            players: lobby.players,
            status: "waiting",
            coins: user.coins,
        }
        );

    } catch (error) {
        console.error("create_lobby error:", error);
        socket.emit("lobby_error", {
            type: "SERVER_ERROR",
            message: "Unable to create lobby",
        });
    }
};
