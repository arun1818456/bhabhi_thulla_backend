import onlinePlayers from "../../data/online_players.js";
import User from "../../modules/user/model.js";

let socketIO;

export const registerSocketIO = (io) => {
    socketIO = io;
};

export const emitFriendAdded = async (userIds) => {
    if (!socketIO) {
        return;
    }

    try {
        // Dono users ka data fetch karo
        const users = await User.find({
            _id: { $in: userIds },
        })
            .select("_id pid name avatar flag level")
            .lean();

        for (const userId of userIds) {
            // Current user's socket
            const player = onlinePlayers.get(String(userId));

            if (!player?.socketId) {
                continue;
            }

            // Current user ke opposite wala user = friend
            const friend = users.find(
                (user) => String(user._id) !== String(userId)
            );

            if (!friend) {
                continue;
            }

            // Sirf friend ka data send karo
            socketIO
                .to(player.socketId)
                .emit("friendAdded", friend);
        }
    } catch (error) {
        console.error("emitFriendAdded error:", error);
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