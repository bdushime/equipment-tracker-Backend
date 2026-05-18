const mongoose = require('mongoose');
const Package = require('../models/Package');
const Equipment = require('../models/Equipment');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Classroom = require('../models/Classroom');
const AuditLog = require('../models/AuditLog');
const { sendNotification } = require('../utils/emailService');

const MAX_LOAN_HOURS = 24;
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildPackagePurposeTag = (packageName) => `[Package: ${packageName}]`;

const resolveProjectorNote = async (equipment, destination) => {
    const isProjector = equipment.name.toLowerCase().includes('projector') ||
        (equipment.type && equipment.type.toLowerCase().includes('projector'));

    if (!isProjector || !destination) return '';

    const roomNameInput = destination.split('(')[0].trim();
    const classroom = await Classroom.findOne({
        name: { $regex: new RegExp(`^${roomNameInput}$`, 'i') }
    });

    if (classroom && classroom.hasScreen) {
        return ' [SYSTEM FLAG: Projector requested in room with existing screen]';
    }
    return '';
};

const populateOptions = [
    { path: 'devices' },
    { path: 'createdBy', select: 'username fullName email role' }
];

const validateAndResolveDevices = async (deviceIds) => {
    if (!deviceIds || deviceIds.length === 0) {
        return { ok: true, ids: [] };
    }

    const uniqueIds = [...new Set(deviceIds.map(String))];

    if (uniqueIds.some((id) => !isValidObjectId(id))) {
        return { ok: false, status: 400, message: 'One or more device IDs are invalid' };
    }

    const found = await Equipment.find({ _id: { $in: uniqueIds } }).select('_id');
    if (found.length !== uniqueIds.length) {
        return { ok: false, status: 400, message: 'One or more devices were not found' };
    }

    return { ok: true, ids: uniqueIds };
};

exports.createPackage = async (req, res) => {
    try {
        const { name, description, deviceIds } = req.body;

        if (!name || !String(name).trim()) {
            return res.status(400).json({ message: 'Package name is required' });
        }

        if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
            return res.status(400).json({ message: 'A package must contain at least one device' });
        }

        const deviceResult = await validateAndResolveDevices(deviceIds);
        if (!deviceResult.ok) {
            return res.status(deviceResult.status).json({ message: deviceResult.message });
        }

        // Enforce: no more than one device per category
        const devices = await Equipment.find({ _id: { $in: deviceResult.ids } }).select('_id name type');
        const categoryMap = {};
        for (const device of devices) {
            if (categoryMap[device.type]) {
                return res.status(400).json({
                    message: `A package cannot have more than one device in the same category. Duplicate category: "${device.type}" (devices: "${categoryMap[device.type]}" and "${device.name}")`
                });
            }
            categoryMap[device.type] = device.name;
        }

        const pkg = await Package.create({
            name: String(name).trim(),
            description: description || '',
            devices: deviceResult.ids,
            createdBy: req.user.id
        });

        const populated = await Package.findById(pkg._id).populate(populateOptions);

        res.status(201).json({
            message: 'Package created successfully',
            data: populated
        });
    } catch (err) {
        console.error('Error creating package:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.getAllPackages = async (req, res) => {
    try {
        const packages = await Package.find({ isActive: true })
            .sort({ createdAt: -1 })
            .populate(populateOptions);

        res.status(200).json({
            message: 'Packages retrieved successfully',
            data: packages
        });
    } catch (err) {
        console.error('Error fetching packages:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.getPackageById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid package ID' });
        }

        const pkg = await Package.findById(id).populate('devices');

        if (!pkg) {
            return res.status(404).json({ message: 'Package not found' });
        }

        if (!pkg.isActive && req.user.role === 'Student') {
            return res.status(404).json({ message: 'Package not found.' });
        }

        res.status(200).json({
            message: 'Package retrieved successfully',
            data: pkg
        });
    } catch (err) {
        console.error('Error fetching package:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.bookPackage = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid package ID' });
        }

        if (!req.body || typeof req.body !== 'object') {
            return res.status(400).json({
                message: 'Request body is missing. Make sure to send JSON with Content-Type: application/json'
            });
        }

        const { expectedReturnTime, destination, purpose, devicePhotos } = req.body;

        if (!expectedReturnTime || !destination || !purpose) {
            return res.status(400).json({
                message: 'expectedReturnTime, destination, and purpose are required'
            });
        }

        const devicePhotoMap = devicePhotos && typeof devicePhotos === 'object' ? devicePhotos : {};

        const pkg = await Package.findById(id).populate('devices');
        if (!pkg || !pkg.isActive) {
            return res.status(404).json({ message: 'Package not found or is not available' });
        }

        if (!pkg.devices || pkg.devices.length === 0) {
            return res.status(400).json({ message: 'This package has no devices to book' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.responsibilityScore < 60) {
            await AuditLog.create({
                action: 'PACKAGE_BOOKING_DENIED',
                user: req.user.id,
                details: `Denied package "${pkg.name}" due to low score: ${user.responsibilityScore}`
            });
            return res.status(403).json({
                message: 'Security Alert: You are banned from borrowing due to low score.'
            });
        }

        // One-at-a-time policy: block if the student already has a pending request or active loan
        const ACTIVE_BLOCKING_STATUSES = ['Pending', 'Checked Out', 'Borrowed', 'Overdue', 'Pending Return'];
        const existingActive = await Transaction.findOne({
            user: req.user.id,
            status: { $in: ACTIVE_BLOCKING_STATUSES }
        }).populate('equipment', 'name');
        if (existingActive) {
            return res.status(409).json({
                message: `You already have an active checkout (${existingActive.equipment?.name || 'a device'} — status: ${existingActive.status}). Please return or resolve it before requesting another.`
            });
        }

        const returnDate = new Date(expectedReturnTime);
        const now = new Date();
        const hoursDifference = Math.abs(returnDate - now) / 36e5;

        if (hoursDifference > MAX_LOAN_HOURS) {
            return res.status(400).json({
                message: `Security Policy: You cannot borrow items for more than ${MAX_LOAN_HOURS} hours.`
            });
        }

        const failedDevices = [];
        for (const equipment of pkg.devices) {
            if (equipment.status !== 'Available') {
                failedDevices.push({
                    id: equipment._id,
                    name: equipment.name,
                    reason: `Device is not available (current status: ${equipment.status})`
                });
            }
        }

        if (failedDevices.length > 0) {
            return res.status(400).json({
                message: 'Package booking failed: one or more devices did not pass validation',
                data: { failedDevices }
            });
        }

        const deviceBookingDetails = await Promise.all(
            pkg.devices.map(async (equipment) => ({
                equipment,
                adminNote: await resolveProjectorNote(equipment, destination)
            }))
        );

        const packagePurpose = `${purpose} ${buildPackagePurposeTag(pkg.name)}`;
        const savedTransactions = [];
        const hasScreenFlag = deviceBookingDetails.some((detail) => detail.adminNote);

        for (const { equipment, adminNote } of deviceBookingDetails) {
            const photos = devicePhotoMap[equipment._id.toString()] || {};
            const checkoutPhotoUrl = [photos.front, photos.back].filter(Boolean);

            const transaction = await new Transaction({
                user: req.user.id,
                equipment: equipment._id,
                expectedReturnTime,
                destination,
                purpose: packagePurpose + adminNote,
                checkoutPhotoUrl,
                signatureUrl: req.body.signatureUrl || '',
                status: 'Pending'
            }).save();

            savedTransactions.push(transaction);
        }

        // Hold every device in the package so no other student can borrow them
        // while IT reviews the request. Reverted on deny / cancel / expiry.
        await Equipment.updateMany(
            { _id: { $in: pkg.devices.map((d) => d._id) }, status: 'Available' },
            { $set: { status: 'Reserved' } }
        );

        const deviceNames = pkg.devices.map((d) => d.name).join(', ');
        const screenNote = hasScreenFlag
            ? ' (Special approval required due to room restrictions)'
            : '';

        await sendNotification(
            user._id,
            user.email,
            'Package Request Submitted',
            `Your request to borrow the "${pkg.name}" package (${pkg.devices.length} items) is pending approval.${screenNote}`,
            'info',
            savedTransactions[0]._id
        ).catch(console.error);

        const staffMembers = await User.find({ role: { $in: ['IT', 'IT_Staff', 'Admin'] } });
        for (const staff of staffMembers) {
            if (staff._id.toString() !== user._id.toString()) {
                await sendNotification(
                    staff._id,
                    staff.email,
                    'New Package Borrow Request',
                    `${user.fullName || user.username} has requested the "${pkg.name}" package: ${deviceNames}.${hasScreenFlag ? ' ⚠️ ALERT: Room already has a screen.' : ''}`,
                    'warning',
                    savedTransactions[0]._id
                ).catch(console.error);
            }
        }

        await AuditLog.create({
            action: 'PACKAGE_REQUEST_CREATED',
            user: req.user.id,
            details: `Requested package "${pkg.name}" (${pkg.devices.length} devices)`
        });

        res.status(201).json({
            message: 'Package booking request submitted successfully',
            data: {
                packageId: pkg._id,
                packageName: pkg.name,
                transactions: savedTransactions,
                serverStatusMessage: 'pending_approval'
            }
        });
    } catch (err) {
        console.error('Error booking package:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.cancelPackageBooking = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid package ID' });
        }

        const pkg = await Package.findById(id);
        if (!pkg) {
            return res.status(404).json({ message: 'Package not found' });
        }

        const packageTag = escapeRegExp(buildPackagePurposeTag(pkg.name));

        // Capture which equipment the pending transactions hold so we can release them
        const pendingTxs = await Transaction.find({
            user: req.user.id,
            status: 'Pending',
            purpose: { $regex: packageTag }
        }).select('equipment');
        const heldEquipmentIds = pendingTxs.map((t) => t.equipment);

        const result = await Transaction.updateMany(
            {
                user: req.user.id,
                status: 'Pending',
                purpose: { $regex: packageTag }
            },
            { $set: { status: 'Cancelled' } }
        );

        if (heldEquipmentIds.length > 0) {
            await Equipment.updateMany(
                { _id: { $in: heldEquipmentIds }, status: 'Reserved' },
                { $set: { status: 'Available' } }
            );
        }

        await AuditLog.create({
            action: 'PACKAGE_BOOKING_CANCELLED',
            user: req.user.id,
            details: `Cancelled ${result.modifiedCount} pending transaction(s) for package "${pkg.name}"`
        });

        res.status(200).json({
            message: result.modifiedCount > 0
                ? 'Package booking cancelled successfully'
                : 'No pending package booking found to cancel',
            data: { cancelledCount: result.modifiedCount }
        });
    } catch (err) {
        console.error('Error cancelling package booking:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.addDevicesToPackage = async (req, res) => {
    try {
        const { id } = req.params;
        const { deviceIds } = req.body;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid package ID' });
        }

        if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
            return res.status(400).json({ message: 'deviceIds must be a non-empty array' });
        }

        const deviceResult = await validateAndResolveDevices(deviceIds);
        if (!deviceResult.ok) {
            return res.status(deviceResult.status).json({ message: deviceResult.message });
        }

        const pkg = await Package.findById(id);
        if (!pkg) {
            return res.status(404).json({ message: 'Package not found' });
        }

        const existing = new Set(pkg.devices.map((d) => d.toString()));
        const toAdd = deviceResult.ids.filter((deviceId) => !existing.has(deviceId));

        if (toAdd.length > 0) {
            // Enforce: no more than one device per category across existing + new devices
            const allDeviceIds = [...pkg.devices.map((d) => d.toString()), ...toAdd];
            const allDevices = await Equipment.find({ _id: { $in: allDeviceIds } }).select('_id name type');
            const categoryMap = {};
            for (const device of allDevices) {
                if (categoryMap[device.type]) {
                    return res.status(400).json({
                        message: `A package cannot have more than one device in the same category. Duplicate category: "${device.type}" (devices: "${categoryMap[device.type]}" and "${device.name}")`
                    });
                }
                categoryMap[device.type] = device.name;
            }

            pkg.devices.push(...toAdd);
            await pkg.save();
        }

        const populated = await Package.findById(id).populate(populateOptions);

        res.status(200).json({
            message: 'Devices added to package successfully',
            data: populated
        });
    } catch (err) {
        console.error('Error adding devices to package:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.removeDeviceFromPackage = async (req, res) => {
    try {
        const { id, deviceId } = req.params;

        if (!isValidObjectId(id) || !isValidObjectId(deviceId)) {
            return res.status(400).json({ message: 'Invalid package or device ID' });
        }

        const pkg = await Package.findById(id);
        if (!pkg) {
            return res.status(404).json({ message: 'Package not found' });
        }

        const before = pkg.devices.length;
        pkg.devices = pkg.devices.filter((d) => d.toString() !== deviceId);

        if (pkg.devices.length === before) {
            return res.status(404).json({ message: 'Device not found in this package' });
        }

        await pkg.save();

        const populated = await Package.findById(id).populate(populateOptions);

        res.status(200).json({
            message: 'Device removed from package successfully',
            data: populated
        });
    } catch (err) {
        console.error('Error removing device from package:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.updatePackage = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid package ID' });
        }

        const updates = {};
        const { name, description, isActive } = req.body;

        if (name !== undefined) {
            if (!String(name).trim()) {
                return res.status(400).json({ message: 'Package name cannot be empty' });
            }
            updates.name = String(name).trim();
        }
        if (description !== undefined) updates.description = description;
        if (isActive !== undefined) updates.isActive = isActive;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'No valid fields provided to update' });
        }

        const pkg = await Package.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        ).populate(populateOptions);

        if (!pkg) {
            return res.status(404).json({ message: 'Package not found' });
        }

        res.status(200).json({
            message: 'Package updated successfully',
            data: pkg
        });
    } catch (err) {
        console.error('Error updating package:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.deletePackage = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid package ID' });
        }

        const pkg = await Package.findByIdAndUpdate(
            id,
            { $set: { isActive: false } },
            { new: true }
        ).populate(populateOptions);

        if (!pkg) {
            return res.status(404).json({ message: 'Package not found' });
        }

        res.status(200).json({
            message: 'Package deactivated successfully.',
            data: pkg
        });
    } catch (err) {
        console.error('Error deleting package:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};
