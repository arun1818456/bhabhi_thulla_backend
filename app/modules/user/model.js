import mongoose from "mongoose";

const userSchema = new mongoose.Schema({

    deviceId: {
        type: String,
        required: true,
        index: true,
    },

    name: {
        type: String,
        required: true,
    },

    loginType: {
        type: String,
        default: "guest",
    },

    avatar: {
        type: String,
        default: "p1",
    },

    coins: {
        type: Number,
        default: 1000,
    },
    diamonds: {
        type: Number,
        default: 10,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },

    lastLoginAt: {
        type: Date,
        default: Date.now,
    },

}, {
    versionKey: false,
});

export default mongoose.model(
    "User",
    userSchema
);