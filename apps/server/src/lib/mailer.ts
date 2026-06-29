import nodemailer, { type Transporter } from "nodemailer";

// SMTP is optional: the app runs fine without it. Configure via env to enable
// outgoing mail (weekly report emails, etc.).
//   SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS
//   SMTP_SECURE = "true" for implicit TLS (port 465)
//   MAIL_FROM   = "Kidora <no-reply@kidora.app>"
export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export function mailFrom(): string {
  return process.env.MAIL_FROM || process.env.SMTP_USER || "Kidora <no-reply@kidora.app>";
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  if (!isMailConfigured()) {
    throw new Error("SMTP is not configured (set SMTP_HOST). See .env.example.");
  }
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

export type Mail = { to: string; subject: string; html: string; text?: string };

/** Send one email. Throws if SMTP is not configured or delivery fails. */
export async function sendMail(mail: Mail): Promise<void> {
  await getTransporter().sendMail({
    from: mailFrom(),
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
}
