const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Equipment = require('../models/Equipment');


// URL: http://localhost:5001/api/transactions/checkout
router.post('/checkout', async (req, res) => {
    try {
       
        const equipment = await Equipment.findById(req.body.equipmentId);
        if (!equipment) {
            return res.status(404).json({ message: "Equipment not found!" });
        }

        if (equipment.status !== 'Available') {
            return res.status(400).json({ message: "Error: This item is already checked out or in maintenance!" });
        }

        
        const newTransaction = new Transaction({
            user: req.body.userId,           
            equipment: req.body.equipmentId, 
            expectedReturnTime: req.body.expectedReturnTime,
            destination: req.body.destination,
            purpose: req.body.purpose,
            checkoutPhotoUrl: req.body.checkoutPhotoUrl || "", 
            signatureUrl: req.body.signatureUrl || ""
        });
        
        const savedTransaction = await newTransaction.save();

        equipment.status = 'Checked Out';
        await equipment.save();

        res.status(201).json(savedTransaction);

    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;