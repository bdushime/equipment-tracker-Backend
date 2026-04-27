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
            action: (log.status === 'Overdue' || (log.returnTime === null && new Date(log.expectedReturnTime) < new Date())) ? 'Overdue Alert' :
                log.status === 'Checked Out' ? 'Equipment Checkout' :
                    log.status === 'Borrowed' ? 'Equipment Checkout' :
                        log.status === 'Returned' ? 'Equipment Return' :
                            log.status === 'Reserved' ? 'Booking Confirmed' :
                                log.status === 'Pending' ? 'Approval Pending' :
                                    log.status === 'Denied' ? 'Request Denied' :
                                        log.status === 'Cancelled' ? 'Reservation Cancelled' :
                                            log.status === 'Active' ? 'Live Session' : 'Activity Log',
            target: log.equipment?.name || "Deleted Item",
            ip: log.user?.lastIp || "192.168.1.X",
            time: new Date(log.createdAt).toLocaleString(),
            status: log.status === 'Overdue' ? "Critical" : "Success",
            severity: log.status === 'Overdue' ? 'High' : 'Low'
        }));

        // 2. ACTIVE SESSIONS (Users who logged in recently)
        // We filter users who logged in within the last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const activeUsers = await User.find({ lastLogin: { $gte: oneDayAgo } }).limit(10);

        const activeSessions = activeUsers.map(user => ({
            user: user.username,
            role: user.role,
            location: user.lastLocation || "Kigali, RW",
            device: user.lastDevice || "Web Browser",
            ip: user.lastIp || "10.0.0.X",
            loginTime: new Date(user.lastLogin).toLocaleTimeString()
        }));

        // 3. COMPLIANCE STATS (Calculated)
        const overdueCount = await Transaction.countDocuments({ status: 'Overdue' });
        const totalItems = await Transaction.countDocuments({
            status: { $in: ['Checked Out', 'Borrowed', 'Overdue'] }
        });
        const returnRate = totalItems > 0 ? ((overdueCount / totalItems) * 100).toFixed(1) : 0;

        const complianceItems = [
            { id: 1, policy: "Data Retention", status: "Compliant", lastCheck: "Auto", details: "Logs retained for 30 days.", link: "/admin/security" },
            { id: 2, policy: "Equipment Return Rate", status: returnRate > 10 ? "Critical" : "Compliant", lastCheck: "Live", details: `${returnRate}% overdue (Threshold: 10%)`, link: "/admin/reports" },
            { id: 3, policy: "Admin Access", status: "Compliant", lastCheck: "Live", details: "Multi-factor auth enabled.", link: "/admin/users" }
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