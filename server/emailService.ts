/**
 * emailService.ts — Lightweight SMTP email helper using Nodemailer.
 * Credentials come from env.ts (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).
 * Falls back to a "no-op" mode when SMTP_PASS is not set (dev / CI).
 */

import nodemailer from "nodemailer";
import { ENV } from "./_core/env";
const env = ENV;

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
    // R4 F10: TLS certificate verification stays ON (Node default). The only
    // opt-out is the explicit dev escape hatch EMAIL_TLS_INSECURE=true, which
    // is refused in production and logs a loud warning.
    tls: {
      rejectUnauthorized: (() => {
        const insecure = process.env.EMAIL_TLS_INSECURE === "true";
        if (insecure && process.env.NODE_ENV === "production") {
          // Fail closed: NEVER disable TLS verification in production.
          throw new Error("[emailService] EMAIL_TLS_INSECURE=true is forbidden in production — refusing to create SMTP transporter");
        }
        if (insecure) {
          console.warn("[emailService] WARNING: EMAIL_TLS_INSECURE=true — SMTP TLS certificate verification DISABLED (dev only). Do not use with real credentials.");
        }
        return !insecure;
      })(),
    },
  });
  return _transporter;
}

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

/**
 * Send an email. Returns true on success, false on failure.
 * In dev mode (no SMTP_PASS), logs the email instead of sending.
 */
export async function sendEmail(opts: SendMailOptions): Promise<boolean> {
  const from = opts.from ?? `"PayGate" <noreply@${env.smtpHost.replace(/^smtp\./, "")}>`;
  if (!env.smtpPass) {
    // R4 F10: the simulated send is gated — in production a missing SMTP_PASS
    // is a misconfiguration and must fail loudly (return false), not pretend
    // the email was delivered.
    const simulationAllowed =
      process.env.PAYGATE_SIMULATION_MODE === "true" ||
      process.env.NODE_ENV !== "production";
    if (!simulationAllowed) {
      console.error("[emailService] SMTP_PASS not configured in production — email NOT sent (failing loud):", {
        to: opts.to,
        subject: opts.subject,
      });
      return false;
    }
    console.warn("[emailService] SIMULATED SEND (PAYGATE_SIMULATION_MODE or non-production) — email not actually delivered:", {
      to: opts.to,
      subject: opts.subject,
    });
    return true;
  }
  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from,
      to: Array.isArray(opts.to) ? opts.to.join(", ") : opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text ?? opts.html.replace(/<[^>]+>/g, ""),
    });
    return true;
  } catch (err) {
    console.error("[emailService] Failed to send email:", err);
    return false;
  }
}

// ─── Template helpers ──────────────────────────────────────────────────────────

export function teamInviteEmail(opts: {
  inviteeName: string;
  inviterName: string;
  businessName: string;
  role: string;
  inviteUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `You've been invited to join ${opts.businessName} on PayGate`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #6366f1; font-size: 28px; margin: 0;">PayGate</h1>
    <p style="color: #6b7280; margin: 4px 0 0;">Merchant Portal</p>
  </div>
  <h2 style="font-size: 22px; margin-bottom: 8px;">You've been invited!</h2>
  <p style="color: #374151; line-height: 1.6;">
    <strong>${opts.inviterName}</strong> has invited you to join <strong>${opts.businessName}</strong>
    on PayGate as a <strong>${opts.role}</strong>.
  </p>
  <p style="color: #374151; line-height: 1.6;">
    Click the button below to accept the invitation and set up your account.
  </p>
  <div style="text-align: center; margin: 32px 0;">
    <a href="${opts.inviteUrl}"
       style="background: #6366f1; color: white; padding: 14px 28px; border-radius: 8px;
              text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
      Accept Invitation
    </a>
  </div>
  <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">
    This invitation link expires in 7 days. If you didn't expect this email, you can safely ignore it.
  </p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
  <p style="color: #9ca3af; font-size: 12px; text-align: center;">
    © ${new Date().getFullYear()} PayGate. All rights reserved.
  </p>
</body>
</html>`,
  };
}

export function payoutApprovalEmail(opts: {
  approverName: string;
  merchantName: string;
  amount: string;
  currency: string;
  payoutId: string;
  approveUrl: string;
  rejectUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `[Action Required] Payout Approval — ${opts.merchantName} — ${opts.currency} ${opts.amount}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #6366f1; font-size: 28px; margin: 0;">PayGate</h1>
  </div>
  <h2 style="font-size: 20px;">Payout Approval Required</h2>
  <p>Hi ${opts.approverName},</p>
  <p>A payout from <strong>${opts.merchantName}</strong> requires your approval:</p>
  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Payout ID</td>
        <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">${opts.payoutId}</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Amount</td>
        <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">${opts.currency} ${opts.amount}</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Merchant</td>
        <td style="padding: 8px; border: 1px solid #e5e7eb;">${opts.merchantName}</td></tr>
  </table>
  <div style="text-align: center; margin: 32px 0; display: flex; gap: 16px; justify-content: center;">
    <a href="${opts.approveUrl}"
       style="background: #10b981; color: white; padding: 12px 24px; border-radius: 8px;
              text-decoration: none; font-weight: 600; display: inline-block; margin: 0 8px;">
      ✓ Approve
    </a>
    <a href="${opts.rejectUrl}"
       style="background: #ef4444; color: white; padding: 12px 24px; border-radius: 8px;
              text-decoration: none; font-weight: 600; display: inline-block; margin: 0 8px;">
      ✗ Reject
    </a>
  </div>
  <p style="color: #9ca3af; font-size: 13px;">
    If you did not request this, please contact support immediately.
  </p>
</body>
</html>`,
  };
}

export function kycStatusEmail(opts: {
  merchantName: string;
  status: "approved" | "rejected" | "pending";
  reason?: string;
  portalUrl: string;
}): { subject: string; html: string } {
  const statusLabel = opts.status === "approved" ? "✅ Approved" : opts.status === "rejected" ? "❌ Rejected" : "⏳ Under Review";
  const statusColor = opts.status === "approved" ? "#10b981" : opts.status === "rejected" ? "#ef4444" : "#f59e0b";
  return {
    subject: `KYC Verification ${statusLabel} — ${opts.merchantName}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #6366f1; font-size: 28px; margin: 0;">PayGate</h1>
  </div>
  <h2 style="font-size: 20px;">KYC Verification Update</h2>
  <p>Hi <strong>${opts.merchantName}</strong>,</p>
  <p>Your KYC verification status has been updated:</p>
  <div style="background: ${statusColor}15; border: 2px solid ${statusColor}; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0;">
    <span style="font-size: 24px; font-weight: 700; color: ${statusColor};">${statusLabel}</span>
  </div>
  ${opts.reason ? `<p><strong>Reason:</strong> ${opts.reason}</p>` : ""}
  <div style="text-align: center; margin: 24px 0;">
    <a href="${opts.portalUrl}"
       style="background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px;
              text-decoration: none; font-weight: 600; display: inline-block;">
      View in Portal
    </a>
  </div>
</body>
</html>`,
  };
}

export function geoAnomalyEmail(opts: {
  ownerEmail: string;
  userId: string;
  newCountry: string;
  knownCountries: string[];
  ipAddress?: string;
  timestamp: Date;
  portalUrl: string;
}): { subject: string; html: string } {
  const knownList = opts.knownCountries.length > 0
    ? opts.knownCountries.join(", ")
    : "None on record";
  const formattedTime = opts.timestamp.toUTCString();
  return {
    subject: `🌍 New Country Login Detected — ${opts.newCountry}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #6366f1; font-size: 28px; margin: 0;">PayGate</h1>
  </div>
  <div style="background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <h2 style="color: #92400e; margin: 0 0 8px 0; font-size: 18px;">🌍 New Country Login Alert</h2>
    <p style="color: #78350f; margin: 0;">A user has logged in from a country not previously seen in their login history.</p>
  </div>
  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #6b7280; width: 40%;">User ID</td>
        <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-family: monospace;">${opts.userId}</td></tr>
    <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #6b7280;">New Country</td>
        <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 700; color: #d97706;">${opts.newCountry}</td></tr>
    <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #6b7280;">Known Countries</td>
        <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${knownList}</td></tr>
    ${opts.ipAddress ? `<tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #6b7280;">IP Address</td>
        <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-family: monospace;">${opts.ipAddress}</td></tr>` : ""}
    <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #6b7280;">Timestamp</td>
        <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${formattedTime}</td></tr>
  </table>
  <div style="text-align: center; margin: 24px 0;">
    <a href="${opts.portalUrl}/active-sessions"
       style="background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px;
              text-decoration: none; font-weight: 600; display: inline-block;">
      Review in Portal
    </a>
  </div>
  <p style="color: #9ca3af; font-size: 13px; text-align: center;">
    If this login was expected, you can dismiss the alert in the Auth Events page.
  </p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
  <p style="color: #9ca3af; font-size: 12px; text-align: center;">
    © ${new Date().getFullYear()} PayGate. All rights reserved.
  </p>
</body>
</html>`,
  };
}
