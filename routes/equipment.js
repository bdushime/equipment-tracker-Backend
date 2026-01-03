const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');


router.post('/', verifyToken, checkRole(['IT', 'Admin']), async (req, res) => {
    try {
        
        const newEquipment = new Equipment(req.body);
  
        const savedEquipment = await newEquipment.save();
    
        res.status(201).json(savedEquipment);
    } catch (err) {
        res.status(500).json(err);
    }
});


router.get('/', async (req, res) => {
    try {
        const allEquipment = await Equipment.find();
        res.status(200).json(allEquipment);
    } catch (err) {
        res.status(500).json(err);
    }
});


router.put('/:id', async (req, res) => {
    try {
        const updatedEquipment = await Equipment.findByIdAndUpdate(
            req.params.id, 
            { $set: req.body }, 
            { new: true }       
        );
        res.status(200).json(updatedEquipment);
    } catch (err) {
        res.status(500).json(err);
    }
});


router.delete('/:id', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        await Equipment.findByIdAndDelete(req.params.id);
        res.status(200).json("Equipment has been deleted...");
    } catch (err) {
        res.status(500).json(err);
    }
});


// Description: Get one specific item by its ID
router.get('/:id', async (req, res) => {
    try {
        const equipment = await Equipment.findById(req.params.id);
        if (!equipment) {
            return res.status(404).json("Equipment not found");
        }
        res.status(200).json(equipment);
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;