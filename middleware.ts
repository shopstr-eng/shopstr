
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Handle npub redirects
  if (pathname.match(/^\/npub[a-zA-Z0-9]+$/)) {
    return NextResponse.redirect(new URL(`/marketplace${pathname}`, request.url))
  }

  // Handle naddr redirects
  if (pathname.match(/^\/naddr[a-zA-Z0-9]+$/)) {
    return NextResponse.redirect(new URL(`/listing${pathname}`, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|service-worker.js).*)',
  ],
}
