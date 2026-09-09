import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import * as barrel from '../src/index.js';
import * as articleSchemas from '../src/schemas/article.js';
import * as auditSchemas from '../src/schemas/audit.js';
import * as authSchemas from '../src/schemas/auth.js';
import * as bookingSchemas from '../src/schemas/booking.js';
import * as commonSchemas from '../src/schemas/common.js';
import * as customerSchemas from '../src/schemas/customer.js';
import * as dashboardSchemas from '../src/schemas/dashboard.js';
import * as documentSchemas from '../src/schemas/document.js';
import * as healthSchemas from '../src/schemas/health.js';
import * as odometerSchemas from '../src/schemas/odometer.js';
import * as partnerLinkSchemas from '../src/schemas/partner-link.js';
import * as primitives from '../src/schemas/primitives.js';
import * as quoteSchemas from '../src/schemas/quote.js';
import * as searchSchemas from '../src/schemas/search.js';
import * as serviceProtocolSchemas from '../src/schemas/service-protocol.js';
import * as serviceRuleSchemas from '../src/schemas/service-rule.js';
import * as settingsSchemas from '../src/schemas/settings.js';
import * as stockSchemas from '../src/schemas/stock.js';
import * as userSchemas from '../src/schemas/user.js';
import * as vehicleDataSchemas from '../src/schemas/vehicle-data.js';
import * as vehicleSchemas from '../src/schemas/vehicle.js';
import * as workOrderSchemas from '../src/schemas/work-order.js';

/**
 * B1.5 — the shared API contracts.
 *
 * `src/schemas/**` is excluded from the coverage threshold because a Zod
 * schema is a declaration and asserting that `z.string()` is a string tests
 * Zod, not us. What is worth asserting is everything a declaration *cannot*
 * guarantee on its own: that the barrel really re-exports every module, that
 * the refinements which encode a business rule actually fire, and that the
 * design invariant the whole file set rests on holds.
 */

const domainModules: ReadonlyArray<readonly [string, Record<string, unknown>]> =
  [
    ['primitives', primitives],
    ['common', commonSchemas],
    ['health', healthSchemas],
    ['user', userSchemas],
    ['auth', authSchemas],
    ['customer', customerSchemas],
    ['vehicle', vehicleSchemas],
    ['odometer', odometerSchemas],
    ['article', articleSchemas],
    ['stock', stockSchemas],
    ['booking', bookingSchemas],
    ['work-order', workOrderSchemas],
    ['document', documentSchemas],
    ['quote', quoteSchemas],
    ['service-rule', serviceRuleSchemas],
    ['service-protocol', serviceProtocolSchemas],
    ['partner-link', partnerLinkSchemas],
    ['settings', settingsSchemas],
    ['vehicle-data', vehicleDataSchemas],
    ['audit', auditSchemas],
    ['search', searchSchemas],
    ['dashboard', dashboardSchemas],
  ];

describe('the barrel re-exports every domain area (B1.5.1)', () => {
  const exported = barrel as Record<string, unknown>;

  it.each(domainModules)('%s', (_name, module) => {
    const names = Object.keys(module);
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      // A star-export name collision is not a compile error: ESM resolves the
      // ambiguous binding to nothing and the import silently disappears. This
      // is the only cheap way to notice.
      expect(exported[name]).toBe(module[name]);
    }
  });
});

describe('money and VAT primitives', () => {
  it('rejects a price expressed in kronor', () => {
    expect(primitives.nonNegativeOreSchema.safeParse(349.5).success).toBe(
      false,
    );
    expect(primitives.nonNegativeOreSchema.safeParse(34_950).success).toBe(
      true,
    );
  });

  it('refuses a negative price but allows a negative signed amount', () => {
    expect(primitives.nonNegativeOreSchema.safeParse(-1).success).toBe(false);
    expect(primitives.oreSchema.safeParse(-1).success).toBe(true);
  });

  it('caps a VAT rate at 100 %', () => {
    expect(primitives.vatRateBpsSchema.safeParse(2500).success).toBe(true);
    expect(primitives.vatRateBpsSchema.safeParse(10_001).success).toBe(false);
  });
});

describe('quantity and odometer primitives', () => {
  it('takes a quantity as a string, never as a number', () => {
    expect(primitives.quantityStringSchema.safeParse('4.250').success).toBe(
      true,
    );
    expect(primitives.quantityStringSchema.safeParse(4.25).success).toBe(false);
  });

  it('rejects a fourth decimal place', () => {
    expect(primitives.quantityStringSchema.safeParse('4.2501').success).toBe(
      false,
    );
  });

  it('rejects an odometer reading outside the §3.5 range', () => {
    expect(primitives.odometerKmSchema.safeParse(120_000).success).toBe(true);
    expect(primitives.odometerKmSchema.safeParse(0).success).toBe(false);
    expect(primitives.odometerKmSchema.safeParse(2_000_001).success).toBe(
      false,
    );
  });
});

describe('registration number primitives', () => {
  it('accepts a plate as typed, spaces and lower case included', () => {
    expect(primitives.registrationNumberInputSchema.parse(' abc 12d ')).toBe(
      'abc 12d',
    );
  });

  it('accepts only the canonical form where the unique index lives', () => {
    const schema = primitives.normalisedRegistrationNumberSchema;
    expect(schema.safeParse('ABC12D').success).toBe(true);
    expect(schema.safeParse('abc12d').success).toBe(false);
    expect(schema.safeParse('ABC 12D').success).toBe(false);
    expect(schema.safeParse('ABC-12D').success).toBe(false);
  });

  it('rejects arbitrary text that merely looks normalised', () => {
    const schema = primitives.normalisedRegistrationNumberSchema;
    expect(schema.safeParse('ABC_12D').success).toBe(false);
    expect(schema.safeParse('AB!').success).toBe(false);
  });
});

describe('the calendar window (§6.2)', () => {
  const schema = bookingSchemas.calendarQuerySchema;

  it('accepts a range within the cap', () => {
    expect(
      schema.safeParse({
        from: '2026-03-01T00:00:00Z',
        to: '2026-03-08T00:00:00Z',
      }).success,
    ).toBe(true);
  });

  it('rejects a range longer than the cap or running backwards', () => {
    expect(
      schema.safeParse({
        from: '2026-01-01T00:00:00Z',
        to: '2026-12-31T00:00:00Z',
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        from: '2026-03-08T00:00:00Z',
        to: '2026-03-01T00:00:00Z',
      }).success,
    ).toBe(false);
  });
});

describe('confirming a booking request (§6.2, B5.3.3)', () => {
  const schema = bookingSchemas.confirmBookingRequestInputSchema;
  const slot = {
    startsAt: '2026-03-29T07:00:00Z',
    endsAt: '2026-03-29T09:00:00Z',
  };

  it('accepts a slot that moves forward', () => {
    expect(schema.safeParse(slot).success).toBe(true);
  });

  it('rejects an empty or reversed slot', () => {
    // An empty range overlaps nothing, so the exclusion constraint in B5.4
    // would happily accept two of them in the same slot for one mechanic.
    expect(schema.safeParse({ ...slot, endsAt: slot.startsAt }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({ startsAt: slot.endsAt, endsAt: slot.startsAt })
        .success,
    ).toBe(false);
  });
});

describe('document numbering (§4.4)', () => {
  it('leaves a draft work order and a draft quote without a number', () => {
    // §4.4 assigns a number on finalisation, not at draft creation, so that
    // an abandoned draft leaves no gap in the series.
    expect(
      workOrderSchemas.workOrderSchema.shape.number.safeParse(null).success,
    ).toBe(true);
    expect(quoteSchemas.quoteSchema.shape.number.safeParse(null).success).toBe(
      true,
    );
  });

  it('accepts every prefix it declares, and nothing else', () => {
    // The prefixes and the number format are two separate declarations of the
    // same §4.4 rule; a prefix added to one and not the other produces
    // documents whose own numbers fail validation.
    const prefixes = [
      ...Object.values(documentSchemas.DOCUMENT_NUMBER_PREFIXES),
      documentSchemas.WORK_ORDER_NUMBER_PREFIX,
    ];

    for (const prefix of prefixes) {
      expect(
        primitives.documentNumberSchema.safeParse(`${prefix}-2026-0001`)
          .success,
      ).toBe(true);
    }
  });

  it('rejects a number in the wrong format', () => {
    expect(
      primitives.documentNumberSchema.safeParse('AO-2026-0001').success,
    ).toBe(true);
    expect(primitives.documentNumberSchema.safeParse('AO-26-1').success).toBe(
      false,
    );
    expect(
      primitives.documentNumberSchema.safeParse('XX-2026-0001').success,
    ).toBe(false);
  });
});

describe('query-string coercion', () => {
  it('reads the string "false" as false', () => {
    // `z.coerce.boolean()` would return true here, which is a filter that
    // silently means the opposite of what the URL says.
    expect(primitives.booleanQuerySchema.parse('false')).toBe(false);
    expect(primitives.booleanQuerySchema.parse('true')).toBe(true);
  });
});

describe('the public booking form (§6.2)', () => {
  const validSubmission = {
    website: '',
    formToken: 'signed-token',
    customerName: 'Anna Andersson',
    phone: '070-123 45 67',
  };

  it('accepts a submission with the honeypot left empty', () => {
    const result =
      bookingSchemas.publicBookingRequestInputSchema.safeParse(validSubmission);
    expect(result.success).toBe(true);
  });

  it('rejects a submission where a bot filled the honeypot', () => {
    const result = bookingSchemas.publicBookingRequestInputSchema.safeParse({
      ...validSubmission,
      website: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });

  it('requires the form token, which is a spending control (§6.1)', () => {
    const result = bookingSchemas.publicBookingRequestInputSchema.safeParse({
      website: validSubmission.website,
      customerName: validSubmission.customerName,
      phone: validSubmission.phone,
    });
    expect(result.success).toBe(false);
  });

  it('keeps the registration number optional', () => {
    const result =
      bookingSchemas.publicBookingRequestInputSchema.safeParse(validSubmission);
    expect(result.success && result.data.regNr).toBeUndefined();
  });
});

describe('service rules (§7.3)', () => {
  const baseRule = {
    make: 'Volvo',
    serviceType: 'TIMING_BELT',
    sourceNote: 'Volvo servicehäfte 2019',
  };

  it('rejects a rule with no interval at all', () => {
    // A rule with neither interval can never come due, and would sit in the
    // table looking correct.
    expect(
      serviceRuleSchemas.createServiceRuleInputSchema.safeParse(baseRule)
        .success,
    ).toBe(false);
  });

  it('accepts a rule with either interval', () => {
    expect(
      serviceRuleSchemas.createServiceRuleInputSchema.safeParse({
        ...baseRule,
        intervalKm: 120_000,
      }).success,
    ).toBe(true);
    expect(
      serviceRuleSchemas.createServiceRuleInputSchema.safeParse({
        ...baseRule,
        intervalMonths: 120,
      }).success,
    ).toBe(true);
  });

  it('rejects a model-year range that ends before it starts', () => {
    expect(
      serviceRuleSchemas.createServiceRuleInputSchema.safeParse({
        ...baseRule,
        intervalKm: 120_000,
        modelYearFrom: 2015,
        modelYearTo: 2010,
      }).success,
    ).toBe(false);
  });

  it('requires the source note that makes the advice defensible', () => {
    expect(
      serviceRuleSchemas.createServiceRuleInputSchema.safeParse({
        make: baseRule.make,
        serviceType: baseRule.serviceType,
        intervalKm: 120_000,
      }).success,
    ).toBe(false);
  });
});

describe('public vehicle lookup suggestions (§6.1)', () => {
  it('keeps the public projection useful without leaking internal fields', () => {
    const result = vehicleDataSchemas.vehicleLookupResponseSchema.parse({
      registrationNumber: 'ABC123',
      data: null,
      source: 'PROVIDER',
      fetchedAt: '2026-09-09T08:00:00.000Z',
      ownerName: 'Must not leave the API boundary',
      suggestedServices: [
        {
          serviceType: 'BRAKE_FLUID',
          severity: 'DUE_SOON',
          explanation: 'Bromsvätskan närmar sig bytesintervallet.',
          sourceNote: 'Volvo serviceschema 2022',
          vehicleId: 'internal-id',
        },
      ],
    });

    expect(result.unavailableReason).toBeNull();
    expect(result.suggestedServices).toHaveLength(1);
    expect(result).not.toHaveProperty('ownerName');
    expect(result.suggestedServices[0]).not.toHaveProperty('vehicleId');
  });

  it('distinguishes a spent public budget from provider downtime', () => {
    const result = vehicleDataSchemas.vehicleLookupResponseSchema.parse({
      registrationNumber: 'ABC123',
      data: null,
      source: 'UNAVAILABLE',
      unavailableReason: 'PUBLIC_LIMIT_REACHED',
      fetchedAt: null,
    });

    expect(result.unavailableReason).toBe('PUBLIC_LIMIT_REACHED');
    expect(result.suggestedServices).toEqual([]);
  });
});

describe('partner links (§7.2)', () => {
  it('requires https and at least one placeholder', () => {
    const schema = partnerLinkSchemas.partnerLinkUrlTemplateSchema;
    expect(
      schema.safeParse('https://partner.se/sok?regnr={regnr}').success,
    ).toBe(true);
    expect(schema.safeParse('https://partner.se/sok?q={artnr}').success).toBe(
      true,
    );
    // Renders a button that always opens the same page regardless of the car
    // in front of the mechanic — looks like it works, and does not.
    expect(schema.safeParse('https://partner.se/sok').success).toBe(false);
    expect(schema.safeParse('http://partner.se/{regnr}').success).toBe(false);
  });
});

describe('opening hours (§3.6)', () => {
  const schema = settingsSchemas.openingHoursDaySchema;

  it('accepts a normal day and a closed day', () => {
    expect(
      schema.safeParse({
        weekday: 'MONDAY',
        opensAt: '08:00',
        closesAt: '17:00',
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ weekday: 'SUNDAY', opensAt: null, closesAt: null })
        .success,
    ).toBe(true);
  });

  it('rejects a half-specified day and a day that closes before it opens', () => {
    expect(
      schema.safeParse({ weekday: 'MONDAY', opensAt: '08:00', closesAt: null })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({
        weekday: 'MONDAY',
        opensAt: '17:00',
        closesAt: '08:00',
      }).success,
    ).toBe(false);
  });

  it('requires all seven days, so none can go missing', () => {
    expect(settingsSchemas.openingHoursSchema.safeParse([]).success).toBe(
      false,
    );
  });
});

describe('customer detail (B3.1.3)', () => {
  it('composes a customer with the vehicles they own', () => {
    // Declared in vehicle.ts rather than customer.ts to keep the two schema
    // modules from importing each other at load time; this asserts the
    // composite is still reachable and shaped right.
    const parsed = vehicleSchemas.customerDetailSchema.safeParse({
      id: 'c1',
      type: 'PRIVATE',
      name: 'Test Kund',
      orgNumber: null,
      email: null,
      phone: '070-000 00 00',
      phoneNormalised: '+46700000000',
      address: null,
      notes: null,
      anonymisedAt: null,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      vehicles: [
        {
          id: 'v1',
          registrationNumber: 'ABC12D',
          registrationNumberDisplay: 'ABC 12D',
          make: 'Volvo',
          model: 'V70',
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});

describe('global search (§6.3)', () => {
  it('discriminates on type', () => {
    const vehicleHit = searchSchemas.searchResultSchema.parse({
      type: 'VEHICLE',
      id: 'v1',
      registrationNumber: 'ABC12D',
      registrationNumberDisplay: 'ABC 12D',
      make: 'Volvo',
      model: 'V70',
      customerName: null,
    });
    expect(vehicleHit.type).toBe('VEHICLE');
  });

  it('covers exactly the declared result types', () => {
    // The union spells its discriminators as literals, so a category added to
    // SEARCH_RESULT_TYPES without a member here would render a heading with
    // nothing that can ever appear under it.
    const discriminators = searchSchemas.searchResultSchema.options.map(
      (member) => member.shape.type.value,
    );
    expect(discriminators).toEqual([...searchSchemas.SEARCH_RESULT_TYPES]);
  });

  it('rejects a result carrying the wrong shape for its type', () => {
    expect(
      searchSchemas.searchResultSchema.safeParse({
        type: 'ARTICLE',
        id: 'a1',
        registrationNumber: 'ABC12D',
      }).success,
    ).toBe(false);
  });
});

describe('enum values match their Zod schemas', () => {
  const pairs: ReadonlyArray<
    readonly [string, readonly string[], z.ZodEnum<Record<string, string>>]
  > = [
    ['user role', userSchemas.USER_ROLES, userSchemas.userRoleSchema],
    [
      'customer type',
      customerSchemas.CUSTOMER_TYPES,
      customerSchemas.customerTypeSchema,
    ],
    [
      'odometer source',
      odometerSchemas.ODOMETER_SOURCES,
      odometerSchemas.odometerSourceSchema,
    ],
    [
      'stock movement type',
      stockSchemas.STOCK_MOVEMENT_TYPES,
      stockSchemas.stockMovementTypeSchema,
    ],
    [
      'booking request status',
      bookingSchemas.BOOKING_REQUEST_STATUSES,
      bookingSchemas.bookingRequestStatusSchema,
    ],
    [
      'booking status',
      bookingSchemas.BOOKING_STATUSES,
      bookingSchemas.bookingStatusSchema,
    ],
    [
      'work order line type',
      workOrderSchemas.WORK_ORDER_LINE_TYPES,
      workOrderSchemas.workOrderLineTypeSchema,
    ],
    [
      'quote status',
      quoteSchemas.QUOTE_STATUSES,
      quoteSchemas.quoteStatusSchema,
    ],
    [
      'document type',
      documentSchemas.DOCUMENT_TYPES,
      documentSchemas.documentTypeSchema,
    ],
    [
      'service type',
      serviceRuleSchemas.SERVICE_TYPES,
      serviceRuleSchemas.serviceTypeSchema,
    ],
    [
      'partner link placeholder',
      partnerLinkSchemas.PARTNER_LINK_PLACEHOLDER_TYPES,
      partnerLinkSchemas.partnerLinkPlaceholderTypeSchema,
    ],
    ['weekday', settingsSchemas.WEEKDAYS, settingsSchemas.weekdaySchema],
  ];

  it.each(pairs)('%s', (_name, values, schema) => {
    expect(schema.options).toEqual([...values]);
  });

  it('reuses the shared unit and work-order status lists rather than copying them', () => {
    // A second copy of either list is how the API and the state machine end up
    // disagreeing about what a status is.
    expect(articleSchemas.unitSchema.options).toEqual([...barrel.UNITS]);
    expect(workOrderSchemas.workOrderStatusSchema.options).toEqual([
      ...barrel.WORK_ORDER_STATUSES,
    ]);
  });

  it('keeps the exclusion-constraint exemption list in sync with the status enum', () => {
    // The partial `WHERE` clause in B5.4's migration has to name exactly
    // these; a status added here and forgotten there blocks a slot nobody
    // occupies.
    for (const status of bookingSchemas.BOOKING_STATUSES_NOT_OCCUPYING_A_SLOT) {
      expect(bookingSchemas.BOOKING_STATUSES).toContain(status);
    }
  });
});
