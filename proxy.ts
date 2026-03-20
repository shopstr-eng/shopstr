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

  if (hostname.includes("shopstr.store")) {
    if (hostname === "www.shopstr.store") {
      const url = new URL(request.url);
      url.hostname = "shopstr.store";
      return NextResponse.redirect(url, 301);
    }

    if (hostname !== "shopstr.store" && hostname.endsWith(".shopstr.store")) {
      const subdomain = hostname.replace(".shopstr.store", "");
      if (subdomain !== "www" && subdomain !== "api") {
        const url = new URL(
          `/shop/${subdomain}${pathname === "/" ? "" : pathname}`,
          request.url
        );
        url.hostname = "shopstr.store";
        return NextResponse.rewrite(url);
      }
    }
  }

  if (
    hostname &&
    !hostname.includes("shopstr.store") &&
    !hostname.includes("localhost") &&
    !hostname.includes("replit") &&
    !hostname.includes("127.0.0.1") &&
    !hostname.includes(".repl.co") &&
    !hostname.includes(".replit.dev") &&
    !hostname.includes(".replit.app")
  ) {
    if (!pathname.startsWith("/api/") && !pathname.startsWith("/_next/")) {
      return NextResponse.rewrite(
        new URL(
          `/shop/_custom-domain?domain=${encodeURIComponent(
            hostname
          )}&path=${encodeURIComponent(pathname)}`,
          request.url
        )
      );
    }
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
    } catch (e) {
      /* ignore */
    }
  }

  const response = NextResponse.next();
  response.headers.delete("X-Powered-By");

  return response;
}
