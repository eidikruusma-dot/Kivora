import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD } = process.env;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
  console.warn(
    "[mailer] SMTP_HOST, SMTP_USER, or SMTP_PASSWORD is not set — email sending will fail at runtime.",
  );
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT ?? 465),
  secure: SMTP_SECURE !== "false", // true unless explicitly "false"
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASSWORD,
  },
});

export default transporter;
