const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');

// ==========================================
// 1. GET All Courses (Open to ALL logged-in users)
// ==========================================
router.get('/', verifyToken, async (req, res) => {
    try {
        const courses = await Course.find().sort({ code: 1 }); // Sort by code
        res.status(200).json(courses);
    } catch (err) {
        console.error("Fetch Courses Error:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// ==========================================
// 2. CREATE Course (IT/Admin Only)
// ==========================================
router.post('/', verifyToken, checkRole(['IT', 'IT_Staff', 'Admin']), async (req, res) => {
    try {
        const { code, name, description } = req.body;

        // Check for duplicates
        const existingCourse = await Course.findOne({ code });
        if (existingCourse) {
            return res.status(400).json({ message: "Course with this code already exists" });
        }

        const newCourse = new Course({ code, name, description });
        const savedCourse = await newCourse.save();
        res.status(201).json(savedCourse);
    } catch (err) {
        console.error("Create Course Error:", err);
        res.status(500).json(err);
    }
});

// ==========================================
// 3. UPDATE Course (IT/Admin Only)
// ==========================================
router.put('/:id', verifyToken, checkRole(['IT', 'IT_Staff', 'Admin']), async (req, res) => {
    try {
        const updatedCourse = await Course.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true } // Return the updated document
        );
        res.status(200).json(updatedCourse);
    } catch (err) {
        res.status(500).json(err);
    }
});

// ==========================================
// 4. DELETE Course (IT/Admin Only)
// ==========================================
router.delete('/:id', verifyToken, checkRole(['IT', 'IT_Staff', 'Admin']), async (req, res) => {
    try {
        await Course.findByIdAndDelete(req.params.id);
        res.status(200).json("Course has been deleted...");
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;
