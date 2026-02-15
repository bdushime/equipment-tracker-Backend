// File: src/models/Classroom.js
const mongoose = require('mongoose');

const classroomSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true, 
        trim: true
    },
    hasScreen: {
        type: Boolean,
        default: false 
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Classroom', classroomSchema);