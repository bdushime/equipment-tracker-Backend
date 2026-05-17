const router = require('express').Router();
const { protect, isSecurityOrAdmin, isStudent } = require('../middleware/auth');
const { requirePasswordResetComplete } = require('../middleware/requirePasswordResetComplete');
const {
    createPackage,
    getAllPackages,
    getPackageById,
    bookPackage,
    cancelPackageBooking,
    addDevicesToPackage,
    removeDeviceFromPackage,
    updatePackage,
    deletePackage
} = require('../controllers/packageController');

router.get('/', protect, getAllPackages);
router.get('/:id', protect, getPackageById);
router.post('/:id/book', protect, requirePasswordResetComplete, isStudent, bookPackage);
router.delete('/:id/book', protect, isStudent, cancelPackageBooking);

router.post('/', protect, isSecurityOrAdmin, createPackage);
router.put('/:id', protect, isSecurityOrAdmin, updatePackage);
router.delete('/:id', protect, isSecurityOrAdmin, deletePackage);
router.patch('/:id/devices', protect, isSecurityOrAdmin, addDevicesToPackage);
router.delete('/:id/devices/:deviceId', protect, isSecurityOrAdmin, removeDeviceFromPackage);

module.exports = router;
