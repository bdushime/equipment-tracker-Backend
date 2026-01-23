const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema({
  name: { 
      type: String, 
      required: true 
  }, 
  
  description: {
      type: String,
      default: ""
  },

  type: { 
      type: String, 
      required: true,
      enum: ['Laptop', 'Projector', 'Camera', 'Microphone', 'Tablet', 'Audio', 'Accessories', 'Electronics', 'Other'] 
  }, 
  
  serialNumber: { 
      type: String, 
      required: true, 
      unique: true 
  }, 
  
  status: { 
      type: String, 
      default: 'Available',
      enum: ['Available', 'Checked Out', 'Maintenance', 'Lost']
  },

  location: {
      // Allow flexible string storage (e.g. "Cabinet A") OR coordinates
      type: mongoose.Schema.Types.Mixed, 
      default: "Main Storage"
  },

  condition: {
      type: String,
      default: 'Good'
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
  
  // Necessary for "Online/Offline" check
  lastSeen: { 
      type: Date, 
      default: null 
  },

  // Necessary for Battery display
  batteryLevel: {
      type: Number,
      default: 100
  },

  // Necessary for Map display
  geoCoordinates: {
      lat: { type: Number },
      lng: { type: Number }
  }
  
}, { timestamps: true }); 

module.exports = mongoose.model('Equipment', equipmentSchema);