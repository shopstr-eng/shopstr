import { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";
import { generateRecoveryToken } from "@/utils/auth/recovery";
import { sendRecoveryEmail } from "@/utils/email/email-service";
import { recoveryRequestLimiter } from "@/utils/auth/rate-limit";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const allowed = await recoveryRequestLimiter(req, res);
  if (!allowed) return;

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const client = new Client({
    connectionString: process.env["DATABASE_URL"],
  });

  try {
    await client.connect();

    await client.query(
      "DELETE FROM account_recovery_tokens WHERE expires_at < NOW() OR used = TRUE"
    );

    const recoveryRecord = await client.query(
      "SELECT id FROM account_recovery WHERE email = $1",
      [email]
    );

    if (recoveryRecord.rows.length === 0) {
      return res.status(200).json({
        success: true,
        message:
          "If an account exists with this email, a recovery link has been sent.",
      });
    }

    await client.query(
      "UPDATE account_recovery_tokens SET used = TRUE WHERE email = $1 AND used = FALSE",
      [email]
    );

    const token = generateRecoveryToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await client.query(
      "INSERT INTO account_recovery_tokens (email, token, expires_at) VALUES ($1, $2, $3)",
      [email, token, expiresAt]
    );

    const baseUrl =
      process.env["NEXTAUTH_URL"] ||
      (req.headers.host
        ? `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`
        : "");
    const recoveryLink = `${baseUrl}/auth/recover?token=${token}`;

    await sendRecoveryEmail(email, recoveryLink);

    res.status(200).json({
      success: true,
      message:
        "If an account exists with this email, a recovery link has been sent.",
    });
  } catch (error) {
    console.error("Request recovery error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    await client.end();
  }
}
