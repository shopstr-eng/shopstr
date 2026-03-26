import { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  const client = new Client({
    connectionString: process.env["DATABASE_URL"],
  });

  try {
    await client.connect();

    const result = await client.query(
      "SELECT email, expires_at, used FROM account_recovery_tokens WHERE token = $1",
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid recovery token" });
    }

    const { email, expires_at, used } = result.rows[0];

    if (used) {
      return res
        .status(400)
        .json({ error: "This recovery token has already been used" });
    }

    if (new Date(expires_at) < new Date()) {
      return res.status(400).json({ error: "This recovery token has expired" });
    }

    res.status(200).json({ success: true, email });
  } catch (error) {
    console.error("Verify recovery token error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    await client.end();
  }
}
