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
        enum: ['Student', 'Admin', 'Security', 'IT_Staff','Gate_Keeper'],
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
    mustChangePassword: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['Active', 'Suspended'],
        default: 'Active'
    },
    // --- Lockout (separate from Suspension) ---
    // Suspension is a long-term admin punishment; lockout is automatic after
    // too many failed password attempts and only an admin can clear it.
    loginAttempts: {
        type: Number,
        default: 0
    },
    isLocked: {
        type: Boolean,
        default: false
    },
    lockedAt: {
        type: Date,
        default: null
    },
    lastLogin: {
        type: Date,
        default: Date.now // 👇 NEW: Added default
    },
    // Device Tracking
    lastDevice: { type: String, default: "Web Browser" },
    lastIp: { type: String, default: "127.0.0.1" },
    lastLocation: { type: String, default: "Kigali, RW" },
    // Password Reset & OTP Fields
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    otpCode: { type: String },
    otpExpires: { type: Date }
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