import User from "../../modules/user/model.js";
import matchLobbies from "../../data/match_lobbies.js";
import matchmakingQueue from "../../data/matchmaking_queue.js";
import rooms from "../../data/game_rooms.js";
import { findUserIdBySocket } from "../../utils/getUserIdBySocket.js";
import { createDeck, shuffleDeck } from "../../game/cards.js";

const PLAYERS_COUNT = 4;

// ======================================================
// FIND MATCH
// ======================================================

export const handleFindMatch = async (io, socket, data) => {
    try {
        const { lobbyId } = data || {};

        // ==========================================
        // FIND USER
        // ==========================================

        const userId = findUserIdBySocket(socket.id);

        if (!userId) {
            socket.emit("match_error", {
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
            socket.emit("match_error", {
                type: "LOBBY_NOT_FOUND",
                message: "Lobby not found",
            });

            return;
        }

        // ==========================================
        // ONLY OWNER CAN START
        // ==========================================

        if (lobby.ownerId !== userId) {
            socket.emit("match_error", {
                type: "NOT_OWNER",
                message: "Only lobby owner can find match",
            });

            return;
        }

        // ==========================================
        // ALREADY SEARCHING
        // ==========================================

        if (lobby.status === "searching") {
            return;
        }

        // ==========================================
        // CHECK PLAYERS
        // ==========================================

        if (lobby.players.length === 0) {
            socket.emit("match_error", {
                type: "NO_PLAYERS",
                message: "No players in lobby",
            });

            return;
        }

        // ==========================================
        // VERIFY ALL PLAYERS BALANCE
        // ==========================================

        const users = await User.find({
            _id: {
                $in: lobby.players.map((player) => player.userId),
            },
        }).select("_id coins name");

        const userMap = new Map(
            users.map((user) => [user._id.toString(), user])
        );

        const requiredCoins = Number(lobby.entryFee) || 0;

        for (const player of lobby.players) {
            const dbUser = userMap.get(String(player.userId));

            if (!dbUser) {
                socket.emit("match_error", {
                    type: "USER_NOT_FOUND",
                    message: `Player ${player.name} not found`,
                });

                return;
            }

            if (dbUser.coins < requiredCoins) {
                socket.emit("match_error", {
                    type: "INSUFFICIENT_COINS",
                    message: `${player.name} does not have enough coins.`,
                    userId: player.userId,
                    requiredCoins,
                    availableCoins: dbUser.coins,
                });

                return;
            }
        }

        // ==========================================
        // MARK LOBBY AS SEARCHING
        // ==========================================

        lobby.status = "searching";

        const queueKey = String(lobby.entryFee);

        if (!matchmakingQueue.has(queueKey)) {
            matchmakingQueue.set(queueKey, []);
        }

        const queue = matchmakingQueue.get(queueKey);

        if (!queue.includes(lobbyId)) {
            queue.push(lobbyId);
        }

        // ==========================================
        // PLAYER COUNT
        // ==========================================

        const currentPlayers = lobby.players.length;
        const needPlayers = PLAYERS_COUNT - currentPlayers;

        // ==========================================
        // NOTIFY LOBBY
        // ==========================================

        io.to(lobbyId).emit("match_searching", {
            lobbyId,
            currentPlayers,
            requiredPlayers: PLAYERS_COUNT,
            needPlayers,
            entryFee: lobby.entryFee,
            status: "searching",
        });

        console.log(
            `🔎 Lobby ${lobbyId} searching (${currentPlayers}/${PLAYERS_COUNT})`
        );

        // ==========================================
        // TRY CREATE MATCH
        // ==========================================

        await tryCreateMatch(io, queueKey);
    } catch (error) {
        console.error("❌ find_match error:", error);

        socket.emit("match_error", {
            type: "SERVER_ERROR",
            message: "Unable to find match",
        });
    }
};

// ======================================================
// MATCHMAKING
// ======================================================

const tryCreateMatch = async (io, queueKey) => {
    const queue = matchmakingQueue.get(queueKey);

    if (!queue || queue.length === 0) {
        return;
    }

    let selectedLobbies = [];
    let totalPlayers = 0;

    // ==========================================
    // FIND COMPATIBLE LOBBIES
    // ==========================================

    for (const lobbyId of queue) {
        const lobby = matchLobbies.get(lobbyId);

        if (!lobby) {
            continue;
        }

        if (lobby.status !== "searching") {
            continue;
        }

        const count = lobby.players.length;

        if (totalPlayers + count <= PLAYERS_COUNT) {
            selectedLobbies.push(lobby);
            totalPlayers += count;
        }

        if (totalPlayers === PLAYERS_COUNT) {
            break;
        }
    }

    // ==========================================
    // NOT ENOUGH PLAYERS
    // ==========================================

    if (totalPlayers < PLAYERS_COUNT) {
        console.log(
            `⏳ Queue ${queueKey}: ${totalPlayers}/${PLAYERS_COUNT}`
        );

        return;
    }

    // ==========================================
    // REMOVE SELECTED LOBBIES FROM QUEUE
    // ==========================================

    for (const lobby of selectedLobbies) {
        const index = queue.indexOf(lobby.lobbyId);

        if (index !== -1) {
            queue.splice(index, 1);
        }
    }

    if (queue.length === 0) {
        matchmakingQueue.delete(queueKey);
    }

    // ==========================================
    // COMBINE PLAYERS
    // ==========================================

    const roomPlayers = selectedLobbies.flatMap(
        (lobby) => lobby.players
    );

    console.log(
        `🎮 Match found: ${roomPlayers.length}/${PLAYERS_COUNT}`
    );

    // ==========================================
    // FINAL COIN CHECK + DEDUCT
    // ==========================================

    const deductionResult = await deductMatchCoins(
        roomPlayers,
        selectedLobbies[0].entryFee
    );

    if (!deductionResult.success) {
        console.log("❌ Coin deduction failed");

        for (const lobby of selectedLobbies) {
            lobby.status = "waiting";

            io.to(lobby.lobbyId).emit("match_error", {
                type: deductionResult.type,
                message: deductionResult.message,
            });
        }

        return;
    }

    // ==========================================
    // CREATE GAME ROOM
    // ==========================================

    try {
        await createGameRoom(
            io,
            roomPlayers,
            selectedLobbies[0].entryFee
        );

        // ======================================
        // REMOVE LOBBIES
        // ======================================

        for (const lobby of selectedLobbies) {
            matchLobbies.delete(lobby.lobbyId);
        }
    } catch (error) {
        console.error("❌ Room creation failed:", error);

        // ======================================
        // REFUND COINS
        // ======================================

        await refundMatchCoins(
            roomPlayers,
            selectedLobbies[0].entryFee
        );

        // ======================================
        // RESTORE LOBBIES
        // ======================================

        for (const lobby of selectedLobbies) {
            lobby.status = "waiting";

            io.to(lobby.lobbyId).emit("match_error", {
                type: "ROOM_CREATION_FAILED",
                message: "Unable to create room. Coins refunded.",
            });
        }
    }
};

// ======================================================
// ATOMIC COIN DEDUCTION
// ======================================================

const deductMatchCoins = async (players, entryFee) => {
    const userIds = players.map((player) => player.userId);
    const updatedUsers = [];

    try {
        for (const userId of userIds) {
            const updatedUser = await User.findOneAndUpdate(
                {
                    _id: userId,
                    coins: {
                        $gte: entryFee,
                    },
                },
                {
                    $inc: {
                        coins: -entryFee,
                    },
                },
                {
                    new: true,
                }
            );

            // ======================================
            // INSUFFICIENT COINS
            // ======================================

            if (!updatedUser) {
                for (const deductedUserId of updatedUsers) {
                    await User.updateOne(
                        {
                            _id: deductedUserId,
                        },
                        {
                            $inc: {
                                coins: entryFee,
                            },
                        }
                    );
                }

                return {
                    success: false,
                    type: "INSUFFICIENT_COINS",
                    message:
                        "One or more players do not have enough coins.",
                };
            }

            updatedUsers.push(userId);
        }

        return {
            success: true,
        };
    } catch (error) {
        console.error("❌ Coin deduction error:", error);

        // ==========================================
        // REFUND IF ERROR
        // ==========================================

        for (const userId of updatedUsers) {
            try {
                await User.updateOne(
                    {
                        _id: userId,
                    },
                    {
                        $inc: {
                            coins: entryFee,
                        },
                    }
                );
            } catch (refundError) {
                console.error(
                    "❌ CRITICAL REFUND ERROR:",
                    refundError
                );
            }
        }

        return {
            success: false,
            type: "COIN_TRANSACTION_FAILED",
            message: "Coin deduction failed.",
        };
    }
};

// ======================================================
// REFUND MATCH COINS
// ======================================================

const refundMatchCoins = async (players, entryFee) => {
    for (const player of players) {
        try {
            await User.updateOne(
                {
                    _id: player.userId,
                },
                {
                    $inc: {
                        coins: entryFee,
                    },
                }
            );
        } catch (error) {
            console.error(
                `❌ Refund failed for ${player.userId}`,
                error
            );
        }
    }
};

// ======================================================
// CREATE GAME ROOM
// ======================================================

const createGameRoom = async (
    io,
    lobbyPlayers,
    entryFee
) => {
    if (lobbyPlayers.length !== PLAYERS_COUNT) {
        throw new Error(
            `Room requires exactly ${PLAYERS_COUNT} players`
        );
    }

    // ==========================================
    // CREATE ROOM ID
    // ==========================================

    const roomId =
        `room_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;

    // ==========================================
    // CREATE + SHUFFLE DECK
    // ==========================================

    const deck = shuffleDeck(createDeck());

    const cardsPerPlayer = Math.floor(
        deck.length / PLAYERS_COUNT
    );

    // ==========================================
    // CREATE PLAYERS
    // ==========================================

    const players = lobbyPlayers.map(
        (player, index) => {
            const playerSocket =
                io.sockets.sockets.get(
                    player.socketId
                );

            if (!playerSocket) {
                throw new Error(
                    `Player disconnected: ${player.userId}`
                );
            }

            return {
                userId: player.userId,
                name: player.name,
                socketId: player.socketId,
                seat: index + 1,
                cards: deck.splice(
                    0,
                    cardsPerPlayer
                ),
            };
        }
    );

    // ==========================================
    // CREATE ROOM OBJECT
    // ==========================================

    const room = {
        roomId,
        players,
        playersCount: PLAYERS_COUNT,
        entryFee,
        tableCards: [],
        currentTurn: 1,
        status: "started",
        createdAt: new Date(),
    };

    rooms.set(roomId, room);

    // ==========================================
    // PUBLIC PLAYER DATA
    // ==========================================

    const publicPlayers = players.map(
        ({
            userId,
            name,
            seat,
        }) => ({
            userId,
            name,
            seat,
        })
    );

    // ==========================================
    // JOIN SOCKET.IO ROOM
    // ==========================================

    for (const player of players) {
        const playerSocket =
            io.sockets.sockets.get(
                player.socketId
            );

        playerSocket.join(roomId);
    }

    // ==========================================
    // ROOM CREATED
    // ==========================================

    io.to(roomId).emit("room_created", {
        roomId,
        players: publicPlayers,
        playersCount: PLAYERS_COUNT,
        entryFee,
    });

    // ==========================================
    // SEND GAME DATA
    // ==========================================

    for (const player of players) {
        const playerSocket =
            io.sockets.sockets.get(
                player.socketId
            );

        playerSocket.emit("match_started", {
            roomId,
            yourUserId: player.userId,
            yourSeat: player.seat,
            players: publicPlayers,
            playersCount: PLAYERS_COUNT,
            entryFee,
            currentTurn: room.currentTurn,
        });

        // Only this player's cards
        playerSocket.emit("your_cards", {
            roomId,
            cards: player.cards,
        });
    }

    console.log(`✅ Room ${roomId} started`);
    console.log(`👥 Players: ${players.length}/${PLAYERS_COUNT}`);
    console.log(`🪙 Entry: ${entryFee}`);

    return room;
};