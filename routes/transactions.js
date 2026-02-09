const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Equipment = require('../models/Equipment');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Config = require('../models/Config');

// 👇 IMPORT THE NOTIFICATION SERVICE
const { sendNotification } = require('../utils/emailService');

const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');

const MAX_LOAN_HOURS = 24;

// ==========================================
// 1. Get Active Loans & Requests (For IT Staff)
// ==========================================
router.get('/active', verifyToken, async (req, res) => {
    try {
        const transactions = await Transaction.find({
            status: { $in: ['Pending', 'Checked Out', 'Overdue', 'Borrowed', 'Reserved'] }
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
// 3. Borrow Item (Checkout / Request) -- NON-BLOCKING EMAIL
// ==========================================
router.post('/checkout', verifyToken, async (req, res) => {
    try {
        const { userId, equipmentId, expectedReturnTime, destination, purpose } = req.body;
        const isStudent = req.user.role === 'Student';
        const targetUserId = isStudent ? req.user.id : (userId || req.user.id);

        console.log(`[DEBUG] Checkout initiated by: ${req.user.username}`);

        // Security Check: Score
        const user = await User.findById(targetUserId);
        if (user.responsibilityScore < 60) {
            // Background Email
            sendNotification(user._id, user.email, "Checkout Denied", "Low Score.", "error").catch(console.error);

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
            // STAFF MANUAL CHECKOUT
            equipment.status = 'Checked Out';
            await equipment.save();

            // Background Email (Don't await)
            sendNotification(user._id, user.email, "Equipment Checked Out", `You have borrowed: ${equipment.name}.`, "success", savedTransaction._id).catch(console.error);
        } else {
            // STUDENT REQUEST FLOW

            // 1. Notify the Student (Background)
            sendNotification(
                user._id,
                user.email,
                "Request Submitted",
                `Your request to borrow ${equipment.name} is now PENDING approval from IT Staff.`,
                "info",
                savedTransaction._id
            ).catch(console.error);

            // 2. Notify IT Staff (Background Search & Send)
            User.find({ role: { $regex: /IT|Admin|Staff/i } }).then(staffMembers => {
                console.log(`[DEBUG] Background Task: Found ${staffMembers.length} staff to notify.`);
                staffMembers.forEach(staff => {
                    // Don't notify the student if they happen to be staff
                    if (staff._id.toString() !== user._id.toString()) {
                        sendNotification(
                            staff._id,
                            staff.email,
                            "New Borrow Request",
                            `${user.username} has requested the ${equipment.name}.`,
                            "warning",
                            savedTransaction._id
                        ).catch(console.error);
                    }
                });
            }).catch(console.error);
        }

        await AuditLog.create({
            action: isStudent ? "REQUEST_CREATED" : "CHECKOUT_SUCCESS",
            user: targetUserId,
            details: `${isStudent ? 'Requested' : 'Borrowed'} ${equipment.name}`
        });

        // Respond IMMEDIATELY so UI doesn't hang
        res.status(201).json(savedTransaction);

    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});

// ==========================================
// 4. Return Item (Check-in) -- DEBUGGED
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

        // --- FETCH DYNAMIC CONFIG WITH FALLBACK ---
        let config = await Config.findOne();
        if (!config) config = new Config();
        const LATE_PENALTY = config.latePenalty || 5; // Default to 5 if config is missing

        transaction.returnTime = Date.now();
        transaction.status = 'Returned';
        transaction.condition = condition || "Good";

        // Calculate Lateness
        const now = new Date();
        const dueDate = new Date(transaction.expectedReturnTime);
        const isLate = now > dueDate;

        // DEBUGGING LOGS
        console.log("--- RETURN DEBUG ---");
        console.log("Now:", now);
        console.log("Due:", dueDate);
        console.log("Is Late:", isLate);

        await transaction.save();

        const equipment = await Equipment.findById(equipmentId);
        equipment.status = 'Available';
        equipment.condition = condition || equipment.condition;
        await equipment.save();

        // Update User Score
        const user = await User.findById(targetUserId);

        if (isLate) {
            const diffTime = Math.abs(now - dueDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Round UP so 1 hour late = 1 day penalty

            const penalty = diffDays * LATE_PENALTY;
            user.responsibilityScore -= penalty;

            console.log(`Late by ${diffDays} days. Penalty: -${penalty}`);

            // Background Email
            sendNotification(
                user._id,
                user.email,
                "Late Return Penalty",
                `You returned ${equipment.name} late (${diffDays} days). A penalty of -${penalty} points has been applied.`,
                "warning",
                transaction._id
            ).catch(console.error);

        } else {
            user.responsibilityScore += 2;
            if (user.responsibilityScore > 100) user.responsibilityScore = 100;

            console.log("Returned On Time. Score +2");

            // Background Email
            sendNotification(
                user._id,
                user.email,
                "Equipment Returned",
                `You have successfully returned ${equipment.name}. Thank you!`,
                "success",
                transaction._id
            ).catch(console.error);
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

        const user = await User.findById(req.user.id);
        const equipment = await Equipment.findById(equipmentId);

        // Background Email
        sendNotification(
            user._id,
            user.email,
            "Reservation Confirmed",
            `You have reserved ${equipment.name} for ${startTime.toLocaleString()}.`,
            "success",
            newReservation._id
        ).catch(console.error);

        res.status(201).json({ message: "Reservation confirmed!", reservation: newReservation });

    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});

// ==========================================
// 7. Handle Approve / Deny Request -- UPDATED FOR REASON
// ==========================================
router.put('/:id/respond', verifyToken, checkRole(['IT', 'IT_Staff', 'Admin']), async (req, res) => {
    try {
        // 👇 EXTRACT THE REASON
        const { action, reason } = req.body;

        const transaction = await Transaction.findById(req.params.id).populate('user').populate('equipment');

        if (!transaction) return res.status(404).json("Transaction not found");

        if (action === 'Approve') {
            const now = new Date();
            const requestTime = new Date(transaction.createdAt);
            const originalDue = new Date(transaction.expectedReturnTime);

            let durationInMillis = originalDue - requestTime;
            if (durationInMillis < 0) durationInMillis = 2 * 60 * 60 * 1000;

            transaction.checkoutTime = now;
            transaction.expectedReturnTime = new Date(now.getTime() + durationInMillis);
            transaction.status = 'Checked Out';

            const equipment = await Equipment.findById(transaction.equipment._id);
            if (equipment) {
                equipment.status = 'Checked Out';
                await equipment.save();
            }

            // Background Email
            sendNotification(
                transaction.user._id,
                transaction.user.email,
                "Request Approved",
                `Your request for ${transaction.equipment.name} has been APPROVED.`,
                "success",
                transaction._id
            ).catch(console.error);

        } else if (action === 'Deny') {
            transaction.status = 'Denied';
            const equipment = await Equipment.findById(transaction.equipment._id);
            if (equipment && equipment.status !== 'Available') {
                equipment.status = 'Available';
                await equipment.save();
            }

            // 👇 CONSTRUCT MESSAGE WITH REASON
            const denialMessage = reason
                ? `Your request for ${transaction.equipment.name} was DENIED.\n\nReason: "${reason}"`
                : `Your request for ${transaction.equipment.name} was DENIED.`;

            // Background Email (With Reason)
            sendNotification(
                transaction.user._id,
                transaction.user.email,
                "Request Denied",
                denialMessage,
                "error",
                transaction._id
            ).catch(console.error);
        }

        await transaction.save();
        res.status(200).json(transaction);
    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});

// ==========================================
// 8. Cancel Reservation -- NON-BLOCKING
// ==========================================
router.post('/cancel/:id', verifyToken, async (req, res) => {
    try {
        const transactionId = req.params.id;
        const transaction = await Transaction.findById(transactionId).populate('user').populate('equipment');

        if (!transaction) return res.status(404).json({ message: "Transaction not found." });

        const isOwner = transaction.user._id.toString() === req.user.id;
        const isStaff = ['IT', 'IT_Staff', 'Admin'].includes(req.user.role);

        if (!isOwner && !isStaff) {
            return res.status(403).json({ message: "Unauthorized." });
        }

        if (transaction.status !== 'Reserved') {
            return res.status(400).json({ message: "Only reservations can be cancelled." });
        }

        transaction.status = 'Cancelled';
        await transaction.save();

        // Background Email
        sendNotification(
            transaction.user._id,
            transaction.user.email,
            "Reservation Cancelled",
            `Reservation for ${transaction.equipment.name} has been cancelled.`,
            "warning",
            transaction._id
        ).catch(console.error);

        res.status(200).json({ message: "Reservation cancelled successfully." });

    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});

// ==========================================
// 9. GET ALL HISTORY (For Reports)
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

// ... (Routes 11, 12, 13, 14 kept same as before - they are read-only and fine) ...
// 11. Security Dashboard
router.get('/security/dashboard-stats', verifyToken, async (req, res) => {
    try {
        const activeCount = await Transaction.countDocuments({ status: 'Checked Out' });
        const overdueCount = await Transaction.countDocuments({ status: 'Overdue' });
        const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const rawTrend = await Transaction.aggregate([
            { $match: { createdAt: { $gte: sixMonthsAgo } } },
            { $group: { _id: { $month: "$createdAt" }, checkouts: { $sum: { $cond: [{ $in: ["$status", ["Checked Out", "Returned", "Overdue"]] }, 1, 0] } }, overdue: { $sum: { $cond: [{ $eq: ["$status", "Overdue"] }, 1, 0] } } } },
            { $sort: { "_id": 1 } }
        ]);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const trendData = rawTrend.map(item => ({ name: monthNames[item._id - 1], checkouts: item.checkouts, failed: item.overdue }));
        const equipmentStats = await Transaction.aggregate([
            { $lookup: { from: 'equipment', localField: 'equipment', foreignField: '_id', as: 'eq' } },
            { $unwind: "$eq" },
            { $group: { _id: "$eq.type", value: { $sum: 1 } } },
            { $limit: 4 }
        ]);
        const formattedEqStats = equipmentStats.map(item => ({ name: item._id || "Uncategorized", value: item.value, color: "#" + Math.floor(Math.random() * 16777215).toString(16) }));
        res.status(200).json({ activeCount, overdueCount, trendData, equipmentTypeData: formattedEqStats });
    } catch (err) { res.status(500).json(err); }
});

// 12. Security Logs
router.get('/security/access-logs', verifyToken, checkRole(['Security', 'Admin', 'IT_Staff']), async (req, res) => {
    try {
        const totalBorrowed = await Transaction.countDocuments({ status: 'Checked Out' });
        const totalOverdue = await Transaction.countDocuments({ status: 'Overdue' });
        const totalLost = await Equipment.countDocuments({ status: 'Lost' });
        const totalDamaged = await Equipment.countDocuments({ status: 'Damaged' });
        const logs = await Transaction.find().populate('user', 'username email role').populate('equipment', 'name serialNumber category').sort({ createdAt: -1 }).limit(100);
        res.status(200).json({ stats: { totalBorrowed, totalOverdue, totalLost, totalDamaged }, logs });
    } catch (err) { res.status(500).json(err); }
});

// 13. Admin Dashboard
router.get('/admin/dashboard-stats', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await Transaction.distinct('user', { status: 'Checked Out' });
        const lowScoreUsers = await User.countDocuments({ responsibilityScore: { $lt: 50 } });
        const totalEquipment = await Equipment.countDocuments();
        const availableEquipment = await Equipment.countDocuments({ status: 'Available' });
        const atRiskItems = await Transaction.countDocuments({ status: 'Overdue' });
        const recentActivity = await Transaction.find().populate('user', 'username email').populate('equipment', 'name').sort({ createdAt: -1 }).limit(5);
        res.status(200).json({ stats: { activeBorrowed: activeUsers.length, totalUsers, totalEquipment, availableEquipment, atRiskItems, lowScoreUsers, systemStatus: "Online" }, recentActivity });
    } catch (err) { res.status(500).json(err); }
});

// 14. Snapshotss
router.get('/admin/snapshots', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        const maintenanceCount = await Equipment.countDocuments({ status: { $in: ['Maintenance', 'Damaged'] } });
        let config = await Config.findOne(); if (!config) config = new Config();
        const configWarnings = config.maintenanceMode ? 1 : 0;
        const health = { uptime: "99.98%", storage: "45%", lastBackup: new Date(Date.now() - 1000 * 60 * 120) };
        res.status(200).json({ attention: { sensors: 0, maintenance: maintenanceCount, warnings: configWarnings }, policies: { loanDuration: config.loanDuration, latePenalty: config.latePenalty, maintenanceMode: config.maintenanceMode }, health });
    } catch (err) { res.status(500).json(err); }
});

module.exports = router;