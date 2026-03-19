require('dotenv').config();
const mongoose = require('mongoose');
const Equipment = require('./models/Equipment');

const checkCoords = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const items = await Equipment.find({});
        console.log(`Checking ${items.length} items for coordinates...`);

        items.forEach(item => {
            console.log(`${item.name}: ${JSON.stringify(item.geoCoordinates)}`);
        });

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkCoords();
