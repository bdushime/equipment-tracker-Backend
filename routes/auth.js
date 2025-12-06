const express = require('express');
const router = express.Router();
const User = require('../models/User');



router.post('/register', async (req, res) => {
    try {
      
        const checkCriteria = [
            { email: req.body.email }, 
            { username: req.body.username }
        ];

        if (req.body.studentId) {
            checkCriteria.push({ studentId: req.body.studentId });
        }

        const existingUser = await User.findOne({ 
            $or: checkCriteria 
        });
        
        if (existingUser) {
            return res.status(400).json({ message: "User already exists (Email, Username, or Student ID)!" });
        }

        const newUser = new User(req.body);
        const savedUser = await newUser.save();
        
        res.status(201).json(savedUser);

    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});



router.post('/login', async (req, res) => {
    try {
       
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            return res.status(404).json({ message: "User not found!" });
        }

        
        if (user.password !== req.body.password) {
            return res.status(400).json({ message: "Wrong password!" });
        }

        user.lastLogin = new Date();
        await user.save();

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