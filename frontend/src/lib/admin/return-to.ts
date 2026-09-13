const LOGIN_PATH = '/admin/logga-in';

/**
 * Login return targets are user input once they come from the query string.
 * Keep them local to the admin app and avoid bouncing straight back to the
 * login form after a successful sign-in.
 */
export function sanitiseAdminReturnTo(value: string | null): string {
  if (value === null || value === '') {
    return '/admin';
  }

  let parsed: URL;
  try {
    parsed = new URL(value, 'http://verkstad.local');
  } catch {
    return '/admin';
  }

  if (parsed.origin !== 'http://verkstad.local') {
    return '/admin';
  }

  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (!path.startsWith('/admin') || path.startsWith(LOGIN_PATH)) {
    return '/admin';
  }

  return path;
}

export function adminLoginUrl(returnTo: string): string {
  const safeReturnTo = sanitiseAdminReturnTo(returnTo);
  return `${LOGIN_PATH}?returnTo=${encodeURIComponent(safeReturnTo)}`;
}
