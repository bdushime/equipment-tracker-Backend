const cron = require('node-cron');
const Equipment = require('../models/Equipment');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { sendNotification } = require('./emailService');

const startIoTCheck = () => {
    // Schedule: Run every minute
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

            // Find devices that have an IoT tag and are NOT 'Unknown'
            const devices = await Equipment.find({
                iotTag: { $exists: true, $ne: null },
                trackingStatus: { $ne: 'Unknown' }
            });

            for (const device of devices) {
                // If it's already LOST, don't change it to Unknown (Lost is higher priority)
                if (device.trackingStatus === 'Lost') continue;

                // Check lastSeen
                // If lastSeen is missing, treat as long ago (Offline)
                const lastSeen = device.lastSeen ? new Date(device.lastSeen) : new Date(0);

                if (lastSeen < fiveMinutesAgo) {
                    console.log(`⚠️ Device Offline: ${device.name} (${device.iotTag})`);

                    device.trackingStatus = 'Unknown';
                    await device.save();

                    // Log it
                    await AuditLog.create({
                        action: "IOT_OFFLINE",
                        details: `Device ${device.name} (${device.iotTag}) stopped sending signals.`
                    });

                    // Notify Staff
                    const staff = await User.find({ role: { $in: ['IT', 'IT_Staff', 'Admin', 'Security'] } });
                    for (const user of staff) {
                        await sendNotification(
                            user._id,
                            user.email,
                            "⚠️ IoT Device Offline",
                            `Warning: ${device.name} has stopped communication. Last seen in ${device.location || 'Unknown'}.`,
                            "warning",
                            device._id
                        );
                    }
                }
            }
        } catch (err) {
            console.error("IoT Check Error:", err);
        }
    });
};

module.exports = startIoTCheck;
