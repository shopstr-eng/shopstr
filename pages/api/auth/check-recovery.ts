import { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { pubkey } = req.body;

  if (!pubkey) {
    return res.status(400).json({ error: "pubkey is required" });
  }

  const client = new Client({
    connectionString: process.env["DATABASE_URL"],
  });

  try {
    await client.connect();

    const result = await client.query(
      "SELECT email, auth_type, created_at FROM account_recovery WHERE pubkey = $1",
      [pubkey]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({ hasRecovery: false });
    }

    const { email, auth_type, created_at } = result.rows[0];
    res.status(200).json({
      hasRecovery: true,
      email,
      authType: auth_type,
      createdAt: created_at,
    });
  } catch (error) {
    console.error("Check recovery error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    await client.end();
  }
}
