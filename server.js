// Import necessary packages
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const startIoTCheck = require('./utils/iotCheck');

// Import your routes
const equipmentRoute = require('./routes/equipment');
const authRoute = require('./routes/auth');
const userRoute = require('./routes/users');
const transactionRoute = require('./routes/transactions');
const startOverdueCheck = require('./utils/overdueCheck');
const ticketRoute = require('./models/Ticket');
const analyticsRoute = require('./routes/analytics');
const securityRoute = require('./routes/security');
const chartsRoute = require('./routes/charts');
const notificationRoute = require('./routes/notifications');
const iotRoute = require('./routes/iot');
const classroomRoute = require('./routes/classrooms');
const courseRoute = require('./routes/courses');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`); // Unique filename format
    }
});
const upload = multer({ storage });

// Register routes
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
app.use('/api/config', require('./routes/config'));
app.use('/api/notifications', notificationRoute);
app.use('/api/courses', courseRoute);

// Checkout route to handle multiple file uploads
app.post('/api/transactions/checkout', upload.array('checkoutPhotos', 10), async (req, res) => {
    try {
        const transactionData = {
            user: req.body.user,
            equipment: req.body.equipment,
            startTime: req.body.startTime ? new Date(req.body.startTime) : Date.now(),
            expectedReturnTime: req.body.expectedReturnTime ? new Date(req.body.expectedReturnTime) : null,
            destination: req.body.destination,
            purpose: req.body.purpose,
            status: req.body.status || 'Borrowed',
            checkoutPhotoUrls: req.files.map(file => `/uploads/${file.filename}`)
        };

        // Save the transaction (adjust according to your model)
        const Transaction = require('./models/Transaction');
        const transaction = new Transaction(transactionData);
        await transaction.save();

        res.status(201).json(transaction);
    } catch (error) {
        console.error('Error during checkout:', error);
        res.status(500).send('Internal Server Error');
    }
});

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB Connected Successfully");
    } catch (error) {
        console.error("MongoDB Connection Error:", error);
        process.exit(1);
    }
};

app.get('/', (req, res) => {
    res.send('Equipment Tracker API is running...');
});

// Start overdue check if applicable
startOverdueCheck();
startIoTCheck(); // Start IoT Monitoring

// ... (rest of the file)

const PORT = process.env.PORT || 5001;
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT} | Restarted at ${new Date().toLocaleTimeString()}`);
    });
});
