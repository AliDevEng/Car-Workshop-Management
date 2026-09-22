/**
 * The accounts the load test signs in as (B13.4.2).
 *
 * **Why twenty accounts rather than twenty sessions on one.** §5.1 limits login
 * to five attempts per fifteen minutes on **two** independent keys, the email
 * and the IP, and a successful login only resets them afterwards — so twenty
 * simultaneous logins to one account are indistinguishable from a brute-force
 * burst and the sixth is refused. That is the limiter working, not a bug in
 * it: the first version of this harness shared one account and was correctly
 * turned away.
 *
 * Sharing a single session instead would have hidden a second distortion. Every
 * request slides that session's expiry (H1.9), so twenty users on one session
 * row means twenty writers contending on one row — a load shape that does not
 * exist in production. Twenty rows is what twenty people at twenty keyboards
 * actually look like.
 *
 * These accounts own no work orders and no bookings. The workshop has two
 * mechanics (§1.1) and the dataset keeps its work assigned to them, so the
 * calendar and the `assignedUserId` filter still describe a two-person shop.
 * These exist only to authenticate.
 */

export const LOAD_TEST_USER_COUNT = 20;

/**
 * Hard-coded, and safe for the same reason `prisma/seed.ts`'s credentials
 * are: the only script that creates these accounts refuses to run against any
 * database whose name does not end in `_perf` (`config.ts`).
 */
export const LOAD_TEST_PASSWORD = 'prestandatest-b13-2026';

export function loadTestEmail(index: number): string {
  return `perf-vu-${String(index + 1).padStart(2, '0')}@verkstaden.se`;
}

export function loadTestName(index: number): string {
  return `Prestandatest ${String(index + 1).padStart(2, '0')}`;
}

/**
 * Half admins, half mechanics — the ratio `prisma/seed.ts` gives the real
 * workshop (§1.1's two owners, §5.3's two roles).
 *
 * The first version made every account a `MECHANIC` and the load run reported
 * **178 failures out of 7 571**: every draw of `GET /api/service-rules`,
 * `/api/audit-log` or `/api/users` answered `403`, because those three are
 * `ADMIN`-only. That was the authorisation layer working exactly as §5.3
 * specifies and the harness asking the wrong questions — a load test whose
 * "errors" are correct refusals measures nothing and hides the failures that
 * would matter.
 */
export function loadTestRole(index: number): 'ADMIN' | 'MECHANIC' {
  return index % 2 === 0 ? 'ADMIN' : 'MECHANIC';
}
