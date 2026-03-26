import { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import CryptoJS from "crypto-js";
import {
  generateRecoveryKey,
  hashRecoveryKey,
  encryptNsecWithRecoveryKey,
} from "@/utils/auth/recovery";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS account_recovery (
        id SERIAL PRIMARY KEY,
        pubkey VARCHAR(64) NOT NULL,
        email VARCHAR(255) NOT NULL,
        recovery_key_hash VARCHAR(255) NOT NULL,
        recovery_encrypted_nsec TEXT NOT NULL,
        auth_type VARCHAR(20) NOT NULL CHECK (auth_type IN ('email', 'oauth', 'nsec')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(pubkey)
      )
    `);

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
