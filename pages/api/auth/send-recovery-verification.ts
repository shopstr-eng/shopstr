import { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";
import { generateVerificationCode } from "@/utils/auth/recovery";
import { sendEmail } from "@/utils/email/email-service";
import { recoverySetupVerifyLimiter } from "@/utils/auth/rate-limit";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const allowed = await recoverySetupVerifyLimiter(req, res);
  if (!allowed) return;

  const { email, pubkey } = req.body;

  if (!email || !pubkey) {
    return res.status(400).json({ error: "Email and pubkey are required" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  const client = new Client({
    connectionString: process.env["DATABASE_URL"],
  });

  try {
    await client.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS recovery_email_verifications (
        id SERIAL PRIMARY KEY,
        pubkey VARCHAR(64) NOT NULL,
        email VARCHAR(255) NOT NULL,
        code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(
      "DELETE FROM recovery_email_verifications WHERE pubkey = $1 OR expires_at < NOW()",
      [pubkey]
    );

    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await client.query(
      "INSERT INTO recovery_email_verifications (pubkey, email, code, expires_at) VALUES ($1, $2, $3, $4)",
      [pubkey, email, code, expiresAt]
    );

    const subject = "Milk Market — Verify Your Recovery Email";
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="margin: 0 0 16px; font-size: 20px; color: #111;">Verify Your Email</h2>
        <p style="margin: 0 0 24px; color: #555; font-size: 14px; line-height: 1.5;">
          Enter this code in Milk Market to verify your recovery email address:
        </p>
        <div style="background: #f5f5f5; border: 2px solid #111; border-radius: 8px; padding: 20px; text-align: center; margin: 0 0 24px;">
          <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111;">${code}</span>
        </div>
        <p style="margin: 0; color: #888; font-size: 12px;">
          This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `;

    await sendEmail(email, subject, html);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Send recovery verification error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    await client.end();
  }
}
