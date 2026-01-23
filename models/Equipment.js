const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema({
  name: { 
      type: String, 
      required: true 
  }, 
  
  // Existing Description Field
  description: {
      type: String,
      default: ""
  },

  type: { 
      type: String, 
      required: true,
      enum: ['Laptop', 'Projector', 'Camera', 'Microphone', 'Tablet', 'Audio', 'Accessories', 'Other'] 
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

  // Existing Location Field
  location: {
      type: String,
      default: "Main Storage"
  },

  condition: {
      type: String,
      default: 'Good'
  },

  // =========================================================
  // 👇 NEW IOT TRACKING FIELDS (Added for ESP8266 Integration)
  // =========================================================
  iotTag: { 
      type: String, 
      unique: true, 
      sparse: true // Allows this field to be empty (null) for items without trackers
  },
  
  trackingStatus: { 
      type: String, 
      enum: ['Safe', 'Lost', 'Unknown'], 
      default: 'Unknown' 
  },
  
  lastSeen: { 
      type: Date, 
      default: null 
  }
  
}, { timestamps: true }); 

module.exports = mongoose.model('Equipment', equipmentSchema);