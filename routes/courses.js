const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');

// GET all courses
router.get('/', async (req, res) => {
    try {
        const courses = await Course.find().collation({ locale: 'en', strength: 2 }).sort({ name: 1 });
        res.json(courses);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST a new course
router.post('/', async (req, res) => {
    const { code, name } = req.body;
    try {
        const existingCourse = await Course.findOne({ code: code.toUpperCase() });
        if (existingCourse) {
            return res.status(400).json({ message: "Course code already exists" });
        }
        const course = new Course({ code, name });
        const newCourse = await course.save();
        res.status(201).json(newCourse);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// PUT update a course
router.put('/:id', async (req, res) => {
    try {
        const { code, name } = req.body;
        const course = await Course.findByIdAndUpdate(req.params.id, { code, name }, { new: true });
        if (!course) return res.status(404).json({ message: "Course not found" });
        res.json(course);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// DELETE a course
router.delete('/:id', async (req, res) => {
    try {
        const course = await Course.findByIdAndDelete(req.params.id);
        if (!course) return res.status(404).json({ message: "Course not found" });
        res.json({ message: "Course deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
