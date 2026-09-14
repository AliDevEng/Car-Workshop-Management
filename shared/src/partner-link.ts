import { formatRegNrSpaced, normaliseRegNr } from './regnr.js';
import { PARTNER_LINK_PLACEHOLDERS } from './schemas/partner-link.js';
import type { PartnerLinkPlaceholderType } from './schemas/partner-link.js';

/**
 * Building the outbound URL for a partner deep link (PROJECT_SPEC.md §7.2,
 * B10.6.4).
 *
 * `urlTemplate` is validated at write time to contain exactly one *kind* of
 * known placeholder for its `placeholderType` — this is the read-side half,
 * substituting the real value in. Every substitution goes through
 * `encodeURIComponent`, matching §7.2's literal instruction, so a value
 * containing `&` or a space cannot break the query string it is dropped into.
 */

/**
 * `{regnr_spaced}` is replaced first. It has no `{regnr}` substring inside it
 * (`_spaced}` follows, not `}`), so the order would not matter for
 * correctness either way — but replacing the longer, more specific token
 * first is the safer habit to have when a future placeholder is added.
 */
export function buildPartnerUrl(
  link: {
    readonly urlTemplate: string;
    readonly placeholderType: PartnerLinkPlaceholderType;
  },
  value: string,
): string {
  switch (link.placeholderType) {
    case 'REGNR': {
      const normalised = normaliseRegNr(value);
      return link.urlTemplate
        .replaceAll(
          PARTNER_LINK_PLACEHOLDERS.REGNR_SPACED,
          encodeURIComponent(formatRegNrSpaced(normalised)),
        )
        .replaceAll(
          PARTNER_LINK_PLACEHOLDERS.REGNR,
          encodeURIComponent(normalised),
        );
    }
    case 'ARTICLE_NUMBER':
      return link.urlTemplate.replaceAll(
        PARTNER_LINK_PLACEHOLDERS.ARTICLE_NUMBER,
        encodeURIComponent(value),
      );
    case 'FREE_TEXT':
      return link.urlTemplate.replaceAll(
        PARTNER_LINK_PLACEHOLDERS.FREE_TEXT,
        encodeURIComponent(value),
      );
  }
}
