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

module.exports = router;