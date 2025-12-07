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
        enum: ['Active', 'Returned', 'Overdue'],
        default: 'Active'
    },
    
    checkoutPhotoUrl: { type: String, default: "" },
    signatureUrl: { type: String, default: "" }

}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);