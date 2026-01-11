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
    damagePenalty: { type: Number, default: 10 }
}, { timestamps: true });

module.exports = mongoose.model('Config', ConfigSchema);