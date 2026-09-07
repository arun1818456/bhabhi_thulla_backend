import onlineUsers from "../../data/online_players.js";
import matchLobbies from "../../data/match_lobbies.js";
import matchmakingQueue from "../../data/matchmaking_queue.js";
import rooms from "../../data/match_rooms.js";
import { createDeck, shuffleDeck } from "../../game/cards.js";

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 8;

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

        const entryFee = Number(matchData?.entryFee);
        const playersCount = Number(matchData?.playersCount);

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
            socket.emit("match_status", {
                status: "searching",
                lobbyId: lobby.lobbyId,
                entryFee,
                playersCount,
            });

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
            io.to(lobby.lobbyId).emit("match_status", {
                status: "searching",
                lobbyId: lobby.lobbyId,
                players: totalPlayers,
                requiredPlayers: playersCount,
                entryFee,
            });

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

        const roomPlayers = [];

        for (const selected of selectedLobbies) {
            const selectedLobby = matchLobbies.get(selected.lobbyId);

            if (!selectedLobby) {
                continue;
            }

            for (const player of selectedLobby.players) {
                roomPlayers.push({
                    userId: player.userId,
                    name: player.name,
                    socketId: player.socketId,
                });
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
                io.sockets.sockets.get(
                    player.socketId
                );

            if (!playerSocket) {
                continue;
            }

            playerSocket.join(roomId);

            // =========================
            // MATCH STARTED
            // =========================

            playerSocket.emit("match_started", {
                roomId,
                yourUserId: player.userId,
                yourSeat: player.seat,
                players: publicPlayers,
                playersCount,
                entryFee,
                currentTurn,
            });

            // =========================
            // ONLY THIS PLAYER'S CARDS
            // =========================

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
            matchLobbies.delete(
                selected.lobbyId
            );
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