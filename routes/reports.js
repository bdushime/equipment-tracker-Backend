const router = require('express').Router();
const Transaction = require('../models/Transaction');
const { verifyToken } = require('../middleware/verifyToken');
const { checkRole } = require('../middleware/checkRole');

// GET FILTERED REPORTS
router.get('/', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        const { status, role, department, timeRange, search } = req.query;
        let query = {};

        // 1. Status Filter
        if (status && status !== "All") {
            if (status === 'Active') query.status = 'Checked Out';
            else if (status === 'Lost/Damaged') query.status = { $in: ['Lost', 'Damaged'] };
            else query.status = status;
        }

        // 2. Time Range Filter
        const now = new Date();
        if (timeRange === 'Today') {
            const startOfDay = new Date(now.setHours(0,0,0,0));
            query.createdAt = { $gte: startOfDay };
        } else if (timeRange === 'This Week') {
            const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
            query.createdAt = { $gte: startOfWeek };
        }

        // 3. Execute Query with Population
        let transactions = await Transaction.find(query)
            .populate({
                path: 'user',
                select: 'username fullName email role department responsibilityScore',
                match: role && role !== "All Roles" ? { role: role } : {}
            })
            .populate({
                path: 'equipment',
                select: 'name category',
                match: department && department !== "All Departments" ? { department: department } : {}
            })
            .sort({ createdAt: -1 });

        // 4. Post-Filter (because populate 'match' returns null for non-matching docs)
        transactions = transactions.filter(t => t.user && t.equipment);

        // 5. Search Filter — match against fullName OR username so the
        // admin can search by the student's displayed name or their handle.
        if (search) {
            const lowerSearch = search.toLowerCase();
            transactions = transactions.filter(t =>
                (t.user.fullName || "").toLowerCase().includes(lowerSearch) ||
                t.user.username.toLowerCase().includes(lowerSearch) ||
                t.equipment.name.toLowerCase().includes(lowerSearch)
            );
        }

        // 6. Format Data for Table — return user as an OBJECT (not a flat string)
        // so the frontend can show fullName when present and fall back to username
        // when it isn't (e.g. student hasn't completed first-login yet).
        const tableData = transactions.map(t => ({
            id: t._id,
            item: t.equipment.name,
            category: t.equipment.category,
            user: {
                fullName: t.user.fullName || "",
                username: t.user.username,
                email: t.user.email,
                role: t.user.role,
            },
            role: t.user.role,
            dept: t.user.department || "General",
            dateOut: t.createdAt,
            dueDate: t.expectedReturnTime,
            status: t.status === 'Checked Out' ? 'Active' : t.status,
            responsibilityScore: t.user.responsibilityScore
        }));

        res.status(200).json(tableData);

    } catch (err) {
        console.error("Reports Error:", err);
        res.status(500).json(err);
    }
});

module.exports = router;