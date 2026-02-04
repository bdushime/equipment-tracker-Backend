require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const users = [
    {
        username: "admin_user",
        email: "admin@auca.ac.rw",
        password: "Admin@123",
        role: "Admin",
        fullName: "System Administrator",
        department: "IT"
    },
    {
        username: "it_staff",
        email: "itstaff@auca.ac.rw",
        password: "ITStaff@123",
        role: "IT_Staff",
        fullName: "IT Staff Member",
        department: "IT"
    },
    {
        username: "security_guard",
        email: "security@auca.ac.rw",
        password: "Security@123",
        role: "Security",
        fullName: "Security Personnel",
        department: "Security"
    }
];

const seedUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to MongoDB");

        for (const userData of users) {
            // Check if user already exists
            const exists = await User.findOne({ email: userData.email });
            if (exists) {
                console.log(`⚠️ User ${userData.email} already exists, skipping...`);
                continue;
            }

            const newUser = new User(userData);
            await newUser.save();
            console.log(`✅ Created ${userData.role}: ${userData.email}`);
        }

        console.log("\n🎉 Seeding complete!");
        console.log("\n📋 Login Credentials:");
        console.log("─────────────────────────────────────────────────");
        console.log("| Role      | Email                | Password     |");
        console.log("─────────────────────────────────────────────────");
        console.log("| Admin     | admin@auca.ac.rw     | Admin@123    |");
        console.log("| IT_Staff  | itstaff@auca.ac.rw   | ITStaff@123  |");
        console.log("| Security  | security@auca.ac.rw  | Security@123 |");
        console.log("─────────────────────────────────────────────────");

        process.exit(0);
    } catch (err) {
        console.error("❌ Error:", err.message);
        process.exit(1);
    }
};

seedUsers();
