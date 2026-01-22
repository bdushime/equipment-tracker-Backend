const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { verifyToken } = require('../middleware/verifyToken');

// Get My Notifications
router.get('/', verifyToken, async (req, res) => {
    try {
        const notes = await Notification.find({ recipient: req.user.id })
            .sort({ createdAt: -1 })
            .limit(20);
        res.status(200).json(notes);
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

module.exports = router;