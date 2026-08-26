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

            // Friend ka online/offline status
            const friendPlayer = onlinePlayers.get(
                String(friend._id)
            );

            const friendData = {
                ...friend,
                isOnline: !!friendPlayer?.socketId,
            };

            // Sirf friend ka data + online status
            socketIO
                .to(player.socketId)
                .emit("friendAdded", friendData);
        }
    } catch (error) {
        console.error(
            "emitFriendAdded error:",
            error
        );
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

export const removeFriendFromList = (userId, removedFriendId) => {
    if (!socketIO) {
        console.log("❌ socketIO not initialized");
        return;
    }

    const player = onlinePlayers.get(String(userId));

    if (!player?.socketId) {
        console.log(
            `❌ User ${userId} is offline or socket not found`
        );
        return;
    }

    socketIO.to(player.socketId).emit("friendRemoved", {
        userId: String(removedFriendId),
    });

    console.log(
        `✅ friendRemoved sent to ${userId}, removed friend: ${removedFriendId}`
    );
};