const User = require('../models/User');

const requirePasswordResetComplete = async (req, res, next) => {
    try {
        if (!req.user || req.user.role !== 'Student') {
            return next();
        }

        const user = await User.findById(req.user.id).select('mustChangePassword');
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        if (user.mustChangePassword) {
            return res.status(403).json({
                message: "Password reset required before performing transactions.",
                code: "PASSWORD_RESET_REQUIRED"
            });
        }

        return next();
    } catch (err) {
        return res.status(500).json({ message: "Server Error", error: err.message });
    }
};

module.exports = { requirePasswordResetComplete };
