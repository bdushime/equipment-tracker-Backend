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
        const { loginId, email, studentId, password: inputPassword } = req.body;

        if (!inputPassword) {
            return res.status(400).json({ message: "Password is required." });
        }

        // 1. Find User by Email OR Student ID
        const identifier = (loginId || email || studentId || "").toString().trim();
        if (!identifier) {
            return res.status(400).json({ message: "Provide a login identifier (email or student ID)." });
        }

        const user = await User.findOne({
            $or: [{ email: identifier }, { studentId: identifier }]
        });
        if (!user) {
            return res.status(404).json({ message: "User not found!" });
        }

        // --- NEW: Check if user is suspended
        if (user.status === 'Suspended') {
            return res.status(403).json({ message: "Your account is suspended. Please contact the administrator." });
        }

        // 2. VERIFY PASSWORD
        const isMatch = await bcrypt.compare(inputPassword, user.password);
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
            { id: user._id, role: user.role, mustChangePassword: user.mustChangePassword },
            process.env.JWT_SECRET || "mySuperSecretKey123",
            { expiresIn: "30m" } // CHANGED: Session now expires in 7 minutes
        );

        // 5. Send Response (excluding password)
        const { password: _password, ...others } = user._doc;

        res.status(200).json({ ...others, token, mustChangePassword: !!user.mustChangePassword });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json(err);
    }
});

// @route   PUT /api/auth/reset-first-password
// @desc    Reset temporary password on first login
// @access  Private
const { verifyToken } = require('../middleware/verifyToken');
router.put('/reset-first-password', verifyToken, async (req, res) => {
    try {
        const { newPassword, firstName, lastName } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: "New password must be at least 6 characters." });
        }

        const safeFirstName = (firstName || "").toString().trim();
        const safeLastName = (lastName || "").toString().trim();
        if (!safeFirstName || !safeLastName) {
            return res.status(400).json({ message: "First name and last name are required on first login." });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User not found!" });
        }
        if (!user.mustChangePassword) {
            return res.status(400).json({ message: "First-login reset is already completed for this account." });
        }

        user.password = newPassword;
        user.fullName = `${safeFirstName} ${safeLastName}`;
        user.mustChangePassword = false;
        await user.save();

        return res.status(200).json({ message: "Password and profile name updated successfully. You can now use all features." });
    } catch (err) {
        console.error("Reset First Password Error:", err);
        return res.status(500).json({ message: "Server Error", error: err.message });
    }
});

module.exports = router;