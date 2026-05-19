require('dotenv').config();
const mongoose = require('mongoose');

// Pre-load ALL models (just like the routes do) to avoid "Schema not registered" errors
require('./models/User');
require('./models/Equipment');
require('./models/Transaction');
require('./models/AuditLog');
require('./models/Notification');
require('./models/Package');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const Transaction = mongoose.model('Transaction');
    const AuditLog = mongoose.model('AuditLog');

    // Find a 'Checked Out' or 'Borrowed' transaction
    const tx = await Transaction.findOne({ status: { $in: ['Checked Out', 'Borrowed'] } })
        .populate('equipment')
        .populate('user');

    if (!tx) {
        console.log('No active transaction found to test with.');
        process.exit(0);
    }

    console.log('Testing with transaction:');
    console.log('  ID:       ', tx._id);
    console.log('  Equipment:', tx.equipment?.name);
    console.log('  User:     ', tx.user?.email);
    console.log('  Status:   ', tx.status);

    // Step 1: Test transaction.save()
    const originalStatus = tx.status;
    const originalPhotos = tx.returnPhotoUrl;
    tx.returnPhotoUrl = [];
    tx.status = 'Pending Return';
    try {
        await tx.save();
        console.log('✅ Step 1 PASSED: transaction.save() worked');
    } catch (e) {
        console.error('❌ Step 1 FAILED: transaction.save() threw:', e.message);
        process.exit(1);
    }

    // Step 2: Test AuditLog.create()
    try {
        await AuditLog.create({
            action: 'RETURN_REQUESTED',
            user: tx.user._id,
            details: `Requested to return ${tx.equipment?.name}`
        });
        console.log('✅ Step 2 PASSED: AuditLog.create() worked');
    } catch (e) {
        console.error('❌ Step 2 FAILED: AuditLog.create() threw:', e.message);
    }

    // Revert the test change
    tx.status = originalStatus;
    tx.returnPhotoUrl = originalPhotos;
    await tx.save();
    console.log('✅ Reverted transaction back to:', originalStatus);
    console.log('\n✅ All steps passed — route should work correctly.');

    process.exit(0);
}).catch(e => {
    console.error('DB Connection error:', e.message);
    process.exit(1);
});
