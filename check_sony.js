require('dotenv').config();
const mongoose = require('mongoose');
const Equipment = require('./models/Equipment');

const checkSony = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("DB Connected");

        const sony = await Equipment.findOne({ name: { $regex: 'Sony', $options: 'i' } });
        if (sony) {
            console.log("Found Sony Device:");
            console.log("Name:", sony.name);
            console.log("IoT Tag:", sony.iotTag);
        } else {
            console.log("Sony device not found.");
        }

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkSony();
