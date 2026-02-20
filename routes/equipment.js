const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');

// ==========================================
// 1. Create New Equipment 
// ==========================================
// 👇 FIX: Added Security and IT_Staff to allowed roles
router.post('/', verifyToken, checkRole(['IT', 'IT_Staff', 'Admin', 'Security']), async (req, res) => {
    try {
        const newEquipment = new Equipment(req.body);
        const savedEquipment = await newEquipment.save();
        res.status(201).json(savedEquipment);
    } catch (err) {
        res.status(500).json(err);
    }
});

// ==========================================
// 2. BROWSE & FILTER ROUTE
// ==========================================
router.get('/browse', async (req, res) => {
    try {
        const { search, category, status } = req.query;
        let query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        if (category && category !== 'All Categories') {
            query.type = category; 
        }

        if (status) {
            if (status === 'Available') query.status = 'Available';
            if (status === 'Unavailable') query.status = { $ne: 'Available' };
        }

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
// 4. Update Equipment (With Spy Logs 🕵️‍♂️)
// ==========================================
// 👇 FIX: Added authentication and role checks to the update route
router.put('/:id', verifyToken, checkRole(['IT', 'IT_Staff', 'Admin', 'Security']), async (req, res) => {
    try {
        console.log("-----------------------------------------");
        console.log("📝 UPDATE REQUEST RECEIVED");
        console.log("🆔 ID:", req.params.id);
        console.log("📦 BODY:", req.body);

        // 1. Check if ID is valid
        if (!req.params.id || req.params.id === 'undefined') {
            console.log("❌ ERROR: Invalid ID");
            return res.status(400).json({ message: "Invalid ID provided" });
        }

        // 2. Attempt the update
        const updatedEquipment = await Equipment.findByIdAndUpdate(
            req.params.id, 
            { $set: req.body }, 
            { new: true, runValidators: true } // runValidators ensures data matches Schema rules
        );

        if (!updatedEquipment) {
            console.log("❌ ERROR: Equipment not found in DB with that ID");
            return res.status(404).json({ message: "Equipment not found" });
        }

        console.log("✅ SUCCESS: Updated item:", updatedEquipment.name);
        res.status(200).json(updatedEquipment);

    } catch (err) {
        console.error("🔥 CRASH during update:", err);
        res.status(500).json(err);
    }
});

// ==========================================
// 5. Delete Equipment 
// ==========================================
// 👇 FIX: Added Security and IT_Staff to allowed roles
router.delete('/:id', verifyToken, checkRole(['IT', 'IT_Staff', 'Admin', 'Security']), async (req, res) => {
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