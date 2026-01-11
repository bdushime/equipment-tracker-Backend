require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');


const equipmentRoute = require('./routes/equipment');
const authRoute = require('./routes/auth');
const userRoute = require('./routes/users');
const transactionRoute = require('./routes/transactions');
const startOverdueCheck = require('./utils/overdueCheck');
const ticketRoute = require('./models/Ticket');
const analyticsRoute = require('./routes/analytics');
const securityRoute = require('./routes/security');
const chartsRoute = require('./routes/charts');


const app = express();


app.use(express.json());
app.use(cors());

app.use('/api/equipment', equipmentRoute);
app.use('/api/auth', authRoute);
app.use('/api/users', userRoute);
app.use('/api/transactions', transactionRoute);
app.use('/api/gate', require('./routes/gate'));
app.use('/api/tickets', ticketRoute);
app.use('/api/analytics', analyticsRoute);
app.use('/api/security', securityRoute);
app.use('/api/charts', chartsRoute);
app.use('/api/reports', require('./routes/reports'));
app.use('/api/data', require('./routes/data'));
app.use('/api/monitoring', require('./routes/monitoring'));


const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB Connected Successfully");
    } catch (error) {
        console.error(" MongoDB Connection Error:", error);
        process.exit(1);
    }
};


app.get('/', (req, res) => {
    res.send('Equipment Tracker API is running...');
});


startOverdueCheck();


const PORT = process.env.PORT || 5001;
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(` Server running on port ${PORT}`);
    });
});