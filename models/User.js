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
        enum: ['Student', 'Admin', 'Security', 'IT_Staff'],
        default: 'Student'
    },
    studentId: {
        type: String,
    },
    fullName: { type: String },
    phone: { type: String },
    responsibilityScore: {
        type: Number,
        default: 100
    },
    lastLogin: {
        type: Date
    }
}, { timestamps: true });

// --- THE FIX IS HERE ---
// Notice: We removed 'next' from the function arguments: async function()
UserSchema.pre('save', async function() { 

    // If password is not modified, we just return (exit the function)
    if (!this.isModified('password')) {
        return; 
    }

    // Generate salt and hash
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    
    
});

module.exports = mongoose.model('User', UserSchema);