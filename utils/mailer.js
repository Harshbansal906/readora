/**
 * READORA - Universal High-Deliverability Email Dispatch Service
 * Supports:
 * 1. Resend API (HTTP REST - 100% Free, bypasses cloud SMTP port blocks on Render/Vercel)
 * 2. Brevo / Custom SMTP
 * 3. Gmail SMTP (Nodemailer fallback)
 */

const nodemailer = require('nodemailer');

/**
 * Dispatches verification or password reset email with high inbox deliverability.
 * @param {string} toEmail - Recipient email
 * @param {string} otpCode - 6-digit OTP code
 * @param {'verify' | 'reset'} type - Purpose of OTP code
 */
async function sendVerificationEmail(toEmail, otpCode, type = 'verify') {
  const cleanRecipient = toEmail.trim().toLowerCase();
  const isReset = type === 'reset';

  const actionTitle = isReset ? 'Reset Your Password' : 'Verify Your Email Address';
  const actionDesc = isReset
    ? 'We received a request to reset your READORA account password. Use the 6-digit code below to set your new password:'
    : 'Hello,<br>Use the 6-digit confirmation code below to verify your email and complete your Readora account setup:';
  const emailSubject = isReset
    ? `${otpCode} is your READORA password reset code`
    : `${otpCode} is your READORA verification code`;

  // 1. Plain text version
  const plainText = `Your READORA ${isReset ? 'password reset' : 'verification'} code is: ${otpCode}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.\n\n— The Readora Team`;

  // 2. Clean modern HTML template
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px 12px; }
        .wrapper { max-width: 480px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px 24px; box-shadow: 0 4px 6px rgba(0,0,0,0.04); }
        .logo { font-size: 24px; font-weight: 800; color: #2563eb; letter-spacing: 1px; margin-bottom: 4px; }
        .subtitle { font-size: 13px; color: #64748b; margin-bottom: 24px; }
        .title { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
        .desc { font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 20px; }
        .otp-box { background: #eff6ff; border: 2px dashed #2563eb; border-radius: 8px; padding: 16px; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #1d4ed8; text-align: center; margin: 20px 0; font-family: monospace; }
        .note { font-size: 12px; color: #94a3b8; line-height: 1.5; margin-bottom: 24px; text-align: center; }
        .footer { border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 11px; color: #94a3b8; text-align: center; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="logo">READORA</div>
        <div class="subtitle">Where readers become creators</div>
        
        <div class="title">${actionTitle}</div>
        <div class="desc">${actionDesc}</div>

        <div class="otp-box">${otpCode}</div>

        <div class="note">
          ⏱️ This code will expire in <strong>10 minutes</strong>.<br>
          If you did not request this code, please ignore this email.
        </div>

        <div class="footer">
          &copy; ${new Date().getFullYear()} READORA Platform • Automated Security Message
        </div>
      </div>
    </body>
    </html>
  `;

  // OPTION A: RESEND API (HTTP REST — 100% Free, Reliable in Cloud without SMTP blocks)
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  if (resendApiKey) {
    try {
      console.log(`🚀 [Resend HTTP] Sending ${type} email to ${cleanRecipient}...`);
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.FROM_EMAIL || 'READORA <onboarding@resend.dev>',
          to: [cleanRecipient],
          subject: emailSubject,
          text: plainText,
          html: htmlContent
        })
      });

      const data = await response.json();
      if (response.ok) {
        console.log(`✅ [Resend Success] Email delivered! ID: ${data.id}`);
        return { success: true, messageId: data.id, provider: 'resend' };
      } else {
        console.error(`⚠️ [Resend API Error]:`, data);
      }
    } catch (resendErr) {
      console.error(`⚠️ [Resend Failed, falling back to SMTP]:`, resendErr.message);
    }
  }

  // OPTION B: GMAIL / CUSTOM SMTP (Nodemailer)
  const user = (process.env.GMAIL_USER || process.env.SMTP_USER || '').trim();
  const rawPass = (process.env.GMAIL_APP_PASS || process.env.SMTP_PASS || '').trim();
  const pass = rawPass.replace(/\s+/g, '');

  if (!user || !pass) {
    throw new Error('No email provider credentials configured (RESEND_API_KEY or GMAIL_USER/GMAIL_APP_PASS)');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass }
  });

  const mailOptions = {
    from: process.env.FROM_EMAIL || `"READORA" <${user}>`,
    to: cleanRecipient,
    replyTo: user,
    subject: emailSubject,
    text: plainText,
    html: htmlContent,
    headers: {
      'X-Priority': '3',
      'X-MSMail-Priority': 'Normal',
      'Importance': 'Normal'
    }
  };

  console.log(`📨 [Gmail SMTP] Dispatching ${type} code to: ${cleanRecipient}...`);
  const info = await transporter.sendMail(mailOptions);
  console.log(`✅ [Gmail SMTP Delivered] ID: ${info.messageId}`);
  return { success: true, messageId: info.messageId, provider: 'gmail' };
}

module.exports = { sendVerificationEmail };
