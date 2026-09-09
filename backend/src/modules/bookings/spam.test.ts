import { describe, expect, it } from 'vitest';
import { assessBookingRequest } from './spam.js';

/**
 * B5.2.5 — the content heuristic (PROJECT_SPEC.md §6.2).
 *
 * The tests that matter most here are the negative ones: a false positive
 * sends a real customer's booking to the spam folder, and nobody finds out.
 */

describe('genuine Swedish bookings are not flagged', () => {
  it.each([
    ['a plain description', 'Bilen låter konstigt fram till vänster.'],
    ['Swedish characters', 'Behöver däckbyte och en översyn på bromsarna.'],
    ['a part number', 'Reservdel 06E-115-562-C behövs, kan ni beställa?'],
    ['a decimal and a full stop', 'Kör ca 1.5 mil per dag. Tack på förhand.'],
    ['an abbreviation with a dot', 'Servicebok finns. Mvh. Karin'],
    ['no message at all', undefined],
  ])('%s', (_name, message) => {
    const assessment = assessBookingRequest({
      customerName: 'Åsa Öberg-Ekström',
      message,
    });
    expect(assessment).toEqual({ isSpam: false, reasons: [] });
  });

  it.each([
    ['Swedish', 'Åsa Öberg-Ekström'],
    ['Greek', 'Γιώργος Παπαδόπουλος'],
    ['French', 'Françoise Lefèvre'],
    ['Polish', 'Łukasz Wiśniewski'],
    ['Turkish', 'Şeyma Çelik'],
  ])('accepts a %s name', (_name, customerName) => {
    // §6.2 asks for Cyrillic and CJK, not "non-Latin". Sweden has large Greek,
    // Polish and Turkish communities, and a customer whose name is turned into
    // spam never finds out and never comes back.
    expect(assessBookingRequest({ customerName }).isSpam).toBe(false);
  });
});

describe('link spam is flagged, not rejected', () => {
  it.each([
    ['a scheme', 'Check out https://cheap-pills.example for a deal'],
    ['a bare www host', 'visit www.casino-bonus.net now'],
    ['a BBCode tag', 'nice site [url=http://spam.example]click[/url]'],
    ['a naked domain', 'best offers at bestdeals.xyz today'],
  ])('%s', (_name, message) => {
    const assessment = assessBookingRequest({
      customerName: 'Anna Svensson',
      message,
    });
    expect(assessment.isSpam).toBe(true);
    expect(assessment.reasons).toContain('link-in-message');
  });
});

describe('a name in another script is flagged', () => {
  it.each([
    ['Cyrillic', 'Владимир Петров'],
    ['Chinese', '张伟'],
    ['Japanese kana', 'たなか'],
    ['Korean', '김민준'],
  ])('%s', (_name, customerName) => {
    const assessment = assessBookingRequest({ customerName });
    expect(assessment.isSpam).toBe(true);
    expect(assessment.reasons).toContain('non-latin-name');
  });

  it('only looks at the name, so a message may quote another script', () => {
    // The rule §6.2 states is "Cyrillic/CJK in a Swedish *name* field". A
    // customer pasting a label off an imported part is not a spammer.
    const assessment = assessBookingRequest({
      customerName: 'Erik Lund',
      message: 'Etiketten på delen säger 東京 — passar den?',
    });
    expect(assessment.isSpam).toBe(false);
  });
});

describe('reasons accumulate', () => {
  it('reports both rules when both match', () => {
    const assessment = assessBookingRequest({
      customerName: 'Владимир',
      message: 'http://spam.example',
    });
    expect(assessment.reasons).toEqual(['link-in-message', 'non-latin-name']);
  });
});
