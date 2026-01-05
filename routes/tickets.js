const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const { verifyToken } = require('../middleware/verifyToken');

// POST /api/tickets
router.post('/', verifyToken, async (req, res) => {
    // 1. Log when request hits the route
    console.log("👉 Ticket Route Hit!"); 
    console.log("📦 Request Body:", req.body);
    console.log("👤 User from Token:", req.user);

    try {
        const { subject, message, email } = req.body;

        // 2. Log before creating object
        console.log("🔨 Creating Ticket Object...");
        const newTicket = new Ticket({
            user: req.user.id,
            email: email,
            subject: subject,
            message: message
        });

        // 3. Log before saving
        console.log("💾 Saving to Database...");
        const savedTicket = await newTicket.save();
        
        // 4. Log success
        console.log("✅ Ticket Saved:", savedTicket);
        res.status(201).json(savedTicket);

    } catch (err) {
        // 5. Log errors
        console.error("❌ Error in Ticket Route:", err);
        res.status(500).json(err);
    }
});

// GET /api/tickets/my-tickets
router.get('/my-tickets', verifyToken, async (req, res) => {
    try {
        const tickets = await Ticket.find({ user: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json(tickets);
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;