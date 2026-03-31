import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const baseUrl = "https://milk.market";
  const currentDate = new Date().toISOString().split("T")[0];

  const pages = [
    { url: "/", changefreq: "daily", priority: "1.0" },
    { url: "/marketplace", changefreq: "daily", priority: "0.9" },
    { url: "/producer-guide", changefreq: "weekly", priority: "0.8" },
    { url: "/about", changefreq: "monthly", priority: "0.7" },
    { url: "/contact", changefreq: "monthly", priority: "0.7" },
    { url: "/faq", changefreq: "weekly", priority: "0.6" },
    { url: "/terms", changefreq: "monthly", priority: "0.3" },
    { url: "/privacy", changefreq: "monthly", priority: "0.3" },
    { url: "/cart", changefreq: "daily", priority: "0.5" },
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) => `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.status(200).send(sitemap);
}
