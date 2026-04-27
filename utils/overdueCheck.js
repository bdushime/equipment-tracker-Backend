const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Config = require('../models/Config');
const { sendNotification } = require('./emailService');

const startOverdueCheck = () => {
    // Schedule: Run at minute 0 of every hour ('0 * * * *')
    // For testing right now, let's use every MINUTE: '* * * * *'
    cron.schedule('* * * * *', async () => {
        console.log(' CRON JOB: Checking for overdue items...');

        try {
            const now = new Date();

            // 1. Find transactions that missed the deadline and haven't been resolved
            const lateTransactions = await Transaction.find({
                status: { $in: ['Borrowed', 'Checked Out', 'Overdue'] },
                expectedReturnTime: { $lt: now } // $lt means "Less Than" (in the past)
            }).populate('equipment user'); // Populate to get text details

            if (lateTransactions.length === 0) {
                console.log(' No new overdue items found.');
                return;
            }

            console.log(` Found ${lateTransactions.length} late items. Processing penalties...`);

            // Fetch dynamic config for email subjects
            let config = await Config.findOne();
            if (!config) config = new Config(); // fallback defaults

            // 2. Loop through each late transaction
            for (const transaction of lateTransactions) {
                let savedNeeded = false;

                // A. Mark transaction as "Overdue" and apply INITIAL Penalty
                if (transaction.status !== 'Overdue') {
                    transaction.status = 'Overdue';
                    savedNeeded = true;

                    // Deduct initial late penalty
                    if (transaction.user) {
                        transaction.user.responsibilityScore -= 10;
                        if (transaction.user.responsibilityScore < 0) transaction.user.responsibilityScore = 0;
                        await transaction.user.save();
                        console.log(` PENALTY APPLIED: ${transaction.user.username} dropped to ${transaction.user.responsibilityScore} points.`);

                        // Notify student IMMEDIATELY that they missed the deadline
                        await sendNotification(
                            transaction.user._id,
                            transaction.user.email,
                            config.emailOverdueSubject || "URGENT: Equipment Overdue",
                            `You have missed the deadline to return ${transaction.equipment?.name || "your equipment"}. Please return it immediately! A 10-point penalty was applied.`,
                            "error",
                            transaction._id
                        );
                    }
                }

                // B. Check for 6-HOUR Admin Alert
                const hoursLate = Math.abs(now - new Date(transaction.expectedReturnTime)) / 36e5;
                if (hoursLate >= 6 && !transaction.adminAlerted) {
                    transaction.adminAlerted = true;
                    savedNeeded = true;

                    console.log(`[ALERT] Item 6+ hours overdue! Notifying Admins...`);
                    const admins = await User.find({ role: 'Admin' });
                    for (const admin of admins) {
                        await sendNotification(
                            admin._id,
                            admin.email,
                            "URGENT: Severely Overdue Equipment",
                            `The student ${transaction.user?.username || 'Unknown'} is severely late (${Math.floor(hoursLate)} hours) returning ${transaction.equipment?.name || 'Equipment'}.`,
                            "warning",
                            transaction._id
                        );
                    }
                }

                if (savedNeeded) {
                    // Update the transaction in database
                    await transaction.save();
                }
            }

        } catch (err) {
            console.error(' CRON ERROR:', err.message);
        }
    });
};

module.exports = startOverdueCheck;