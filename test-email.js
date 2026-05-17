require('dotenv').config();
const sendEmail = require('./utils/email');

async function test() {
    console.log("Testing email with:");
    console.log("SMTP_USER:", process.env.SMTP_USER || process.env.EMAIL_USER);
    console.log("SMTP_PASS:", process.env.SMTP_PASS || process.env.EMAIL_PASS ? "***" : "none");
    
    const result = await sendEmail({
        to: 'bdushime47@gmail.com', 
        subject: 'Test Email from Local Backend',
        html: '<p>This is a test to prove the backend works!</p>',
        text: 'This is a test to prove the backend works!'
    });
    console.log("Result:", result);
}
test();
