const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Course = require('../models/Course');

const courses = [

    { code: "ACCT 112", name: "Principles of Accounting I" },
    { code: "AMAT 111", name: "Applied Mathematics" },
    { code: "EDRM 113", name: "Study and Research Methods" },
    { code: "ENGL 115", name: "General English" },
    { code: "INSY 118", name: "Introduction to Computer Applications" },
    { code: "RELB 116", name: "Introduction to Bible Study" },
    { code: "INSY 214", name: "Computer Maintenance" },
    { code: "INSY 217", name: "Database Management System" },
    { code: "STAT 122", name: "Descriptive Statistics" },
    { code: "ENGL 124", name: "Academic English Writing" },
    { code: "INSY 227", name: "Introduction to Computer Programming" },
    { code: "INSY 321", name: "Software Engineering" },
    { code: "MATH 127", name: "Digital Computer Fundamentals" },
    { code: "RELT 123", name: "Bible Doctrines" },
    { code: "STAT 223", name: "Probability, Statistics and Reliability" },
    { code: "COSC 222", name: "Electronic Device and Circuits" },
    { code: "COSC 416", name: "Routing and Switching" },
    { code: "ENGL 223", name: "English Proficiency Certificate I" },
    { code: "INSY 228", name: "Programming with C" },
    { code: "INSY 229", name: "Computer Networks" },
    { code: "COSC 413", name: "Multimedia Computing" },
    { code: "INSY 226", name: "Management Information System" },
    { code: "INSY 410", name: "Emerging Technologies" },
    { code: "COSC 421", name: "Advanced Computer Networks" },
    { code: "ENGL 224", name: "English Proficiency Certificate II" },
    { code: "HELT 213", name: "Health Principles" },
    { code: "INSY 230", name: "Object-Oriented Programming" },
    { code: "INSY 329", name: "Operating Systems" },
    { code: "COSC 415", name: "Mobile communication" },
    { code: "COSC 417", name: "Introduction to LINUX Administration" },
    { code: "COSC 418", name: "Network Security" },
    { code: "COSC 423", name: "Wireless Networks" },
    { code: "INSY 324", name: "Java Programming" },
    { code: "INSY 8314", name: "Web Design" },
    { code: "INSY 8415", name: "System Analysis and Design" },
    { code: "RELT 8221", name: "Philosophy, Science and Religion" },
    { code: "COSC 8323", name: "Network Administration" },
    { code: "INSY 8321", name: "Data Structure and Algorithm" },
    { code: "INSY 8322", name: "Web Technology and Internet" },
    { code: "INSY 8421", name: "Internship" },
    { code: "MATH 8214", name: "Multivariable Calculus & Differential Equations" },
    { code: "COSC 8311", name: "Advanced Computer Networks" },
    { code: "COSC 8324", name: "Network Programming TCP/IP" },
    { code: "COSC 8411", name: "System Administration" },
    { code: "INSY 8422", name: "Final Year Project" }
];

const seedCourses = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB for seeding...");

        for (const course of courses) {
            const existing = await Course.findOne({ code: course.code });
            if (!existing) {
                await Course.create(course);
                console.log(`Added: ${course.code} - ${course.name}`);
            } else {
                console.log(`Skipped (already exists): ${course.code}`);
            }
        }

        console.log("Seeding completed!");
        process.exit(0);
    } catch (err) {
        console.error("Seeding error:", err);
        process.exit(1);
    }
};

seedCourses();
