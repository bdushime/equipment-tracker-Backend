require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// 1. Import Routes FIRST
const equipmentRoute = require('./routes/equipment');

// 2. Create the App
const app = express();

// 3. Setup Middleware (So the app can understand JSON)
app.use(express.json());
app.use(cors());

// 4. Connect Routes (Plug them in)
app.use('/api/equipment', equipmentRoute);

// Database Connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB Connected Successfully");
    } catch (error) {
        console.error(" MongoDB Connection Error:", error);
        process.exit(1);
    }
};

// Basic Route
app.get('/', (req, res) => {
    res.send('Equipment Tracker API is running...');
});

// Start Server
const PORT = process.env.PORT || 5001;
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(` Server running on port ${PORT}`);
    });
});