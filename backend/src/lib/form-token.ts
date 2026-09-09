import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The HMAC-signed timestamp issued with a public form (PROJECT_SPEC.md §6.1,
 * §6.2; B5.2.2).
 *
 * It is a spam and **spending** control, not authentication. §6.2's time trap
 * needs to know when the form was rendered, and §6.1 needs something a bot
 * cannot skip before the workshop pays for a vehicle lookup: IP rate limiting
 * alone is defeated by rotating addresses in minutes, and the bill is real
 * money. A signed timestamp costs a legitimate visitor nothing — the page
 * fetches one when it renders — and forces an attacker to make a second
 * request per submission that we can see and count.
 *
 * The token is stateless on purpose. Storing issued tokens would make the
 * public form write to the database before anyone has typed anything, which is
 * a denial-of-service surface rather than a defence.
 *
 * Signed with `FORM_TOKEN_SECRET`, which is deliberately **not**
 * `SESSION_COOKIE_SECRET`: rotating it must not log the whole workshop out.
 */

/**
 * Bound into the signature so a token issued for one form is not valid for the
 * other. Without it the free booking-form token would also unlock the paid
 * vehicle lookup, which is the more expensive of the two (§6.1).
 */
export const FORM_TOKEN_PURPOSES = ['booking', 'vehicle-lookup'] as const;
export type FormTokenPurpose = (typeof FORM_TOKEN_PURPOSES)[number];

/** `<issuedAtMs>.<hmac>` — one field, so a form carries one hidden input. */
const TOKEN_PATTERN = /^(\d{1,15})\.([0-9a-f]{64})$/;

export type FormToken = {
  readonly token: string;
  readonly issuedAt: Date;
};

function sign(
  secret: string,
  purpose: FormTokenPurpose,
  issuedAt: number,
): string {
  return createHmac('sha256', secret)
    .update(`form:${purpose}:${String(issuedAt)}`)
    .digest('hex');
}

export function issueFormToken(
  secret: string,
  purpose: FormTokenPurpose,
  now: Date = new Date(),
): FormToken {
  const issuedAt = now.getTime();
  return {
    token: `${String(issuedAt)}.${sign(secret, purpose, issuedAt)}`,
    issuedAt: new Date(issuedAt),
  };
}

/**
 * Why a token was refused. Reported to the caller as one indistinguishable
 * message and to the log as this value: telling a bot which layer caught it is
 * how it learns to get past the next one, but an operator asking "is the form
 * broken or is this spam?" needs the difference.
 */
export type FormTokenVerdict =
  'VALID' | 'MALFORMED' | 'BAD_SIGNATURE' | 'TOO_FAST' | 'EXPIRED';

export type VerifyFormTokenOptions = {
  readonly minAgeSeconds: number;
  readonly maxAgeSeconds: number;
  readonly now?: Date;
};

export function verifyFormToken(
  secret: string,
  purpose: FormTokenPurpose,
  token: string,
  options: VerifyFormTokenOptions,
): FormTokenVerdict {
  const match = TOKEN_PATTERN.exec(token);
  if (match === null) {
    return 'MALFORMED';
  }

  const issuedAt = Number(match[1]);
  const signature = match[2];
  if (!Number.isSafeInteger(issuedAt) || signature === undefined) {
    return 'MALFORMED';
  }

  const expected = Buffer.from(sign(secret, purpose, issuedAt), 'hex');
  const supplied = Buffer.from(signature, 'hex');
  // The pattern fixes both to 32 bytes, so the lengths always match; the guard
  // is here because `timingSafeEqual` throws rather than returning false, and
  // this function must not throw on caller-supplied input.
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return 'BAD_SIGNATURE';
  }

  const ageSeconds = ((options.now ?? new Date()).getTime() - issuedAt) / 1000;

  // A clock that has moved backwards, or a token minted in the future, is
  // "too fast" rather than valid — the trap is that a human cannot fill in a
  // form instantly, and a negative age is not evidence that they did.
  if (ageSeconds < options.minAgeSeconds) {
    return 'TOO_FAST';
  }
  if (ageSeconds > options.maxAgeSeconds) {
    return 'EXPIRED';
  }

  return 'VALID';
}
