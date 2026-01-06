const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const { verifyToken } = require('../middleware/verifyToken');

// POST /api/tickets
router.post('/', async (req, res) => {
    console.log("👉 Ticket Route Hit (Security Bypassed)!"); 

    try {
        const { subject, message, email } = req.body;

        const newTicket = new Ticket({
            // FIXME: HARDCODED USER ID FOR TESTING
            // Open MongoDB Compass, copy an _id from your 'users' collection, and paste it here
            user: "695501a1db6a8e385fd2f9e7", // <--- PASTE A REAL USER ID HERE
            email: email,
            subject: subject,
            message: message
        });

        const savedTicket = await newTicket.save();
        console.log("✅ Ticket Saved:", savedTicket);
        res.status(201).json(savedTicket);

    } catch (err) {
        console.error("❌ Error:", err);
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