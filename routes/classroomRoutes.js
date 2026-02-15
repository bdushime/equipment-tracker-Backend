const express = require('express');
const router = express.Router();
const { getClassrooms, createClassroom, updateClassroom, deleteClassroom } = require('../controllers/classroomController');
const { protect, authorize } = require('../middleware/authMiddleware');

// =================================================================
// 1. READ ACCESS (Open to All Logged-in Users)
// =================================================================
// Students need this to check if a room has a screen before borrowing.
router.get('/', protect, getClassrooms); 

// =================================================================
// 2. WRITE ACCESS (Restricted to IT Staff & Admins)
// =================================================================
// Only staff should be able to Add, Edit, or Delete rooms.
router.post('/', protect, authorize('IT_Staff', 'Admin'), createClassroom);
router.put('/:id', protect, authorize('IT_Staff', 'Admin'), updateClassroom);
router.delete('/:id', protect, authorize('IT_Staff', 'Admin'), deleteClassroom);

module.exports = router;