const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',        
        required: true
    },
    equipment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Equipment',   
        required: true
    },
    // --- NEW FIELD: When does the booking START? ---
    // For immediate borrow, this is Date.now(). 
    // For reservations, this is a future date.
    startTime: {
        type: Date,
        required: true,
        default: Date.now 
    },
    // We keep checkoutTime for record-keeping of when they actually picked it up
    checkoutTime: {
        type: Date,
        default: Date.now
    },
    expectedReturnTime: {
        type: Date,
        required: true
    },
    returnTime: {
        type: Date,
        default: null       
    },
    destination: {
        type: String,
        required: true      
    },
    purpose: {
        type: String,
        required: true      
    },
    status: {
        type: String,
        // 👇 UPDATED: Added 'Pending Return' to the allowed list
        enum: [
            'Active', 
            'Borrowed', 
            'Returned', 
            'Overdue', 
            'Reserved', 
            'Cancelled', 
            'Pending',      
            'Denied',       
            'Checked Out',
            'Pending Return' // <--- NEWLY ADDED
        ],
        default: 'Borrowed'
    },
    
    checkoutPhotoUrl: { type: String, default: "" },
    signatureUrl: { type: String, default: "" }

}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);