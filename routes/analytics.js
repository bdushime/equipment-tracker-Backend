const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const Transaction = require('../models/Transaction');
const { verifyToken } = require('../middleware/verifyToken');

router.get('/dashboard', verifyToken, async (req, res) => {
    try {
        // --- 1. Basic Counters ---
        const totalDevices = await Equipment.countDocuments();
        const activeLoans = await Transaction.countDocuments({ status: { $in: ['Borrowed', 'Overdue'] } });
        const overdueLoans = await Transaction.countDocuments({ status: 'Overdue' });
        const lostDevices = await Equipment.countDocuments({ status: 'Lost' });

        // --- 2. Recent Activity (DEBUG MODE 🕵️‍♂️) ---
        console.log("------------------------------------------------");
        console.log("🕵️‍♂️ ANALYTICS ROUTE HIT");

        // A. Check total raw count first (No filters, no population)
        const rawCount = await Transaction.countDocuments();
        console.log(`📊 Total Transactions in DB: ${rawCount}`);

        const rawActivity = await Transaction.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'username email') 
            .populate('equipment', 'name');

        console.log(`✅ Transactions Fetched for Dashboard: ${rawActivity.length}`);

        // B. Inspect the first item if it exists
        if (rawActivity.length > 0) {
            const firstItem = rawActivity[0];
            console.log("📄 SAMPLE TRANSACTION (First Item):");
            console.log("   - ID:", firstItem._id);
            console.log("   - User Field:", firstItem.user); // Is this null?
            console.log("   - Equip Field:", firstItem.equipment); // Is this null?
            console.log("   - Status:", firstItem.status);
        } else {
            console.log("⚠️ No transactions found in query.");
        }
        console.log("------------------------------------------------");

        const recentActivity = rawActivity.map(t => ({
            id: t._id,
            deviceName: t.equipment ? t.equipment.name : "Unknown Device",
            description: `${t.status} by ${t.user ? t.user.username : "Unknown User"}`,
            timestamp: t.updatedAt || t.createdAt,
            returned: t.status === 'Returned'
        }));

        // --- 3. DYNAMIC CHARTS DATA 📊 ---
        const categoryStats = await Equipment.aggregate([
            { $group: { _id: "$type", count: { $sum: 1 } } }
        ]);
        
        const deviceTypes = categoryStats.map(stat => ({
            name: stat._id || "Other",
            count: stat.count
        }));

        // --- 4. DYNAMIC ACTIVITY TRENDS (Last 6 months) ---
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const activityMap = new Map();
        
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const mName = monthNames[d.getMonth()];
            activityMap.set(mName, { name: mName, checkouts: 0, returns: 0 });
        }

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1);
        sixMonthsAgo.setHours(0,0,0,0);

        const recentTransactions = await Transaction.find({
            createdAt: { $gte: sixMonthsAgo }
        });

        recentTransactions.forEach(t => {
            const m = monthNames[t.createdAt.getMonth()];
            if (activityMap.has(m)) {
                const stat = activityMap.get(m);
                stat.checkouts += 1;
            }
            
            if (t.returnTime) {
                const retM = monthNames[t.returnTime.getMonth()];
                if (activityMap.has(retM)) {
                    activityMap.get(retM).returns += 1;
                }
            } else if (t.status === 'Returned') {
                if (activityMap.has(m)) {
                    activityMap.get(m).returns += 1;
                }
            }
        });

        const activityTrends = Array.from(activityMap.values());

        res.json({
            metrics: {
                total: totalDevices,
                active: activeLoans,
                lost: lostDevices,
                overdue: overdueLoans
            },
            recentActivity,
            charts: {
                deviceTypes,   
                activityTrends 
            }
        });

    } catch (err) {
        console.error("Analytics Error:", err);
        res.status(500).json({ message: "Failed to load dashboard data" });
    }
});

module.exports = router;