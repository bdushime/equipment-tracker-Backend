const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema({
  name: { 
      type: String, 
      required: true 
  }, 
  
  // Added Description Field ✅
  description: {
      type: String,
      default: ""
  },

  type: { 
      type: String, 
      required: true,
      // Note: If you want to allow 'Tablet', 'Audio', 'Accessories', add them here!
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

  // Added Location Field ✅
  location: {
      type: String,
      default: "Main Storage"
  },

  condition: {
      type: String,
      default: 'Good'
  },
  
}, { timestamps: true }); 

module.exports = mongoose.model('Equipment', equipmentSchema);