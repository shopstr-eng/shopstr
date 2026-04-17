import { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "beehiiv-subscribe", RATE_LIMIT)) return;

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const BEEHIIV_API_KEY = process.env.BEEHIIV_API_KEY;
  const BEEHIIV_PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID;

  if (!BEEHIIV_API_KEY || !BEEHIIV_PUBLICATION_ID) {
    console.error("Beehiiv API credentials not configured");
    return res.status(500).json({ error: "Email service not configured" });
  }

  try {
    const response = await fetch(
      `https://api.beehiiv.com/v2/publications/${BEEHIIV_PUBLICATION_ID}/subscriptions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${BEEHIIV_API_KEY}`,
        },
        body: JSON.stringify({
          email: email,
          reactivate_existing: false,
          send_welcome_email: true,
          utm_source: "milk_market",
          utm_medium: "landing_page",
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Beehiiv API error:", data);

      // Handle already subscribed case
      if (response.status === 400 && data.errors?.email) {
        return res.status(409).json({ error: "Email already subscribed" });
      }

      return res.status(response.status).json({
        error: data.errors || "Failed to subscribe to newsletter",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Successfully subscribed to newsletter",
      data: data,
    });
  } catch (error) {
    console.error("Beehiiv subscription error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
