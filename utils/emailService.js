const nodemailer = require('nodemailer');
const Notification = require('../models/Notification');

// 1. Configure the Transporter (Force IPv4 on Port 587)
const transporter = nodemailer.createTransport({
    service: 'gmail', 
    // We use the 'service' shorthand here because it automatically handles 
    // the correct host/port mapping for Gmail, but we MUST force authentication logic.
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS 
    },
    // 👇 THIS IS THE FIX FOR RENDER TIMEOUTS
    family: 4, 
});

// 2. The Main Function to Send & Save
const sendNotification = async (userId, userEmail, title, message, type = 'info', relatedId = null) => {
    try {
        // A. Save to Database
        await Notification.create({
            recipient: userId,
            title,
            message,
            type,
            relatedId
        });

        // B. Send Email
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const mailOptions = {
                from: `"Tracknity System" <${process.env.EMAIL_USER}>`,
                to: userEmail,
                subject: `Tracknity Alert: ${title}`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                        <h2 style="color: #0b1d3a;">${title}</h2>
                        <p style="font-size: 16px; color: #333;">${message}</p>
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                        <p style="font-size: 12px; color: #777;">This is an automated message from the Tracknity Equipment System.</p>
                    </div>
                `
            };

            // Attempt to send with callback for logging
            transporter.sendMail(mailOptions, (err, info) => {
                if (err) {
                    console.error("❌ Email Failed:", err.message);
                } else {
                    console.log(`📧 Email sent to ${userEmail}`);
                }
            });

        } else {
            console.warn("⚠️ Email skipped: No EMAIL_USER/PASS in .env");
        }

    } catch (error) {
        console.error("Notification Error:", error);
    }
};

module.exports = { sendNotification };