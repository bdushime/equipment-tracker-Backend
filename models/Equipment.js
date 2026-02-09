const mongoose = require('mongoose');

/**
 * Equipment Schema - REFACTORED for Asset-Level Tracking
 * 
 * IMPORTANT REFACTOR DECISIONS:
 * 1. Each record represents ONE physical device (asset-level tracking)
 * 2. Removed: quantity, available, total fields (availability is inferred by counting devices per status)
 * 3. Added: structured specifications field (category-specific key-value pairs)
 * 4. Department is now optional (not required for Security Officers)
 * 5. Extended category enum to include more device types
 */
const equipmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Device name is required']
    },

    description: {
        type: String,
        default: ""
    },

    // Extended category list for better categorization
    type: {
        type: String,
        required: [true, 'Device category is required'],
        enum: ['Laptop', 'Projector', 'Camera', 'Microphone', 'Tablet', 'Audio', 'Video', 'Router', 'Accessories', 'Electronics', 'Other']
    },

    serialNumber: {
        type: String,
        required: [true, 'Serial number is required'],
        unique: true
    },

    status: {
        type: String,
        default: 'Available',
        enum: ['Available', 'Checked Out', 'Maintenance', 'Damaged', 'Lost']
    },

    location: {
        type: mongoose.Schema.Types.Mixed,
        default: "Main Storage"
    },

    condition: {
        type: String,
        default: 'Good',
        enum: ['Excellent', 'Good', 'Fair', 'Poor', 'Damaged']
    },

    // Device identification fields
    brand: {
        type: String,
        default: ""
    },

    model: {
        type: String,
        default: ""
    },

    // Department is optional - NOT required for Security Officers
    department: {
        type: String,
        default: ""
    },

    // =========================================================
    // 👇 REMOVED: quantity, available, total fields
    // Availability is now inferred by counting devices per status
    // =========================================================

    // Purchase and warranty information
    purchaseDate: {
        type: Date,
        default: null
    },

    // Purchase price - required for Security Officers, optional for others
    purchasePrice: {
        type: Number,
        default: 0,
        min: [0, 'Purchase price cannot be negative']
    },

    warrantyExpiry: {
        type: Date,
        default: null
    },

    // =========================================================
    // 👇 NEW: Structured Specifications (Category-specific)
    // Stores specs as key-value pairs instead of free-text
    // Example: { ram: "16GB", storage: "512GB SSD", cpu: "i7-12700H" }
    // =========================================================
    specifications: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // Track who added this device
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    addedByRole: {
        type: String,
        enum: ['Student', 'Security', 'IT', 'Admin'],
        default: null
    },

    // =========================================================
    // 👇 IOT TRACKING FIELDS (Updated for Simulation)
    // =========================================================
    iotTag: {
        type: String,
        unique: true,
        sparse: true
    },

    trackingStatus: {
        type: String,
        enum: ['Safe', 'Lost', 'Unknown'],
        default: 'Unknown'
    },

    lastSeen: {
        type: Date,
        default: null
    },

    batteryLevel: {
        type: Number,
        default: 100
    },

    geoCoordinates: {
        lat: { type: Number },
        lng: { type: Number }
    }

}, { timestamps: true });

// Index for faster availability queries
equipmentSchema.index({ type: 1, status: 1 });

module.exports = mongoose.model('Equipment', equipmentSchema);