const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

const startOverdueCheck = () => {
    // Schedule: Run at minute 0 of every hour ('0 * * * *')
    // For testing right now, let's use every MINUTE: '* * * * *'
    cron.schedule('* * * * *', async () => {
        console.log(' CRON JOB: Checking for overdue items...');

        try {
            const now = new Date();

            // 1. Find all transactions that are ACTIVE but PAST their return time
            const lateTransactions = await Transaction.find({
                status: 'Active',
                expectedReturnTime: { $lt: now } // $lt means "Less Than" (in the past)
            });

            if (lateTransactions.length === 0) {
                console.log(' No new overdue items found.');
                return;
            }

            console.log(` Found ${lateTransactions.length} late items. Processing penalties...`);

            // 2. Loop through each late transaction
            for (const transaction of lateTransactions) {
                // A. Mark transaction as "Overdue"
                transaction.status = 'Overdue';
                await transaction.save();

                // B. Find the User and Deduct Points
                const user = await User.findById(transaction.user);
                if (user) {
                    // Deduct 10 points for missing the deadline
                    user.responsibilityScore -= 10;
                    
                    // Prevent score from going below 0
                    if (user.responsibilityScore < 0) user.responsibilityScore = 0;
                    
                    await user.save();
                    console.log(` PENALTY APPLIED: ${user.username} dropped to ${user.responsibilityScore} points.`);
                }
            }

        } catch (err) {
            console.error(' CRON ERROR:', err.message);
        }
    });
};

module.exports = startOverdueCheck;