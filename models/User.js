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


UserSchema.pre('save', async function(next) {

    if (!this.isModified('password')) {
        return next();
    }

    const salt = await bcrypt.genSalt(10);
   
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

module.exports = mongoose.model('User', UserSchema);