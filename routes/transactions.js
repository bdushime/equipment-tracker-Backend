const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const { verifyToken } = require('../middleware/verifyToken');
const Equipment = require('../models/Equipment');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog'); 
const MAX_LOAN_HOURS = 24; 


// URL: http://localhost:5001/api/transactions/checkout
router.post('/checkout',verifyToken, async (req, res) => {
    try {
        const { userId, equipmentId, expectedReturnTime, destination, purpose } = req.body;

        const user = await User.findById(userId);
        if (user.responsibilityScore < 70) {
           
            await AuditLog.create({
                action: "CHECKOUT_DENIED",
                user: userId,
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
            user: userId,
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
            user: userId,
            details: `Borrowed ${equipment.name} (Serial: ${equipment.serialNumber})`
        });

        res.status(201).json(savedTransaction);

    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});


router.post('/checkin',verifyToken, async (req, res) => {
    try {
        const { userId, equipmentId, condition } = req.body;

        const transaction = await Transaction.findOne({
            user: userId,
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

        const user = await User.findById(userId);

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