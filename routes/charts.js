const router = require('express').Router();
const Transaction = require('../models/Transaction');
const Equipment = require('../models/Equipment');
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');

// GET DASHBOARD CHARTS DATA
router.get('/', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        // 1. PIE CHART: Equipment by Category
        // We need to join Transactions with Equipment to get the category of borrowed items
        const categoryStats = await Transaction.aggregate([
            { $match: { status: 'Checked Out' } },
            { $lookup: { from: 'equipment', localField: 'equipment', foreignField: '_id', as: 'eq' } },
            { $unwind: '$eq' },
            {
                $group: {
                    _id: '$eq.category',
                    value: { $sum: 1 }
                }
            }
        ]);

        const pieData = categoryStats.map(stat => ({
            name: stat._id || "Other",
            value: stat.value
        }));

        // 2. BAR CHART: Weekly Usage (Last 7 Days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const weeklyStats = await Transaction.aggregate([
            { $match: { createdAt: { $gte: sevenDaysAgo } } },
            {
                $group: {
                    _id: { $dayOfWeek: "$createdAt" }, // 1 (Sun) to 7 (Sat)
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        // Map MongoDB day numbers (1=Sun) to Names
        const daysMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        
        // Ensure all days have a value (even if 0)
        const areaData = daysMap.map((day, index) => {
            const found = weeklyStats.find(s => s._id === (index + 1));
            return {
                name: day,
                usage: found ? found.count : 0
            };
        });

        res.status(200).json({ pieData, areaData });

    } catch (err) {
        console.error("Chart Data Error:", err);
        res.status(500).json(err);
    }
});

module.exports = router;