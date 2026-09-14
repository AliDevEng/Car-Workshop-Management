import { describe, expect, it } from 'vitest';
import { buildPartnerUrl } from '../src/partner-link.js';

describe('buildPartnerUrl (§7.2, B10.6.4)', () => {
  it('substitutes a registration number that needs encoding', () => {
    const url = buildPartnerUrl(
      {
        urlTemplate: 'https://partner.se/sok?regnr={regnr}',
        placeholderType: 'REGNR',
      },
      'abc 12d',
    );
    // Normalised first (uppercased, unspaced), then percent-encoded — a plain
    // ABC12D would not need it, but the substitution must not assume that.
    expect(url).toBe('https://partner.se/sok?regnr=ABC12D');
  });

  it('substitutes both regnr placeholders when a template carries both', () => {
    const url = buildPartnerUrl(
      {
        urlTemplate: 'https://partner.se/{regnr}?display={regnr_spaced}',
        placeholderType: 'REGNR',
      },
      'ABC12D',
    );
    expect(url).toBe('https://partner.se/ABC12D?display=ABC%2012D');
  });

  it('substitutes an article number', () => {
    const url = buildPartnerUrl(
      {
        urlTemplate: 'https://partner.se/artikel?nr={artnr}',
        placeholderType: 'ARTICLE_NUMBER',
      },
      'OIL 5W-30',
    );
    expect(url).toBe('https://partner.se/artikel?nr=OIL%205W-30');
  });

  it('substitutes free text', () => {
    const url = buildPartnerUrl(
      {
        urlTemplate: 'https://partner.se/sok?q={q}',
        placeholderType: 'FREE_TEXT',
      },
      'bromsskiva & belägg',
    );
    expect(url).toBe('https://partner.se/sok?q=bromsskiva%20%26%20bel%C3%A4gg');
  });

  it('leaves an unknown placeholder untouched rather than guessing at it', () => {
    const url = buildPartnerUrl(
      {
        urlTemplate: 'https://partner.se/sok?regnr={regnr}&foo={foo}',
        placeholderType: 'REGNR',
      },
      'ABC12D',
    );
    expect(url).toBe('https://partner.se/sok?regnr=ABC12D&foo={foo}');
  });
});
