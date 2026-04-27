const mongoose = require('mongoose');
const Transaction = require('./models/Transaction');
const Equipment = require('./models/Equipment');
const User = require('./models/User');

const dbUri = "mongodb://localhost:27017/equipment-tracker"; // Adjust if needed

async function checkCounts() {
    try {
        await mongoose.connect(dbUri);

        const overdueCount = await Transaction.countDocuments({ status: 'Overdue' });
        const maintenanceCount = await Equipment.countDocuments({ status: 'Maintenance' });
        const lostCount = await Equipment.countDocuments({ status: 'Lost' });
        const cancelledCount = await Transaction.countDocuments({ status: 'Cancelled' });
        const deniedCount = await Transaction.countDocuments({ status: 'Denied' });

        console.log("--- COUNTS ---");
        console.log(`Overdue Transactions: ${overdueCount}`);
        console.log(`Maintenance Equipment: ${maintenanceCount}`);
        console.log(`Lost Equipment: ${lostCount}`);
        console.log(`Cancelled Transactions: ${cancelledCount}`);
        console.log(`Denied Transactions: ${deniedCount}`);

        const overdueItems = await Transaction.find({ status: 'Overdue' }).populate('user equipment').lean();
        console.log("\n--- OVERDUE ITEMS ---");
        overdueItems.forEach(tx => console.log(`User: ${tx.user?.username}, Equip: ${tx.equipment?.name}, Status: ${tx.status}`));

        const maintenanceItems = await Equipment.find({ status: 'Maintenance' }).lean();
        console.log("\n--- MAINTENANCE EQUIPMENT ---");
        maintenanceItems.forEach(e => console.log(`Name: ${e.name}, Status: ${e.status}`));

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkCounts();
