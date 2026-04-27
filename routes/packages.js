const router = require('express').Router();
const Package = require('../models/Package');

// ==========================================
// @route   GET /api/packages
// @desc    Get all active packages for the catalogue
// @access  Public / Student
// ==========================================
router.get('/', async (req, res) => {
    try {
        // Only fetch packages that are active
        const packages = await Package.find({ isActive: true }).sort({ createdAt: -1 });
        res.status(200).json(packages);
    } catch (err) {
        console.error("Error fetching packages:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});

// ==========================================
// @route   GET /api/packages/:id
// @desc    Get a single package by its ID
// @access  Public / Student
// ==========================================
router.get('/:id', async (req, res) => {
    try {
        const pkg = await Package.findById(req.params.id);
        if (!pkg) {
            return res.status(404).json({ message: "Package not found!" });
        }
        res.status(200).json(pkg);
    } catch (err) {
        console.error("Error fetching single package:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});

// ==========================================
// @route   POST /api/packages
// @desc    Create a new equipment package bundle
// @access  Admin / IT Staff
// ==========================================
router.post('/', async (req, res) => {
    try {
        const newPackage = new Package(req.body);
        const savedPackage = await newPackage.save();
        res.status(201).json(savedPackage);
    } catch (err) {
        console.error("Error creating package:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});

// ==========================================
// @route   PUT /api/packages/:id
// @desc    Update an existing package
// @access  Admin / IT Staff
// ==========================================
router.put('/:id', async (req, res) => {
    try {
        const updatedPackage = await Package.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true }
        );
        res.status(200).json(updatedPackage);
    } catch (err) {
        console.error("Error updating package:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});

// ==========================================
// @route   DELETE /api/packages/:id
// @desc    Deactivate a package (soft delete)
// @access  Admin / IT Staff
// ==========================================
router.delete('/:id', async (req, res) => {
    try {
        // We do a soft delete (isActive: false) so old transactions linked to this package don't break
        await Package.findByIdAndUpdate(req.params.id, { isActive: false });
        res.status(200).json({ message: "Package deactivated successfully!" });
    } catch (err) {
        console.error("Error deleting package:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});

module.exports = router;