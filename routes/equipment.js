const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');


router.post('/', async (req, res) => {
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


router.delete('/:id', async (req, res) => {
    try {
        await Equipment.findByIdAndDelete(req.params.id);
        res.status(200).json("Equipment has been deleted...");
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;