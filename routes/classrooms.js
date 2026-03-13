const express = require('express');
const router = express.Router();
const Classroom = require('../models/Classroom');
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');

// ==========================================
// 1. GET All Classrooms (Open to ALL logged-in users)
// ==========================================
// Students need this to check for screens before borrowing
router.get('/', verifyToken, async (req, res) => {
    try {
        const classrooms = await Classroom.find().sort({ name: 1 }); // Sort alphabetically
        res.status(200).json(classrooms);
    } catch (err) {
        console.error("Fetch Classrooms Error:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// ==========================================
// 2. CREATE Classroom (IT/Admin Only)
// ==========================================
router.post('/', verifyToken, checkRole(['IT', 'IT_Staff', 'Admin']), async (req, res) => {
    try {
        const { name, hasScreen } = req.body;

        // Check for duplicates
        const existingRoom = await Classroom.findOne({ name });
        if (existingRoom) {
            return res.status(400).json({ message: "Classroom already exists" });
        }

        const newRoom = new Classroom({ name, hasScreen });
        const savedRoom = await newRoom.save();
        res.status(201).json(savedRoom);
    } catch (err) {
        res.status(500).json(err);
    }
});

// ==========================================
// 3. UPDATE Classroom (IT/Admin Only)
// ==========================================
router.put('/:id', verifyToken, checkRole(['IT', 'IT_Staff', 'Admin']), async (req, res) => {
    try {
        const updatedRoom = await Classroom.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true } // Return the updated document
        );
        res.status(200).json(updatedRoom);
    } catch (err) {
        res.status(500).json(err);
    }
});

// ==========================================
// 4. DELETE Classroom (IT/Admin Only)
// ==========================================
router.delete('/:id', verifyToken, checkRole(['IT', 'IT_Staff', 'Admin']), async (req, res) => {
    try {
        await Classroom.findByIdAndDelete(req.params.id);
        res.status(200).json("Classroom has been deleted...");
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;