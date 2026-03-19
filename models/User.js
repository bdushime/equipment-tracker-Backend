const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        // Removed duplicate 'Security'
        enum: ['Student', 'Admin', 'Security', 'IT_Staff'],
        default: 'Student'
    },
    studentId: {
        type: String,
    },
    fullName: { type: String },
    // 👇 NEW: Added Department for Admin Panel
    department: {
        type: String,
        default: 'General'
    },
    phone: { type: String },
    responsibilityScore: {
        type: Number,
        default: 100
    },
    status: {
        type: String,
        enum: ['Active', 'Suspended'],
        default: 'Active'
    },
    lastLogin: {
        type: Date,
        default: Date.now // 👇 NEW: Added default
    }
}, { timestamps: true });

UserSchema.pre('save', async function () {
    // If password is not modified, return
    if (!this.isModified('password')) {
        return;
    }

    // Generate salt and hash
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

module.exports = mongoose.model('User', UserSchema);