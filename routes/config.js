const router = require('express').Router();
const Config = require('../models/Config');
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');

// GET CONFIG (Or create default if missing)
router.get('/', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        let config = await Config.findOne();
        if (!config) {
            config = new Config();
            await config.save();
        }
        res.status(200).json(config);
    } catch (err) {
        res.status(500).json(err);
    }
});

// UPDATE CONFIG
router.put('/', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        const config = await Config.findOneAndUpdate({}, { $set: req.body }, { new: true, upsert: true });
        res.status(200).json(config);
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;