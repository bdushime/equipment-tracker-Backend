/**
 * One-shot backfill: set `fullName` on every User document that's missing it.
 *
 * Why this exists
 *  - seedStudents.js sets fullName via `$setOnInsert`, so any user that already
 *    existed when the field was introduced never got one.
 *  - The frontend tables (admin dashboard, security audit logs, ticket lists,
 *    reports, etc.) now prefer `fullName` and only fall back to `username`,
 *    which is why those rows still render "student26668" / etc.
 *
 * Naming strategy
 *  - Student with a studentId: "Student <studentId>"  (matches seed convention)
 *  - Student without a studentId: title-cased username
 *  - Anyone else: title-cased username
 *
 * Run with:
 *     node scripts/backfillFullNames.js
 *
 * Safe to re-run — only touches users where fullName is missing or empty.
 */

require('dotenv').config();
require('dns').setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const User = require('../models/User');

const titleCase = (s) =>
    String(s || '')
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

const deriveFullName = (user) => {
    if (user.role === 'Student' && user.studentId) {
        return `Student ${user.studentId}`;
    }
    if (user.username) {
        return titleCase(user.username);
    }
    if (user.email) {
        return titleCase(user.email.split('@')[0]);
    }
    return null;
};

const run = async () => {
    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI is missing from your .env');
        process.exitCode = 1;
        return;
    }

    await mongoose.connect(process.env.MONGO_URI);

    // Match users where fullName is null, missing, or an empty/whitespace string.
    const candidates = await User.find({
        $or: [
            { fullName: null },
            { fullName: { $exists: false } },
            { fullName: '' },
        ],
    }).select('_id username fullName role studentId email');

    if (candidates.length === 0) {
        console.log('No users need backfilling — every account already has a fullName.');
        await mongoose.connection.close();
        return;
    }

    console.log(`Found ${candidates.length} user(s) with a missing fullName. Backfilling…`);

    const ops = [];
    let skipped = 0;
    for (const user of candidates) {
        const derived = deriveFullName(user);
        if (!derived) {
            skipped += 1;
            continue;
        }
        ops.push({
            updateOne: {
                filter: { _id: user._id },
                update: { $set: { fullName: derived } },
            },
        });
    }

    if (ops.length === 0) {
        console.log('No actionable users (all were missing both username + studentId + email).');
        await mongoose.connection.close();
        return;
    }

    const result = await User.bulkWrite(ops, { ordered: false });
    console.log(`Updated ${result.modifiedCount || 0} user(s). Skipped ${skipped} with no derivable name.`);
    await mongoose.connection.close();
};

run().catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
});
