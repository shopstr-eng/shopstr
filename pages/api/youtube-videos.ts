import { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "youtube-videos", RATE_LIMIT)) return;

  const apiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.YOUTUBE_CHANNEL_ID;

  if (!apiKey || !channelId) {
    return res.status(500).json({
      error: "YouTube API not configured",
      details: {
        hasApiKey: !!apiKey,
        hasChannelId: !!channelId,
      },
    });
  }

  try {
    // Fetch latest videos from the channel
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${channelId}&part=snippet,id&order=date&maxResults=21&type=video`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("YouTube API error:", response.status, errorText);
      throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();

    // Check if we got any items
    if (!data.items || data.items.length === 0) {
      return res.status(200).json({ videos: [] });
    }

    // Transform the data into a simpler format
    const videos = data.items.map((item: any) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail: item.snippet.thumbnails.medium.url,
      publishedAt: item.snippet.publishedAt,
    }));

    res.status(200).json({ videos });
  } catch (error) {
    console.error("Error fetching YouTube videos:", error);
    res.status(500).json({
      error: "Failed to fetch videos",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
