import { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import CryptoJS from "crypto-js";
import {
  generateRecoveryKey,
  hashRecoveryKey,
  encryptNsecWithRecoveryKey,
} from "@/utils/auth/recovery";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 5, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "auth-email-signup", RATE_LIMIT)) return;

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const client = new Client({
    connectionString: process.env["DATABASE_URL"],
  });

  try {
    await client.connect();

    const existingUser = await client.query(
      "SELECT id FROM email_auth WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);
    const nsec = nip19.nsecEncode(secretKey);

    const passwordHash = CryptoJS.SHA256(email + password).toString();

    const encryptionKey = CryptoJS.PBKDF2(
      email + password,
      "milk-market-salt",
      {
        keySize: 256 / 32,
        iterations: 1000,
      }
    ).toString();

    const encryptedNsec = CryptoJS.AES.encrypt(nsec, encryptionKey).toString();

    await client.query(
      "INSERT INTO email_auth (email, password_hash, pubkey, encrypted_nsec) VALUES ($1, $2, $3, $4)",
      [email, passwordHash, pubkey, encryptedNsec]
    );

    const recoveryKey = generateRecoveryKey();
    const recoveryKeyHash = hashRecoveryKey(recoveryKey);
    const recoveryEncryptedNsec = encryptNsecWithRecoveryKey(nsec, recoveryKey);

    await client.query(
      `INSERT INTO account_recovery (pubkey, email, recovery_key_hash, recovery_encrypted_nsec, auth_type)
       VALUES ($1, $2, $3, $4, 'email')
       ON CONFLICT (pubkey) DO UPDATE SET
         email = $2,
         recovery_key_hash = $3,
         recovery_encrypted_nsec = $4,
         updated_at = CURRENT_TIMESTAMP`,
      [pubkey, email, recoveryKeyHash, recoveryEncryptedNsec]
    );

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private"
    );
    res.setHeader("Pragma", "no-cache");
    res.status(201).json({
      success: true,
      nsec,
      pubkey,
      recoveryKey,
    });
  } catch (error) {
    console.error("Email signup error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    await client.end();
  }
}
