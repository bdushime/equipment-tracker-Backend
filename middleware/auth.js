const { verifyToken } = require('./verifyToken');
const { checkRole } = require('./checkRole');

const protect = verifyToken;
const isSecurityOrAdmin = checkRole(['Security', 'Admin']);
const isStudent = checkRole(['Student']);

module.exports = { protect, isSecurityOrAdmin, isStudent };
