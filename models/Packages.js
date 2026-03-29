const mongoose = require('mongoose');

const PackageSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true, 
        trim: true 
    },
    description: { 
        type: String, 
        required: true 
    },
    items: [{ 
        type: String, 
        required: true 
    }], 
    isActive: { 
        type: Boolean, 
        default: true 
    }
}, { timestamps: true });

module.exports = mongoose.model('Package', PackageSchema);