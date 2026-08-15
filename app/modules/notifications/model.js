import mongoose from "mongoose";

const notificationModel = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    read: {
        type: Boolean,
        default: false
    },
    type: {
        type: String,
        default: "INFO"
    }
}, {
    versionKey: false,
});

export default mongoose.model("notifications", notificationModel);
// Notification Types:
// INFO: General information or updates
// ALERT: Important alerts or warnings
// PROMOTION: Promotional messages or offers
// REMINDER: Reminders for events or tasks
// ADDMEMBERTOGROUP: Notification for adding a member to a group
// EXPENSEADDED: Notification for adding an expense
// EXPENSEUPDATED: Notification for updating an expense
// EXPENSEDELETED: Notification for deleting an expense
// CREATEGROUP: Notification for creating a group
// DELETEGROUP: Notification for deleting a group
//