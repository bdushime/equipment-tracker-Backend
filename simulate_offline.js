require('dotenv').config();
const mongoose = require('mongoose');
const Equipment = require('./models/Equipment');

const simulateOffline = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        // Find one of our test trackers
        const device = await Equipment.findOne({ iotTag: "TRACK_TEST_007" }); // Choosing 007 randomly

        if (device) {
            console.log(`Simulating offline for: ${device.name}`);

            // Set lastSeen to 10 minutes ago
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            device.lastSeen = tenMinutesAgo;
            device.trackingStatus = 'Safe'; // Reset status so the cron job picks it up

            await device.save();
            console.log("Device updated. Waiting for Cron Job...");
        } else {
            console.log("Device not found.");
        }

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

simulateOffline();
