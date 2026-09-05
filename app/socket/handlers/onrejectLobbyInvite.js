import onlinePlayers from "../../data/online_players.js";
import User from "../../modules/user/model.js";
import { findUserIdBySocket } from "../../utils/getUserIdBySocket.js";

export const handleRejectInvite = async (io, socket, data) => {
    try {
        // =====================================================
        // RECEIVE DATA
        // =====================================================

        console.log(
            "Received reject_invite event:",
            data
        );

        // Flutter:
        // socket.emit("reject_invite", {
        //     ownerId: ownerId,
        // });

        // =====================================================
        // GET OWNER ID
        // =====================================================

        const ownerId =
            typeof data === "object"
                ? data?.ownerId
                : data;

        // =====================================================
        // GET CURRENT USER / REJECTED USER ID
        // =====================================================

        const rejectedBy = findUserIdBySocket(socket.id);

        console.log("Owner ID:", ownerId);
        console.log("Rejected By:", rejectedBy);

        // =====================================================
        // VALIDATION
        // =====================================================

        if (!rejectedBy) {
            console.log(
                "Rejected user not found for socket:",
                socket.id
            );
            return;
        }

        if (!ownerId) {
            console.log(
                "Owner ID is required"
            );
            return;
        }

        // =====================================================
        // FIND LOBBY OWNER
        // =====================================================

        const owner = onlinePlayers.get(
            String(ownerId)
        );

        if (!owner) {
            console.log(
                "Lobby owner is offline:",
                ownerId
            );
            return;
        }

        console.log(
            "Lobby owner found:",
            owner
        );

        // =====================================================
        // GET REJECTED USER FROM DATABASE
        // =====================================================

        const userData = await User
            .findById(rejectedBy)
            .select("name avatar flag level")
            .lean();

        if (!userData) {
            console.log(
                "Rejected user not found in database:",
                rejectedBy
            );
            return;
        }

        // =====================================================
        // RESPONSE DATA
        // =====================================================

        const responseData = {
            rejectedBy: userData.name ?? "Unknown",
            avatar: userData.avatar ?? "",
            flag: userData.flag ?? "AU",
            level: userData.level ?? 1,
        };

        console.log(
            "Sending invite_rejected:",
            responseData
        );

        // =====================================================
        // SEND TO LOBBY OWNER
        // =====================================================

        io.to(owner.socketId).emit(
            "invite_rejected",
            responseData
        );

        console.log(
            `Invite rejection sent to owner ${ownerId}`
        );

    } catch (error) {
        console.error(
            "Error handling reject_invite:",
            error
        );
    }
};

