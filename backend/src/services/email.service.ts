import nodemailer from "nodemailer";

export async function sendTestEmail(
  recipientEmail: string,
  subject: string,
  body: string
) {
  // Create transporter after environment variables are loaded
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: recipientEmail,
    subject,
    text: body,
  });

  console.log("Email sent:", info.messageId);

  return info;
}