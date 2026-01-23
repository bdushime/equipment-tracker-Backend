const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const { verifyToken } = require('../middleware/verifyToken');

// ==========================================
// 1. GET IoT DASHBOARD DATA (Calculates Online/Offline)
// ==========================================
router.get('/live', verifyToken, async (req, res) => {
    try {
        // Find ALL equipment that has an iotTag
        const trackers = await Equipment.find({ 
            iotTag: { $exists: true, $ne: null } 
        });

        const now = new Date();
        const THRESHOLD_MINUTES = 5; 

        const stats = {
            total: trackers.length,
            online: 0,
            offline: 0,
            lowBattery: 0
        };

        const trackerData = trackers.map(t => {
            // Logic: If lastSeen is missing, default to 1970 (Offline)
            const lastPing = t.lastSeen ? new Date(t.lastSeen) : new Date(0);
            const diffMinutes = (now - lastPing) / 1000 / 60;
            
            // Logic: < 5 minutes = ONLINE
            const isOnline = diffMinutes < THRESHOLD_MINUTES;
            
            if (isOnline) stats.online++;
            else stats.offline++;

            const battery = t.batteryLevel || 0;
            if (battery < 20) stats.lowBattery++;

            return {
                id: t.iotTag,
                equipment: t.name,
                status: isOnline ? 'online' : 'offline', // Calculated status
                battery: battery,
                location: t.location || "Unknown",
                // Ensure we send coordinates for the Map
                geoCoordinates: t.geoCoordinates || { lat: -1.9441, lng: 30.0619 },
                lastSeen: t.lastSeen
            };
        });

        res.status(200).json({ stats, trackers: trackerData });

    } catch (err) {
        console.error("Monitoring Error:", err);
        res.status(500).json(err);
    }
});

// ==========================================
// 2. SIMULATE HEARTBEAT (Targeting TRACK_TEST_001)
// ==========================================
router.post('/simulate', verifyToken, async (req, res) => {
    try {
        console.log("[DEBUG] Simulation Requested...");

        // 1. Search for your SPECIFIC tag first
        let tracker = await Equipment.findOne({ iotTag: "TRACK_TEST_001" });

        // 2. Fallback: Find any tag if specific one is missing
        if (!tracker) {
            console.log("[DEBUG] TRACK_TEST_001 not found. Searching for any tag...");
            tracker = await Equipment.findOne({ iotTag: { $exists: true, $ne: null } });
        }

        if (!tracker) {
            return res.status(404).json({ message: "No tracker found with iotTag: TRACK_TEST_001" });
        }

        console.log(`[DEBUG] Updating Tracker: ${tracker.name} (${tracker.iotTag})`);

        // 3. FORCE UPDATE "lastSeen" to NOW
        tracker.lastSeen = new Date();
        
        // 4. Update Battery & Location (Mocking movement)
        tracker.batteryLevel = 95; 
        tracker.location = "Active Transit (Simulated)";
        tracker.geoCoordinates = { 
            lat: -1.9441 + (Math.random() * 0.001), 
            lng: 30.0619 + (Math.random() * 0.001) 
        };

        // 5. CRITICAL: Save to DB
        await tracker.save();

        console.log("[DEBUG] Update Saved. New Time:", tracker.lastSeen);
        
        res.status(200).json({ message: "Simulation successful", tracker });

    } catch (err) {
        console.error("Simulation Error:", err);
        res.status(500).json(err);
    }
});

module.exports = router;