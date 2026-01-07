const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const { verifyToken } = require('../middleware/verifyToken');
const Equipment = require('../models/Equipment');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog'); 

const MAX_LOAN_HOURS = 24; 

// ==========================================
// 🆕 NEW ROUTE: Get ALL Active Loans (For IT Staff)
// ==========================================
// This is used by the "Select Return Item" page to list what needs to be returned.
router.get('/active', verifyToken, async (req, res) => {
    try {
        // Find transactions where status is EITHER 'Borrowed' OR 'Overdue'
        const activeTx = await Transaction.find({ 
            status: { $in: ['Borrowed', 'Overdue'] } 
        })
        .populate('equipment', 'name serialNumber') // Get item details
        .populate('user', 'username email')         // Get student name
        .sort({ expectedReturnTime: 1 });           // Show soonest due first

        res.status(200).json(activeTx);
    } catch (err) {
        console.error("Error fetching active transactions:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// ==========================================
// EXISTING ROUTES BELOW
// ==========================================

// GET /api/transactions/my-borrowed (Student's Active Loans)
router.get('/my-borrowed', verifyToken, async (req, res) => {
    try {
        const activeTransactions = await Transaction.find({ 
            user: req.user.id,      // Match the logged-in user
            returnTime: null        // Only get items NOT yet returned
        })
        .populate('equipment')      
        .sort({ expectedReturnTime: 1 }); // Sort by soonest due first

        res.status(200).json(activeTransactions);
    } catch (err) {
        res.status(500).json(err);
    }
});

// POST /api/transactions/checkout (Borrow Item)
router.post('/checkout', verifyToken, async (req, res) => {
    try {
        const { userId, equipmentId, expectedReturnTime, destination, purpose } = req.body;

        // Determine user ID (admin override or logged-in user)
        const targetUserId = userId || req.user.id; 

        // 1. Security Check: Responsibility Score
        const user = await User.findById(targetUserId);
        if (user.responsibilityScore < 70) {
            await AuditLog.create({
                action: "CHECKOUT_DENIED",
                user: targetUserId,
                details: `Denied due to low score: ${user.responsibilityScore}`
            });
            return res.status(403).json({ message: "Security Alert: You are banned from borrowing equipment due to low responsibility score." });
        }

        // 2. Policy Check: Max Loan Duration
        const returnDate = new Date(expectedReturnTime);
        const now = new Date();
        const hoursDifference = Math.abs(returnDate - now) / 36e5; 

        if (hoursDifference > MAX_LOAN_HOURS) {
            return res.status(400).json({ message: `Security Policy: You cannot borrow items for more than ${MAX_LOAN_HOURS} hours.` });
        }

        // 3. Availability Check
        const equipment = await Equipment.findById(equipmentId);
        if (!equipment || equipment.status !== 'Available') {
            return res.status(400).json({ message: "Error: Equipment is not available." });
        }

        // 4. Create Transaction
        const newTransaction = new Transaction({
            user: targetUserId,
            equipment: equipmentId,
            expectedReturnTime: expectedReturnTime,
            destination: destination,
            purpose: purpose,
            checkoutPhotoUrl: "", 
            signatureUrl: "",
            status: 'Borrowed' // Ensure status is explicitly set to Borrowed
        });
        const savedTransaction = await newTransaction.save();

        // 5. Update Equipment Status
        equipment.status = 'Checked Out';
        await equipment.save();

        // 6. Log it
        await AuditLog.create({
            action: "CHECKOUT_SUCCESS",
            user: targetUserId,
            details: `Borrowed ${equipment.name} (Serial: ${equipment.serialNumber})`
        });

        res.status(201).json(savedTransaction);

    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});

// POST /api/transactions/checkin (Return Item)
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

        transaction.returnTime = Date.now();
        transaction.status = 'Returned';
        transaction.condition = condition || "Good"; 
        
        // Late Check
        const isLate = new Date() > new Date(transaction.expectedReturnTime);
        if (isLate) {
            transaction.status = 'Overdue'; // Optional: keep as Returned but mark late flag if you prefer
        }
        
        await transaction.save();

        // Update Equipment
        const equipment = await Equipment.findById(equipmentId);
        equipment.status = 'Available';
        equipment.condition = condition || equipment.condition; 
        await equipment.save();

        // Update Score
        const user = await User.findById(targetUserId);

        if (isLate) {
            user.responsibilityScore -= 10; 
        } else {
            user.responsibilityScore += 5;  
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

// GET /api/transactions/my-history
router.get('/my-history', verifyToken, async (req, res) => {
    try {
        const history = await Transaction.find({ 
            user: req.user.id 
        })
        .populate('equipment')
        .sort({ updatedAt: -1 }) // Newest first
        .limit(10); // Only get the last 10 actions

        res.status(200).json(history);
    } catch (err) {
        res.status(500).json(err);
    }
});

// POST /api/transactions/reserve
router.post('/reserve', verifyToken, async (req, res) => {
    try {
        const { equipmentId, reservationDate, reservationTime, purpose, location, course } = req.body;

        // 1. Calculate Start and End Times
        const startString = `${reservationDate}T${reservationTime}:00`;
        const startTime = new Date(startString);
        
        if (isNaN(startTime.getTime())) {
            return res.status(400).json({ message: "Invalid date or time format." });
        }

        const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); 

        // 2. Validate: Cannot reserve in the past
        if (startTime < new Date()) {
            return res.status(400).json({ message: "Cannot reserve for a past date/time." });
        }

        // 3. CONFLICT CHECK
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

        // 4. Create Reservation
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

// POST /api/transactions/cancel/:id
router.post('/cancel/:id', verifyToken, async (req, res) => {
    try {
        const transactionId = req.params.id;
        const transaction = await Transaction.findById(transactionId);

        if (!transaction) {
            return res.status(404).json({ message: "Transaction not found." });
        }

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

module.exports = router;