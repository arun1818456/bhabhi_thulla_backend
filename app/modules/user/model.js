import mongoose from "mongoose";

const userSchema = new mongoose.Schema({

    userId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },

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
        type: Number,
        default: 1,
    },

    coins: {
        type: Number,
        default: 1000,
    },

    createdAt: {
        type: Date,
        default: Date.now,
    },

    lastLoginAt: {
        type: Date,
        default: Date.now,
    },

});

export default mongoose.model(
    "User",
    userSchema
);