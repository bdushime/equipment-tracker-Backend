require('dotenv').config(); // Load environment variables
const nodemailer = require('nodemailer');

const sendTestEmail = async () => {
    console.log("1. Loading credentials...");
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!user || !pass) {
        console.error("❌ ERROR: EMAIL_USER or EMAIL_PASS is missing in .env file.");
        return;
    }

    console.log(`2. Preparing to send from: ${user}`);

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass }
    });

    const mailOptions = {
        from: `"Tracknity Test" <${user}>`,
        to: user, // Sending to yourself to test
        subject: "Test Email from Tracknity System",
        text: "If you see this, your email system is working perfectly! 🚀"
    };

    try {
        console.log("3. Sending...");
        const info = await transporter.sendMail(mailOptions);
        console.log("✅ SUCCESS! Email sent: " + info.response);
    } catch (error) {
        console.error("❌ FAILED:", error);
    }
};

sendTestEmail();