import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle npub redirects, but ignore if already in marketplace page route
  if (
    pathname.match(/^\/npub[a-zA-Z0-9]+$/) &&
    !pathname.startsWith("/marketplace/")
  ) {
    return NextResponse.redirect(
      new URL(`/marketplace${pathname}`, request.url),
    );
  }

  // Handle naddr redirects, but ignore if already in listing page route
  if (
    pathname.match(/^\/naddr[a-zA-Z0-9]+$/) &&
    !pathname.startsWith("/listing/")
  ) {
    return NextResponse.redirect(new URL(`/listing${pathname}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|service-worker.js).*)",
  ],
};
