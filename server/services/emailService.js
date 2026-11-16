import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Create a transporter. For development/testing, we'll use Ethereal Email if no SMTP config is provided.
let transporter;

async function initTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    // Use real SMTP if configured in .env
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_PORT == 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    console.log('Real SMTP transporter configured.');
  } else {
    // Use Ethereal for testing
    let testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    console.log('Test Ethereal transporter configured. Check console logs for email preview URLs.');
  }
}

// Initialize on startup
initTransporter().catch(console.error);

/**
 * Send an email notification
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} text - Plain text email body
 * @param {string} html - HTML email body (optional)
 * @param {object} extraOptions - Optional extra nodemailer fields (cc, replyTo, attachments)
 */
export async function sendEmail(to, subject, text, html, extraOptions = {}) {
  try {
    if (!transporter) await initTransporter();

    let info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"FlowTrack Notificações" <noreply@repfix.pt>',
      to,
      subject,
      text,
      html: html || text.replace(/\n/g, '<br>'),
      ...extraOptions,
    });

    console.log("Message sent: %s", info.messageId);
    
    // If using ethereal, log the preview URL
    if (info.messageId && !process.env.SMTP_HOST) {
      console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    }
    
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}
