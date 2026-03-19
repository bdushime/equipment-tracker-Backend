require('dotenv').config();
const mongoose = require('mongoose');
const Equipment = require('./models/Equipment');

const updateEquipment = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("DB Connected");

        const allEquipment = await Equipment.find({});
        console.log(`Found ${allEquipment.length} items.`);

        let count = 2; // Start from 002 since 001 is taken

        for (const item of allEquipment) {
            // Skip the Sony one if we want to preserve it exactly, or just ensure it follows pattern
            // User said: "All those devices... only one have the IoT tag... I want all those devices to have the IoT tag"
            // And "give all the others also the IoT tag"

            // Generate Random Room from specific ranges
            // 104-109, 202-210, 302-310
            const ranges = [
                { min: 104, max: 109 },
                { min: 202, max: 210 },
                { min: 302, max: 310 }
            ];

            const randomRange = ranges[Math.floor(Math.random() * ranges.length)];
            const randomRoomNumber = Math.floor(Math.random() * (randomRange.max - randomRange.min + 1)) + randomRange.min;
            const newLocation = `Room ${randomRoomNumber}`;

            // Generate Random Coordinates (Around Kigali - U of Rwanda approx)
            // Base: -1.9441, 30.0619
            // Offset: +/- 0.0010 (approx 100m)
            const baseLat = -1.9441;
            const baseLng = 30.0619;
            const latOffset = (Math.random() - 0.5) * 0.0020;
            const lngOffset = (Math.random() - 0.5) * 0.0020;

            item.geoCoordinates = {
                lat: baseLat + latOffset,
                lng: baseLng + lngOffset
            };

            // Check if it already has a "TRACK_" tag or if it is the Sony one
            let newTag = item.iotTag;

            if (!newTag || !newTag.startsWith('TRACK_')) {
                // Generate a unique tag
                // Pattern: TRACK_DEV_{000}
                // or just TRACK_TEST_{count} to match the Sony one
                const suffix = String(count).padStart(3, '0');
                newTag = `TRACK_TEST_${suffix}`;
                count++;
            }

            // If it is the Sony one, we might want to keep its tag but update location?
            if (item.name.includes("Sony Laser VPL-PHZ60")) {
                console.log(`Updating Sony location to ${newLocation}`);
            } else {
                console.log(`Updating ${item.name} -> Tag: ${newTag}, Loc: ${newLocation}`);
            }

            item.iotTag = newTag;
            item.location = newLocation;

            // Ensure tracking status is Safe if not set? 
            // The user didn't explicitly ask to reset status, but "Safe" or "Available" makes sense.
            // keeping existing status logic unless undefined.
            if (!item.trackingStatus || item.trackingStatus === 'Unknown') {
                item.trackingStatus = 'Safe';
            }

            await item.save();
        }

        console.log("All items updated successfully.");
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

updateEquipment();
