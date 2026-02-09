const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');

// ==========================================
// HELPER: Validate device data based on role
// ==========================================
const validateDeviceForRole = (device, role) => {
    const errors = [];

    // Common required fields
    if (!device.name || device.name.trim() === '') {
        errors.push('Device name is required');
    }
    if (!device.type && !device.category) {
        errors.push('Category is required');
    }
    if (!device.serialNumber || device.serialNumber.trim() === '') {
        errors.push('Serial number is required');
    }

    // Security Officer specific validation
    if (role === 'Security') {
        // Purchase price is REQUIRED for Security Officers
        if (device.purchasePrice === undefined || device.purchasePrice === null || device.purchasePrice === '') {
            errors.push('Purchase price is required for Security Officers');
        } else {
            const price = parseFloat(device.purchasePrice);
            if (isNaN(price) || price < 0) {
                errors.push('Purchase price must be a valid number ≥ 0');
            }
        }

        // Location is required
        if (!device.location || device.location.trim() === '') {
            errors.push('Location is required');
        }

        // Brand and model are required
        if (!device.brand || device.brand.trim() === '') {
            errors.push('Brand is required');
        }
        if (!device.model || device.model.trim() === '') {
            errors.push('Model is required');
        }
    }

    return errors;
};

// ==========================================
// 1. Create New Equipment (IT/Admin/Security)
// REFACTORED: Adds role tracking, auto-sets status for Security
// ==========================================
router.post('/', verifyToken, checkRole(['IT', 'Admin', 'Security']), async (req, res) => {
    try {
        const userRole = req.user.role;
        const deviceData = { ...req.body };

        // Map category to type if needed (frontend uses 'category', backend uses 'type')
        if (deviceData.category && !deviceData.type) {
            deviceData.type = deviceData.category;
            delete deviceData.category;
        }

        // REFACTOR: Security Officers auto-set status to Available
        if (userRole === 'Security') {
            deviceData.status = 'Available';
            // Remove department if accidentally included
            delete deviceData.department;
        }

        // Validate based on role
        const validationErrors = validateDeviceForRole(deviceData, userRole);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: validationErrors
            });
        }

        // Track who added this device
        deviceData.addedBy = req.user.id;
        deviceData.addedByRole = userRole;

        // REFACTOR: Remove legacy quantity fields if accidentally passed
        delete deviceData.quantity;
        delete deviceData.available;
        delete deviceData.total;

        const newEquipment = new Equipment(deviceData);
        const savedEquipment = await newEquipment.save();

        console.log(`✅ Device created by ${userRole}: ${savedEquipment.name}`);
        res.status(201).json(savedEquipment);
    } catch (err) {
        console.error('❌ Error creating device:', err);
        if (err.code === 11000) {
            return res.status(400).json({
                message: 'Serial number already exists',
                errors: ['A device with this serial number already exists']
            });
        }
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// ==========================================
// 2. BULK UPLOAD - Create Multiple Devices
// NEW: Handles bulk CSV/Excel uploads with validation
// ==========================================
router.post('/bulk', verifyToken, checkRole(['IT', 'Admin', 'Security']), async (req, res) => {
    try {
        const userRole = req.user.role;
        const { devices } = req.body;

        if (!devices || !Array.isArray(devices) || devices.length === 0) {
            return res.status(400).json({
                message: 'No devices provided',
                errors: ['Please provide an array of devices to upload']
            });
        }

        const results = {
            success: [],
            failed: [],
            totalProcessed: devices.length
        };

        // Process each device
        for (let i = 0; i < devices.length; i++) {
            const device = { ...devices[i] };
            const rowNumber = i + 1;

            try {
                // Map category to type
                if (device.category && !device.type) {
                    device.type = device.category;
                    delete device.category;
                }

                // REFACTOR: Security Officers - auto-set defaults
                if (userRole === 'Security') {
                    device.status = 'Available';
                    delete device.department;
                }

                // Apply default values
                device.status = device.status || 'Available';
                device.condition = device.condition || 'Good';

                // Track who added this device
                device.addedBy = req.user.id;
                device.addedByRole = userRole;

                // REFACTOR: Remove legacy quantity fields
                delete device.quantity;
                delete device.available;
                delete device.total;

                // Validate
                const validationErrors = validateDeviceForRole(device, userRole);
                if (validationErrors.length > 0) {
                    results.failed.push({
                        row: rowNumber,
                        name: device.name || 'Unknown',
                        serialNumber: device.serialNumber || 'N/A',
                        errors: validationErrors
                    });
                    continue;
                }

                // Save to database
                const newEquipment = new Equipment(device);
                const saved = await newEquipment.save();

                results.success.push({
                    row: rowNumber,
                    id: saved._id,
                    name: saved.name,
                    serialNumber: saved.serialNumber
                });

            } catch (err) {
                let errorMessage = err.message;
                if (err.code === 11000) {
                    errorMessage = 'Duplicate serial number';
                }
                results.failed.push({
                    row: rowNumber,
                    name: device.name || 'Unknown',
                    serialNumber: device.serialNumber || 'N/A',
                    errors: [errorMessage]
                });
            }
        }

        console.log(`📦 Bulk upload by ${userRole}: ${results.success.length} success, ${results.failed.length} failed`);

        res.status(200).json({
            message: `Processed ${results.totalProcessed} devices`,
            successCount: results.success.length,
            failedCount: results.failed.length,
            results
        });

    } catch (err) {
        console.error('❌ Bulk upload error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// ==========================================
// 3. GET AVAILABILITY STATISTICS
// NEW: Returns device counts by category and status
// REFACTOR: Replaces legacy quantity/available fields
// ==========================================
router.get('/stats/availability', async (req, res) => {
    try {
        // Aggregate devices by category and status
        const stats = await Equipment.aggregate([
            {
                $group: {
                    _id: {
                        category: '$type',
                        status: '$status'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.category',
                    statuses: {
                        $push: {
                            status: '$_id.status',
                            count: '$count'
                        }
                    },
                    total: { $sum: '$count' }
                }
            },
            {
                $project: {
                    _id: 0,
                    category: '$_id',
                    total: 1,
                    statuses: 1,
                    available: {
                        $reduce: {
                            input: '$statuses',
                            initialValue: 0,
                            in: {
                                $cond: [
                                    { $eq: ['$$this.status', 'Available'] },
                                    { $add: ['$$value', '$$this.count'] },
                                    '$$value'
                                ]
                            }
                        }
                    }
                }
            },
            { $sort: { category: 1 } }
        ]);

        // Calculate overall totals
        const overallStats = {
            totalDevices: 0,
            totalAvailable: 0,
            byStatus: {}
        };

        stats.forEach(cat => {
            overallStats.totalDevices += cat.total;
            overallStats.totalAvailable += cat.available;
            cat.statuses.forEach(s => {
                overallStats.byStatus[s.status] = (overallStats.byStatus[s.status] || 0) + s.count;
            });
        });

        res.status(200).json({
            categories: stats,
            overall: overallStats
        });

    } catch (err) {
        console.error('❌ Stats error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 4. BROWSE & FILTER ROUTE
// ==========================================
router.get('/browse', async (req, res) => {
    try {
        const { search, category, status } = req.query;
        let query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { serialNumber: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } }
            ];
        }

        if (category && category !== 'All Categories' && category !== 'All') {
            query.type = category;
        }

        if (status) {
            if (status === 'Available') query.status = 'Available';
            if (status === 'Unavailable') query.status = { $ne: 'Available' };
        }

        const equipment = await Equipment.find(query).sort({ name: 1 });
        res.status(200).json(equipment);

    } catch (err) {
        console.error("Browse Error:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// ==========================================
// 5. Get ALL Equipment (Simple List)
// ==========================================
router.get('/', async (req, res) => {
    try {
        const allEquipment = await Equipment.find();
        res.status(200).json(allEquipment);
    } catch (err) {
        res.status(500).json(err);
    }
});

// ==========================================
// 6. Update Equipment (With Spy Logs 🕵️‍♂️)
// ==========================================
router.put('/:id', async (req, res) => {
    try {
        console.log("-----------------------------------------");
        console.log("📝 UPDATE REQUEST RECEIVED");
        console.log("🆔 ID:", req.params.id);
        console.log("📦 BODY:", req.body);

        if (!req.params.id || req.params.id === 'undefined') {
            console.log("❌ ERROR: Invalid ID");
            return res.status(400).json({ message: "Invalid ID provided" });
        }

        // REFACTOR: Remove legacy quantity fields if passed
        const updateData = { ...req.body };
        delete updateData.quantity;
        delete updateData.available;
        delete updateData.total;

        const updatedEquipment = await Equipment.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!updatedEquipment) {
            console.log("❌ ERROR: Equipment not found in DB with that ID");
            return res.status(404).json({ message: "Equipment not found" });
        }

        console.log("✅ SUCCESS: Updated item:", updatedEquipment.name);
        res.status(200).json(updatedEquipment);

    } catch (err) {
        console.error("🔥 CRASH during update:", err);
        res.status(500).json(err);
    }
});

// ==========================================
// 7. Delete Equipment (Admin only)
// ==========================================
router.delete('/:id', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        await Equipment.findByIdAndDelete(req.params.id);
        res.status(200).json("Equipment has been deleted...");
    } catch (err) {
        res.status(500).json(err);
    }
});

// ==========================================
// 8. Get ONE Specific Item by ID
// ==========================================
router.get('/:id', async (req, res) => {
    try {
        const equipment = await Equipment.findById(req.params.id);
        if (!equipment) {
            return res.status(404).json("Equipment not found");
        }
        res.status(200).json(equipment);
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;