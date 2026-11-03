import { NextResponse, type NextRequest } from 'next/server';
import { classifyTenantHostname } from '@careflow/support-engine';

/**
 * Hostname-based multi-business portal routing middleware.
 *
 * - Requests to central platform hosts (e.g., careflow.com, localhost, preview URLs)
 *   pass straight through to the central CareFlow platform website (`/`).
 * - Requests to verified business subdomains (e.g., ultimatetechapp.careflow.com
 *   or ultimatetechapp.localhost:3000) rewrite cleanly to `/portal/[businessSlug]`.
 *
 * Security: Organization resolution relies strictly on the HTTP Host header,
 * never on client-supplied body/query organization IDs.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip Next.js internals, API routes, static files, and explicit /portal or /admin paths
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/portal') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/onboarding') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const forwardedHost = request.headers.get('x-forwarded-host');
  const hostHeader = forwardedHost || request.headers.get('host');
  const tenant = classifyTenantHostname(hostHeader);

  if (tenant.kind === 'business-portal' && tenant.businessSlug) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/portal/${tenant.businessSlug}${pathname === '/' ? '' : pathname}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  if (tenant.kind === 'unknown-domain' && tenant.hostname) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/portal/${tenant.hostname}${pathname === '/' ? '' : pathname}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

