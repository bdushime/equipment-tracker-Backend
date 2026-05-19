const Transaction = require('../models/Transaction');

// Transaction statuses that represent a device being committed — present hold
// (Pending/Checked Out/Borrowed/Overdue/Pending Return) or a future-dated
// commitment (Reserved/Active). Anything else (Returned/Cancelled/Denied) is
// released. The helper uses this set to verify that equipment.status reflects
// a real transaction; if no transaction in this set points at the device, the
// status is stale and gets auto-healed.
const ACTIVE_HOLD_TX_STATUSES = [
    'Pending',
    'Checked Out',
    'Borrowed',
    'Overdue',
    'Pending Return',
    'Reserved',
    'Active',
];

// Human-set statuses that intentionally take a device out of circulation.
// These never auto-heal — they require manual action by IT.
const HARD_BLOCK_STATUSES = ['Maintenance', 'Damaged', 'Lost'];

/**
 * Check whether an equipment doc can be booked right now, auto-healing stale state.
 *
 * Returns `{ ok: true }` if bookable, or `{ ok: false, reason }` otherwise.
 *
 * Why: equipment.status is denormalized from the booking workflow. Past flows
 * (denied requests, expired pendings, manual edits) can leave a device stuck on
 * `Reserved` / `Checked Out` with no live Transaction backing it. Instead of
 * trusting that field blindly, we cross-check the Transaction table: if no
 * transaction holds the device, the status is stale — flip it to `Available`
 * and proceed. Real holds still block normally.
 *
 * @param {import('mongoose').Document} equipment - Equipment doc (must be a real Mongoose doc; we may save it).
 */
async function checkDeviceBookable(equipment) {
    if (!equipment) {
        return { ok: false, reason: 'Device not found' };
    }

    if (HARD_BLOCK_STATUSES.includes(equipment.status)) {
        return { ok: false, reason: `Device is in ${equipment.status} state` };
    }

    if (equipment.status === 'Available') {
        return { ok: true };
    }

    // status is Reserved / Checked Out — verify the hold is real.
    const activeHold = await Transaction.findOne({
        equipment: equipment._id,
        status: { $in: ACTIVE_HOLD_TX_STATUSES },
    }).select('_id status');

    if (activeHold) {
        return { ok: false, reason: `Device is currently ${equipment.status.toLowerCase()}` };
    }

    // Stale status — heal it.
    equipment.status = 'Available';
    await equipment.save();
    return { ok: true, healed: true };
}

module.exports = { checkDeviceBookable, ACTIVE_HOLD_TX_STATUSES, HARD_BLOCK_STATUSES };
