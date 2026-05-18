/**
 * One-off cleanup script for the student roster.
 *
 * Rules:
 *   1. Keep every student whose numeric studentId falls in [KEEP_START, KEEP_END].
 *   2. Also keep any student whose mustChangePassword === false (they've already
 *      completed the first-login flow and are actively using their account).
 *   3. Delete every other Student record (these are unused seed accounts).
 *   4. For every KEPT student whose email doesn't already end in @yopmail.com,
 *      rewrite it to `student.{studentId}@yopmail.com` so the whole roster
 *      uses one consistent domain.
 *
 * Usage:
 *   node utils/cleanupStudents.js              # show plan + execute
 *   node utils/cleanupStudents.js --dry-run    # show plan only, no DB writes
 */

require('dotenv').config();
require('dns').setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const User = require('../models/User');

const KEEP_START = 26550;
const KEEP_END = 26700;
const EMAIL_DOMAIN = 'yopmail.com';
const DRY_RUN = process.argv.includes('--dry-run');

const isInRange = (studentId) => {
    const n = parseInt(studentId, 10);
    return Number.isFinite(n) && n >= KEEP_START && n <= KEEP_END;
};

const run = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error('MONGO_URI is missing in environment.');
        }

        await mongoose.connect(process.env.MONGO_URI);
        console.log(`Connected. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'EXECUTING'}`);
        console.log(`Keep range: ${KEEP_START}-${KEEP_END}`);
        console.log(`Email domain: @${EMAIL_DOMAIN}\n`);

        const allStudents = await User
            .find({ role: 'Student' })
            .select('_id studentId username email fullName mustChangePassword');

        console.log(`Found ${allStudents.length} total student records.\n`);

        const toDelete = [];
        const toRewriteEmail = [];
        const kept = { inRange: 0, completedProfile: 0 };

        for (const student of allStudents) {
            const inRange = isInRange(student.studentId);
            const hasCompleteProfile = student.mustChangePassword === false;

            // Decision: delete only if BOTH (out of range) AND (incomplete profile)
            if (!inRange && !hasCompleteProfile) {
                toDelete.push(student);
                continue;
            }

            // Tally why we're keeping it (for reporting)
            if (inRange) kept.inRange += 1;
            else if (hasCompleteProfile) kept.completedProfile += 1;

            // Normalize email if it isn't on the @yopmail.com domain
            const currentEmail = (student.email || '').toLowerCase();
            const onDomain = currentEmail.endsWith(`@${EMAIL_DOMAIN}`);
            if (!onDomain && student.studentId) {
                const newEmail = `student.${student.studentId}@${EMAIL_DOMAIN}`;
                toRewriteEmail.push({
                    id: student._id,
                    studentId: student.studentId,
                    oldEmail: student.email,
                    newEmail
                });
            }
        }

        // ── Plan summary ─────────────────────────────────────────────────────
        console.log('Plan:');
        console.log(`  Keep (in range ${KEEP_START}-${KEEP_END}): ${kept.inRange}`);
        console.log(`  Keep (out of range BUT completed profile): ${kept.completedProfile}`);
        console.log(`  Delete (out of range AND incomplete profile): ${toDelete.length}`);
        console.log(`  Email rewrites to @${EMAIL_DOMAIN}: ${toRewriteEmail.length}\n`);

        if (toRewriteEmail.length > 0 && toRewriteEmail.length <= 10) {
            console.log('Sample email rewrites:');
            for (const r of toRewriteEmail.slice(0, 10)) {
                console.log(`  ${r.studentId}: ${r.oldEmail || '(empty)'}  ->  ${r.newEmail}`);
            }
            console.log('');
        }

        if (DRY_RUN) {
            console.log('Dry run complete. No changes made.');
            return;
        }

        // ── Execute ─────────────────────────────────────────────────────────
        let deletedCount = 0;
        let emailUpdated = 0;
        let emailFailed = 0;

        if (toDelete.length > 0) {
            const ids = toDelete.map((s) => s._id);
            const result = await User.deleteMany({ _id: { $in: ids } });
            deletedCount = result.deletedCount || 0;
        }

        for (const r of toRewriteEmail) {
            try {
                await User.updateOne({ _id: r.id }, { $set: { email: r.newEmail } });
                emailUpdated += 1;
            } catch (err) {
                emailFailed += 1;
                console.error(`  ! Email update failed for ${r.studentId} (${r.id}): ${err.message}`);
            }
        }

        console.log('\nResult:');
        console.log(`  Deleted: ${deletedCount}`);
        console.log(`  Emails updated: ${emailUpdated}`);
        if (emailFailed > 0) console.log(`  Email update failures: ${emailFailed}`);
        console.log('Done.');
    } catch (err) {
        console.error('Cleanup failed:', err.message);
        process.exitCode = 1;
    } finally {
        await mongoose.connection.close();
    }
};

run();
