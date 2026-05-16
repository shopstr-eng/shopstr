# SEO & GEO

- **On-page**: Descriptive alt text + explicit `width`/`height` on key pages. Global JSON-LD (`Organization`, `WebSite`, `LocalBusiness`, `FAQPage`) via `components/structured-data.tsx`. `public/robots.txt` allows all crawlers but disallows admin/API. Dynamic sitemap at `pages/api/sitemap.xml.ts`.
- **GEO**: Inline USDA citations with specific numbers; attributed dairy expert quote on landing + about; E-E-A-T signals (founder schema, team credentials, social proof).

# Dev Mode Optimizations

- **Turbopack** for dev server.
- **PWA disabled** in dev via `next.config.mjs`. **Flow scheduler skipped in dev** to reduce memory pressure.
