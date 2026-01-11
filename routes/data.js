const router = require('express').Router();
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Equipment = require('../models/Equipment');
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');
const { Parser } = require('json2csv'); // You might need: npm install json2csv

// 1. GET BACKUP HISTORY (Mock for now, but persistent)
// In a real app, this would read from a 'BackupLog' model
let backupLogs = [
    { id: 1, name: "Auto_Backup_Daily.sql", size: "1.2 GB", date: new Date().toDateString(), type: "Full", status: "Success" }
];

router.get('/backups', verifyToken, checkRole(['Admin']), (req, res) => {
    res.status(200).json(backupLogs);
});

// 2. TRIGGER MANUAL BACKUP (Mock)
router.post('/backups', verifyToken, checkRole(['Admin']), (req, res) => {
    const newBackup = {
        id: Date.now(),
        name: `Manual_Backup_${Date.now()}.sql`,
        size: "0.5 MB",
        date: new Date().toDateString(),
        type: "Manual",
        status: "Success"
    };
    backupLogs.unshift(newBackup); // Add to top
    res.status(200).json(newBackup);
});

// 3. EXPORT DATA (CSV)
router.get('/export/:type', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        const { type } = req.params;
        let data = [];
        let fields = [];

        if (type === 'equipment') {
            data = await Equipment.find();
            fields = ['name', 'category', 'status', 'serialNumber'];
        } else if (type === 'users') {
            data = await User.find();
            fields = ['username', 'email', 'role', 'department'];
        } else {
            // Default: All Transactions
            data = await Transaction.find().populate('user equipment');
            fields = ['status', 'createdAt', 'user.username', 'equipment.name'];
        }

        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(data);

        res.header('Content-Type', 'text/csv');
        res.attachment(`${type}_export.csv`);
        return res.send(csv);

    } catch (err) {
        console.error(err);
        res.status(500).json("Export failed");
    }
});

// 4. CLEANUP OLD LOGS
router.delete('/cleanup', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        // Delete transactions older than 90 days
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        const result = await Transaction.deleteMany({ createdAt: { $lt: ninetyDaysAgo } });
        res.status(200).json({ message: `Cleaned up ${result.deletedCount} old records.` });
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;