import { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";
import CryptoJS from "crypto-js";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "auth-email-signin", RATE_LIMIT)) return;

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const client = new Client({
    connectionString: process.env["DATABASE_URL"],
  });

  try {
    await client.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_auth (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        pubkey VARCHAR(64) NOT NULL,
        encrypted_nsec TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const passwordHash = CryptoJS.SHA256(email + password).toString();

    // Get user from database
    const result = await client.query(
      "SELECT pubkey, encrypted_nsec FROM email_auth WHERE email = $1 AND password_hash = $2",
      [email, passwordHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const { pubkey, encrypted_nsec } = result.rows[0];

    // Decrypt nsec
    const encryptionKey = CryptoJS.PBKDF2(
      email + password,
      "milk-market-salt",
      {
        keySize: 256 / 32,
        iterations: 1000,
      }
    ).toString();

    const decryptedNsec = CryptoJS.AES.decrypt(
      encrypted_nsec,
      encryptionKey
    ).toString(CryptoJS.enc.Utf8);

    res.status(200).json({
      success: true,
      nsec: decryptedNsec,
      pubkey,
    });
  } catch (error) {
    console.error("Email signin error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    await client.end();
  }
}
