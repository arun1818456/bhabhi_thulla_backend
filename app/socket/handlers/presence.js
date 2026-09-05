import User from "../../modules/user/model.js";
import onlinePlayers from "../../data/online_players.js";

// const getFriendIds = (user) =>
//     (user.friends || []).map((friendId) => String(friendId));

// const getPresence = (user, friendIds) => {
//     const friendMap = new Map(
//         (user.friends || []).map((friend) => [String(friend._id || friend), friend])
//     );

//     return friendIds.map((friendId) => {
//         const friend = friendMap.get(friendId);
//         const player = onlinePlayers.get(friendId);

//         return {
//             userId: friendId,
//             name: friend?.name || player?.name || null,
//             isOnline: Boolean(player),
//         };
//     });
// };

export const notifyFriendPresence = async (io, changedUserId, isOnline) => {
    const changedUser = await User.findById(changedUserId)
        .select("_id name avatar flag level")
        .lean();

    if (!changedUser) {
        return;
    }

    const friends = await User.find({ friends: changedUserId })
        .select("_id")
        .lean();

    for (const friend of friends) {
        const friendPlayer = onlinePlayers.get(String(friend._id));

        if (!friendPlayer) {
            continue;
        }

        io.to(friendPlayer.socketId).emit("friend_presence_changed", {
            friend: {
                userId: String(changedUser._id),
                name: changedUser.name,
                avatar: changedUser.avatar,
                flag: changedUser.flag,
                level: changedUser.level,
                isOnline,
            },
        });
    }
};
