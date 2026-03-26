import { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";
import CryptoJS from "crypto-js";
import {
  hashRecoveryKey,
  decryptNsecWithRecoveryKey,
  encryptNsecWithRecoveryKey,
} from "@/utils/auth/recovery";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token, recoveryKey, newPassword } = req.body;

  if (!token || !recoveryKey || !newPassword) {
    return res
      .status(400)
      .json({ error: "Token, recovery key, and new password are required" });
  }

  const client = new Client({
    connectionString: process.env["DATABASE_URL"],
  });

  try {
    await client.connect();

    const tokenResult = await client.query(
      "SELECT email, expires_at, used FROM account_recovery_tokens WHERE token = $1",
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: "Invalid recovery token" });
    }

    const { email, expires_at, used } = tokenResult.rows[0];

    if (used) {
      return res
        .status(400)
        .json({ error: "This recovery token has already been used" });
    }

    if (new Date(expires_at) < new Date()) {
      return res.status(400).json({ error: "This recovery token has expired" });
    }

    const recoveryRecord = await client.query(
      "SELECT pubkey, recovery_key_hash, recovery_encrypted_nsec, auth_type FROM account_recovery WHERE email = $1",
      [email]
    );

    if (recoveryRecord.rows.length === 0) {
      return res
        .status(400)
        .json({ error: "No recovery information found for this email" });
    }

    const { pubkey, recovery_key_hash, recovery_encrypted_nsec, auth_type } =
      recoveryRecord.rows[0];

    const providedHash = hashRecoveryKey(recoveryKey);
    if (providedHash !== recovery_key_hash) {
      return res.status(400).json({ error: "Invalid recovery key" });
    }

    let nsec: string;
    try {
      nsec = decryptNsecWithRecoveryKey(recovery_encrypted_nsec, recoveryKey);
    } catch {
      return res
        .status(400)
        .json({
          error: "Failed to decrypt account data. Invalid recovery key.",
        });
    }

    if (auth_type === "email") {
      const newPasswordHash = CryptoJS.SHA256(email + newPassword).toString();
      const newEncryptionKey = CryptoJS.PBKDF2(
        email + newPassword,
        "milk-market-salt",
        { keySize: 256 / 32, iterations: 1000 }
      ).toString();
      const newEncryptedNsec = CryptoJS.AES.encrypt(
        nsec,
        newEncryptionKey
      ).toString();

      await client.query(
        "UPDATE email_auth SET password_hash = $1, encrypted_nsec = $2 WHERE email = $3",
        [newPasswordHash, newEncryptedNsec, email]
      );
    }

    const newRecoveryEncryptedNsec = encryptNsecWithRecoveryKey(
      nsec,
      recoveryKey
    );
    await client.query(
      "UPDATE account_recovery SET recovery_encrypted_nsec = $1, updated_at = CURRENT_TIMESTAMP WHERE pubkey = $2",
      [newRecoveryEncryptedNsec, pubkey]
    );

    await client.query(
      "UPDATE account_recovery_tokens SET used = TRUE WHERE token = $1",
      [token]
    );

    res.status(200).json({
      success: true,
      nsec,
      pubkey,
      authType: auth_type,
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    await client.end();
  }
}
