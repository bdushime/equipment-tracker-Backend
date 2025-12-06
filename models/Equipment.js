const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema({
  name: { 
      type: String, 
      required: true 
  }, 
  
  type: { 
      type: String, 
      required: true,
      enum: ['Laptop', 'Projector', 'Camera', 'Microphone', 'Other'] 
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

  condition: {
      type: String,
      default: 'Good'
  },
  
  
}, { timestamps: true }); 

module.exports = mongoose.model('Equipment', equipmentSchema);