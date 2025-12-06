const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');


router.post('/', async (req, res) => {
    try {
        
        const newEquipment = new Equipment(req.body);
  
        const savedEquipment = await newEquipment.save();
    
        res.status(201).json(savedEquipment);
    } catch (err) {
        res.status(500).json(err);
    }
});

// 2. GET ALL EQUIPMENT (GET)
// URL: http://localhost:5000/api/equipment
router.get('/', async (req, res) => {
    try {
        const allEquipment = await Equipment.find();
        res.status(200).json(allEquipment);
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;