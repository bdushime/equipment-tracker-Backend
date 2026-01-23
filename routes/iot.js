const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const AuditLog = require('../models/AuditLog');
const { sendNotification } = require('../utils/emailService');
const User = require('../models/User');

// Security Middleware: Check for the Secret Key
const verifyIoTKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.IOT_API_KEY) {
        return res.status(401).json({ message: "Unauthorized Device" });
    }
    next();
};

// ==========================================
// RECEIVE STATUS UPDATE FROM ESP8266
// ==========================================
router.post('/update', verifyIoTKey, async (req, res) => {
    try {
        const { tag, status, location } = req.body;

        if (!tag || !status) {
            return res.status(400).json({ message: "Missing tag or status" });
        }

        // 1. Find the Equipment by its Tag
        const equipment = await Equipment.findOne({ iotTag: tag });

        if (!equipment) {
            console.log(`[IoT Warning] Signal received for unknown tag: ${tag}`);
            return res.status(404).json({ message: "Tag not registered" });
        }

        // 2. Update Heartbeat (Last Seen)
        equipment.lastSeen = Date.now();

        // 3. Check for Status Change
        if (equipment.trackingStatus !== status) {
            equipment.trackingStatus = status;
            
            // If LOST, trigger the Alarm!
            if (status === 'LOST') {
                console.log(`[IoT CRITICAL] ${equipment.name} is LOST at ${location}!`);

                // A. Log it
                await AuditLog.create({
                    action: "IOT_ALERT_LOST",
                    details: `IoT Sensor reported ${equipment.name} (${tag}) removed from ${location}.`
                });

                // B. Notify IT Staff & Security
                const staff = await User.find({ role: { $in: ['IT', 'IT_Staff', 'Admin', 'Security'] } });
                
                for (const user of staff) {
                    await sendNotification(
                        user._id,
                        user.email,
                        "🚨 SECURITY ALERT: Equipment Removed",
                        `CRITICAL: ${equipment.name} has moved out of the authorized zone (${location}).`,
                        "error",
                        equipment._id
                    );
                }
            }
        }
        
        await equipment.save();
        res.status(200).json({ message: "Status updated" });

    } catch (err) {
        console.error("IoT Route Error:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

module.exports = router;