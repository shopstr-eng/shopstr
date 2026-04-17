import { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "utm-tracking", RATE_LIMIT)) return;

  const {
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
    referrer,
    user_agent,
  } = req.body;

  const client = new Client({
    connectionString: process.env["DATABASE_URL"],
  });

  try {
    await client.connect();

    // Get IP address from request
    const ip_address =
      req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;

    // Insert tracking data
    const result = await client.query(
      `INSERT INTO utm_tracking 
       (utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, user_agent, ip_address) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        referrer,
        user_agent,
        ip_address,
      ]
    );

    res.status(200).json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error("Database error in UTM tracking:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await client.end();
  }
}
