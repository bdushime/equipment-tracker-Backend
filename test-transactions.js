require('dotenv').config();
const mongoose = require('mongoose');
const Transaction = require('./models/Transaction');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    // --- DYNAMIC ACTIVITY TRENDS (Last 6 months) ---
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const activityMap = new Map();
    
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const mName = monthNames[d.getMonth()];
        activityMap.set(mName, { name: mName, checkouts: 0, failed: 0 });
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0,0,0,0);

    const recentTransactions = await Transaction.find({
        createdAt: { $gte: sixMonthsAgo }
    });

    console.log("Recent txs count:", recentTransactions.length);

    recentTransactions.forEach(t => {
        const m = monthNames[t.createdAt.getMonth()];
        if (activityMap.has(m)) {
            const stat = activityMap.get(m);
            if (["Checked Out", "Returned", "Overdue"].includes(t.status)) {
                stat.checkouts += 1;
            }
            if (t.status === "Overdue" || t.status === "Denied") {
                stat.failed += 1;
            }
        }
    });

    const trendData = Array.from(activityMap.values());
    console.log("TrendData directly:", trendData);
    mongoose.disconnect();
});
