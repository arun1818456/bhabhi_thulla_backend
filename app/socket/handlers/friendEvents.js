import onlinePlayers from "../../data/online_players.js";

let socketIO;

export const registerSocketIO = (io) => {
    socketIO = io;
};

export const emitFriendAdded = (userIds) => {
    if (!socketIO) {
        return;
    }

    for (const userId of userIds) {
        const player = onlinePlayers.get(String(userId));
        if (player?.socketId) {
            socketIO.to(player.socketId).emit("friendAdded");
        }
    }
};

export const emitFriendRequestReceived = (userId, request) => {
    if (!socketIO) {
        return;
    }

    const player = onlinePlayers.get(String(userId));
    if (player?.socketId) {
        socketIO.to(player.socketId).emit("friendRequestReceived", request);
    }
};