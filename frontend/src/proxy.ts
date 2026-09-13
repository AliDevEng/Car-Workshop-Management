import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from 'shared';

const LOGIN_PATH = '/admin/logga-in';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!pathname.startsWith('/admin') || pathname.startsWith(LOGIN_PATH)) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
  if (hasSession) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  url.search = '';
  url.searchParams.set('returnTo', `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/admin/:path*'],
};
