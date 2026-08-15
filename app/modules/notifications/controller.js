import Notification from './model.js';

export const getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const notifications = await Notification.find({ userId }).sort({ createdAt: -1 });
        res.json({ success: true, notifications });
        await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
    } catch (error) {
        console.error("Error fetching notifications:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};


export const deleteNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const notificationId = req.params.id; 
        const notification = await Notification.findOneAndDelete({ _id: notificationId, userId });

        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }
        res.json({ success: true, message: "Notification deleted successfully" });
    } catch (error) {
        console.error("Error deleting notification:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};
export const deleteAllNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        await Notification.deleteMany({ userId });
        res.json({ success: true, message: "All notifications deleted successfully" });
    } catch (error) {
        console.error("Error deleting all notifications:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};
