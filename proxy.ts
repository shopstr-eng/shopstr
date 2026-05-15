import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { nip19 } from "nostr-tools";
import { lookupSlugByHost } from "@/utils/storefront/host-cache";

// Routes that should NOT be rewritten under /stall/<slug>/ on a custom
// domain — they live at the root of the seller's site (or fall through to
// shared platform infrastructure that just happens to serve the same code).
const CUSTOM_DOMAIN_PASSTHROUGH_PREFIXES = [
  "/_next/",
  "/static/",
  "/images/",
  "/favicon",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest",
  "/sw.js",
  "/service-worker.js",
];

const CUSTOM_DOMAIN_API_ALLOWLIST = [
  "/api/storefront/",
  "/api/db/fetch-products",
  "/api/db/fetch-profiles",
  "/api/db/fetch-reviews",
  "/api/db/fetch-communities",
  "/api/nostr/",
  "/api/lightning/",
  "/api/cashu/",
  "/api/stripe/",
  "/api/email/",
  "/api/og-preview",
  "/api/sitemap.xml",
];

// Canonical platform hosts that should NEVER be treated as a seller's
// custom domain. Uses exact host (and explicit subdomain) matches rather
// than substring tests so legitimate seller domains that happen to contain
// "replit" or "milk.market" as a substring (e.g. `myreplitfarm.com`) are
// still routed correctly.
const PLATFORM_HOST_SUFFIXES = [
  "milk.market", // milk.market + *.milk.market
  "replit.app", // *.replit.app
  "replit.dev", // *.replit.dev (preview)
  "repl.co",
];

const PLATFORM_HOST_EXACT = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

function hostStripPort(host: string): string {
  return host.split(":")[0]?.toLowerCase() ?? "";
}

function isCustomDomain(rawHost: string): boolean {
  const host = hostStripPort(rawHost);
  if (!host) return false;
  if (PLATFORM_HOST_EXACT.has(host)) return false;
  for (const suffix of PLATFORM_HOST_SUFFIXES) {
    if (host === suffix || host.endsWith("." + suffix)) return false;
  }
  return true;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hostname = (request.headers.get("host") || "").toLowerCase();

  if (pathname === "/.well-known/agent.json") {
    return NextResponse.rewrite(
      new URL("/api/.well-known/agent.json", request.url)
    );
  }

  if (hostname === "www.milk.market") {
    const url = new URL(request.url);
    url.hostname = "milk.market";
    return NextResponse.redirect(url, 301);
  }

  if (isCustomDomain(hostname)) {
    // Static assets and Next internals always pass through.
    if (
      CUSTOM_DOMAIN_PASSTHROUGH_PREFIXES.some((p) => pathname.startsWith(p))
    ) {
      return NextResponse.next();
    }

    // API routes: gate to the allow-list. Storefront browsing + checkout +
    // account flows on the custom domain still call back into milk.market's
    // shared APIs (Stripe, Lightning, email, etc.) so they need to pass.
    if (pathname.startsWith("/api/")) {
      const allowed = CUSTOM_DOMAIN_API_ALLOWLIST.some((p) =>
        pathname.startsWith(p)
      );
      if (!allowed) {
        return NextResponse.json(
          { error: "Not available on this domain" },
          { status: 403 }
        );
      }
      return NextResponse.next();
    }

    const origin = request.nextUrl.origin;
    const slug = await lookupSlugByHost(origin, hostname);

    if (!slug) {
      // Fallback: render the legacy custom-domain placeholder which does a
      // client-side lookup and surfaces a "domain not configured" message.
      return NextResponse.rewrite(
        new URL(
          `/stall/_custom-domain?domain=${encodeURIComponent(
            hostname
          )}&path=${encodeURIComponent(pathname)}`,
          request.url
        )
      );
    }

    const stallPrefix = `/stall/${slug}`;
    // Idempotent: if the path is already under /stall/<slug>, do nothing.
    if (pathname === stallPrefix || pathname.startsWith(`${stallPrefix}/`)) {
      return NextResponse.next();
    }

    // Root → stall homepage.
    if (pathname === "/" || pathname === "") {
      return NextResponse.rewrite(
        new URL(`${stallPrefix}${search}`, request.url)
      );
    }

    // Everything else: prefix with /stall/<slug> so the existing dynamic
    // routes ([...stallPath].tsx, /listing/[slug], /cart, /orders) handle SSR.
    return NextResponse.rewrite(
      new URL(`${stallPrefix}${pathname}${search}`, request.url)
    );
  }

  if (
    pathname.match(/^\/npub[a-zA-Z0-9]+$/) &&
    !pathname.startsWith("/marketplace/")
  ) {
    const url = new URL(`/marketplace${pathname}`, request.url);
    return NextResponse.redirect(url);
  }

  if (
    pathname.match(/^\/naddr[a-zA-Z0-9]+$/) &&
    !pathname.startsWith("/listing/")
  ) {
    const url = new URL(`/listing${pathname}`, request.url);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/naddr") && !pathname.startsWith("/communities/")) {
    try {
      const decoded = nip19.decode(pathname.substring(1));
      if (decoded.type === "naddr" && decoded.data.kind === 34550) {
        return NextResponse.redirect(
          new URL(`/communities${pathname}`, request.url)
        );
      }
    } catch {
      /* ignore */
    }
  }

  return NextResponse.next();
}
