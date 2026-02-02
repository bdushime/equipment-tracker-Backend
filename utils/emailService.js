const nodemailer = require('nodemailer');
const Notification = require('../models/Notification');

// 1. Configure the Transporter (Brevo on Port 2525)
const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com', 
    port: 2525,             // 👈 FORCE PORT 2525 (Bypasses Render Firewall)
    secure: false,          // Must be false for 2525
    auth: {
        user: process.env.EMAIL_USER, // Your Brevo Email
        pass: process.env.EMAIL_PASS  // Your Brevo SMTP Key
    },
    tls: {
        rejectUnauthorized: false // Helps with cloud SSL handshakes
    }
});

// 2. The Main Function to Send & Save
const sendNotification = async (userId, userEmail, title, message, type = 'info', relatedId = null) => {


    // Add this right inside the sendNotification function
console.log("DEBUG AUTH CHECK:");
console.log("User:", process.env.EMAIL_USER);
console.log("Pass Length:", process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : "MISSING");
console.log("First 3 chars of Key:", process.env.EMAIL_PASS ? process.env.EMAIL_PASS.substring(0, 3) : "N/A");

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
                from: `"Tracknity System" <${process.env.EMAIL_USER}>`, // Must match your Brevo verified sender
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

            // Attempt to send
            transporter.sendMail(mailOptions, (err, info) => {
                if (err) {
                    console.error("❌ Email Failed:", err.message);
                } else {
                    console.log(`✅ Email sent to ${userEmail}`);
                }
            });

        } else {
            console.warn("⚠️ Email skipped: Credentials missing.");
        }

    } catch (error) {
        console.error("Notification Error:", error);
    }
};

module.exports = { sendNotification };