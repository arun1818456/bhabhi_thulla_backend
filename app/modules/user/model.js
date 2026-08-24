import mongoose from "mongoose";

const userSchema = new mongoose.Schema({

    pid: {
        type: Number,
        required: true,
        unique: true,
        min: 10000000,
        max: 999999999999,
        index: true,
    },

    level: {
        type: Number,
        default: 1,
    },

    totalTrophies: {
        type: Number,
        default: 0,
    },
    flag : {
        type: String,
        default: "AU",
    },

    wins: {
        type: Number,
        default: 0,
    },

    quits: {
        type: Number,
        default: 0,
    },
    thullaCounts: {
        type: Number,
        default: 0,
    },

    bestWinStreak: {
        type: Number,
        default: 0,
    },
    winStreak: {
        type: Number,
        default: 0,
    },
    totalGamesPlayed: {
        type: Number,
        default: 0,
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
    friends: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    }],
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

userSchema.index({ friends: 1 });

export default mongoose.model(
    "User",
    userSchema
);