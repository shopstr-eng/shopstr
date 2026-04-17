import { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "utm-analytics", RATE_LIMIT)) return;

  const client = new Client({
    connectionString: process.env["DATABASE_URL"],
  });

  try {
    await client.connect();

    // Get overall stats
    const totalVisits = await client.query(
      "SELECT COUNT(*) as count FROM utm_tracking"
    );

    // Get stats by source
    const bySource = await client.query(`
      SELECT utm_source, COUNT(*) as count 
      FROM utm_tracking 
      WHERE utm_source IS NOT NULL
      GROUP BY utm_source 
      ORDER BY count DESC
    `);

    // Get stats by campaign
    const byCampaign = await client.query(`
      SELECT utm_campaign, COUNT(*) as count 
      FROM utm_tracking 
      WHERE utm_campaign IS NOT NULL
      GROUP BY utm_campaign 
      ORDER BY count DESC
    `);

    // Get stats by term (neighborhood)
    const byTerm = await client.query(`
      SELECT utm_term, COUNT(*) as count 
      FROM utm_tracking 
      WHERE utm_term IS NOT NULL
      GROUP BY utm_term 
      ORDER BY count DESC
    `);

    // Get recent visits
    const recentVisits = await client.query(`
      SELECT utm_source, utm_medium, utm_campaign, utm_term, utm_content, visited_at
      FROM utm_tracking 
      ORDER BY visited_at DESC 
      LIMIT 100
    `);

    // Get daily stats for the last 30 days
    const dailyStats = await client.query(`
      SELECT 
        DATE(visited_at) as date,
        COUNT(*) as count
      FROM utm_tracking
      WHERE visited_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(visited_at)
      ORDER BY date DESC
    `);

    res.status(200).json({
      totalVisits: parseInt(totalVisits.rows[0].count),
      bySource: bySource.rows,
      byCampaign: byCampaign.rows,
      byTerm: byTerm.rows,
      recentVisits: recentVisits.rows,
      dailyStats: dailyStats.rows,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    await client.end();
  }
}
