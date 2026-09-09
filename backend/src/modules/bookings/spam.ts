/**
 * The content heuristic, the fourth anti-spam layer (PROJECT_SPEC.md §6.2,
 * B5.2.5).
 *
 * **It flags; it never rejects.** The first three layers — honeypot, time trap
 * and rate limit — catch a machine, and a machine is not a customer. This one
 * looks at what a human wrote, and being wrong about that costs the workshop a
 * job. So a match sets `status = SPAM` and the request lands in the inbox for
 * review rather than disappearing, and the visitor is told the same thing
 * either way: telling a bot why it was caught is how it learns.
 *
 * Deliberately two rules, both from §6.2, both cheap and both explainable to
 * the owners. A cleverer classifier here would be untestable and would fail in
 * the expensive direction.
 *
 * Pure, so it is unit-tested without a database or a request.
 */

export type SpamAssessment = {
  readonly isSpam: boolean;
  /**
   * English, because this is an operator-facing diagnostic in the log rather
   * than user-facing copy (CLAUDE.md: Swedish for users, English for code).
   */
  readonly reasons: readonly string[];
};

/**
 * A link, in the forms link spam actually arrives in: a scheme, a bare `www.`,
 * a BBCode tag, or a naked domain with a recognisable TLD. A Swedish customer
 * describing a noise from the front axle has no reason to include any of them.
 */
const LINK_PATTERNS: readonly RegExp[] = [
  /\b(?:https?|ftp):\/\//i,
  /\bwww\.[a-z0-9-]+\.[a-z]{2,}/i,
  /\[url[=\]]/i,
  /\b[a-z0-9-]+\.(?:com|net|org|ru|cn|xyz|top|info|biz|shop|online|link)\b/i,
];

/**
 * Exactly the two script families §6.2 names — Cyrillic and CJK, the latter
 * including kana and Hangul — and nothing else.
 *
 * **Greek is deliberately absent.** "Non-Latin" would be a wider and much
 * worse rule than the one the specification asks for: Sweden has a large Greek
 * community, and sending Γιώργος to the spam folder is precisely the false
 * positive that costs the workshop a customer nobody ever finds out about.
 *
 * Written as `\u` escapes rather than literal characters on purpose. The
 * ranges are unreadable either way, and a source file re-saved in another
 * encoding would silently change which names get flagged.
 *
 * Scoped to the **name** field only: a Swedish workshop's customer name is
 * written in the Latin alphabet, while a message might legitimately quote a
 * label off an imported part. Å, Ä and Ö are Latin and unaffected.
 */
const NON_LATIN_SCRIPT = new RegExp(
  [
    '[\\u0400-\\u04FF\\u0500-\\u052F', // Cyrillic and its supplement
    '\\u3040-\\u30FF', // Hiragana and katakana
    '\\u3400-\\u4DBF\\u4E00-\\u9FFF', // CJK ideographs, extension A and main
    '\\uAC00-\\uD7AF]', // Hangul syllables
  ].join(''),
  'u',
);

export type SpamCandidate = {
  readonly customerName: string;
  readonly message?: string | undefined;
};

export function assessBookingRequest(input: SpamCandidate): SpamAssessment {
  const reasons: string[] = [];

  const message = input.message ?? '';
  if (
    message !== '' &&
    LINK_PATTERNS.some((pattern) => pattern.test(message))
  ) {
    reasons.push('link-in-message');
  }

  if (NON_LATIN_SCRIPT.test(input.customerName)) {
    reasons.push('non-latin-name');
  }

  return { isSpam: reasons.length > 0, reasons };
}
