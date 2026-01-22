const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    recipient: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['info', 'success', 'warning', 'error'], 
        default: 'info' 
    },
    relatedId: { type: String }, // Can store Transaction ID or Equipment ID
    read: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Notification', NotificationSchema);