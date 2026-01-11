const router = require('express').Router();
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');

// GET SYSTEM MONITORING DATA
router.get('/', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        // 1. Simulate Error Logs (In a real app, you'd query a 'SystemLogs' collection)
        // We'll generate some dynamic ones based on time to make it look active.
        const now = new Date();
        const errorLogs = [
            { id: 1, type: "Warning", message: "High latency detected", source: "API Gateway", time: now.toLocaleTimeString(), user: "System" },
            { id: 2, type: "Error", message: "Failed login attempt", source: "Auth Service", time: new Date(now - 500000).toLocaleTimeString(), user: "Unknown IP" },
            { id: 3, type: "Warning", message: "Database backup started", source: "Backup Service", time: new Date(now - 1500000).toLocaleTimeString(), user: "System" },
        ];

        // 2. System Status
        const systemStatus = {
            uptime: "99.98%",
            cpuLoad: Math.floor(Math.random() * 30) + 20 + "%", // Simulate 20-50%
            memoryUsage: (Math.random() * 2 + 4).toFixed(1) + " GB", // Simulate 4-6GB
            errorRate: "0.02%"
        };

        res.status(200).json({
            systemStatus,
            errorLogs
        });

    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;