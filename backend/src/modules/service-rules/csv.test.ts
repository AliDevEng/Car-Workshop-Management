import { describe, expect, it } from 'vitest';
import { parseServiceRulesCsv } from './csv.js';

/**
 * B9.7.3/B9.7.4 — the service-rule CSV importer.
 *
 * Pure parsing, tested without the HTTP layer — the same split
 * `low-stock-csv.test.ts` draws for the export side.
 */

const HEADER =
  'Märke;Modell;Motorkod;Årsmodell från;Årsmodell till;Tjänst;Intervall km;Intervall månader;Anteckning;Källa';

describe('parseServiceRulesCsv', () => {
  it('parses a minimal valid row', () => {
    const rows = parseServiceRulesCsv(
      [HEADER, 'Volvo;;;;;SERVICE_A;15000;;;Källa'].join('\r\n'),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      line: 2,
      status: 'VALID',
      rule: { make: 'Volvo', serviceType: 'SERVICE_A', intervalKm: 15_000 },
    });
  });

  it('accepts the Swedish label as well as the raw code for the service type', () => {
    const rows = parseServiceRulesCsv(
      [HEADER, 'Volvo;;;;;Liten service;15000;;;Källa'].join('\r\n'),
    );
    expect(rows[0]?.status).toBe('VALID');
    expect(rows[0]?.rule?.serviceType).toBe('SERVICE_A');
  });

  it('is case-insensitive on the service type', () => {
    const rows = parseServiceRulesCsv(
      [HEADER, 'Volvo;;;;;service_a;15000;;;Källa'].join('\r\n'),
    );
    expect(rows[0]?.status).toBe('VALID');
  });

  it('reports an unknown service type without throwing', () => {
    const rows = parseServiceRulesCsv(
      [HEADER, 'Volvo;;;;;NOT_A_TYPE;15000;;;Källa'].join('\r\n'),
    );
    expect(rows[0]?.status).toBe('INVALID');
    expect(rows[0]?.errors.some((e) => e.includes('Okänd tjänst'))).toBe(true);
  });

  it('reports a non-integer interval without throwing', () => {
    const rows = parseServiceRulesCsv(
      [HEADER, 'Volvo;;;;;SERVICE_A;fifteen-thousand;;;Källa'].join('\r\n'),
    );
    expect(rows[0]?.status).toBe('INVALID');
    expect(rows[0]?.errors.some((e) => e.includes('heltal'))).toBe(true);
  });

  it('reports a rule with neither interval, via the shared schema refinement', () => {
    const rows = parseServiceRulesCsv(
      [HEADER, 'Volvo;;;;;SERVICE_A;;;;Källa'].join('\r\n'),
    );
    expect(rows[0]?.status).toBe('INVALID');
    expect(rows[0]?.errors.length).toBeGreaterThan(0);
  });

  it('reports a missing make, via the shared schema', () => {
    const rows = parseServiceRulesCsv(
      [HEADER, ';;;;;SERVICE_A;15000;;;Källa'].join('\r\n'),
    );
    expect(rows[0]?.status).toBe('INVALID');
  });

  it('does not let one invalid row hide a later valid one', () => {
    const rows = parseServiceRulesCsv(
      [
        HEADER,
        'Volvo;;;;;NOT_A_TYPE;15000;;;Källa',
        'Toyota;;;;;SERVICE_A;15000;;;Källa',
      ].join('\r\n'),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.status).toBe('INVALID');
    expect(rows[1]?.status).toBe('VALID');
    expect(rows[1]?.line).toBe(3);
  });

  it('parses optional fields, including a quoted note containing the separator', () => {
    const rows = parseServiceRulesCsv(
      [
        HEADER,
        'Volvo;V70;B5254T;2005;2010;SERVICE_A;15000;12;"Byt var 15 000 km; eller 12 mån";Källa',
      ].join('\r\n'),
    );
    expect(rows[0]?.rule).toMatchObject({
      make: 'Volvo',
      model: 'V70',
      engineCode: 'B5254T',
      modelYearFrom: 2005,
      modelYearTo: 2010,
      note: 'Byt var 15 000 km; eller 12 mån',
    });
  });

  it('treats a blank optional cell as absent, not as an empty string', () => {
    const rows = parseServiceRulesCsv(
      [HEADER, 'Volvo;;;;;SERVICE_A;15000;;;Källa'].join('\r\n'),
    );
    expect(rows[0]?.rule?.model).toBeUndefined();
    expect(rows[0]?.rule?.note).toBeUndefined();
  });

  it('strips a leading BOM and accepts bare LF line endings', () => {
    const rows = parseServiceRulesCsv(
      `${'\uFEFF'}${HEADER}\nVolvo;;;;;SERVICE_A;15000;;;Källa`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('VALID');
  });

  it('rejects a file whose header does not match', () => {
    expect(() =>
      parseServiceRulesCsv(
        'Fel;Header;Rad\r\nVolvo;;;;;SERVICE_A;15000;;;Källa',
      ),
    ).toThrow(/rubrikraden/);
  });

  it('rejects an empty file', () => {
    expect(() => parseServiceRulesCsv('')).toThrow(/rubrikraden/);
  });

  it('rejects a header with the right cells in the wrong order', () => {
    const scrambled = HEADER.split(';').reverse().join(';');
    expect(() =>
      parseServiceRulesCsv(`${scrambled}\r\nVolvo;;;;;SERVICE_A;15000;;;Källa`),
    ).toThrow();
  });
});
