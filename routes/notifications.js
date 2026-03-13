const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const User = require('../models/User'); // 👈 Imported User model
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole'); // 👈 Imported checkRole
const { sendNotification } = require('../utils/emailService'); // 👈 Imported Email Service

// ==========================================
// 1. SEND NOTIFICATION (Admin/IT -> User)
// ==========================================
router.post('/send-to-user', verifyToken, checkRole(['Admin', 'IT_Staff']), async (req, res) => {
    try {
        const { userId, title, message, type } = req.body;

        // 1. Validation
        if (!userId || !title || !message) {
            return res.status(400).json({ message: "Missing required fields (userId, title, message)" });
        }

        // 2. Find User
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // 3. Save to Database (So it appears in their notification bell)
        // We use 'recipient' to match your existing schema
        const newNotification = new Notification({
            recipient: userId, 
            title: title,
            message: message,
            type: type || 'info',
            read: false
        });
        await newNotification.save();

        // 4. Send Email (Background task)
        // We use catch() so if email fails (e.g. bad internet), the API still succeeds
        sendNotification(
            user._id,
            user.email,
            title,
            message,
            type || 'info'
        ).catch(err => console.error("Email failed:", err.message));

        res.status(200).json({ message: "Notification sent successfully" });

    } catch (err) {
        console.error("Notification Error:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// ==========================================
// 2. Get My Notifications
// ==========================================
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

// ==========================================
// 3. Mark Single as Read
// ==========================================
router.put('/:id/read', verifyToken, async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { read: true });
        res.status(200).json("Marked as read");
    } catch (err) {
        res.status(500).json(err);
    }
});

// ==========================================
// 4. Mark ALL as Read
// ==========================================
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

// ==========================================
// 5. CONTACT ALL ADMINS (For Staff/Users to Reply) <-- NEW FEATURE
// ==========================================
router.post('/contact-admins', verifyToken, async (req, res) => {
    try {
        const { subject, message } = req.body;
        const sender = await User.findById(req.user.id);

        if (!subject || !message) {
            return res.status(400).json({ message: "Subject and message are required." });
        }

        // 1. Find ALL Admins
        const admins = await User.find({ role: 'Admin' });

        if (admins.length === 0) {
            return res.status(404).json({ message: "No admins found to contact." });
        }

        // 2. Loop through Admins and Notify them
        // We map over the array to trigger all notifications in parallel
        const notifications = admins.map(async (admin) => {
            // A. Save to DB (So Admin sees it in their bell icon)
            await Notification.create({
                recipient: admin._id,
                title: `Message from ${sender.username || sender.email}`,
                message: `Subject: ${subject}\n\n${message}`,
                type: 'info',
                read: false
            });

            // B. Send Email
            return sendNotification(
                admin._id,
                admin.email,
                `New Message: ${subject}`,
                `You received a message from ${sender.username} (${sender.role}):\n\n${message}`,
                'info'
            ).catch(err => console.error(`Failed to email admin ${admin.email}`, err));
        });

        // Wait for all database writes and email triggers to finish
        await Promise.all(notifications);

        res.status(200).json({ message: "Admins have been notified." });

    } catch (err) {
        console.error("Contact Admin Error:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

module.exports = router;