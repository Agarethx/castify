import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest): NextResponse {
  const host = request.headers.get('host') ?? '';

  // Extract subdomain: e.g. "mychannel.castify.tv" → "mychannel"
  const parts = host.split('.');
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

  let tenant: string | null = null;

  if (!isLocalhost && parts.length >= 3) {
    tenant = parts[0] ?? null;
  }

  const requestHeaders = new Headers(request.headers);
  if (tenant) {
    requestHeaders.set('x-tenant', tenant);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
