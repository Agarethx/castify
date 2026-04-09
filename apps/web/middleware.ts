import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/', '/_next/', '/favicon.ico'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function extractTenant(request: NextRequest): string | null {
  const host = request.headers.get('host') ?? '';
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

  if (!isLocalhost) {
    const parts = host.split('.');
    // e.g. demo.castify.tv → ["demo", "castify", "tv"]
    if (parts.length >= 3) return parts[0] ?? null;
  }

  // Localhost: use ?tenant= query param first, then cookie
  const fromQuery = request.nextUrl.searchParams.get('tenant');
  if (fromQuery) return fromQuery;

  const fromCookie = request.cookies.get('castify_tenant')?.value ?? null;
  return fromCookie;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const tenant = extractTenant(request);

  const requestHeaders = new Headers(request.headers);
  if (tenant) {
    requestHeaders.set('x-tenant-slug', tenant);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Persist tenant in cookie for client-side access
  if (tenant && !request.cookies.get('castify_tenant')) {
    response.cookies.set('castify_tenant', tenant, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
