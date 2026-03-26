import { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";
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

  const { pubkey, email, nsec, authType } = req.body;

  if (!pubkey || !email || !nsec) {
    return res
      .status(400)
      .json({ error: "pubkey, email, and nsec are required" });
  }

  const validAuthType = authType || "nsec";
  if (!["email", "oauth", "nsec"].includes(validAuthType)) {
    return res.status(400).json({ error: "Invalid auth type" });
  }

  const client = new Client({
    connectionString: process.env["DATABASE_URL"],
  });

  try {
    await client.connect();

    const recoveryKey = generateRecoveryKey();
    const recoveryKeyHash = hashRecoveryKey(recoveryKey);
    const recoveryEncryptedNsec = encryptNsecWithRecoveryKey(nsec, recoveryKey);

    await client.query(
      `INSERT INTO account_recovery (pubkey, email, recovery_key_hash, recovery_encrypted_nsec, auth_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (pubkey) DO UPDATE SET
         email = $2,
         recovery_key_hash = $3,
         recovery_encrypted_nsec = $4,
         auth_type = $5,
         updated_at = CURRENT_TIMESTAMP`,
      [pubkey, email, recoveryKeyHash, recoveryEncryptedNsec, validAuthType]
    );

    res.status(200).json({
      success: true,
      recoveryKey,
    });
  } catch (error) {
    console.error("Setup recovery error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    await client.end();
  }
}
