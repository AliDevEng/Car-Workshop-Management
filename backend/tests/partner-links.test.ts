import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  partnerLinkListResponseSchema,
  partnerLinkResponseSchema,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type Agent } from './helpers/auth.js';
import { jsonBody } from './helpers/http.js';
import { get, patch, post } from './helpers/work-orders.js';

/**
 * Partner deep links end to end (B10.6).
 */

let harness: TestApp;
let admin: Agent;
let mechanic: Agent;

beforeAll(async () => {
  harness = await createTestApp();
  admin = await loginAs(harness, { role: 'ADMIN' });
  mechanic = await loginAs(harness, { role: 'MECHANIC' });
}, 180_000);

afterAll(async () => {
  await harness.close();
});

describe('B10.6.2 — creating and listing links', () => {
  it('creates a link and appends it after the existing ones', async () => {
    const first = partnerLinkResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/partner-links', {
          name: 'Mekonomen',
          urlTemplate: 'https://www.mekonomen.se/sok?regnr={regnr}',
          placeholderType: 'REGNR',
        }).expect(201),
      ),
    );
    expect(first.link.isActive).toBe(true);

    const second = partnerLinkResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/partner-links', {
          name: 'Bildelsbasen',
          urlTemplate: 'https://www.bildelsbasen.se/artikel/{artnr}',
          placeholderType: 'ARTICLE_NUMBER',
        }).expect(201),
      ),
    );

    expect(second.link.sortOrder).toBeGreaterThan(first.link.sortOrder);
  });

  it('a mechanic can list links but not create one', async () => {
    const list = partnerLinkListResponseSchema.parse(
      jsonBody(await get(harness, mechanic, '/api/partner-links').expect(200)),
    );
    expect(list.data.length).toBeGreaterThan(0);

    await post(harness, mechanic, '/api/partner-links', {
      name: 'Not allowed',
      urlTemplate: 'https://example.com/{regnr}',
      placeholderType: 'REGNR',
    }).expect(403);
  });

  it('404s for a link that does not exist', async () => {
    await get(
      harness,
      admin,
      '/api/partner-links/00000000-0000-0000-0000-000000000000',
    ).expect(404);
  });

  it('rejects a template without https or a placeholder', async () => {
    await post(harness, admin, '/api/partner-links', {
      name: 'Bad',
      urlTemplate: 'http://example.com/{regnr}',
      placeholderType: 'REGNR',
    }).expect(400);

    await post(harness, admin, '/api/partner-links', {
      name: 'Bad',
      urlTemplate: 'https://example.com/sok',
      placeholderType: 'REGNR',
    }).expect(400);
  });
});

describe('B10.6.2 — editing and disabling a link', () => {
  it('updates the template and can disable it', async () => {
    const created = partnerLinkResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/partner-links', {
          name: 'Skruvat',
          urlTemplate: 'https://www.skruvat.se/sok?regnr={regnr}',
          placeholderType: 'REGNR',
        }).expect(201),
      ),
    );

    const updated = partnerLinkResponseSchema.parse(
      jsonBody(
        await patch(harness, admin, `/api/partner-links/${created.link.id}`, {
          isActive: false,
        }).expect(200),
      ),
    );

    expect(updated.link.isActive).toBe(false);
    expect(updated.link.urlTemplate).toBe(created.link.urlTemplate);
  });

  it('the isActive filter excludes a disabled link', async () => {
    const created = partnerLinkResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/partner-links', {
          name: 'Temporary',
          urlTemplate: 'https://example.com/sok?regnr={regnr}',
          placeholderType: 'REGNR',
        }).expect(201),
      ),
    );
    await patch(harness, admin, `/api/partner-links/${created.link.id}`, {
      isActive: false,
    }).expect(200);

    const activeOnly = partnerLinkListResponseSchema.parse(
      jsonBody(
        await get(harness, admin, '/api/partner-links?isActive=true').expect(
          200,
        ),
      ),
    );
    expect(activeOnly.data.some((link) => link.id === created.link.id)).toBe(
      false,
    );
  });
});

describe('B10.6.2 — reordering', () => {
  it('reorders every link to match the given sequence', async () => {
    const list = partnerLinkListResponseSchema.parse(
      jsonBody(await get(harness, admin, '/api/partner-links').expect(200)),
    );
    const ids = list.data.map((link) => link.id);
    const reversed = [...ids].reverse();

    const reordered = partnerLinkListResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/partner-links/reorder', {
          orderedIds: reversed,
        }).expect(200),
      ),
    );

    expect(reordered.data.map((link) => link.id)).toEqual(reversed);
    expect(reordered.data.map((link) => link.sortOrder)).toEqual(
      reversed.map((_, index) => index),
    );
  });

  it('rejects a reorder that drops or invents a link', async () => {
    const list = partnerLinkListResponseSchema.parse(
      jsonBody(await get(harness, admin, '/api/partner-links').expect(200)),
    );
    const ids = list.data.map((link) => link.id);

    await post(harness, admin, '/api/partner-links/reorder', {
      orderedIds: ids.slice(1),
    }).expect(400);

    await post(harness, admin, '/api/partner-links/reorder', {
      orderedIds: [...ids, '00000000-0000-0000-0000-000000000000'],
    }).expect(400);
  });
});
