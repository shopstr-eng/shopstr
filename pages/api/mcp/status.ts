import type { NextApiRequest, NextApiResponse } from "next";
import { getMetrics } from "@/utils/mcp/metrics";
import {
  fetchAllProductsFromDb,
  fetchAllProfilesFromDb,
  fetchCachedEvents,
} from "@/utils/db/db-service";

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  const startTime = Date.now();

  try {
    const metrics = getMetrics();

    const [products, profiles, reviews] = await Promise.all([
      fetchAllProductsFromDb(),
      fetchAllProfilesFromDb(),
      fetchCachedEvents(31555),
    ]);

    const shopProfiles = profiles.filter((p) => p.kind === 30019);

    const latestProduct = products.reduce(
      (max, p) => (Number(p.created_at) > max ? Number(p.created_at) : max),
      0
    );
    const latestProfile = profiles.reduce(
      (max, p) => (Number(p.created_at) > max ? Number(p.created_at) : max),
      0
    );
    const latestReview = reviews.reduce(
      (max, r) => (Number(r.created_at) > max ? Number(r.created_at) : max),
      0
    );

    const responseTimeMs = Date.now() - startTime;

    res.setHeader("X-Response-Time", `${responseTimeMs}ms`);
    res.setHeader("Cache-Control", "public, max-age=30");

    return res.status(200).json({
      ...metrics,
      data: {
        products: {
          count: products.length,
          lastUpdated: latestProduct
            ? new Date(latestProduct * 1000).toISOString()
            : null,
        },
        companies: {
          count: shopProfiles.length,
          lastUpdated: latestProfile
            ? new Date(latestProfile * 1000).toISOString()
            : null,
        },
        reviews: {
          count: reviews.length,
          lastUpdated: latestReview
            ? new Date(latestReview * 1000).toISOString()
            : null,
        },
      },
      version: "1.0.0",
      _meta: {
        responseTimeMs,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Failed to generate status:", error);
    return res.status(500).json({
      status: "degraded",
      error: "Failed to generate metrics",
      version: "1.0.0",
    });
  }
}
