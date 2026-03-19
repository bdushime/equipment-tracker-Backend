const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { verifyToken } = require('../middleware/verifyToken');
const User = require('../models/User');
const { sendNotification } = require('../utils/emailService');

// Get My Notifications
router.get('/', verifyToken, async (req, res) => {
    try {
        const notes = await Notification.find({ recipient: req.user.id })
            .sort({ createdAt: -1 });
        res.status(200).json(notes);
    } catch (err) {
        res.status(500).json(err);
    }
});

// Get Unread Count
router.get('/unread-count', verifyToken, async (req, res) => {
    try {
        const count = await Notification.countDocuments({ recipient: req.user.id, read: false });
        res.status(200).json({ count });
    } catch (err) {
        res.status(500).json(err);
    }
});

// Mark as Read
router.put('/:id/read', verifyToken, async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { read: true });
        res.status(200).json("Marked as read");
    } catch (err) {
        res.status(500).json(err);
    }
});

// Mark ALL as Read
router.put('/mark-all-read', verifyToken, async (req, res) => {
    try {
        await Notification.updateMany(
            { recipient: req.user.id, read: false },
            { $set: { read: true } }
        );
        res.status(200).json("All read");
    } catch (err) {
        res.status(500).json(err);
    }
});
// Send Notification to User
router.post('/send-to-user', verifyToken, async (req, res) => {
    try {
        const { userId, title, message, type } = req.body;

        if (!userId || !title || !message) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Send via email service which also saves to database
        await sendNotification(
            userId,
            user.email,
            title,
            message,
            type || 'info'
        );

        res.status(200).json({ message: "Notification sent successfully" });
    } catch (err) {
        console.error("Send Notification Error:", err);
        res.status(500).json(err);
    }
});

module.exports = router;