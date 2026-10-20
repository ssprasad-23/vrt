import { Resend } from 'resend';
import { log } from './logger.js';

// Created on first use rather than at import: dotenv.config() runs in server.js after the
// imports are evaluated, so process.env isn't filled in yet at module load.
let resend;

// Without RESEND_API_KEY (local dev) the code is logged instead of emailed.
export async function sendResetCodeEmail(to, code) {
  if (!process.env.RESEND_API_KEY) {
    log(`RESEND_API_KEY not set — password reset code for ${to}: ${code}`);
    return;
  }
  resend ??= new Resend(process.env.RESEND_API_KEY);

  // The Resend SDK reports failures in `error` instead of throwing
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM,
    to,
    subject: 'Your password reset code',
    text: `Your password reset code is ${code}. It expires in 10 minutes.\n\nIf you didn't ask to reset your password, you can ignore this email.`,
    html: `<p>Your password reset code is:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>
<p>It expires in 10 minutes.</p>
<p>If you didn't ask to reset your password, you can ignore this email.</p>`,
  });
  if (error) {
    throw new Error(`Resend failed: ${error.name}: ${error.message}`);
  }
  log('Password reset code email sent');
}
