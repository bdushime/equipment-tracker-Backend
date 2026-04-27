const express = require('express');
const router = express.Router();
const Role = require('../models/Role');
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');

// GET ALL ROLES
router.get('/', verifyToken, async (req, res) => {
    try {
        const roles = await Role.find();
        res.status(200).json(roles);
    } catch (err) {
        res.status(500).json(err);
    }
});

// CREATE ROLE
router.post('/', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        const { name, description } = req.body;
        // Check if role exists
        const existing = await Role.findOne({ name });
        if (existing) return res.status(400).json({ message: "Role already exists" });

        const newRole = new Role({ name, description });
        const savedRole = await newRole.save();
        res.status(201).json(savedRole);
    } catch (err) {
        res.status(500).json(err);
    }
});

// DELETE ROLE
router.delete('/:id', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        const role = await Role.findById(req.params.id);
        if (!role) return res.status(404).json({ message: "Role not found" });

        // Protect core roles if needed (optional)
        const coreRoles = ['Student', 'Admin', 'Security', 'IT_Staff'];
        if (coreRoles.includes(role.name)) {
            return res.status(403).json({ message: "Cannot delete core system roles" });
        }

        await Role.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Role deleted" });
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;
