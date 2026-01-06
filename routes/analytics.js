const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const Transaction = require('../models/Transaction');
const { verifyToken } = require('../middleware/verifyToken');

// GET /api/analytics/dashboard
router.get('/dashboard', verifyToken, async (req, res) => {
    try {
        // 1. Calculate Metrics
        const totalDevices = await Equipment.countDocuments();
        
        // Active = Borrowed OR Overdue
        const activeLoans = await Transaction.countDocuments({ 
            status: { $in: ['Borrowed', 'Overdue'] } 
        });

        // Overdue specifically
        const overdueLoans = await Transaction.countDocuments({ status: 'Overdue' });

        // Lost items (Looking at Equipment status)
        const lostDevices = await Equipment.countDocuments({ status: 'Lost' });

        // 2. Fetch Recent Activity (Last 5 transactions)
        const rawActivity = await Transaction.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'name email') // Get student name
            .populate('equipment', 'name'); // Get device name

        // Format activity for the frontend
        const recentActivity = rawActivity.map(t => ({
            id: t._id,
            deviceName: t.equipment ? t.equipment.name : "Unknown Device",
            description: `${t.status} by ${t.user ? t.user.name : "Unknown User"}`,
            timestamp: t.updatedAt || t.createdAt,
            returned: t.status === 'Returned'
        }));

        res.json({
            metrics: {
                total: totalDevices,
                active: activeLoans,
                lost: lostDevices,
                overdue: overdueLoans
            },
            recentActivity
        });

    } catch (err) {
        console.error("Analytics Error:", err);
        res.status(500).json({ message: "Failed to load dashboard data" });
    }
});

module.exports = router;