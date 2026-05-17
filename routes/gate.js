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

        if (!studentId) {
            return res.status(400).json({ allowed: false, message: "Student ID is required" });
        }

        // 1. Build a search query matching studentId, username, or MongoDB _id (if valid)
        const searchQuery = {
            $or: [
                { studentId: studentId.trim() },
                { username: studentId.trim() }
            ]
        };

        if (studentId.trim().match(/^[0-9a-fA-F]{24}$/)) {
            searchQuery.$or.push({ _id: studentId.trim() });
        }

        const user = await User.findOne(searchQuery);

        if (!user) {
            return res.status(404).json({ 
                allowed: false, 
                message: "Student ID not found in database" 
            });
        }

        // 2. Check for active loans where equipment hasn't been returned (returnTime is null)
        const activeLoans = await Transaction.find({ 
            user: user._id, 
            returnTime: null 
        }).populate('equipment');

        const displayName = user.fullName || user.username || "Unknown Student";

        // 3. The Gatekeeper Logic
        if (activeLoans.length > 0) {
            // STOP! They have items.
            return res.status(200).json({
                allowed: false,
                status: "STOP",
                studentName: displayName,
                department: user.department || 'IT',
                message: "STOP! User has active equipment.",
                items: activeLoans.map(loan => ({
                    id: loan._id,
                    name: loan.equipment?.name || 'Unknown Item',
                    quantity: loan.quantity || 1,
                    date: loan.checkoutTime || loan.createdAt,
                    dept: user.department || 'IT'
                }))
            });
        } else {
            // GO! They are clear.
            return res.status(200).json({
                allowed: true,
                status: "GREEN",
                studentName: displayName,
                message: "Clear. No active equipment."
            });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
    }
});

module.exports = router;