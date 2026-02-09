const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
    systemName: { type: String, default: 'Tracknity' },
    timezone: { type: String, default: 'Africa/Kigali' },
    currency: { type: String, default: 'RWF' },
    maintenanceMode: { type: Boolean, default: false },
    studentLimit: { type: Number, default: 3 },
    loanDuration: { type: Number, default: 3 }, // Days
    maxRenewals: { type: Number, default: 1 },
    latePenalty: { type: Number, default: 5 },
    damagePenalty: { type: Number, default: 10 },

    // Dynamic Lists for Dropdowns
    equipmentCategories: {
        type: [String],
        default: ["Laptop", "Tablet", "Camera", "Audio", "Video", "Projector", "Accessories", "Electronics", "Other"]
    },
    equipmentConditions: {
        type: [String],
        default: ["Excellent", "Good", "Fair", "Poor", "Damaged"]
    },
    equipmentStatuses: {
        type: [String],
        default: ["Available", "Checked Out", "Maintenance", "Damaged", "Lost"]
    }
}, { timestamps: true });

module.exports = mongoose.model('Config', ConfigSchema);