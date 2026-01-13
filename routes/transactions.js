const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Equipment = require('../models/Equipment');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Config = require('../models/Config'); // Import Config model for dynamic settings 

const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole'); 

const MAX_LOAN_HOURS = 24; 

// ==========================================
// 1. Get Active Loans & Requests (For IT Staff)
// ==========================================
router.get('/active', verifyToken, async (req, res) => {
    try {
        const transactions = await Transaction.find({ 
            status: { $in: ['Pending', 'Checked Out', 'Overdue', 'Borrowed'] } 
        })
        .populate('equipment', 'name serialNumber') 
        .populate('user', 'username email responsibilityScore')
        .sort({ createdAt: -1 });

        res.status(200).json(transactions);
    } catch (err) {
        console.error("Error fetching active transactions:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// ==========================================
// 2. Get Student's Active Loans
// ==========================================
router.get('/my-borrowed', verifyToken, async (req, res) => {
    try {
        const activeTransactions = await Transaction.find({ 
            user: req.user.id,      
            returnTime: null        
        })
        .populate('equipment')      
        .sort({ expectedReturnTime: 1 }); 

        res.status(200).json(activeTransactions);
    } catch (err) {
        res.status(500).json(err);
    }
});

// ==========================================
// 3. Borrow Item (Checkout / Request)
// ==========================================
router.post('/checkout', verifyToken, async (req, res) => {
    try {
        const { userId, equipmentId, expectedReturnTime, destination, purpose } = req.body;
        const isStudent = req.user.role === 'Student';
        const targetUserId = isStudent ? req.user.id : (userId || req.user.id);

        // Security Check: Score
        const user = await User.findById(targetUserId);
        if (user.responsibilityScore < 60) {
            await AuditLog.create({
                action: "CHECKOUT_DENIED",
                user: targetUserId,
                details: `Denied due to low score: ${user.responsibilityScore}`
            });
            return res.status(403).json({ message: "Security Alert: You are banned from borrowing due to low score." });
        }

        // Policy Check: Duration
        const returnDate = new Date(expectedReturnTime);
        const now = new Date();
        const hoursDifference = Math.abs(returnDate - now) / 36e5; 

        if (hoursDifference > MAX_LOAN_HOURS) {
            return res.status(400).json({ message: `Security Policy: You cannot borrow items for more than ${MAX_LOAN_HOURS} hours.` });
        }

        // Availability Check
        const equipment = await Equipment.findById(equipmentId);
        if (!equipment || equipment.status !== 'Available') {
            return res.status(400).json({ message: "Error: Equipment is not available." });
        }

        const initialStatus = isStudent ? 'Pending' : 'Checked Out';

        const newTransaction = new Transaction({
            user: targetUserId,
            equipment: equipmentId,
            expectedReturnTime: expectedReturnTime,
            destination: destination,
            purpose: purpose,
            checkoutPhotoUrl: req.body.checkoutPhotoUrl || "", 
            signatureUrl: req.body.signatureUrl || "",
            status: initialStatus
        });
        const savedTransaction = await newTransaction.save();

        if (!isStudent) {
            equipment.status = 'Checked Out';
            await equipment.save();
        } 

        await AuditLog.create({
            action: isStudent ? "REQUEST_CREATED" : "CHECKOUT_SUCCESS",
            user: targetUserId,
            details: `${isStudent ? 'Requested' : 'Borrowed'} ${equipment.name}`
        });

        res.status(201).json(savedTransaction);

    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});

// ==========================================
// 4. Return Item (Check-in) - UPDATED WITH DYNAMIC CONFIG
// ==========================================
router.post('/checkin', verifyToken, async (req, res) => {
    try {
        const { userId, equipmentId, condition } = req.body;
        const targetUserId = userId || req.user.id;

        const transaction = await Transaction.findOne({
            user: targetUserId,
            equipment: equipmentId,
            returnTime: null 
        });

        if (!transaction) {
            return res.status(404).json({ message: "No active transaction found for this item/user combo." });
        }

        // --- FETCH DYNAMIC CONFIG ---
        let config = await Config.findOne();
        if (!config) config = new Config(); // Fallback to defaults if not set

        transaction.returnTime = Date.now();
        transaction.status = 'Returned'; 
        transaction.condition = condition || "Good"; 
        
        // Calculate Lateness
        const now = new Date();
        const dueDate = new Date(transaction.expectedReturnTime);
        const isLate = now > dueDate;

        await transaction.save();

        // Update Equipment Status
        const equipment = await Equipment.findById(equipmentId);
        equipment.status = 'Available';
        equipment.condition = condition || equipment.condition; 
        await equipment.save();

        // Update User Score
        const user = await User.findById(targetUserId);
        
        if (isLate) {
            // Use DYNAMIC penalty from Config
            // Calculate days late (min 1)
            const diffTime = Math.abs(now - dueDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            const penalty = diffDays * config.latePenalty; // Dynamic calculation
            user.responsibilityScore -= penalty;
        } else {
            // Optional: Bonus for on-time return (Could also be in Config)
            user.responsibilityScore += 2;  
            if (user.responsibilityScore > 100) user.responsibilityScore = 100;
        }
        await user.save();

        res.status(200).json({
            message: "Equipment returned successfully!",
            late: isLate,
            newScore: user.responsibilityScore
        });

    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});

// ==========================================
// 5. Get Student's History
// ==========================================
router.get('/my-history', verifyToken, async (req, res) => {
    try {
        const history = await Transaction.find({ 
            user: req.user.id 
        })
        .populate('equipment')
        .sort({ updatedAt: -1 }) 
        .limit(10); 

        res.status(200).json(history);
    } catch (err) {
        res.status(500).json(err);
    }
});

// ==========================================
// 6. Reserve Item
// ==========================================
router.post('/reserve', verifyToken, async (req, res) => {
    try {
        const { equipmentId, reservationDate, reservationTime, purpose, location, course } = req.body;
        const startString = `${reservationDate}T${reservationTime}:00`;
        const startTime = new Date(startString);
        
        if (isNaN(startTime.getTime())) {
            return res.status(400).json({ message: "Invalid date or time format." });
        }

        const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); 

        if (startTime < new Date()) {
            return res.status(400).json({ message: "Cannot reserve for a past date/time." });
        }

        const conflict = await Transaction.find({
            equipment: equipmentId,
            status: { $in: ['Active', 'Borrowed', 'Reserved'] },
            $or: [
                { startTime: { $lte: startTime }, expectedReturnTime: { $gt: startTime } },
                { startTime: { $lt: endTime }, expectedReturnTime: { $gte: endTime } },
                { startTime: { $gte: startTime }, expectedReturnTime: { $lte: endTime } }
            ]
        });

        if (conflict.length > 0) {
            return res.status(409).json({ message: "Equipment is already booked for this time slot." });
        }

        const newReservation = new Transaction({
            user: req.user.id,
            equipment: equipmentId,
            startTime: startTime,
            expectedReturnTime: endTime,
            destination: `${location} (${course})`,
            purpose: purpose,
            status: 'Reserved' 
        });

        await newReservation.save();
        res.status(201).json({ message: "Reservation confirmed!", reservation: newReservation });

    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});

// ==========================================
// 7. Handle Approve / Deny Request
// ==========================================
router.put('/:id/respond', verifyToken, checkRole(['IT', 'IT_Staff', 'Admin']), async (req, res) => {
    try {
        const { action } = req.body; 
        const transaction = await Transaction.findById(req.params.id);

        if (!transaction) return res.status(404).json("Transaction not found");

        if (action === 'Approve') {
            const now = new Date();
            const requestTime = new Date(transaction.createdAt);
            const originalDue = new Date(transaction.expectedReturnTime);
            const durationInMillis = originalDue - requestTime;

            transaction.checkoutTime = now; 
            transaction.expectedReturnTime = new Date(now.getTime() + durationInMillis);
            transaction.status = 'Checked Out';

            const equipment = await Equipment.findById(transaction.equipment);
            if (equipment) {
                equipment.status = 'Checked Out';
                await equipment.save();
            }
            
        } else if (action === 'Deny') {
            transaction.status = 'Denied';
            const equipment = await Equipment.findById(transaction.equipment);
            if(equipment && equipment.status !== 'Available') {
                 equipment.status = 'Available';
                 await equipment.save();
            }
        }

        await transaction.save();
        res.status(200).json(transaction);
    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});

// ==========================================
// 8. Cancel Reservation
// ==========================================
router.post('/cancel/:id', verifyToken, async (req, res) => {
    try {
        const transactionId = req.params.id;
        const transaction = await Transaction.findById(transactionId);

        if (!transaction) return res.status(404).json({ message: "Transaction not found." });

        if (transaction.user.toString() !== req.user.id) {
            return res.status(403).json({ message: "Unauthorized: You do not own this reservation." });
        }

        if (transaction.status !== 'Reserved') {
            return res.status(400).json({ message: "Only reservations can be cancelled." });
        }

        transaction.status = 'Cancelled';
        await transaction.save();
        res.status(200).json({ message: "Reservation cancelled successfully." });

    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});

// ==========================================
// 9. GET ALL HISTORY (For IT Staff Reports)
// ==========================================
router.get('/all-history', verifyToken, checkRole(['IT', 'IT_Staff', 'Admin']), async (req, res) => {
    try {
        const transactions = await Transaction.find()
            .populate('user', 'username email responsibilityScore') 
            .populate('equipment', 'name serialNumber category status') 
            .sort({ createdAt: -1 });

        res.status(200).json(transactions);
    } catch (err) {
        console.error("Report fetch error:", err);
        res.status(500).json(err);
    }
});


// ==========================================
// 11. GET SECURITY DASHBOARD STATS
// ==========================================
router.get('/security/dashboard-stats', verifyToken, async (req, res) => {
    try {
        // 1. Get Headline Stats
        const activeCount = await Transaction.countDocuments({ status: 'Checked Out' });
        const overdueCount = await Transaction.countDocuments({ status: 'Overdue' });
        
        // 2. Get Chart Data (Last 6 Months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const rawTrend = await Transaction.aggregate([
            { $match: { createdAt: { $gte: sixMonthsAgo } } },
            {
                $group: {
                    _id: { $month: "$createdAt" },
                    checkouts: { 
                        $sum: { $cond: [{ $in: ["$status", ["Checked Out", "Returned", "Overdue"]] }, 1, 0] } 
                    },
                    overdue: { 
                        $sum: { $cond: [{ $eq: ["$status", "Overdue"] }, 1, 0] } 
                    }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const trendData = rawTrend.map(item => ({
            name: monthNames[item._id - 1],
            checkouts: item.checkouts,
            failed: item.overdue 
        }));

        // 3. Get Equipment Category Stats (For Pie Chart)
        const equipmentStats = await Transaction.aggregate([
            { $lookup: { from: 'equipment', localField: 'equipment', foreignField: '_id', as: 'eq' } },
            { $unwind: "$eq" },
            {
                $group: {
                    _id: "$eq.category",
                    value: { $sum: 1 }
                }
            },
            { $limit: 4 } // Top 4 categories
        ]);

        const formattedEqStats = equipmentStats.map(item => ({
            name: item._id || "Uncategorized",
            value: item.value,
            color: "#" + Math.floor(Math.random()*16777215).toString(16) 
        }));

        res.status(200).json({
            activeCount,
            overdueCount,
            trendData,
            equipmentTypeData: formattedEqStats
        });

    } catch (err) {
        console.error("Dashboard Stats Error:", err);
        res.status(500).json(err);
    }
});

// ==========================================
// 12. GET SECURITY ACCESS LOGS & STATS
// ==========================================
router.get('/security/access-logs', verifyToken, checkRole(['Security', 'Admin', 'IT_Staff']), async (req, res) => {
    try {
        const totalBorrowed = await Transaction.countDocuments({ status: 'Checked Out' });
        const totalOverdue = await Transaction.countDocuments({ status: 'Overdue' });
        const totalLost = await Equipment.countDocuments({ status: 'Lost' });
        const totalDamaged = await Equipment.countDocuments({ status: 'Damaged' });

        const logs = await Transaction.find()
            .populate('user', 'username email role')
            .populate('equipment', 'name serialNumber category')
            .sort({ createdAt: -1 })
            .limit(100);

        res.status(200).json({
            stats: { totalBorrowed, totalOverdue, totalLost, totalDamaged },
            logs
        });

    } catch (err) {
        console.error("Access Logs Error:", err);
        res.status(500).json(err);
    }
});


// ==========================================
// 13. GET ADMIN DASHBOARD STATS
// ==========================================
router.get('/admin/dashboard-stats', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await Transaction.distinct('user', { status: 'Checked Out' });
        const lowScoreUsers = await User.countDocuments({ responsibilityScore: { $lt: 50 } }); // Count 'bad' users
        
        const totalEquipment = await Equipment.countDocuments();
        const availableEquipment = await Equipment.countDocuments({ status: 'Available' });
        const atRiskItems = await Transaction.countDocuments({ status: 'Overdue' });

        const systemStatus = "Online";

        const recentActivity = await Transaction.find()
            .populate('user', 'username email')
            .populate('equipment', 'name')
            .sort({ createdAt: -1 })
            .limit(5);

        res.status(200).json({
            stats: {
                activeBorrowed: activeUsers.length,
                totalUsers,
                totalEquipment,
                availableEquipment,
                atRiskItems,
                lowScoreUsers, // <--- ADDED THIS
                systemStatus
            },
            recentActivity
        });

    } catch (err) {
        console.error("Admin Dashboard Error:", err);
        res.status(500).json(err);
    }
});


// ==========================================
// 14. GET SYSTEM SNAPSHOTS (Widgets)
// ==========================================
router.get('/admin/snapshots', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        // 1. Attention Indicatorss
        const maintenanceCount = await Equipment.countDocuments({ status: { $in: ['Maintenance', 'Damaged'] } });
        
        // 2. Active Policies (From Config)
        let config = await Config.findOne();
        if (!config) config = new Config(); // Default if missing

        // Logic: If maintenance mode is ON, it's a warning
        const configWarnings = config.maintenanceMode ? 1 : 0;

        // 3. System Health (Simulated for MERN app)
        const health = {
            uptime: "99.98%",
            storage: "45%", // In a real app, use 'diskusage' package
            lastBackup: new Date(Date.now() - 1000 * 60 * 120) // Mock: 2 hours ago
        };

        res.status(200).json({
            attention: {
                sensors: 0, // Mock: No real IOT sensors yet
                maintenance: maintenanceCount,
                warnings: configWarnings
            },
            policies: {
                loanDuration: config.loanDuration,
                latePenalty: config.latePenalty,
                maintenanceMode: config.maintenanceMode
            },
            health
        });

    } catch (err) {
        console.error("Snapshots Error:", err);
        res.status(500).json(err);
    }
});


module.exports = router;