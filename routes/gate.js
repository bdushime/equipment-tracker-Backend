const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const User = require('../models/User');

// @route   GET /api/gate/check-status/:studentId
// @desc    Check if a student is allowed to leave (Active Loans Check)
// @access  Public (or restricted to Security Role in future)
router.get('/check-status/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;

        // 1. Find the User by their Student ID Card Number
        const user = await User.findOne({ studentId: studentId });

        if (!user) {
            return res.status(404).json({ 
                allowed: false, 
                message: "Student ID not found in database" 
            });
        }

        // 2. Check for any 'Active' transactions for this user
        // We use .populate('equipment') so we can see the NAMES of the items they have
        const activeLoans = await Transaction.find({ 
            user: user._id, 
            status: 'Active' 
        }).populate('equipment');

        // 3. The Gatekeeper Logic
        if (activeLoans.length > 0) {
            // STOP! They have items.
            return res.status(200).json({
                allowed: false,
                status: "RED",
                message: "STOP! User has active equipment.",
                items: activeLoans.map(loan => loan.equipment.name) // Returns list of item names
            });
        } else {
            // GO! They are clear.
            return res.status(200).json({
                allowed: true,
                status: "GREEN",
                message: "Clear. No active equipment."
            });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
    }
});

module.exports = router;