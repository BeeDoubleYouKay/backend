const nodemailer: any = require('nodemailer');

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.MAIL_FROM ?? `no-reply@localhost`;

if (!host || !user || !pass) {
  console.warn('SMTP not fully configured; outbound email will fail until SMTP_HOST/SMTP_USER/SMTP_PASS are set.');
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: user && pass ? { user, pass } : undefined,
});

export async function sendMail(to: string, subject: string, html: string, text?: string) {
  const isTest = process.env.NODE_ENV === 'test';
  const isDev = process.env.NODE_ENV === 'development';
  const smtpConfigured = Boolean(host && user && pass);

  // If SMTP is not configured, or in test mode, or in development without SMTP_HOST,
  // skip sending emails and resolve immediately so registration / dev flow is not blocked.
  if (!smtpConfigured || isTest || (isDev && !host)) {
    console.warn(
      `Mailer: skipping sendMail to ${to} (smtpConfigured=${smtpConfigured}, NODE_ENV=${process.env.NODE_ENV})`
    );
    return Promise.resolve(undefined);
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text,
    });
    return info;
  } catch (err) {
    // Log the error but do not rethrow so registration / other flows are not blocked.
    console.error('Mailer: sendMail failed (error swallowed)', err);
    return undefined;
  }
}

export default transporter;