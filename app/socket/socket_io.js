import { Server } from "socket.io";
import { handleJoinGame } from "./handlers/joinGame.js";
import { handleFindMatch } from "./handlers/findMatch.js";
import { handlePlayCard } from "./handlers/playCard.js";
import { handleDisconnect } from "./handlers/disconnect.js";
import { handleCreateLobby } from "./handlers/createLobby.js";
import { registerSocketIO } from "./handlers/friendEvents.js";

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
        // check user online 
        socket.on("join_game", (playerData) => {
            handleJoinGame(io, socket, playerData).catch((error) => {
                console.error("join_game error:", error);
            });
        });
        // create a Lobby 
        socket.on("create_lobby", (playerData) => {
            handleCreateLobby(io, socket, playerData);
        });


        socket.on("find_match", (matchData) => {
            handleFindMatch(io, socket, matchData);
        });

        socket.on("play_card", (data) => {
            handlePlayCard(io, socket, data);
        });

        socket.on("disconnect", () => {
            handleDisconnect(io, socket).catch((error) => {
                console.error("disconnect presence error:", error);
            });
        });
    });

    return io;
};