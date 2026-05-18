const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const authHeader = req.headers.token || req.headers.authorization;

    if (authHeader) {
    
        // Accept both:
        // - "Bearer <token>" (standard Authorization header)
        // - "<token>" (some clients send raw token)
        const token = authHeader.startsWith('Bearer ')
            ? authHeader.split(' ')[1]
            : authHeader.trim();

        jwt.verify(token, process.env.JWT_SECRET || "mySuperSecretKey123", (err, user) => {
            if (err) {
                // 401 (not 403) — an invalid or expired JWT means "not authenticated",
                // which the frontend's axios interceptor uses to trigger auto-logout.
                // 403 is reserved for "authenticated but not allowed for this resource".
                const reason = err.name === 'TokenExpiredError'
                    ? 'Token expired'
                    : 'Token is not valid!';
                return res.status(401).json({ message: reason, code: err.name });
            }

            req.user = user;
            next();
        });
    } else {
        return res.status(401).json({ message: "You are not authenticated! No token found." });
    }
};

module.exports = { verifyToken };