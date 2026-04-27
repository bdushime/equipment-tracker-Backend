require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const START_ID = 25000;
const END_ID = 26700;
const TEMP_PASSWORD = process.env.STUDENT_TEMP_PASSWORD || "password123";
const TEMP_EMAIL_DOMAIN = process.env.STUDENT_TEMP_EMAIL_DOMAIN || "temp.students.local";

const run = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI is missing in environment.");
        }

        await mongoose.connect(process.env.MONGO_URI);

        const hashedPassword = await bcrypt.hash(TEMP_PASSWORD, 10);
        const operations = [];

        for (let id = START_ID; id <= END_ID; id += 1) {
            const studentId = String(id);
            const username = `student${studentId}`;
            const email = `${username}@${TEMP_EMAIL_DOMAIN}`;

            operations.push({
                updateOne: {
                    filter: { studentId },
                    update: {
                        $setOnInsert: {
                            username,
                            email,
                            password: hashedPassword,
                            role: 'Student',
                            studentId,
                            fullName: `Student ${studentId}`,
                            department: 'General',
                            mustChangePassword: true
                        }
                    },
                    upsert: true
                }
            });
        }

        const result = await User.bulkWrite(operations, { ordered: false });

        console.log(`Seed complete for student IDs ${START_ID}-${END_ID}.`);
        console.log(`Inserted: ${result.upsertedCount || 0}`);
        console.log(`Already existing: ${operations.length - (result.upsertedCount || 0)}`);
        console.log(`Default temp password used: ${TEMP_PASSWORD}`);
    } catch (error) {
        console.error("Student seed failed:", error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.connection.close();
    }
};

run();
