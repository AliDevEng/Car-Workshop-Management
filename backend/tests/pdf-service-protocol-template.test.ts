import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderPdf } from '../src/pdf/renderer.js';
import { ServiceProtocolDocument } from '../src/pdf/templates/service-protocol.js';
import { extractPdfTextNormalised } from './helpers/pdf-text.js';
import { goldenServiceProtocolPayload } from './helpers/service-protocols.js';

/**
 * The service protocol template (B8.3, B8.4.4, mirroring `pdf-quote-template.test.ts`).
 *
 * No database and no HTTP: the template renders from a payload and nothing
 * else, which is what makes the document reproducible from `payloadJson`
 * three years later (§4.2) — B7's font and determinism findings (B0.10.1,
 * B0.10.2) already cover the renderer itself, so this file only tests what is
 * specific to this template.
 */

const payload = goldenServiceProtocolPayload();

let bytes: Buffer;
let text: string;

beforeAll(async () => {
  bytes = await renderPdf(ServiceProtocolDocument(payload));
  text = extractPdfTextNormalised(bytes);
}, 60_000);

describe('B8.3.1 — the document carries everything §6.7 requires', () => {
  it('names the workshop, the customer and the vehicle', () => {
    expect(text).toContain('Mome Bilservice');
    expect(text).toContain('556000-0000');
    expect(text).toContain('070-123 45 67');
    expect(text).toContain('ABC 12D');
    expect(text).toContain('Volvo V70 (2018)');
    expect(text).toContain('YV1SW6114230000');
  });

  it('renders every Swedish letter, including in bold text', () => {
    for (const character of ['Å', 'Ä', 'Ö', 'å', 'ä', 'ö']) {
      expect(text).toContain(character);
    }
    // The customer name is bold (§8.3's load-bearing check, restated here
    // because a subset built for one weight does not cover the other).
    expect(text).toContain('Åsa Öberg-Ängström');
  });

  it('renders an uppercased heading through textTransform', () => {
    expect(text).toContain('CHECKLISTA');
  });

  it('names the work order and the mechanic', () => {
    expect(text).toContain('AO-2026-0007');
    expect(text).toContain('Årlig service och bromsvätskebyte');
    expect(text).toContain('Björn Ångström');
  });

  it('shows the odometer reading in mil, not km (§3.5)', () => {
    // 120 000 km → 12 000,0 mil. A bare "120000" reaching the page would be
    // exactly the km/mil mix-up CLAUDE.md's trap table names.
    expect(text).toContain('12 000,0 mil');
    expect(text).not.toContain('120 000 km');
  });

  it('prints every line, with an article number where there is one', () => {
    expect(text).toContain('Service, 2 timmar');
    expect(text).toContain('Motorolja 5W-30 ÅÄÖ åäö');
    expect(text).toContain('OIL-5W30-ÅÄÖ');
    // The labour line has no article — the placeholder, not a blank cell.
    expect(text).toContain('—');
  });

  it('prints the checklist with all three Swedish result labels', () => {
    expect(text).toContain('Bromsar');
    expect(text).toContain('Utan anmärkning');
    expect(text).toContain('Däck och mönsterdjup');
    expect(text).toContain('Anmärkning');
    expect(text).toContain('Mönsterdjup 3 mm fram, byt inför vintern.');
    expect(text).toContain('AC-anläggning');
    expect(text).toContain('Ej tillämpligt');
  });

  it('prints the free-text notes', () => {
    expect(text).toContain(
      'Kunden vill bli kontaktad innan nästa bromsvätskebyte.',
    );
  });

  it('shows the next service in both km and date', () => {
    expect(text).toContain('14 000,0 mil');
    expect(text).toContain('2027-09-10');
  });

  it('includes a signature area naming the mechanic', () => {
    expect(text).toContain('Mekanikerns signatur');
    expect(text).toContain('Björn Ångström');
  });

  it('numbers its pages', () => {
    expect(text).toContain('Sida 1 av 1');
  });
});

describe('omitting optional sections', () => {
  it('omits the notes section entirely when there are none', () => {
    return renderPdf(
      ServiceProtocolDocument(goldenServiceProtocolPayload({ notes: null })),
    ).then((rendered) => {
      expect(extractPdfTextNormalised(rendered)).not.toContain('Anteckningar');
    });
  });

  it('omits the next-service section when nothing is due', () => {
    return renderPdf(
      ServiceProtocolDocument(
        goldenServiceProtocolPayload({
          nextServiceDueKm: null,
          nextServiceDueDate: null,
        }),
      ),
    ).then((rendered) => {
      expect(extractPdfTextNormalised(rendered)).not.toContain('Nästa service');
    });
  });
});

describe('B0.10.1 — pinned dates and byte-identical regeneration', () => {
  it('pins the creation and modification dates from the payload', () => {
    const raw = bytes.toString('latin1');
    expect(raw).toContain('D:20260910080000Z');
    expect(raw).toContain('(Verkstadssystem)');
  });

  it('renders the same payload to the same bytes', async () => {
    const again = await renderPdf(
      ServiceProtocolDocument(goldenServiceProtocolPayload()),
    );
    const hash = (value: Buffer): string =>
      createHash('sha256').update(value).digest('hex');

    expect(hash(again)).toBe(hash(bytes));
  }, 60_000);

  it('renders different bytes when the payload differs', () => {
    return renderPdf(
      ServiceProtocolDocument(
        goldenServiceProtocolPayload({ number: 'SP-2026-0002' }),
      ),
    ).then((other) => {
      expect(other.equals(bytes)).toBe(false);
    });
  }, 60_000);
});
