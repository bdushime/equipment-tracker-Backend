const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const { verifyToken } = require('../middleware/verifyToken');
const Equipment = require('../models/Equipment');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog'); 

const MAX_LOAN_HOURS = 24; 

// ==========================================
// 1. Get ALL Active Loans (For IT Staff)
// ==========================================
router.get('/active', verifyToken, async (req, res) => {
    try {
        const activeTx = await Transaction.find({ 
            status: { $in: ['Borrowed', 'Overdue'] } 
        })
        .populate('equipment', 'name serialNumber') 
        .populate('user', 'username email')         
        .sort({ expectedReturnTime: 1 });           

        res.status(200).json(activeTx);
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
// 3. Borrow Item (Checkout)
// ==========================================
router.post('/checkout', verifyToken, async (req, res) => {
    try {
        const { userId, equipmentId, expectedReturnTime, destination, purpose } = req.body;
        const targetUserId = userId || req.user.id; 

        // Security Check: Score
        const user = await User.findById(targetUserId);
        if (user.responsibilityScore < 70) {
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

        // Create Transaction
        const newTransaction = new Transaction({
            user: targetUserId,
            equipment: equipmentId,
            expectedReturnTime: expectedReturnTime,
            destination: destination,
            purpose: purpose,
            checkoutPhotoUrl: "", 
            signatureUrl: "",
            status: 'Borrowed' 
        });
        const savedTransaction = await newTransaction.save();

        // Update Equipment
        equipment.status = 'Checked Out';
        await equipment.save();

        // Log it
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

// ==========================================
// 4. Return Item (Check-in) -- FIXED LOGIC ✅
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

        // 1. Update Transaction
        transaction.returnTime = Date.now();
        transaction.status = 'Returned'; // Always mark as Returned so it clears from dashboard
        transaction.condition = condition || "Good"; 
        
        // 2. Check Lateness (Logic only, does not change status to Overdue)
        const isLate = new Date() > new Date(transaction.expectedReturnTime);
        
        await transaction.save();

        // 3. Update Equipment to Available
        const equipment = await Equipment.findById(equipmentId);
        equipment.status = 'Available';
        equipment.condition = condition || equipment.condition; 
        await equipment.save();

        // 4. Update User Score (Penalty if Late)
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

// ==========================================
// 5. Get History
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

        // Conflict Check
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
// 7. Cancel Reservation
// ==========================================
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