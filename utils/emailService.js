const nodemailer = require('nodemailer');
const Notification = require('../models/Notification');

// 1. Configure the Transporter (The Postman)
const transporter = nodemailer.createTransport({
    service: 'gmail', // Or your SMTP provider
    auth: {
        user: process.env.EMAIL_USER, // Add this to your .env
        pass: process.env.EMAIL_PASS  // Add this to your .env (App Password, not login password)
    }
});

// 2. The Main Function to Send & Save
const sendNotification = async (userId, userEmail, title, message, type = 'info', relatedId = null) => {
    try {
        // A. Save to Database (In-App Notification)
        await Notification.create({
            recipient: userId,
            title,
            message,
            type,
            relatedId
        });

        // B. Send Email
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

        if (process.env.EMAIL_USER) {
            await transporter.sendMail(mailOptions);
            console.log(`📧 Email sent to ${userEmail}`);
        } else {
            console.warn("⚠️ Email skipped: No EMAIL_USER in .env");
        }

    } catch (error) {
        console.error("Notification Error:", error);
        // We don't throw error here to prevent blocking the main transaction flow
    }
};

module.exports = { sendNotification };