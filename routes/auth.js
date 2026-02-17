const router = require('express').Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// @route   POST /api/auth/register
// @desc    Register a new user (Secure + Validated)
// @access  Public
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, studentId } = req.body;

        // --- 1. INPUT VALIDATION ---
        if (!username || !email || !password) {
            return res.status(400).json({ message: "Please fill in all required fields." });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters." });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: "Invalid email format." });
        }

        // --- 2. DUPLICATE CHECK ---
        const checkCriteria = [
            { email: email }, 
            { username: username }
        ];

        if (studentId) {
            checkCriteria.push({ studentId: studentId });
        }

        const existingUser = await User.findOne({ 
            $or: checkCriteria 
        });
        
        if (existingUser) {
            return res.status(400).json({ message: "User already exists (Email, Username, or Student ID)!" });
        }

        // --- 3. CREATE USER ---
        const newUser = new User(req.body);
        const savedUser = await newUser.save();
        
        const { password: _, ...userInfo } = savedUser._doc;

        res.status(201).json(userInfo);

    } catch (err) {
        console.error("Register Error:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});

// @route   POST /api/auth/login
// @desc    Login user & get token
// @access  Public
router.post('/login', async (req, res) => {
    try {
        // 1. Find User by Email
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            return res.status(404).json({ message: "User not found!" });
        }

        // 2. VERIFY PASSWORD 
        const isMatch = await bcrypt.compare(req.body.password, user.password);
        
        if (!isMatch) {
            return res.status(400).json({ message: "Wrong password!" });
        }

        // 3. Update Last Login
        user.lastLogin = new Date();
        await user.save();

        // 4. Generate JWT Token (SESSION MANAGEMENT UPDATE)
        const token = jwt.sign(
            { id: user._id, role: user.role }, 
            process.env.JWT_SECRET || "mySuperSecretKey123", 
            { expiresIn: "7m" } //  CHANGED: Session now expires in 7 minutes
        );

        // 5. Send Response (excluding password)
        const { password, ...others } = user._doc;
        
        res.status(200).json({ ...others, token });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json(err);
    }
});

module.exports = router;