const express = require('express');
const router = express.Router();
const User = require('../models/User');


router.post('/register', async (req, res) => {
    try {
        
        const existingUser = await User.findOne({ 
            $or: [
                { email: req.body.email }, 
                { username: req.body.username },
                { studentId: req.body.studentId } 
            ] 
        });
        
        if (existingUser) {
            return res.status(400).json({ message: "User (Email, Username, or ID) already exists!" });
        }

        
        const newUser = new User({
            username: req.body.username,
            studentId: req.body.studentId, 
            fullName: req.body.fullName,
            email: req.body.email,
            phone: req.body.phone,
            password: req.body.password, 
            role: req.body.role || 'Student'
        });
        
        const savedUser = await newUser.save();
        res.status(201).json(savedUser);
    } catch (err) {
        res.status(500).json(err);
    }
});

// 2. LOGIN USER
// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        // A. Find user by email
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            return res.status(404).json({ message: "User not found!" });
        }

        // B. Check password (Simple text check for now)
        if (user.password !== req.body.password) {
            return res.status(400).json({ message: "Wrong password!" });
        }

        // C. Update 'lastLogin' timestamp (Important for your dashboard stats)
        user.lastLogin = new Date();
        await user.save();

        // D. Send success response (Exclude the password from the response)
        const { password, ...others } = user._doc;
        
        res.status(200).json({ 
            message: "Login Successful", 
            user: others 
        });

    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;