import { Server } from "socket.io";
import { handleJoinGame } from "./handlers/joinGame.js";
import { handleFindMatch } from "./handlers/findMatch.js";
import { handlePlayCard } from "./handlers/playCard.js";
import { handleDisconnect } from "./handlers/disconnect.js";
import { handleCreateLobby } from "./handlers/createLobby.js";

export const initSocketIO = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
        },
    });

    io.on("connection", (socket) => {
        console.log("Player connected!");
        console.log("Socket ID:", socket.id);
        // check user online 
        socket.on("join_game", (playerData) => {
            handleJoinGame(socket, playerData);
        });
        // create a Lobby 
        socket.on("join_game", (playerData) => {
            handleCreateLobby(io, socket, playerData);
        });





        socket.on("find_match", (matchData) => {
            handleFindMatch(io, socket, matchData);
        });

        socket.on("play_card", (data) => {
            handlePlayCard(io, socket, data);
        });

        socket.on("disconnect", () => {
            handleDisconnect(socket);
        });
    });

    return io;
};