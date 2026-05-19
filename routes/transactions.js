const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Equipment = require('../models/Equipment');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Config = require('../models/Config');
const Classroom = require('../models/Classroom');

const { sendNotification } = require('../utils/emailService');
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');
const { requirePasswordResetComplete } = require('../middleware/requirePasswordResetComplete');

const MAX_LOAN_HOURS = 24;

router.use(verifyToken, requirePasswordResetComplete);

// ==========================================
// 1. Get Active Loans & Requests (For IT Staff)
// ==========================================
router.get('/active', verifyToken, async (req, res) => {
    try {
        // Exclude heavy base64 photo blobs from the list payload; the detail
        // endpoint (GET /:id) returns them on demand when the dialog opens.
        const transactions = await Transaction.find({
            status: { $in: ['Pending', 'Checked Out', 'Overdue', 'Borrowed', 'Reserved', 'Pending Return'] }
        })
            .select('-checkoutPhotoUrl -returnPhotoUrl')
            .populate('equipment', 'name serialNumber type category')
            .populate('user', 'username email fullName phone studentId department responsibilityScore')
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
            status: { $in: ['Pending', 'Checked Out', 'Borrowed', 'Overdue', 'Pending Return', 'Reserved', 'Saved'] },
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

        console.log(`[DEBUG] Checkout initiated by: ${req.user.username}`);

        // Security Check: Score
        const user = await User.findById(targetUserId);
        if (user.responsibilityScore < 60) {
            sendNotification(user._id, user.email, "Checkout Denied", "Low Score.", "error").catch(console.error);

            await AuditLog.create({
                action: "CHECKOUT_DENIED",
                user: targetUserId,
                details: `Denied due to low score: ${user.responsibilityScore}`
            });
            return res.status(403).json({ message: "Security Alert: You are banned from borrowing due to low score." });
        }

        // One-at-a-time policy: block if the student already has a pending request or active loan
        const ACTIVE_BLOCKING_STATUSES = ['Pending', 'Checked Out', 'Borrowed', 'Overdue', 'Pending Return'];
        const existingActive = await Transaction.findOne({
            user: targetUserId,
            status: { $in: ACTIVE_BLOCKING_STATUSES }
        }).populate('equipment', 'name');
        if (existingActive) {
            return res.status(409).json({
                message: `You already have an active checkout (${existingActive.equipment?.name || 'a device'} — status: ${existingActive.status}). Please return or resolve it before requesting another.`
            });
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

        // Package membership check: devices in a package cannot be borrowed individually
        const Package = require('../models/Package');
        const parentPackage = await Package.findOne({ devices: equipmentId, isActive: true }).select('name');
        if (parentPackage) {
            return res.status(400).json({
                message: `This device belongs to the "${parentPackage.name}" package and cannot be borrowed individually. Please book the full package instead.`
            });
        }

        let status = isStudent ? 'Pending' : 'Checked Out';
        let adminNote = "";

        // 1. Is it a Projector?
        const isProjector = equipment.name.toLowerCase().includes('projector') ||
            (equipment.category && equipment.category.toLowerCase().includes('projector'));

        if (isProjector) {
            // 2. Extract Room Name (e.g. from "Room 304 (CS101)" -> "Room 304")
            const roomNameInput = destination ? destination.split('(')[0].trim() : "";

            // 3. Find Classroom (Regex for case-insensitive match)
            const classroom = await Classroom.findOne({
                name: { $regex: new RegExp(`^${roomNameInput}$`, 'i') }
            });

            // 4. If Room has a screen, Force Pending Status
            if (classroom && classroom.hasScreen) {
                console.log(`[POLICY HIT] Projector requested for ${classroom.name} which has a screen.`);
                status = 'Pending'; // Force approval required
                adminNote = " [SYSTEM FLAG: Projector requested in room with existing screen]";
            }
        }

        const conditionPhotos = req.body.conditionPhotos && typeof req.body.conditionPhotos === 'object'
            ? req.body.conditionPhotos
            : {};
        const checkoutPhotoUrl = [conditionPhotos.front, conditionPhotos.back].filter(Boolean);

        const newTransaction = new Transaction({
            user: targetUserId,
            equipment: equipmentId,
            expectedReturnTime: expectedReturnTime,
            destination: destination,
            purpose: purpose + adminNote,
            checkoutPhotoUrl,
            signatureUrl: req.body.signatureUrl || "",
            status: status
        });

        const savedTransaction = await newTransaction.save();

        if (status === 'Checked Out') {
            equipment.status = 'Checked Out';
            await equipment.save();
            sendNotification(user._id, user.email, "Equipment Checked Out", `You have borrowed: ${equipment.name}.`, "success", savedTransaction._id).catch(console.error);
        } else {
            // Pending request: hold the device so no other student can borrow it
            // while IT decides. Reverted to 'Available' on deny / cancel / expiry.
            equipment.status = 'Reserved';
            await equipment.save();

            await sendNotification(
                user._id,
                user.email,
                "Request Submitted",
                `Your request to borrow ${equipment.name} is now PENDING approval from IT Staff.${adminNote ? ' (Special approval required due to room restrictions)' : ''}`,
                "info",
                savedTransaction._id
            ).catch(console.error);

            // 2. DEBUG & NOTIFY IT STAFF
            console.log("[DEBUG] Searching for IT Staff to notify...");

            // Query strictly for these roles (including IT Staff space and casing variations)
            const staffMembers = await User.find({ role: { $in: ['IT', 'IT_Staff', 'IT Staff', 'IT_STAFF', 'Admin', 'Security'] } });

            console.log(`[DEBUG] Found ${staffMembers.length} staff members in DB.`);

            if (staffMembers.length === 0) {
                console.error("[CRITICAL WARNING] No IT Staff found! Notifications will not be sent to staff.");
                console.error("Please check that users in MongoDB have roles: 'IT', 'IT_Staff', or 'Admin'");
            }

            for (const staff of staffMembers) {
                if (staff._id.toString() !== user._id.toString()) {
                    console.log(`[DEBUG] Sending alert to: ${staff.username} (${staff.email})`);
                    await sendNotification(
                        staff._id,
                        staff.email,
                        "New Borrow Request",
                        `${user.fullName || user.username} has requested the ${equipment.name}.${adminNote ? ' ⚠️ ALERT: Room already has a screen.' : ''}`,
                        "warning",
                        savedTransaction._id
                    ).catch(console.error);
                }
            }
        }

        await AuditLog.create({
            action: status === 'Pending' ? "REQUEST_CREATED" : "CHECKOUT_SUCCESS",
            user: targetUserId,
            details: `${status === 'Pending' ? 'Requested' : 'Borrowed'} ${equipment.name}`
        });

        res.status(201).json({
            ...savedTransaction.toObject(),
            serverStatusMessage: status === 'Pending' ? 'pending_approval' : 'success'
        });

    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});


// ==========================================
// 4a. REQUEST RETURN (New Flow from Student)
// ==========================================
router.put('/:id/request-return', verifyToken, async (req, res) => {
    try {
        const transactionId = req.params.id;

        // Find the active transaction
        const transaction = await Transaction.findById(transactionId).populate('equipment').populate('user');

        if (!transaction) {
            return res.status(404).json({ message: "Transaction not found." });
        }

        // Security check: Only the user who borrowed it can request a return
        if (transaction.user._id.toString() !== req.user.id) {
            return res.status(403).json({ message: "Unauthorized. You did not borrow this item." });
        }

        // Extract return condition photos if provided
        // Guard against req.body being undefined (Render sends no body on simple PUT requests)
        const conditionPhotos = (req.body && req.body.conditionPhotos && typeof req.body.conditionPhotos === 'object')
            ? req.body.conditionPhotos
            : {};
        const returnPhotoUrl = [conditionPhotos.front, conditionPhotos.back].filter(Boolean);

        // Update the status and photos
        transaction.returnPhotoUrl = returnPhotoUrl;
        transaction.status = 'Pending Return';

        console.log(`[REQUEST-RETURN] Saving transaction ${transaction._id}, status=${transaction.status}, startTime=${transaction.startTime}, expectedReturnTime=${transaction.expectedReturnTime}, destination=${transaction.destination}, purpose=${transaction.purpose}`);
        await transaction.save();
        console.log(`[REQUEST-RETURN] transaction.save() OK`);

        // Send Notification to IT Staff (strict allowlist — same as checkout route)
        User.find({ role: { $in: ['IT', 'IT_Staff', 'IT Staff', 'IT_STAFF', 'Admin'] } }).then(staffMembers => {
            staffMembers.forEach(staff => {
                sendNotification(
                    staff._id,
                    staff.email,
                    "Return Request",
                    `${transaction.user.fullName || transaction.user.username} has requested to return the ${transaction.equipment.name}. Please verify and check it in.`,
                    "info",
                    transaction._id
                ).catch(console.error);
            });
        }).catch(console.error);

        // Log the action
        console.log(`[REQUEST-RETURN] Creating AuditLog for user=${req.user.id}, equipment=${transaction.equipment?.name}`);
        await AuditLog.create({
            action: "RETURN_REQUESTED",
            user: req.user.id,
            details: `Requested to return ${transaction.equipment.name}`
        });
        console.log(`[REQUEST-RETURN] AuditLog.create() OK`);

        res.status(200).json({ message: "Return requested successfully. Awaiting IT Staff approval.", transaction });

    } catch (err) {
        console.error("Error requesting return:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});


// ==========================================
// 4b. Return Item (Check-in by IT STAFF)
// ==========================================
router.post('/checkin', verifyToken, async (req, res) => {
    try {
        const { userId, equipmentId, condition } = req.body;
        const targetUserId = userId || req.user.id;

        const transaction = await Transaction.findOne({
            user: targetUserId,
            equipment: equipmentId,
            status: { $in: ['Checked Out', 'Borrowed', 'Overdue', 'Pending Return'] },
            returnTime: null
        });

        if (!transaction) {
            return res.status(404).json({ message: "No active transaction found for this item/user combo." });
        }

        let config = await Config.findOne();
        if (!config) config = new Config();
        const LATE_PENALTY = config.latePenalty || 5;

        transaction.returnTime = Date.now();
        transaction.status = 'Returned';
        transaction.condition = condition || "Good";

        // Calculate Lateness
        const now = new Date();
        const dueDate = new Date(transaction.expectedReturnTime);
        const isLate = now > dueDate;

        await transaction.save();

        const equipment = await Equipment.findById(equipmentId);
        equipment.status = 'Available';
        equipment.condition = condition || equipment.condition;
        await equipment.save();

        const user = await User.findById(targetUserId);

        if (isLate) {
            const diffTime = Math.abs(now - dueDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const penalty = diffDays * LATE_PENALTY;
            user.responsibilityScore -= penalty;

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
// 7. Handle Approve / Deny Request
// ==========================================
router.put('/:id/respond', verifyToken, checkRole(['IT', 'IT_Staff', 'Admin']), async (req, res) => {
    try {
        const { action, reason } = req.body;
        const transaction = await Transaction.findById(req.params.id).populate('user').populate('equipment');

        if (!transaction) return res.status(404).json("Transaction not found");

        if (action === 'Approve') {
            const now = new Date();
            const requestTime = new Date(transaction.createdAt);
            const originalDue = new Date(transaction.expectedReturnTime);
            // Calculate original requested duration to shift it to "now"
            let durationInMillis = originalDue - requestTime;
            if (durationInMillis < 0) durationInMillis = 2 * 60 * 60 * 1000; // Default 2h if weird
            transaction.checkoutTime = now;
            transaction.expectedReturnTime = new Date(now.getTime() + durationInMillis);
            transaction.status = 'Checked Out';

            const equipment = await Equipment.findById(transaction.equipment._id);
            if (equipment) {
                equipment.status = 'Checked Out';
                await equipment.save();
            }

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
            // Only release the hold we placed when the request was created.
            // We must not touch Maintenance/Damaged/Lost or other unrelated states.
            if (equipment && equipment.status === 'Reserved') {
                equipment.status = 'Available';
                await equipment.save();
            }

            const denialMessage = reason
                ? `Your request for ${transaction.equipment.name} was DENIED.\n\nReason: "${reason}"`
                : `Your request for ${transaction.equipment.name} was DENIED.`;

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
// 8. Cancel Reservation
// ==========================================
router.post('/cancel/:id', verifyToken, async (req, res) => {
    try {
        const transactionId = req.params.id;
        const transaction = await Transaction.findById(transactionId).populate('user').populate('equipment');

        if (!transaction) return res.status(404).json({ message: "Transaction not found." });

        const isOwner = transaction.user._id.toString() === req.user.id;
        const isStaff = ['IT', 'IT_Staff', 'IT Staff', 'IT_STAFF', 'Admin', 'Security'].includes(req.user.role);

        if (!isOwner && !isStaff) {
            return res.status(403).json({ message: "Unauthorized." });
        }

        if (transaction.status !== 'Reserved') {
            return res.status(400).json({ message: "Only reservations can be cancelled." });
        }

        transaction.status = 'Cancelled';
        await transaction.save();

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
// 9. GET ALL HISTORY (For Reports) - Paginated
// ==========================================
router.get('/all-history', verifyToken, checkRole(['IT', 'IT_Staff', 'IT_STAFF', 'Admin']), async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
        const skip = (page - 1) * limit;

        const [transactions, total] = await Promise.all([
            Transaction.find()
                .populate('user', 'username fullName studentId email responsibilityScore')
                .populate('equipment', 'name serialNumber category status')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Transaction.countDocuments()
        ]);

        res.status(200).json({
            items: transactions,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1
        });
    } catch (err) {
        console.error("Report fetch error:", err);
        res.status(500).json(err);
    }
});


// ==========================================
// 11. Security Dashboard (BULLETPROOF FIX)
// ==========================================
router.get('/security/dashboard-stats', verifyToken, async (req, res) => {
    try {
        const activeCount = await Transaction.countDocuments({ status: { $in: ['Checked Out', 'Pending Return'] } });
        const overdueCount = await Transaction.countDocuments({ status: 'Overdue' });
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

        // 👇 BULLETPROOF FIX: We fetch all transactions and tally the equipment categories in JavaScript
        const allTransactions = await Transaction.find().populate('equipment', 'type category');
        const categoryCounts = {};

        allTransactions.forEach(tx => {
            const categoryName = (tx.equipment && (tx.equipment.type || tx.equipment.category)) ? (tx.equipment.type || tx.equipment.category) : "General";
            categoryCounts[categoryName] = (categoryCounts[categoryName] || 0) + 1;
        });

        // Convert the tally object into a sorted array, taking the top 3
        const sortedCategories = Object.entries(categoryCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 3);

        const colors = ["#1A2240", "#BEBEE0", "#343264"];
        const formattedEqStats = sortedCategories.map((item, index) => ({
            name: item.name,
            value: item.value,
            color: colors[index]
        }));

        res.status(200).json({ activeCount, overdueCount, trendData, equipmentTypeData: formattedEqStats });
    } catch (err) {
        console.error("Dashboard Stats Error:", err);
        res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
});


// ==========================================
// 12. Security Logs (BULLETPROOF FIX, Paginated)
// ==========================================
router.get('/security/access-logs', verifyToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            Transaction.find()
                .populate('user', 'username fullName studentId email role')
                .populate('equipment', 'name serialNumber category')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Transaction.countDocuments()
        ]);

        res.status(200).json({
            logs,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1
        });
    } catch (err) {
        console.error("Access Logs Error:", err);
        res.status(500).json({ error: "Failed to fetch access logs" });
    }
});

// ==========================================
// 13. Admin Dashboard
// ==========================================
router.get('/admin/dashboard-stats', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await Transaction.distinct('user', { status: 'Checked Out' });
        const lowScoreUsers = await User.countDocuments({ responsibilityScore: { $lt: 50 } });
        const totalEquipment = await Equipment.countDocuments();
        const availableEquipment = await Equipment.countDocuments({ status: 'Available' });

        // Strictly count only VALID Overdue transactions (existing user & equipment, and NOT yet returned)
        // Bulletproof: Count both explicitly marked 'Overdue' AND items past deadline that haven't been returned
        const validOverdueRows = await Transaction.find({
            $and: [
                { returnTime: null },
                {
                    $or: [
                        { status: 'Overdue' },
                        { expectedReturnTime: { $lt: new Date() }, status: { $in: ['Checked Out', 'Borrowed', 'Active'] } }
                    ]
                }
            ]
        }).populate('user equipment');

        const filteredValidOverdue = validOverdueRows.filter(t => t.user && t.equipment);
        const overdueCount = filteredValidOverdue.length;
        const overdueNames = filteredValidOverdue.map(t => `${t.user?.username || 'Unknown'}: ${t.equipment?.name || 'Unknown'}`).join(', ');

        const maintenanceCount = await Equipment.countDocuments({ status: 'Maintenance' });
        const damagedCount = await Equipment.countDocuments({ status: 'Damaged' });
        const deniedCount = await Transaction.countDocuments({ status: 'Denied' });

        // At-Risk = Overdue + Maintenance + Damaged
        const atRiskItems = overdueCount + maintenanceCount + damagedCount;


        const systemStatus = "Online";

        const recentActivity = await Transaction.find()
            .populate('user', 'username fullName studentId email')
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
                overdueCount,
                overdueNames,
                maintenanceCount,
                damagedCount,
                deniedCount,
                lowScoreUsers,
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
// 14. Snapshots
// ==========================================
router.get('/admin/snapshots', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        const maintenanceCount = await Equipment.countDocuments({ status: { $in: ['Maintenance', 'Damaged'] } });
        let config = await Config.findOne();
        if (!config) config = new Config();

        const configWarnings = config.maintenanceMode ? 1 : 0;

        const health = {
            uptime: "99.98%",
            storage: "45%",
            lastBackup: new Date(Date.now() - 1000 * 60 * 120)
        };

        res.status(200).json({
            attention: {
                sensors: 0,
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

// ==========================================
// 15. Get a single transaction with full detail (for IT/Admin review dialog)
// Must be registered LAST so it doesn't shadow specific GET routes like
// /active, /my-borrowed, /my-history, /admin/*, /security/*.
// ==========================================
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Invalid transaction ID' });
        }

        const transaction = await Transaction.findById(req.params.id)
            .populate('equipment', 'name serialNumber type category description')
            .populate('user', 'username email fullName phone studentId department responsibilityScore role');

        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        // Students can only see their own; staff can see anything.
        const isStaff = ['IT', 'IT_Staff', 'IT Staff', 'IT_STAFF', 'Admin', 'Security'].includes(req.user.role);
        if (!isStaff && transaction.user?._id?.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        res.status(200).json({ data: transaction });
    } catch (err) {
        console.error("Error fetching transaction:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

module.exports = router;