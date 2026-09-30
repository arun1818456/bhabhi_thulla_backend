import onlineUsers from "../../data/online_players.js";
import matchLobbies from "../../data/match_lobbies.js";
import matchmakingQueue from "../../data/matchmaking_queue.js";
import rooms from "../../data/match_rooms.js";
import { createDeck, shuffleDeck } from "../../game/cards.js";
import User from "../../modules/user/model.js";

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 8;

// Prevent two find-match requests from creating two rooms
const matchmakingLocks = new Set();

const delay = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send current lobby/searching state
 */
const broadcastLobbySearchState = (
    io,
    lobby,
    playersCount,
    entryFee,
    status = "searching"
) => {
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

/**
 * Sync players using actual Socket.IO room members.
 *
 * This is important because after merging lobbies,
 * socket room membership is the source of truth.
 */
const syncLobbyPlayersFromSocketRoom = (io, lobby) => {
    const room = io.sockets.adapter.rooms.get(lobby.lobbyId);

    if (!room) {
        return lobby.players;
    }

    const syncedPlayers = [];
    const uniqueUserIds = new Set();

    for (const socketId of room) {
        const userEntry = [...onlineUsers.entries()].find(
            ([, player]) => player.socketId === socketId
        );

        const userId = userEntry?.[0];

        if (!userId) {
            continue;
        }

        if (uniqueUserIds.has(userId)) {
            continue;
        }

        const existingPlayer = lobby.players.find(
            (player) => player.userId === userId
        );

        if (existingPlayer) {
            syncedPlayers.push({
                ...existingPlayer,
                socketId,
            });

            uniqueUserIds.add(userId);
            continue;
        }

        const socket = io.sockets.sockets.get(socketId);

        if (!socket) {
            continue;
        }

        const player = {
            userId,
            name:
                socket.user?.name ||
                socket.user?.userName ||
                `Player_${userId}`,
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

/**
 * Remove duplicate players and reassign seats.
 */
const normalizeLobbyPlayers = (lobby) => {
    const uniquePlayers = [];
    const userIds = new Set();

    for (const player of lobby.players) {
        if (!player?.userId) {
            continue;
        }

        if (userIds.has(player.userId)) {
            continue;
        }

        userIds.add(player.userId);

        uniquePlayers.push({
            ...player,
            seat: uniquePlayers.length + 1,
        });
    }

    lobby.players = uniquePlayers;

    return uniquePlayers;
};

/**
 * Find a compatible searching lobby.
 *
 * IMPORTANT:
 * entryFee AND target player count must match.
 */
const findCompatibleLobby = (
    lobby,
    playersCount,
    entryFee
) => {
    return [...matchLobbies.values()].find(
        (candidate) =>
            candidate.lobbyId !== lobby.lobbyId &&
            candidate.entryFee === entryFee &&
            candidate.status === "searching" &&
            candidate.players.length < playersCount &&
            candidate.players.length + lobby.players.length <= playersCount
    );
};

/**
 * Merge one lobby into another.
 *
 * IMPORTANT:
 * This function DOES NOT stop matchmaking.
 * Caller must continue checking whether target lobby
 * has reached required player count.
 */
const mergeLobbyIntoExistingSearchingLobby = (
    io,
    lobby,
    playersCount,
    entryFee
) => {
    const targetLobby = findCompatibleLobby(
        lobby,
        playersCount,
        entryFee
    );

    if (!targetLobby) {
        return null;
    }

    syncLobbyPlayersFromSocketRoom(io, lobby);
    syncLobbyPlayersFromSocketRoom(io, targetLobby);

    normalizeLobbyPlayers(lobby);
    normalizeLobbyPlayers(targetLobby);

    const existingUserIds = new Set(
        targetLobby.players.map(
            (player) => player.userId
        )
    );

    for (const player of lobby.players) {
        if (existingUserIds.has(player.userId)) {
            continue;
        }

        targetLobby.players.push({
            ...player,
            seat: targetLobby.players.length + 1,
        });

        existingUserIds.add(player.userId);

        const playerSocket =
            io.sockets.sockets.get(player.socketId);

        if (playerSocket) {
            playerSocket.leave(lobby.lobbyId);
            playerSocket.join(targetLobby.lobbyId);
        }
    }

    normalizeLobbyPlayers(targetLobby);

    targetLobby.status = "searching";

    /**
     * Remove old lobby from queue.
     */
    for (const [queueKey, queue] of matchmakingQueue.entries()) {
        const index = queue.findIndex(
            (item) => item.lobbyId === lobby.lobbyId
        );

        if (index !== -1) {
            queue.splice(index, 1);

            if (queue.length === 0) {
                matchmakingQueue.delete(queueKey);
            }
        }
    }

    /**
     * Make sure target lobby exists in queue.
     */
    const queueKey = `${entryFee}_${playersCount}`;

    if (!matchmakingQueue.has(queueKey)) {
        matchmakingQueue.set(queueKey, []);
    }

    const queue =
        matchmakingQueue.get(queueKey);

    const targetQueueItem = queue.find(
        (item) =>
            item.lobbyId === targetLobby.lobbyId
    );

    if (targetQueueItem) {
        targetQueueItem.playersCount =
            targetLobby.players.length;
    } else {
        queue.push({
            lobbyId: targetLobby.lobbyId,
            playersCount: targetLobby.players.length,
        });
    }

    /**
     * Old lobby is no longer active.
     */
    matchLobbies.delete(lobby.lobbyId);

    /**
     * Notify players who are now inside target lobby.
     */
    io.to(targetLobby.lobbyId).emit(
        "lobby_updated",
        {
            lobbyId: targetLobby.lobbyId,
            ownerId: targetLobby.ownerId,
            players: targetLobby.players,
            totalPlayers:
                targetLobby.players.length,
            requiredPlayers: playersCount,
            entryFee: targetLobby.entryFee,
            status: targetLobby.status,
            matchStatus: "searching",
        }
    );

    io.to(targetLobby.lobbyId).emit(
        "match_status",
        {
            status: "searching",
            lobbyId: targetLobby.lobbyId,
            players:
                targetLobby.players.length,
            requiredPlayers: playersCount,
            entryFee,
        }
    );

    console.log(
        `[MATCHMAKING] Lobby ${lobby.lobbyId} merged into ${targetLobby.lobbyId}`
    );

    console.log(
        `[MATCHMAKING] Target lobby players: ${targetLobby.players.length}/${playersCount}`
    );

    return targetLobby;
};

/**
 * Make sure lobby is in correct queue.
 */
const addLobbyToQueue = (
    lobby,
    playersCount,
    entryFee
) => {
    const queueKey =
        `${entryFee}_${playersCount}`;

    if (!matchmakingQueue.has(queueKey)) {
        matchmakingQueue.set(queueKey, []);
    }

    const queue =
        matchmakingQueue.get(queueKey);

    const existingItem = queue.find(
        (item) =>
            item.lobbyId === lobby.lobbyId
    );

    if (existingItem) {
        existingItem.playersCount =
            lobby.players.length;
    } else {
        queue.push({
            lobbyId: lobby.lobbyId,
            playersCount: lobby.players.length,
        });
    }

    return queue;
};

/**
 * Remove a lobby from every matchmaking queue.
 */
const removeLobbyFromAllQueues = (lobbyId) => {
    for (const [queueKey, queue] of matchmakingQueue.entries()) {
        const filtered = queue.filter(
            (item) => item.lobbyId !== lobbyId
        );

        if (filtered.length === 0) {
            matchmakingQueue.delete(queueKey);
        } else {
            matchmakingQueue.set(
                queueKey,
                filtered
            );
        }
    }
};

/**
 * Find lobbies whose TOTAL players exactly
 * match the requested match size.
 *
 * Example:
 *
 * 4 player match:
 * 1 + 1 + 1 + 1
 * 2 + 2
 * 3 + 1
 * 4
 *
 * 8 player match:
 * 4 + 4
 * 3 + 3 + 2
 * 2 + 2 + 2 + 2
 */
const selectLobbiesForMatch = (
    queue,
    playersCount
) => {
    const selected = [];
    let totalPlayers = 0;

    for (const item of queue) {
        const count =
            Number(item.playersCount) || 0;

        if (count <= 0) {
            continue;
        }

        if (
            totalPlayers + count <=
            playersCount
        ) {
            selected.push(item);

            totalPlayers += count;
        }

        if (totalPlayers === playersCount) {
            break;
        }
    }

    return {
        selected,
        totalPlayers,
    };
};

/**
 * Merge selected lobbies into one primary lobby.
 */
const mergeSelectedLobbiesIntoPrimary = (
    io,
    selectedLobbies
) => {
    if (!selectedLobbies.length) {
        return null;
    }

    const primaryLobbyId =
        selectedLobbies[0].lobbyId;

    const primaryLobby =
        matchLobbies.get(primaryLobbyId);

    if (!primaryLobby) {
        return null;
    }

    syncLobbyPlayersFromSocketRoom(
        io,
        primaryLobby
    );

    normalizeLobbyPlayers(primaryLobby);

    const existingUserIds = new Set(
        primaryLobby.players.map(
            (player) => player.userId
        )
    );

    for (
        const selected of selectedLobbies.slice(1)
    ) {
        const otherLobby =
            matchLobbies.get(
                selected.lobbyId
            );

        if (!otherLobby) {
            continue;
        }

        syncLobbyPlayersFromSocketRoom(
            io,
            otherLobby
        );

        normalizeLobbyPlayers(otherLobby);

        for (
            const player of otherLobby.players
        ) {
            if (
                existingUserIds.has(
                    player.userId
                )
            ) {
                continue;
            }

            primaryLobby.players.push({
                ...player,
                seat:
                    primaryLobby.players.length +
                    1,
            });

            existingUserIds.add(
                player.userId
            );

            const playerSocket =
                io.sockets.sockets.get(
                    player.socketId
                );

            if (playerSocket) {
                playerSocket.leave(
                    otherLobby.lobbyId
                );

                playerSocket.join(
                    primaryLobbyId
                );
            }
        }

        matchLobbies.delete(
            otherLobby.lobbyId
        );
    }

    normalizeLobbyPlayers(
        primaryLobby
    );

    primaryLobby.status = "starting";

    io.to(primaryLobbyId).emit(
        "lobby_updated",
        {
            lobbyId: primaryLobbyId,
            ownerId: primaryLobby.ownerId,
            players: primaryLobby.players,
            totalPlayers:
                primaryLobby.players.length,
            requiredPlayers:
                primaryLobby.players.length,
            entryFee:
                primaryLobby.entryFee,
            status: "starting",
            matchStatus: "starting",
        }
    );

    return primaryLobby;
};

/**
 * CREATE GAME ROOM
 */
const createGameRoom = async (
    io,
    primaryLobby,
    playersCount,
    entryFee
) => {
    if (!primaryLobby) {
        throw new Error(
            "Primary lobby not found"
        );
    }

    syncLobbyPlayersFromSocketRoom(
        io,
        primaryLobby
    );

    normalizeLobbyPlayers(
        primaryLobby
    );

    /**
     * Final player validation.
     */
    if (
        primaryLobby.players.length !==
        playersCount
    ) {
        throw new Error(
            `Player count mismatch. Expected ${playersCount}, got ${primaryLobby.players.length}`
        );
    }

    const roomId =
        `room_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;

    /**
     * Create deck.
     */
    const deck =
        shuffleDeck(createDeck());

    const cardsPerPlayer =
        Math.floor(
            deck.length / playersCount
        );

    /**
     * Create room players.
     */
    const players =
        primaryLobby.players.map(
            (player, index) => ({
                userId: player.userId,
                name: player.name,
                socketId: player.socketId,
                avatar: player.avatar,
                flag: player.flag,
                level: player.level,
                seat: index + 1,
                cards: deck.splice(
                    0,
                    cardsPerPlayer
                ),
            })
        );

    /**
     * Find Ace of Spades.
     */
    const firstPlayer =
        players.find((player) =>
            player.cards.some(
                (card) =>
                    card.rank === 1 &&
                    card.suit === "spades"
            )
        );

    const currentTurn =
        firstPlayer
            ? firstPlayer.seat
            : 1;

    /**
     * Create room object.
     */
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

    rooms.set(
        roomId,
        room
    );

    console.log(
        "================================="
    );

    console.log(
        "[MATCH FOUND]"
    );

    console.log(
        "Room:",
        roomId
    );

    console.log(
        "Players:",
        players.map((p) => ({
            userId: p.userId,
            socketId: p.socketId,
            seat: p.seat,
        }))
    );

    console.log(
        "Required:",
        playersCount
    );

    console.log(
        "Actual:",
        players.length
    );

    console.log(
        "Current turn:",
        currentTurn
    );

    console.log(
        "================================="
    );

    /**
     * Public player information.
     */
    const publicPlayers =
        players.map(
            ({
                userId,
                name,
                seat,
                avatar,
                flag,
                level,
                cards,
            }) => ({
                userId,
                name,
                seat,
                avatar,
                flag,
                level,
                cardCount: cards.length,
            })
        );

    /**
     * IMPORTANT:
     *
     * Every player's socket individually joins
     * the SAME room and individually receives
     * match_started.
     */
    for (
        const player of players
    ) {
        const playerSocket =
            io.sockets.sockets.get(
                player.socketId
            );

        if (!playerSocket) {
            console.error(
                `[MATCH] Socket missing for user ${player.userId}`
            );

            continue;
        }

        /**
         * Join game room.
         */
        playerSocket.join(
            roomId
        );

        console.log(
            `[MATCH] ${player.userId} joined room ${roomId}`
        );

        // Deduct entry fee
        if (entryFee > 0) {
            User.updateOne(
                { _id: player.userId },
                { $inc: { coins: -entryFee } }
            ).catch(err => console.error("Coin deduct err:", err));
        }

        /**
         * Send match_started directly
         * to that player's socket.
         */
        playerSocket.emit(
            "match_started",
            {
                roomId,

                yourSeat:
                    player.seat,

                players:
                    publicPlayers,

                playersCount,

                entryFee,

                currentTurn,

                tableCards: [],

                myCards:
                    player.cards,
            }
        );

        console.log(
            `[MATCH] match_started emitted -> ${player.userId}`
        );
    }

    /**
     * Verify actual Socket.IO room members.
     */
    const socketRoom =
        io.sockets.adapter.rooms.get(
            roomId
        );

    const connectedPlayerCount =
        socketRoom
            ? socketRoom.size
            : 0;

    console.log(
        `[MATCH] Socket room ${roomId}: ${connectedPlayerCount}/${playersCount}`
    );

    /**
     * Small delay so clients can process
     * match_started before game_started.
     */
    await delay(500);

    /**
     * game_started is broadcast to
     * EVERY socket in game room.
     */
    io.to(roomId).emit(
        "game_started",
        {
            roomId,

            playersCount,

            currentTurn,
        }
    );

    console.log(
        `[MATCH] game_started emitted -> ${roomId}`
    );

    /**
     * Remove used lobby.
     */
    removeLobbyFromAllQueues(
        primaryLobby.lobbyId
    );

    matchLobbies.delete(
        primaryLobby.lobbyId
    );

    return room;
};

/**
 * MAIN FIND MATCH HANDLER
 */
export const handleFindMatch = async (io, socket, matchData) => {
    const socketId = socket.id;

    if (matchmakingLocks.has(socketId)) {
        socket.emit("match_error", {
            type: "MATCHMAKING_ALREADY_RUNNING",
            message: "Matchmaking request is already being processed",
        });
        return;
    }
    matchmakingLocks.add(socketId);

    try {
        const userEntry = [...onlineUsers.entries()].find(
            ([, player]) => player.socketId === socket.id
        );
        const userId = userEntry?.[0];

        if (!userId) {
            socket.emit("match_error", { type: "USER_NOT_FOUND", message: "User not found" });
            return;
        }

        let lobby = [...matchLobbies.values()].find((lobby) =>
            lobby.players.some((player) => player.userId === userId)
        );

        if (!lobby) {
            socket.emit("match_error", { type: "LOBBY_NOT_FOUND", message: "You are not in a lobby" });
            return;
        }

        syncLobbyPlayersFromSocketRoom(io, lobby);
        normalizeLobbyPlayers(lobby);

        const entryFee = Number.isFinite(Number(matchData?.entryFee))
            ? Number(matchData.entryFee)
            : Number(lobby.entryFee);

        if (!Number.isFinite(entryFee) || entryFee < 0) {
            socket.emit("match_error", { type: "INVALID_ENTRY_FEE", message: "Invalid entry fee" });
            return;
        }

        if (lobby.ownerId !== userId) {
            socket.emit("match_error", { type: "NOT_LOBBY_OWNER", message: "Only lobby owner can start the match" });
            return;
        }

        // As requested by user: start game immediately with whoever is in the lobby
        const actualPlayersCount = lobby.players.length;
        if (actualPlayersCount < 2) {
             socket.emit("match_error", { type: "NOT_ENOUGH_PLAYERS", message: "At least 2 players required to play" });
             return;
        }

        removeLobbyFromAllQueues(lobby.lobbyId);
        matchLobbies.delete(lobby.lobbyId);

        // CREATE GAME ROOM DIRECTLY WITH LOBBY PLAYERS
        const room = await createGameRoom(io, lobby, actualPlayersCount, entryFee);
        
        // Start turn timer
        import('./playCard.js').then(({ startTurnTimer }) => {
             startTurnTimer(io, room.roomId);
        });

        console.log(`[MATCHMAKING] SUCCESS: Room ${room.roomId} started directly by owner`);
    } catch (error) {
        console.error("[handleFindMatch] error:", error);
        socket.emit("match_error", { type: "SERVER_ERROR", message: "Something went wrong" });
    } finally {
        matchmakingLocks.delete(socketId);
    }
};