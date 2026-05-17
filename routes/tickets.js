const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const sendEmail = require('../utils/email');
const { verifyToken } = require('../middleware/verifyToken');

// POST /api/tickets
router.post('/', async (req, res) => {
    console.log("👉 Ticket Route Hit (Dynamic Handling)!"); 

    try {
        const { subject, message, email } = req.body;

        if (!subject || !message || !email) {
            return res.status(400).json({ message: "All fields (email, subject, message) are required." });
        }

        // Try to find a registered user matching the email
        const user = await User.findOne({ email: email.trim().toLowerCase() });
        
        let targetUserId;
        if (user) {
            targetUserId = user._id;
        } else {
            // Graceful fallback to avoid schema validation errors: find first user in system
            const fallbackUser = await User.findOne();
            targetUserId = fallbackUser ? fallbackUser._id : "695501a1db6a8e385fd2f9e7"; 
        }

        const newTicket = new Ticket({
            user: targetUserId,
            email: email.trim().toLowerCase(),
            subject: subject.trim(),
            message: message.trim()
        });

        const savedTicket = await newTicket.save();
        console.log("✅ Ticket Saved:", savedTicket);

        // Dispatch a professional HTML alert email to the IT support desk
        const emailHTML = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
                <div style="background-color: #0f172a; padding: 20px; border-radius: 6px; text-align: center; color: white;">
                    <h1 style="margin: 0; font-size: 24px; letter-spacing: 0.5px;">🎫 IT Support Registry</h1>
                    <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">New Incident Ticket Raised</p>
                </div>
                <div style="padding: 20px; color: #334155; line-height: 1.6;">
                    <p>Hello IT Support Team,</p>
                    <p>A new student help ticket has been successfully registered in the Tracknity database.</p>
                    
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 4px 0; font-weight: bold; color: #64748b; font-size: 12px; text-transform: uppercase; width: 120px;">Sender:</td>
                                <td style="padding: 4px 0; color: #0f172a; font-weight: bold;">\${email}</td>
                            </tr>
                            <tr>
                                <td style="padding: 4px 0; font-weight: bold; color: #64748b; font-size: 12px; text-transform: uppercase;">Subject:</td>
                                <td style="padding: 4px 0; color: #0f172a; font-weight: bold;">\${subject}</td>
                            </tr>
                            <tr>
                                <td style="padding: 4px 0; font-weight: bold; color: #64748b; font-size: 12px; text-transform: uppercase; vertical-align: top;">Message:</td>
                                <td style="padding: 4px 0; color: #334155; white-space: pre-wrap;">\${message}</td>
                            </tr>
                        </table>
                    </div>

                    <p>Please log into the Staff Control Panel to review and assign this ticket to an officer.</p>
                    
                    <p style="font-size: 12px; color: #94a3b8; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                        Tracknity Incident Notification Agent. Raised on \${new Date().toLocaleString()}.
                    </p>
                </div>
            </div>
        `;

        await sendEmail({
            to: "it-support@auca.ac.rw",
            subject: `[New Ticket] ${subject}`,
            html: emailHTML,
            text: `A new ticket has been raised by ${email}. Subject: ${subject}. Message: ${message}`
        });

        res.status(201).json(savedTicket);

    } catch (err) {
        console.error("❌ Ticket Error:", err);
        res.status(500).json({ message: "Failed to submit ticket", error: err.message });
    }
});

// GET /api/tickets/my-tickets
router.get('/my-tickets', verifyToken, async (req, res) => {
    try {
        const tickets = await Ticket.find({ user: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json(tickets);
    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;