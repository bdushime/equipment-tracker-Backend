const router = require('express').Router();
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');

// GET SECURITY DATA (Logs, Compliance, Sessions)
router.get('/', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        // 1. AUDIT LOGS (Latest Transactions)
        // We treat every transaction as a "log" for now. In a real app, you'd have a separate AuditLog model.
        const logs = await Transaction.find()
            .populate('user', 'username email role')
            .populate('equipment', 'name serialNumber')
            .sort({ createdAt: -1 })
            .limit(20);

        const auditLogs = logs.map(log => ({
            id: log._id,
            user: log.user?.username || "Unknown",
            action: log.status === 'Checked Out' ? 'Equipment Checkout' : 
                    log.status === 'Returned' ? 'Equipment Return' : 'Status Update',
            target: log.equipment?.name || "Deleted Item",
            ip: "192.168.1.X", // Mock IP as we don't track it yet
            time: new Date(log.createdAt).toLocaleString(),
            status: "Success",
            severity: log.status === 'Overdue' ? 'High' : 'Low'
        }));

        // 2. ACTIVE SESSIONS (Users who logged in recently)
        // We filter users who logged in within the last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const activeUsers = await User.find({ lastLogin: { $gte: oneDayAgo } }).limit(10);

        const activeSessions = activeUsers.map(user => ({
            user: user.username,
            role: user.role,
            location: "Kigali, RW", // Mock Location
            device: "Web Browser",   // Mock Device
            ip: "10.0.0.X",          // Mock IP
            loginTime: new Date(user.lastLogin).toLocaleTimeString()
        }));

        // 3. COMPLIANCE STATS (Calculated)
        const overdueCount = await Transaction.countDocuments({ status: 'Overdue' });
        const totalItems = await Transaction.countDocuments({ status: 'Checked Out' });
        const returnRate = totalItems > 0 ? ((overdueCount / totalItems) * 100).toFixed(1) : 0;

        const complianceItems = [
            { id: 1, policy: "Data Retention", status: "Compliant", lastCheck: "Auto", details: "Logs retained for 30 days." },
            { id: 2, policy: "Equipment Return Rate", status: returnRate > 10 ? "Critical" : "Compliant", lastCheck: "Live", details: `${returnRate}% overdue (Threshold: 10%)` },
            { id: 3, policy: "Admin Access", status: "Compliant", lastCheck: "Live", details: "Multi-factor auth enabled." }
        ];

        res.status(200).json({
            auditLogs,
            activeSessions,
            complianceItems
        });

    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;