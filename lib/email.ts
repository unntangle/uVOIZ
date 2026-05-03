import { Resend } from 'resend';

/**
 * Email sending — wraps Resend with helpers for the specific transactional
 * emails uVOIZ needs to send.
 *
 * Env:
 *   RESEND_API_KEY     — Resend API key (sending access only)
 *   RESEND_FROM_EMAIL  — From address. Must be on a verified Resend domain.
 *                        Defaults to noreply@uvoiz.unntangle.com.
 *
 * If RESEND_API_KEY is not set, send functions log to console instead of
 * sending. This keeps local dev usable without forcing every contributor
 * to set up Resend.
 */

const FROM = process.env.RESEND_FROM_EMAIL || 'noreply@uvoiz.unntangle.com';
const FROM_NAME = 'uVOIZ';

let resendClient: Resend | null = null;
function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

/**
 * Returns true if Resend is configured. Useful for telling the user "we
 * sent you an email" only when we actually did.
 */
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

// ─────────────────────────────────────────────────────────────────────────
// Password reset
// ─────────────────────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  expiresInMinutes = 30
): Promise<{ ok: boolean; error?: string }> {
  const client = getClient();

  if (!client) {
    // Dev fallback — log so the developer can copy-paste the link
    console.log('\n──────────────────────────────────────────────────────────');
    console.log(`🔑 PASSWORD RESET (Resend not configured) — ${to}`);
    console.log(`   Link: ${resetUrl}`);
    console.log(`   Expires in ${expiresInMinutes} minutes`);
    console.log('──────────────────────────────────────────────────────────\n');
    return { ok: true };
  }

  try {
    const { error } = await client.emails.send({
      from: `${FROM_NAME} <${FROM}>`,
      to,
      subject: 'Reset your uVOIZ password',
      html: passwordResetHtml(resetUrl, expiresInMinutes),
      text: passwordResetText(resetUrl, expiresInMinutes),
    });
    if (error) {
      console.error('Resend send error (password reset):', error);
      return { ok: false, error: error.message || 'Failed to send email' };
    }
    return { ok: true };
  } catch (err: any) {
    console.error('Resend send threw (password reset):', err);
    return { ok: false, error: err?.message || 'Failed to send email' };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Templates — kept inline for now. Move to a /lib/email-templates folder
// once we have more than 2 or 3.
// ─────────────────────────────────────────────────────────────────────────

function passwordResetHtml(resetUrl: string, expiresInMinutes: number): string {
  // Plain HTML, inline CSS only. Email clients are decades behind on CSS
  // support — Tailwind, flexbox, and modern selectors all fail in Outlook.
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Reset your uVOIZ password</title>
</head>
<body style="margin:0; padding:0; background:#f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#1d1d1f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7; padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:14px; box-shadow:0 1px 3px rgba(0,0,0,0.05); overflow:hidden;">
          <tr>
            <td style="padding:32px 40px 0;">
              <div style="font-weight:700; font-size:18px; letter-spacing:-0.01em; color:#1d1d1f;">uVOIZ</div>
              <div style="font-size:11px; color:#86868b; letter-spacing:0.08em; text-transform:uppercase; margin-top:2px;">by Unntangle</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 8px;">
              <h1 style="margin:0; font-size:22px; font-weight:600; color:#1d1d1f;">Reset your password</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 40px 24px; font-size:15px; line-height:1.55; color:#424245;">
              <p style="margin:0 0 16px;">
                Someone — hopefully you — requested a password reset for your uVOIZ account.
              </p>
              <p style="margin:0 0 24px;">
                Click the button below to choose a new password. The link expires in
                <strong>${expiresInMinutes} minutes</strong>.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px; background:#0a84ff;">
                    <a href="${escapeHtml(resetUrl)}"
                       style="display:inline-block; padding:13px 28px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">
                      Reset password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0; font-size:13px; color:#86868b; line-height:1.55;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <span style="word-break:break-all; color:#0a84ff;">${escapeHtml(resetUrl)}</span>
              </p>
              <p style="margin:24px 0 0; font-size:13px; color:#86868b; line-height:1.55;">
                If you didn't request this, you can safely ignore this email — your password won't change.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 32px; border-top:1px solid #e5e5e7;">
              <p style="margin:0; font-size:12px; color:#86868b; line-height:1.55;">
                This message was sent by uVOIZ, an Unntangle product.<br>
                You're receiving it because someone entered this email address on our login page.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function passwordResetText(resetUrl: string, expiresInMinutes: number): string {
  return `Reset your uVOIZ password

Someone — hopefully you — requested a password reset for your uVOIZ account.

Open this link to choose a new password (expires in ${expiresInMinutes} minutes):

${resetUrl}

If you didn't request this, you can safely ignore this email — your password won't change.

— uVOIZ (by Unntangle)
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
