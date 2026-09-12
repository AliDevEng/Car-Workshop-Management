import type { WorkshopDetails } from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { toIsoDateOrNull } from '../../lib/dto-dates.js';
import { toDecimalString } from '../../lib/dto-decimal.js';
import {
  SERVICE_PROTOCOL_PAYLOAD_VERSION,
  serviceProtocolPayloadSchema,
  type ServiceProtocolPayload,
} from '../../pdf/payload.js';
import { toChecklist, type ServiceProtocolRecord } from './repository.js';

/**
 * Assembling what a service protocol PDF is rendered from (PROJECT_SPEC.md
 * §4.2, §6.7, §8.3; B8.3, B8.4.4).
 *
 * The same separation as `quotes/payload.ts`, and for the same reason: the
 * template can be rendered from a fixture with no database at all, and a
 * regeneration years from now reads the stored payload rather than re-running
 * this function against rows that have since changed.
 */

export type PayloadCustomerRecord = {
  readonly name: string;
  readonly orgNumber: string | null;
  readonly address: string | null;
  readonly phone: string;
  readonly email: string | null;
};

export type PayloadVehicleRecord = {
  readonly registrationNumberDisplay: string;
  readonly make: string;
  readonly model: string;
  readonly modelYear: number | null;
  readonly vin: string | null;
};

/** A work-order line as this payload needs it — traceability, not pricing. */
export type PayloadLineRecord = {
  readonly sortOrder: number;
  readonly type: ServiceProtocolPayload['lines'][number]['type'];
  readonly description: string;
  readonly quantity: Prisma.Decimal;
  readonly unit: ServiceProtocolPayload['lines'][number]['unit'];
  readonly articleSku: string | null;
};

export type BuildServiceProtocolPayloadInput = {
  readonly protocol: ServiceProtocolRecord;
  readonly lines: readonly PayloadLineRecord[];
  readonly number: string;
  readonly generatedAt: Date;
  readonly workshop: WorkshopDetails;
  readonly customer: PayloadCustomerRecord;
  readonly vehicle: PayloadVehicleRecord;
  readonly workOrder: {
    readonly number: string | null;
    readonly description: string;
  };
  readonly mechanicName: string;
};

/**
 * Builds the payload and **validates it against its own schema** before it is
 * stored or rendered — the same defensive parse `buildQuotePayload` does, for
 * the same reason: a field that quietly went `undefined` here is discovered
 * years later by someone trying to reconstruct a document, when nothing can
 * be done about it. Failing here costs one 500 and a stack trace instead.
 */
export function buildServiceProtocolPayload(
  input: BuildServiceProtocolPayloadInput,
): ServiceProtocolPayload {
  // Read back from the stored `checklistJson` rather than threaded through as
  // a parameter — the same "re-read after a write" choice `quotes/service.ts`
  // makes, so the payload always reflects what the row actually holds.
  const checklist = toChecklist(input.protocol.checklistJson);

  return serviceProtocolPayloadSchema.parse({
    payloadVersion: SERVICE_PROTOCOL_PAYLOAD_VERSION,
    documentType: 'SERVICE_PROTOCOL',
    generatedAt: input.generatedAt.toISOString(),
    number: input.number,
    workshop: input.workshop,
    customer: input.customer,
    vehicle: input.vehicle,
    workOrder: input.workOrder,
    performedAt: input.protocol.performedAt.toISOString(),
    odometerKm: input.protocol.odometerKm,
    mechanicName: input.mechanicName,
    lines: input.lines.map((line) => ({
      sortOrder: line.sortOrder,
      type: line.type,
      description: line.description,
      quantity: toDecimalString(line.quantity),
      unit: line.unit,
      articleSku: line.articleSku,
    })),
    checklist,
    notes: input.protocol.notes,
    nextServiceDueKm: input.protocol.nextServiceDueKm,
    nextServiceDueDate: toIsoDateOrNull(input.protocol.nextServiceDueDate),
  });
}
