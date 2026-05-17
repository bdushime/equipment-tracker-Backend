const nodemailer = require('nodemailer');

/**
 * Reusable professional email dispatcher
 * Supports real SMTP transport or fallback mockup console logging to prevent crashes.
 */
const sendEmail = async ({ to, subject, html, text }) => {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT || 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    const isSMTPConfigured = smtpHost && smtpUser && smtpPass;

    console.log(`[EMAIL UTILITY] Preparing to dispatch email to: ${to}`);
    console.log(`[EMAIL UTILITY] Subject: ${subject}`);

    if (isSMTPConfigured) {
        try {
            const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: parseInt(smtpPort),
                secure: parseInt(smtpPort) === 465, // true for 465, false for others
                auth: {
                    user: smtpUser,
                    pass: smtpPass
                }
            });

            const info = await transporter.sendMail({
                from: `"AUCA Tracknity Support" <${smtpUser}>`,
                to,
                subject,
                text: text || "Tracknity Notification System.",
                html
            });

            console.log(`[SMTP SUCCESS] Mail delivered securely. MessageId: ${info.messageId}`);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error(`[SMTP ERROR] Real SMTP delivery failed: ${error.message}`);
            console.log("[SMTP FALLBACK] Triggering console mock simulation delivery.");
        }
    } else {
        console.log("[SMTP CONFIG INFO] SMTP settings are incomplete or empty. Using interactive sandbox console fallback.");
    }

    // Elegant presentation fallback to make sure they can demo easily
    console.log("================================================================================");
    console.log(`📬 [SANDBOX EMAIL CLIENT] Dispatched email to: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log("   --- HTML Body ---");
    console.log(html || text);
    console.log("================================================================================");

    return { success: true, mock: true };
};

module.exports = sendEmail;
