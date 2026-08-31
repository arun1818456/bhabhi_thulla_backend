import { Server } from "socket.io";
import { handleJoinGame } from "./handlers/joinGame.js";
import { handleFindMatch } from "./handlers/findMatch.js";
import { handlePlayCard } from "./handlers/playCard.js";
import { handleDisconnect } from "./handlers/disconnect.js";
import { handleCreateLobby } from "./handlers/createLobby.js";
import { registerSocketIO } from "./handlers/friendEvents.js";
import { handleInvitePlayer } from "./handlers/onInvitePlayer.js";
import { handleAcceptInvite } from "./handlers/acceptInvitation.js";
import { handleRejectInvite } from "./handlers/onrejectLobbyInvite.js"

export const
    initSocketIO = (server) => {
        const io = new Server(server, {
            cors: {
                origin: "*",
            },
        });
        registerSocketIO(io);

        io.on("connection", (socket) => {
            console.log("Player connected!");
            console.log("Socket ID:", socket.id);

            // create a Lobby 
            socket.on("create_lobby", (playerData) => {
                handleCreateLobby(io, socket, playerData);
            });
            //  on Invite Player 
            socket.on("invite_player", (targetUserId) => {
                console.log(`invitePlayer event received for targetUserId: ${targetUserId.id}`);
                handleInvitePlayer(io, socket, targetUserId);
            });

            socket.on("acceptInvite", (lobbyId) => {
                handleAcceptInvite(io, socket, lobbyId);
            });


            socket.on("reject_invite", async (data) => {
                handleRejectInvite(io, socket, data);
            });

            socket.on("leaveLobby", (lobbyId) => {
                handleLeaveLobby(io, socket, lobbyId);
            });

            socket.on("find_match", (matchData) => {
                handleFindMatch(io, socket, matchData);
            });

            socket.on("play_card", (data) => {
                handlePlayCard(io, socket, data);
            });





            // check user online or offline
            socket.on("join_game", (playerData) => {
                handleJoinGame(io, socket, playerData).catch((error) => {
                    console.error("join_game error:", error);
                });
            });

            socket.on("disconnect", () => {
                handleDisconnect(io, socket).catch((error) => {
                    console.error("disconnect presence error:", error);
                });
            });
        });

        return io;
    };