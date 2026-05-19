// middleware/checkRole.js

const checkRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(403).json({ 
                message: "Access Denied: You do not have permission to perform this action.(you are not allowed)" 
            });
        }
        
        // Normalize role check to handle space/underscore/casing variations of IT Staff
        const userRole = req.user.role;
        const hasPermission = allowedRoles.some(role => {
            if (role === userRole) return true;
            const norm = (r) => r?.toLowerCase().replace(/[\s_-]+/g, '');
            return norm(role) === norm(userRole);
        });

        if (!hasPermission) {
            return res.status(403).json({ 
                message: "Access Denied: You do not have permission to perform this action.(you are not allowed)" 
            });
        }
        next();
    };
};

module.exports = { checkRole };