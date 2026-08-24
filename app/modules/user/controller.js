import User from "./model.js";
import FriendRequest from "./requestModel.js";
import { getUniqueGuestName } from "../../utils/getUniqueName.js";
import { sendResponse } from "../../utils/sendResposeType.js";
import { emitFriendAdded, emitFriendRequestReceived, } from "../../socket/handlers/friendEvents.js";
import { generateUniquePid } from "../../utils/getUniquePID.js";

export const guestLogin = async (req, res) => {
    try {
        const { deviceId } = req.body;
        if (!deviceId) {
            return sendResponse(res, 400, false, "deviceId is required", null);
        }
        let user = await User.findOne({
            deviceId: deviceId,
            loginType: "guest",
        });
        if (!user) {
            const randomGuestName = await getUniqueGuestName();
            const pid = await generateUniquePid();
            user = await User.create({
                pid,
                deviceId: deviceId,
                name: randomGuestName,
                loginType: "guest",
                avatar: "p1",
                coins: 1000,
                diamonds: 10,
                createdAt: new Date(),
                lastLoginAt: new Date(),
            });

        } else {
            if (!user.pid) {
                user.pid = await generateUniquePid();
            }
            user.lastLoginAt = new Date();
            await user.save();
        }
        return sendResponse(res, 200, true, "Guest login successful", user);

    } catch (error) {
        console.error("Error during guest login:", error);
        return sendResponse(res, 500, false, "Error during guest login", null, error.message);

    }
};

export const getUserByPID = async (req, res) => {
    try {
        const { PID } = req.params;
        const user = await User.findOne({ pid: PID });
        if (!user) {
            return sendResponse(res, 400, false, "User not found");
        }
        const data = {
            id: user._id,
            pid: user.pid,
            name: user.name,
            avatar: user.avatar,
            level: user.level,
            flag: user.flag,
        }

        return sendResponse(res, 200, true, "User found", data);
    } catch (error) {
        console.error("Error fetching user by PID:", error);
        return sendResponse(res, 500, false, "Error fetching user by PID", null, error.message);
    }
};

export const sendRequest = async (req, res) => {
    try {
        const { senderId, receiverId } = req.body || {};

        if (!senderId || !receiverId) {
            return sendResponse(res, 400, false, "senderId and receiverId are required");
        }

        if (String(senderId) === String(receiverId)) {
            return sendResponse(res, 400, false, "You cannot send a request to yourself");
        }

        const [sender, receiver] = await Promise.all([
            User.findById(senderId).select("friends"),
            User.findById(receiverId).select("friends"),
        ]);

        if (!sender || !receiver) {
            return sendResponse(res, 404, false, "Sender or receiver not found");
        }

        if ((sender.friends || []).some((friendId) => String(friendId) === String(receiverId))) {
            return sendResponse(res, 400, false, "Users are already friends");
        }

        const existingRequest = await FriendRequest.findOne({
            $or: [
                { senderId, receiverId },
                { senderId: receiverId, receiverId: senderId },
            ],
            status: "pending",
        });
        if (existingRequest) {
            return sendResponse(res, 400, false, "Friend request already sent");
        }

        const request = await FriendRequest.create({ senderId, receiverId });
        emitFriendRequestReceived(receiverId, request);
        return sendResponse(res, 201, true, "Friend request sent", request);
    } catch (error) {
        console.error("Error sending friend request:", error);
        return sendResponse(res, 500, false, "Error sending friend request", null, error.message);
    }
};

export const acceptRequest = async (req, res) => {
    try {
        const { requestId, receiverId } = req.body || {};

        if (!requestId || !receiverId) {
            return sendResponse(res, 400, false, "requestId and receiverId are required");
        }

        const request = await FriendRequest.findOne({
            _id: requestId,
            receiverId,
            status: "pending",
        });
        if (!request) {
            return sendResponse(res, 400, false, "Friend request not found");
        }

        const [sender, receiver] = await Promise.all([
            User.findByIdAndUpdate(request.senderId, { $addToSet: { friends: request.receiverId } }, { new: true }),
            User.findByIdAndUpdate(request.receiverId, { $addToSet: { friends: request.senderId } }, { new: true }),
        ]);

        if (!sender || !receiver) {
            return sendResponse(res, 400, false, "Sender or receiver not found");
        }

        await FriendRequest.findByIdAndDelete(request._id);
        emitFriendAdded([request.senderId, request.receiverId]);
        return sendResponse(res, 200, true, "Friend request accepted", {
            requestId: request._id,
            friends: receiver.friends,
        });
    } catch (error) {
        console.error("Error accepting friend request:", error);
        return sendResponse(res, 500, false, "Error accepting friend request", null, error.message);
    }
};

export const rejectRequest = async (req, res) => {
    try {
        const { requestId, receiverId } = req.body || {};

        if (!requestId || !receiverId) {
            return sendResponse(res, 400, false, "requestId and receiverId are required");
        }

        const request = await FriendRequest.findOneAndDelete({
            _id: requestId,
            receiverId,
            status: "pending",
        });
        if (!request) {
            return sendResponse(res, 404, false, "Friend request not found");
        }

        return sendResponse(res, 200, true, "Friend request rejected", {
            requestId: request._id,
        });
    } catch (error) {
        console.error("Error rejecting friend request:", error);
        return sendResponse(res, 500, false, "Error rejecting friend request", null, error.message);
    }
};


export const getRequests = async (req, res) => {
    try {
        const { receiverId } = req.query;

        if (!receiverId) {
            return sendResponse(res, 400, false, "receiverId is required");
        }

        const requests = await FriendRequest.find({ receiverId, status: "pending" })
            .populate("senderId", "name avatar pid flag level")
            .sort({ createdAt: -1 });

        return sendResponse(res, 200, true, "Friend requests fetched", requests);
    } catch (error) {
        console.error("Error fetching friend requests:", error);
        return sendResponse(res, 500, false, "Error fetching friend requests", null, error.message);
    }
};

export const getFriends = async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return sendResponse(res, 400, false, "userId is required");
        }

        const user = await User.findById(userId)
            .populate("friends", "name avatar")
            .select("friends");

        if (!user) {
            return sendResponse(res, 404, false, "User not found");
        }

        return sendResponse(res, 200, true, "Friends fetched", user.friends);
    } catch (error) {
        console.error("Error fetching friends:", error);
        return sendResponse(res, 500, false, "Error fetching friends", null, error.message);
    }
};




// // ✅ REGISTER USER
// export const RegisterUser = async (req, res) => {
//   try {
//     console.log("📥 Register user request received:", req.body || {});
//     let { name, email, password, profileUrl, deviceToken, expenseList = [] } = req.body;

//     // sanitize
//     email = email?.trim()?.toLowerCase();

//     if (!name || !email || !password) {
//       return sendResponse(res, 400, false, "All fields are required");
//     }

//     // check existing user
//     const existingUser = await User.findOne({ $or: [{ email }] });
//     if (existingUser) {
//       return sendResponse(res, 400, false, `Email already exists`);
//     }

//     const hashedPassword = await bcrypt.hash(password, 10);
//     const baseUserName = await getUniqueName(name);
//     const newUser = await User.create({
//       name,
//       userName: baseUserName,
//       email,
//       password: hashedPassword,
//       profileUrl: profileUrl || null,
//       deviceToken: deviceToken || null,
//       updatedAt: Date.now(),
//     });

//     await addExpenseWithoutLogging(newUser._id, expenseList || []);

//     const token = jwtTokenGenerator(newUser._id);
//     const userObj = newUser.toObject();
//     delete userObj.password;

//     const userData = {
//       token,
//       ...userObj,
//     };

//     return sendResponse(res, 200, true, "User registered successfully", userData);
//   } catch (error) {
//     console.error(error);
//     return sendResponse(res, 500, false, "Error registering user", null, error.message);
//   }
// };

// // ✅ LOGIN USER
// export const loginUser = async (req, res) => {
//   try {
//     const { email, password, deviceToken, expenses } = req.body || {};

//     if (!email || !password) {
//       return sendResponse(res, 400, false, "Email and password are required");
//     }

//     const user = await User.findOne({ email: email.trim().toLowerCase() });
//     if (!user) return sendResponse(res, 400, false, "Invalid email or password");

//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) return sendResponse(res, 400, false, "Invalid email or password");

//     user.deviceToken = deviceToken || user.deviceToken;
//     // user.expenseList = expenseList || user.expenseList;
//     await addExpenseWithoutLogging(user._id, expenses || []);
//     await user.save();

//     const token = jwtTokenGenerator(user._id);
//     const userObj = user.toObject();
//     delete userObj.password;
//     const expensesList = await Expense.find({ userId: user._id }).sort({ date: -1 });
//     const userData = {
//       token,
//       ...userObj,
//       expenseList: expensesList || [],
//     };

//     return sendResponse(res, 200, true, "Login successful", userData);
//   } catch (error) {
//     console.error(error);
//     return sendResponse(res, 500, false, "Error logging in user", null, error.message);
//   }
// };

// // ✅ LOGOUT USER
// export const logoutUser = async (req, res) => {
//   const { expenses = [] } = req.body || {};
//   console.log("📥 Logout request received");
//   try {
//     const userId = req.user.id;
//     // add all expense if not added on db
//     await addExpenseWithoutLogging(userId, expenses || []);

//     await User.findByIdAndUpdate(userId, { deviceToken: null });
//     return sendResponse(res, 200, true, "Logout successful");
//   } catch (error) {
//     return sendResponse(res, 500, false, "Error logging out", null, error.message);
//   }
// };


// // ✅ UPDATE USER
// export const updateUser = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     console.log("📥 Update user request received:", req.body || {});

//     const { name, profileUrl } = req.body || {};

//     if (!name) {
//       return sendResponse(res, 400, false, "Name is required to update");
//     }

//     const updateData = {
//       ...(name && { name }),
//       ...(profileUrl && { profileUrl }),
//       updatedAt: Date.now(),
//     };

//     const updatedUser = await User.findByIdAndUpdate(
//       userId,
//       updateData,
//       { returnDocument: "after" }
//     );

//     const userObj = updatedUser.toObject();
//     delete userObj.password;

//     return sendResponse(
//       res,
//       200,
//       true,
//       "User updated successfully",
//       userObj
//     );
//   } catch (error) {
//     console.error(error);
//     return sendResponse(
//       res,
//       500,
//       false,
//       "Error updating user",
//       null,
//       error.message
//     );
//   }
// };
// // ✅ GOOGLE LOGIN USER
// export const googleLoginUser = async (req, res) => {
//   console.log("📥 Google login request received:", req.body);

//   try {
//     let { email, name, profileUrl, expenses, deviceToken } = req.body || {};

//     if (!email || !name) {
//       return sendResponse(res, 400, false, "Email and name are required");
//     }

//     email = email.trim().toLowerCase();

//     // 🔎 Check user exists
//     let user = await User.findOne({ email });
//     const baseUserName = await getUniqueName(name);

//     // 🔥 If NEW Google user → create new account
//     if (!user) {
//       user = await User.create({
//         name,
//         userName: baseUserName,
//         email,
//         deviceToken: deviceToken || null,
//         password: "google_oauth_dummy_passwordW$^%&R^&Y*U(", // dummy password
//         profileUrl: profileUrl || null,
//       });
//     }
//     user.deviceToken = deviceToken || user.deviceToken;
//     user.save();
//     // 🔥 Generate JWT Token
//     const token = jwtTokenGenerator(user._id);
//     await addExpenseWithoutLogging(user._id, expenses);
//     const expensesList = await Expense.find({ userId: user._id }).sort({ date: -1 });
//     const userObj = user.toObject();
//     delete userObj.password;

//     return sendResponse(res, 200, true, "Google login successful", { token, ...userObj, expenseList: expensesList || [] });

//   } catch (error) {
//     console.error(error);
//     return sendResponse(res, 500, false, "Error in Google login", null, error.message);
//   }
// };
// // ✅ GET USER DETAILS
// export const getUserDetails = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const user = await User.findById(userId).select("-password");
//     if (!user) {
//       return sendResponse(res, 404, false, "User not found");
//     }
//     return sendResponse(res, 200, true, "User details fetched successfully", user.toObject());
//   } catch (error) {
//     console.error(error);
//     return sendResponse(res, 500, false, "Error fetching user details", null, error.message);
//   }
// };

// export const forgotPassword = async (req, res) => {
//   try {
//     const { email } = req.body || {};
//     if (!email) {
//       return sendResponse(res, 400, false, "Email is required");
//     }

//     const user = await User.findOne({ email: email.trim().toLowerCase() });
//     if (!user) {
//       return sendResponse(res, 404, false, "User with this email does not exist");
//     }

//     // Here you would typically generate a password reset token and send an email to the user
//     // For simplicity, we'll just return a success message

//     return sendResponse(res, 200, true, "Password reset instructions sent to your email (simulated)");
//   } catch (error) {
//     console.error(error);
//     return sendResponse(res, 500, false, "Error processing forgot password request", null, error.message);
//   }
// };

// export const searchUser = async (req, res) => {
//   try {
//     const { query } = req.params || {};
//     if (!query) {
//       return sendResponse(res, 400, false, "Search query is required");
//     }
//     //search by  email or userName
//     const users = await User.find({
//       $or: [
//         { email: { $regex: query, $options: "i" } },
//         { userName: { $regex: query, $options: "i" } }
//       ]
//     }).select("name email profileUrl userName");
//     return sendResponse(res, 200, true, "User search results", users);
//   } catch (error) {
//     console.error(error);
//     return sendResponse(res, 500, false, "Error searching users", null, error.message);
//   }
// };

// //delete User with existing expenses notifications and all data
// export const deleteUser = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const user = await User.findById(userId);
//     if (!user) {
//       return sendResponse(res, 404, false, "User not found");
//     }

//     // Delete all expenses related to the user if group id not present
//     await Expense.deleteMany({
//       userId,
//       $or: [
//         { groupId: null },
//         { groupId: { $exists: false } }
//       ]
//     });

//     // Delete all notifications related to the user
//     await Notification.deleteMany({ userId });

//     // Finally remove the user document
//     await User.findByIdAndDelete(userId);

//     return sendResponse(res, 200, true, "User and related personal data deleted successfully");
//   } catch (error) {
//     return sendResponse(res, 500, false, "Error deleting user", null, error.message);
//   }
// };

