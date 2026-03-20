const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyToken } = require('../middleware/verifyToken'); 
const { checkRole } = require('../middleware/checkRole'); // 👇 IMPORT THIS

// ==========================================
// 1. ADMIN ROUTES (Manage Users)
// ==========================================

// GET ALL USERS (For Admin User List) - Paginated
router.get('/', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const skip = (page - 1) * limit;

        const [users, total] = await Promise.all([
            User.find()
                .select('-password')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            User.countDocuments()
        ]);

        // Back-compat: if frontend expects an array, it can call `/api/users?raw=true`
        if (String(req.query.raw).toLowerCase() === 'true') {
            return res.status(200).json(users);
        }

        return res.status(200).json({
            items: users,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1
        });
    } catch (err) {
        res.status(500).json(err);
    }
});

// CREATE NEW USER (For Admin "Add User" Modal)
router.post('/', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        const { firstName, lastName, email, role, department } = req.body;

        // Auto-generate username from email
        const username = email.split('@')[0];
        const tempPassword = "password123"; // Default password

        const newUser = new User({
            fullName: `${firstName} ${lastName}`,
            username,
            email,
            role,
            department,
            password: tempPassword // Model pre-save hook will hash this
        });

        const savedUser = await newUser.save();
        
        // Remove password before sending back
        const { password, ...others } = savedUser._doc;
        res.status(201).json(others);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error creating user. Email or Username might be taken." });
    }
});

// ==========================================
// 2. PROFILE ROUTE
// ==========================================

// GET CURRENT USER PROFILE
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const { password, ...others } = user._doc;
        res.status(200).json(others);
    } catch (err) {
        res.status(500).json(err);
    }
});

// ==========================================
// 3. SPECIFIC ID ROUTES (Must be last)
// ==========================================

// UPDATE USER
router.put('/:id', verifyToken, async (req, res) => {
    // Security: Only allow Admin OR the user themselves to update
    if (req.user.role !== 'Admin' && req.user.id !== req.params.id) {
        return res.status(403).json("You can only update your own account");
    }

    try {
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true }
        );
        res.status(200).json(updatedUser);
    } catch (err) {
        res.status(500).json(err);
    }
});

// DELETE USER (Protected for Admin)
router.delete('/:id', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.status(200).json("User has been deleted...");
    } catch (err) {
        res.status(500).json(err);
    }
});

// GET USER BY ID
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        const { password, ...others } = user._doc;
        res.status(200).json(others);
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;