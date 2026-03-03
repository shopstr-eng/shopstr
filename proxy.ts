import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { nip19 } from "nostr-tools";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") || "";

  if (pathname === "/.well-known/agent.json") {
    return NextResponse.rewrite(
      new URL("/api/.well-known/agent.json", request.url)
    );
  }

  // Handle subdomain redirects to base domain
  if (hostname.includes("milk.market")) {
    // Redirect www.milk.market to milk.market
    if (hostname === "www.milk.market") {
      const url = new URL(request.url);
      url.hostname = "milk.market";
      return NextResponse.redirect(url, 301);
    }

    // Redirect any other subdomain (*.milk.market) to milk.market
    // But exclude the base domain itself
    if (hostname !== "milk.market" && hostname.endsWith(".milk.market")) {
      const url = new URL(request.url);
      url.hostname = "milk.market";
      return NextResponse.redirect(url, 301);
    }
  }

  // Handle npub redirects, but ignore if already in marketplace page route
  if (
    pathname.match(/^\/npub[a-zA-Z0-9]+$/) &&
    !pathname.startsWith("/marketplace/")
  ) {
    const url = new URL(`/marketplace${pathname}`, request.url);
    return NextResponse.redirect(url);
  }

  // Handle naddr redirects, but ignore if already in listing page route
  if (
    pathname.match(/^\/naddr[a-zA-Z0-9]+$/) &&
    !pathname.startsWith("/listing/")
  ) {
    const url = new URL(`/listing${pathname}`, request.url);
    return NextResponse.redirect(url);
  }

  // Handle community naddr redirects
  if (pathname.startsWith("/naddr") && !pathname.startsWith("/communities/")) {
    try {
      const decoded = nip19.decode(pathname.substring(1));
      if (decoded.type === "naddr" && decoded.data.kind === 34550) {
        return NextResponse.redirect(
          new URL(`/communities${pathname}`, request.url)
        );
      }
    } catch (e) {
      /* ignore */
    }
  }

  // Continue with the request and remove X-Powered-By header
  const response = NextResponse.next();
  response.headers.delete("X-Powered-By");

  return response;
}
