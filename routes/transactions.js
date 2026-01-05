const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const { verifyToken } = require('../middleware/verifyToken');
const Equipment = require('../models/Equipment');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog'); 
const MAX_LOAN_HOURS = 24; 

// --- NEW ROUTE: Get My Active Borrows (Active Loans/Timer) ---
// This finds items where 'returnTime' is null (meaning not returned yet)
router.get('/my-borrowed', verifyToken, async (req, res) => {
    try {
        const activeTransactions = await Transaction.find({ 
            user: req.user.id,      // Match the logged-in user
            returnTime: null        // Only get items NOT yet returned
        })
        .populate('equipment')      // <--- IMPORTANT: Get the Equipment Name/Details
        .sort({ expectedReturnTime: 1 }); // Sort by soonest due first

        res.status(200).json(activeTransactions);
    } catch (err) {
        res.status(500).json(err);
    }
});

// URL: http://localhost:5001/api/transactions/checkout
router.post('/checkout', verifyToken, async (req, res) => {
    try {
        const { userId, equipmentId, expectedReturnTime, destination, purpose } = req.body;

        // Note: verifyToken puts the logged-in user in req.user.id
        // We generally should trust that over the 'userId' sent in the body for security,
        // but since your system might be used by an Admin checking out for a student, 
        // we'll keep using 'userId' from body if that's your logic.
        const targetUserId = userId || req.user.id; 

        const user = await User.findById(targetUserId);
        if (user.responsibilityScore < 70) {
            
            await AuditLog.create({
                action: "CHECKOUT_DENIED",
                user: targetUserId,
                details: `Denied due to low score: ${user.responsibilityScore}`
            });
            return res.status(403).json({ message: "Security Alert: You are banned from borrowing equipment due to low responsibility score." });
        }

        
        const returnDate = new Date(expectedReturnTime);
        const now = new Date();
        const hoursDifference = Math.abs(returnDate - now) / 36e5; 

        if (hoursDifference > MAX_LOAN_HOURS) {
            return res.status(400).json({ message: `Security Policy: You cannot borrow items for more than ${MAX_LOAN_HOURS} hours.` });
        }

      
        const equipment = await Equipment.findById(equipmentId);
        if (!equipment || equipment.status !== 'Available') {
            return res.status(400).json({ message: "Error: Equipment is not available." });
        }

        
        const newTransaction = new Transaction({
            user: targetUserId,
            equipment: equipmentId,
            expectedReturnTime: expectedReturnTime,
            destination: destination,
            purpose: purpose,
            
            checkoutPhotoUrl: "", 
            signatureUrl: ""
        });
        const savedTransaction = await newTransaction.save();

        
        equipment.status = 'Checked Out';
        await equipment.save();

    
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
        
  
        const isLate = new Date() > new Date(transaction.expectedReturnTime);
        if (isLate) {
            transaction.status = 'Overdue'; 
        }
        
        await transaction.save();

  
        const equipment = await Equipment.findById(equipmentId);
        equipment.status = 'Available';
        equipment.condition = condition || equipment.condition; 
        await equipment.save();

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
        // Combine date ("2025-10-25") and time ("14:00")
        const startString = `${reservationDate}T${reservationTime}:00`;
        const startTime = new Date(startString);
        
        // Validation: Invalid Date
        if (isNaN(startTime.getTime())) {
            return res.status(400).json({ message: "Invalid date or time format." });
        }

        // Default duration: 2 hours (You can change this logic later)
        const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); 

        // 2. Validate: Cannot reserve in the past
        if (startTime < new Date()) {
            return res.status(400).json({ message: "Cannot reserve for a past date/time." });
        }

        // 3. CONFLICT CHECK: Is it already booked?
        // We look for any "Active", "Borrowed", or "Reserved" transaction that overlaps.
        const conflict = await Transaction.find({
            equipment: equipmentId,
            status: { $in: ['Active', 'Borrowed', 'Reserved'] },
            $or: [
                // New start time is inside an existing booking
                { startTime: { $lte: startTime }, expectedReturnTime: { $gt: startTime } },
                // New end time is inside an existing booking
                { startTime: { $lt: endTime }, expectedReturnTime: { $gte: endTime } },
                // New booking completely covers an existing one
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

        // Security: Ensure the user owns this transaction
        if (transaction.user.toString() !== req.user.id) {
            return res.status(403).json({ message: "Unauthorized: You do not own this reservation." });
        }

        // Logic: Can only cancel 'Reserved' items (not Active/Borrowed ones)
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