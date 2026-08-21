


export const findUserIdBySocket = (socketId) => {
    for (const [userId, player] of onlinePlayers.entries()) {
        if (player.socketId === socketId) {
            return userId;
        }
    }

    return null;
};