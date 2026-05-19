require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const jwt = require('jsonwebtoken');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const user = await User.findOne({ email: 'security@tracknity.com' });
    if (!user) {
        console.error("User not found");
        return mongoose.disconnect();
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log("Generated Token:", token);
    
    // Call the local api first
    try {
        const res = await fetch('http://localhost:5001/api/transactions/security/dashboard-stats', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        console.log("Local Response dashboard-stats:");
        console.log(JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Local Error:", err.message);
    }

    // Call the Render api
    try {
        const res = await fetch('https://equipment-tracker-backend-dfso.onrender.com/api/transactions/security/dashboard-stats', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        console.log("Render Response dashboard-stats:");
        console.log(JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Render Error:", err.message);
    }
    
    await mongoose.disconnect();
}

run();
