const router = require('express').Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ==========================================
// @route   POST /api/auth/register
// @desc    Register a new user (Secure + Validated)
// @access  Public
// ==========================================
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

        // --- 2. DUPLICATE CHECK (UPDATED: Specific Error Messages) ---
        
        // Check Email
        const existingEmail = await User.findOne({ email: email });
        if (existingEmail) {
            return res.status(400).json({ message: "This Email address is already registered!" });
        }

        // Check Username
        const existingUsername = await User.findOne({ username: username });
        if (existingUsername) {
            return res.status(400).json({ message: "This Username is already taken!" });
        }

        // Check Student ID (if provided)
        if (studentId) {
            const existingStudentId = await User.findOne({ studentId: studentId });
            if (existingStudentId) {
                return res.status(400).json({ message: "This Student ID is already in use!" });
            }
        }

        // --- 3. CREATE USER ---
        const newUser = new User(req.body);
        const savedUser = await newUser.save();
        
        // Remove password from the response for security
        const { password: _, ...userInfo } = savedUser._doc;

        res.status(201).json(userInfo);

    } catch (err) {
        console.error("Register Error:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});

// ==========================================
// @route   POST /api/auth/login
// @desc    Login user & get token
// @access  Public
// ==========================================
router.post('/login', async (req, res) => {
    try {
        // 1. Find User by Email
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            return res.status(404).json({ message: "User not found!" });
        }

        // --- NEW: Check if user is suspended
        if (user.status === 'Suspended') {
            return res.status(403).json({ message: "Your account is suspended. Please contact the administrator." });
        }

        // 2. VERIFY PASSWORD 
        const isMatch = await bcrypt.compare(req.body.password, user.password);

        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials!" });
        }

        // 3. Update Last Login
        user.lastLogin = new Date();
        // Capture Device Info from User Agent
        const ua = req.headers['user-agent'] || "";
        if (ua.includes('Mobi') && !ua.includes('Tablet')) {
            user.lastDevice = "Mobile Device";
        } else if (ua.includes('Tablet') || ua.includes('iPad')) {
            user.lastDevice = "Tablet Browser";
        } else {
            user.lastDevice = "Desktop Browser";
        }

        user.lastIp = req.ip || "10.0.0.X";
        user.lastLocation = "Kigali, RW"; // Default for now

        console.log(`[LOGIN] User: ${user.username}, Device: ${user.lastDevice}, UA: ${ua.substring(0, 50)}...`);
        await user.save();

        // 4. Generate JWT Token (SESSION MANAGEMENT UPDATE)
        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET || "mySuperSecretKey123",
            { expiresIn: "5d" }
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