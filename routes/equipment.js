const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');

// ==========================================
// 1. Create New Equipment (IT/Admin only)
// ==========================================
router.post('/', verifyToken, checkRole(['IT', 'Admin']), async (req, res) => {
    try {
        const newEquipment = new Equipment(req.body);
        const savedEquipment = await newEquipment.save();
        res.status(201).json(savedEquipment);
    } catch (err) {
        res.status(500).json(err);
    }
});

// ==========================================
// 2. BROWSE & FILTER ROUTE (New! ✨)
// ==========================================
// This handles search, category filtering, and status filtering.
// MUST come before router.get('/:id')
router.get('/browse', async (req, res) => {
    try {
        const { search, category, status } = req.query;
        
        let query = {};

        // A. Search by Name or Description (Case insensitive)
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // B. Filter by Category
        // Note: Frontend sends 'category', Schema uses 'type'
        if (category && category !== 'All Categories') {
            query.type = category; 
        }

        // C. Filter by Availability
        if (status) {
            if (status === 'Available') query.status = 'Available';
            if (status === 'Unavailable') query.status = { $ne: 'Available' };
        }

        // Return results sorted by name
        const equipment = await Equipment.find(query).sort({ name: 1 });
        res.status(200).json(equipment);

    } catch (err) {
        console.error("Browse Error:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// ==========================================
// 3. Get ALL Equipment (Simple List)
// ==========================================
router.get('/', async (req, res) => {
    try {
        const allEquipment = await Equipment.find();
        res.status(200).json(allEquipment);
    } catch (err) {
        res.status(500).json(err);
    }
});

// ==========================================
// 4. Update Equipment
// ==========================================
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

// ==========================================
// 5. Delete Equipment (Admin only)
// ==========================================
router.delete('/:id', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        await Equipment.findByIdAndDelete(req.params.id);
        res.status(200).json("Equipment has been deleted...");
    } catch (err) {
        res.status(500).json(err);
    }
});

// ==========================================
// 6. Get ONE Specific Item by ID
// ==========================================
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