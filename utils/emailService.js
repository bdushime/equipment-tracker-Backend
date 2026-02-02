const nodemailer = require('nodemailer');
const Notification = require('../models/Notification');

// 1. Configure the Transporter (Brevo SMTP)
const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com', 
    port: 587,              // Standard SMTP Port
    secure: false,          // False for TLS/STARTTLS
    auth: {
        user: process.env.EMAIL_USER, // This reads 'a15375001@smtp-brevo.com' from Render
        pass: process.env.EMAIL_PASS  // This reads your long 'xsmtpsib-...' Key
    },
    tls: {
        rejectUnauthorized: false // Helps prevent cloud SSL handshake errors
    }
});

// 2. The Main Function to Send & Save
const sendNotification = async (userId, userEmail, title, message, type = 'info', relatedId = null) => {
    try {
        // A. Save to Database (Always happens)
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
                // ✅ FIXED: We authenticate with Brevo ID, but send AS your Gmail.
                from: `"Tracknity System" <bdushime47@gmail.com>`, 
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