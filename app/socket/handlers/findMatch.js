import onlineUsers from "../../data/online_players.js";
import matchLobbies from "../../data/match_lobbies.js";
import matchmakingQueue from "../../data/matchmaking_queue.js";
import rooms from "../../data/match_rooms.js";
import { createDeck, shuffleDeck } from "../../game/cards.js";

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 8;

const broadcastLobbySearchState = (io, lobby, playersCount, entryFee, status = "searching") => {
    io.to(lobby.lobbyId).emit("lobby_updated", {
        lobbyId: lobby.lobbyId,
        ownerId: lobby.ownerId,
        players: lobby.players,
        totalPlayers: lobby.players.length,
        requiredPlayers: playersCount,
        entryFee: lobby.entryFee,
        status: lobby.status,
        matchStatus: status,
    });

    io.to(lobby.lobbyId).emit("match_status", {
        status,
        lobbyId: lobby.lobbyId,
        players: lobby.players.length,
        requiredPlayers: playersCount,
        entryFee,
    });
};

const syncLobbyPlayersFromSocketRoom = (io, lobby) => {
    const room = io.sockets.adapter.rooms.get(lobby.lobbyId);

    if (!room) {
        return lobby.players;
    }

    const syncedPlayers = [];
    const uniqueUserIds = new Set();

    for (const socketId of room) {
        const userId = [...onlineUsers.entries()].find(
            ([, player]) => player.socketId === socketId
        )?.[0];

        if (!userId) {
            continue;
        }

        if (uniqueUserIds.has(userId)) {
            continue;
        }

        const existingPlayer = lobby.players.find((player) => player.userId === userId);
        if (existingPlayer) {
            syncedPlayers.push(existingPlayer);
            uniqueUserIds.add(userId);
            continue;
        }

        const socket = io.sockets.sockets.get(socketId);
        if (!socket) {
            continue;
        }

        const player = {
            userId,
            name: socket.user?.name || socket.user?.userName || `Player_${userId}`,
            avatar: socket.user?.avatar,
            flag: socket.user?.flag,
            level: socket.user?.level,
            socketId,
            seat: syncedPlayers.length + 1,
        };

        syncedPlayers.push(player);
        uniqueUserIds.add(userId);
    }

    lobby.players = syncedPlayers;
    return syncedPlayers;
};

const mergeLobbyIntoExistingSearchingLobby = (io, lobby, queue, playersCount, entryFee) => {
    const targetLobby = [...matchLobbies.values()].find(
        (candidate) =>
            candidate.lobbyId !== lobby.lobbyId &&
            candidate.entryFee === entryFee &&
            candidate.status === "searching" &&
            candidate.players.length < playersCount
    );

    if (!targetLobby) {
        return false;
    }

    syncLobbyPlayersFromSocketRoom(io, lobby);
    syncLobbyPlayersFromSocketRoom(io, targetLobby);

    const mergedPlayers = [...targetLobby.players];
    const existingUserIds = new Set(mergedPlayers.map((player) => player.userId));

    for (const player of lobby.players) {
        if (!existingUserIds.has(player.userId)) {
            mergedPlayers.push({
                ...player,
                seat: mergedPlayers.length + 1,
            });
            existingUserIds.add(player.userId);
        }

        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
            playerSocket.leave(lobby.lobbyId);
            playerSocket.join(targetLobby.lobbyId);
        }
    }

    targetLobby.players = mergedPlayers;
    targetLobby.status = "searching";

    const currentQueueItemIndex = queue.findIndex((item) => item.lobbyId === lobby.lobbyId);
    if (currentQueueItemIndex !== -1) {
        queue.splice(currentQueueItemIndex, 1);
    }

    const targetQueueItem = queue.find((item) => item.lobbyId === targetLobby.lobbyId);
    if (targetQueueItem) {
        targetQueueItem.playersCount = targetLobby.players.length;
    } else {
        queue.push({
            lobbyId: targetLobby.lobbyId,
            playersCount: targetLobby.players.length,
        });
    }

    matchLobbies.delete(lobby.lobbyId);

    io.to(targetLobby.lobbyId).emit("lobby_updated", {
        lobbyId: targetLobby.lobbyId,
        ownerId: targetLobby.ownerId,
        players: targetLobby.players,
        totalPlayers: targetLobby.players.length,
        requiredPlayers: playersCount,
        entryFee: targetLobby.entryFee,
        status: targetLobby.status,
    });

    return true;
};

const mergeSelectedLobbiesIntoPrimary = (io, selectedLobbies) => {
    if (!selectedLobbies.length) {
        return null;
    }

    const primaryLobbyId = selectedLobbies[0].lobbyId;
    const primaryLobby = matchLobbies.get(primaryLobbyId);

    if (!primaryLobby) {
        return null;
    }

    syncLobbyPlayersFromSocketRoom(io, primaryLobby);

    const existingUserIds = new Set(
        primaryLobby.players.map((player) => player.userId)
    );

    for (const selected of selectedLobbies.slice(1)) {
        const otherLobby = matchLobbies.get(selected.lobbyId);

        if (!otherLobby || otherLobby.lobbyId === primaryLobbyId) {
            continue;
        }

        syncLobbyPlayersFromSocketRoom(io, otherLobby);

        for (const player of otherLobby.players) {
            if (!existingUserIds.has(player.userId)) {
                primaryLobby.players.push({
                    ...player,
                    seat: primaryLobby.players.length + 1,
                });
                existingUserIds.add(player.userId);
            }

            const socket = io.sockets.sockets.get(player.socketId);
            if (socket) {
                socket.leave(otherLobby.lobbyId);
                socket.join(primaryLobbyId);
            }
        }

        io.to(primaryLobbyId).emit("lobby_updated", {
            lobbyId: primaryLobbyId,
            ownerId: primaryLobby.ownerId,
            players: primaryLobby.players,
            totalPlayers: primaryLobby.players.length,
            requiredPlayers: primaryLobby.players.length,
            entryFee: primaryLobby.entryFee,
            status: primaryLobby.status,
        });
    }

    return primaryLobby;
};

export const handleFindMatch = async (io, socket, matchData) => {
    try {
        const userId = [...onlineUsers.entries()]
            .find(([, player]) => player.socketId === socket.id)?.[0];

        if (!userId) {
            socket.emit("match_error", {
                type: "USER_NOT_FOUND",
                message: "User not found",
            });
            return;
        }

        // =========================
        // FIND USER LOBBY
        // =========================

        const lobby = [...matchLobbies.values()].find((lobby) =>
            lobby.players.some(
                (player) => player.userId === userId
            )
        );

        if (!lobby) {
            socket.emit("match_error", {
                type: "LOBBY_NOT_FOUND",
                message: "You are not in a lobby",
            });
            return;
        }

        syncLobbyPlayersFromSocketRoom(io, lobby);

        const entryFee = Number.isFinite(Number(matchData?.entryFee))
            ? Number(matchData.entryFee)
            : Number(lobby.entryFee);

        const playersCount = Number.isInteger(Number(matchData?.playersCount))
            ? Number(matchData.playersCount)
            : Number(lobby.players.length) || MIN_PLAYERS;

        // =========================
        // VALIDATE MATCH DATA
        // =========================

        if (!Number.isFinite(entryFee) || entryFee < 0) {
            socket.emit("match_error", {
                type: "INVALID_ENTRY_FEE",
                message: "Invalid entry fee",
            });
            return;
        }

        if (
            !Number.isInteger(playersCount) ||
            playersCount < MIN_PLAYERS ||
            playersCount > MAX_PLAYERS
        ) {
            socket.emit("match_error", {
                type: "INVALID_PLAYERS_COUNT",
                message: "Players count must be between 4 and 8",
            });
            return;
        }

        // =========================
        // ONLY LOBBY OWNER
        // =========================

        if (lobby.ownerId !== userId) {
            socket.emit("match_error", {
                type: "NOT_LOBBY_OWNER",
                message: "Only lobby owner can find a match",
            });
            return;
        }

        // =========================
        // LOBBY STATUS
        // =========================

        if (lobby.status !== "waiting") {
            socket.emit("match_error", {
                type: "INVALID_LOBBY_STATUS",
                message: "Lobby is already searching or started",
            });
            return;
        }

        // =========================
        // CHECK LOBBY ENTRY FEE
        // =========================

        if (Number(lobby.entryFee) !== entryFee) {
            socket.emit("match_error", {
                type: "ENTRY_FEE_MISMATCH",
                message: "Entry fee does not match lobby",
            });
            return;
        }

        // =========================
        // CHECK PLAYERS COUNT
        // =========================

        if (lobby.players.length > playersCount) {
            socket.emit("match_error", {
                type: "TOO_MANY_PLAYERS",
                message: "Lobby has more players than selected match size",
            });
            return;
        }

        // =========================
        // ALREADY IN QUEUE
        // =========================

        const alreadyQueued = [...matchmakingQueue.values()].some((queue) =>
            queue.some((item) => item.lobbyId === lobby.lobbyId)
        );

        if (alreadyQueued) {
            console.log(`Lobby ${lobby.lobbyId} is already in queue; broadcasting searching state to all lobby members`);

            lobby.status = "searching";
            broadcastLobbySearchState(io, lobby, playersCount, entryFee, "searching");

            return;
        }

        // =========================
        // QUEUE KEY
        // =========================
        // Same entry fee + same target
        // players count only.

        const queueKey = `${entryFee}_${playersCount}`;

        if (!matchmakingQueue.has(queueKey)) {
            matchmakingQueue.set(queueKey, []);
        }

        const queue = matchmakingQueue.get(queueKey);

        // =========================
        // ADD LOBBY TO QUEUE
        // =========================

        queue.push({
            lobbyId: lobby.lobbyId,
            playersCount: lobby.players.length,
        });

        lobby.status = "searching";

        const mergedIntoExistingLobby = mergeLobbyIntoExistingSearchingLobby(
            io,
            lobby,
            queue,
            playersCount,
            entryFee
        );

        if (mergedIntoExistingLobby) {
            const activeLobby = [...matchLobbies.values()].find(
                (candidate) => candidate.lobbyId === lobby.lobbyId
            ) || [...matchLobbies.values()].find(
                (candidate) => candidate.entryFee === entryFee && candidate.status === "searching"
            );

            if (activeLobby) {
                activeLobby.status = "searching";
                broadcastLobbySearchState(io, activeLobby, playersCount, entryFee, "searching");
            }

            return;
        }

        io.to(lobby.lobbyId).emit("lobby_searching", {
            lobbyId: lobby.lobbyId,
            players: lobby.players.length,
            requiredPlayers: playersCount,
        });

        broadcastLobbySearchState(io, lobby, playersCount, entryFee, "searching");
        console.log("=================================");
        console.log("LOBBY ADDED TO MATCHMAKING");
        console.log("Queue Key:", queueKey);
        console.log("Lobby:", lobby.lobbyId);
        console.log("Lobby Players:", lobby.players.length);
        console.log("Required Players:", playersCount);
        console.log("=================================");

        // =========================
        // FIND LOBBIES WHOSE TOTAL
        // PLAYERS == TARGET
        // =========================

        let selectedLobbies = [];
        let totalPlayers = 0;

        /*
         * Example:
         *
         * Target = 4
         * 2 + 2 = 4
         *
         * Target = 6
         * 3 + 3 = 6
         * 4 + 2 = 6
         *
         * Target = 8
         * 4 + 4 = 8
         * 3 + 2 + 3 = 8
         *
         * A lobby is NEVER split.
         */

        for (const queuedLobby of queue) {
            const lobbyPlayers = queuedLobby.playersCount;

            if (
                totalPlayers + lobbyPlayers <= playersCount
            ) {
                selectedLobbies.push(queuedLobby);
                totalPlayers += lobbyPlayers;
            }

            if (totalPlayers === playersCount) {
                break;
            }
        }

        // =========================
        // NOT ENOUGH PLAYERS
        // =========================

        if (totalPlayers !== playersCount) {
            lobby.status = "searching";
            broadcastLobbySearchState(io, lobby, playersCount, entryFee, "searching");

            return;
        }

        // =========================
        // REMOVE SELECTED LOBBIES
        // FROM QUEUE
        // =========================

        for (const selected of selectedLobbies) {
            const index = queue.findIndex(
                (item) => item.lobbyId === selected.lobbyId
            );

            if (index !== -1) {
                queue.splice(index, 1);
            }
        }

        if (queue.length === 0) {
            matchmakingQueue.delete(queueKey);
        }

        // =========================
        // GET ALL PLAYERS
        // =========================

        const primaryLobby = mergeSelectedLobbiesIntoPrimary(io, selectedLobbies);

        const roomPlayers = [];
        const seenUserIds = new Set();

        for (const selected of selectedLobbies) {
            const selectedLobby = matchLobbies.get(selected.lobbyId) || primaryLobby;

            if (!selectedLobby) {
                continue;
            }

            for (const player of selectedLobby.players) {
                if (seenUserIds.has(player.userId)) {
                    continue;
                }

                roomPlayers.push({
                    userId: player.userId,
                    name: player.name,
                    socketId: player.socketId,
                });
                seenUserIds.add(player.userId);
            }
        }

        // Safety check
        if (roomPlayers.length !== playersCount) {
            console.error(
                "Room player count mismatch:",
                roomPlayers.length,
                playersCount
            );

            return;
        }

        // =========================
        // CREATE ROOM
        // =========================

        const roomId =
            `room_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`;

        // =========================
        // SHUFFLE + DEAL CARDS
        // =========================

        const deck = shuffleDeck(createDeck());

        const cardsPerPlayer =
            Math.floor(deck.length / playersCount);

        const players = roomPlayers.map(
            (player, index) => ({
                userId: player.userId,
                name: player.name,
                socketId: player.socketId,
                seat: index + 1,
                cards: deck.splice(0, cardsPerPlayer),
            })
        );

        // =========================
        // FIND ACE OF SPADES
        // =========================

        const firstPlayer = players.find((player) =>
            player.cards.some(
                (card) =>
                    card.rank === 1 &&
                    card.suit === "spades"
            )
        );

        const currentTurn = firstPlayer
            ? firstPlayer.seat
            : 1;

        // =========================
        // CREATE ROOM OBJECT
        // =========================

        const room = {
            roomId,
            players,
            playersCount,
            entryFee,
            tableCards: [],
            currentTurn,
            leadSuit: null,
            completedTricks: 0,
            trickNumber: 1,
            resolving: false,
            undealtCards: deck,
            status: "started",
            createdAt: new Date(),
        };

        rooms.set(roomId, room);

        console.log("=================================");
        console.log("MATCH FOUND");
        console.log("Room:", roomId);
        console.log("Entry Fee:", entryFee);
        console.log("Required Players:", playersCount);
        console.log("Players:", players);
        console.log("First Turn:", currentTurn);
        console.log("=================================");

        // =========================
        // JOIN SOCKET ROOM
        // =========================

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

        for (const player of players) {
            const playerSocket =
                io.sockets.sockets.get(player.socketId);

            if (!playerSocket) {
                continue;
            }

            playerSocket.join(roomId);

            playerSocket.emit("match_started", {
                roomId,
                yourUserId: player.userId,
                yourSeat: player.seat,
                players: publicPlayers,
                playersCount,
                entryFee,
                currentTurn,
            });

            playerSocket.emit("your_cards", {
                roomId,
                cards: player.cards,
            });
        }
        io.to(roomId).emit("game_started", {
            roomId,
            playersCount,
            currentTurn,
        });

        // =========================
        // DELETE USED LOBBIES
        // =========================

        for (const selected of selectedLobbies) {
            if (selected.lobbyId !== (primaryLobby?.lobbyId || selected.lobbyId)) {
                matchLobbies.delete(selected.lobbyId);
            }
        }

        if (primaryLobby) {
            matchLobbies.delete(primaryLobby.lobbyId);
        }

        console.log(
            `Room ${roomId} started with ${players.length} players`
        );

    } catch (error) {
        console.error(
            "handleFindMatch error:",
            error
        );

        socket.emit("match_error", {
            type: "SERVER_ERROR",
            message: "Something went wrong",
        });
    }
};