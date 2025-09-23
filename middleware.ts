import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { nip19 } from "nostr-tools";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  return NextResponse.next();
}
