import {
  NotFoundError,
  normalisePhone,
  type Customer,
  type CustomerDetail,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from 'shared';
import { writeAuditLog } from '../../lib/audit.js';
import type { Database } from '../../lib/prisma.js';
import {
  findCustomerWithVehicles,
  findCustomerRecord,
  toCustomerDto,
  CUSTOMER_SELECT,
  type CustomerRecord,
} from './repository.js';

/**
 * Customer records (PROJECT_SPEC.md §4.2, §6.3).
 *
 * A customer is personal data, so every mutation here is audited (§4.2). The
 * record is never hard-deleted — `isActive` is toggled through its own routes,
 * so the documents a customer appears on always keep a real name (§4.3, §5.5).
 */

/** What the audit log records about a customer. */
function auditSnapshot(record: CustomerRecord): Record<string, unknown> {
  return {
    type: record.type,
    name: record.name,
    orgNumber: record.orgNumber,
    email: record.email,
    phone: record.phone,
    address: record.address,
    isActive: record.isActive,
  };
}

/**
 * `phoneNormalised` is derived here, never accepted from the client: letting
 * the caller supply it would allow the two phone columns to disagree, which is
 * the §8.2 failure the pair exists to prevent.
 */
function normalisedContactFields(input: {
  phone: string;
}): { phoneNormalised: string } {
  return { phoneNormalised: normalisePhone(input.phone) };
}

export async function getCustomerDetail(
  db: Database,
  id: string,
): Promise<CustomerDetail> {
  const record = await findCustomerWithVehicles(db, id);
  if (record === null) {
    throw new NotFoundError('Kunden kunde inte hittas.');
  }

  return {
    ...toCustomerDto(record),
    vehicles: record.vehicles.map((vehicle) => ({
      id: vehicle.id,
      registrationNumber: vehicle.registrationNumber,
      registrationNumberDisplay: vehicle.registrationNumberDisplay,
      make: vehicle.make,
      model: vehicle.model,
    })),
  };
}

export async function createCustomer(
  db: Database,
  actorId: string,
  ipHash: string | null,
  input: CreateCustomerInput,
): Promise<Customer> {
  return db.$transaction(async (tx) => {
    const created = await tx.customer.create({
      data: {
        type: input.type,
        name: input.name,
        phone: input.phone,
        ...normalisedContactFields(input),
        ...(input.orgNumber === undefined ? {} : { orgNumber: input.orgNumber }),
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(input.address === undefined ? {} : { address: input.address }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      },
      select: CUSTOMER_SELECT,
    });

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'customer.created',
      entityType: 'Customer',
      entityId: created.id,
      after: auditSnapshot(created),
      ipHash,
    });

    return toCustomerDto(created);
  });
}

export async function updateCustomer(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  input: UpdateCustomerInput,
): Promise<Customer> {
  return db.$transaction(async (tx) => {
    const before = await tx.customer.findUnique({
      where: { id },
      select: CUSTOMER_SELECT,
    });
    if (before === null) {
      throw new NotFoundError('Kunden kunde inte hittas.');
    }

    const after = await tx.customer.update({
      where: { id },
      data: {
        ...(input.type === undefined ? {} : { type: input.type }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.orgNumber === undefined ? {} : { orgNumber: input.orgNumber }),
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(input.phone === undefined
          ? {}
          : { phone: input.phone, ...normalisedContactFields({ phone: input.phone }) }),
        ...(input.address === undefined ? {} : { address: input.address }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      },
      select: CUSTOMER_SELECT,
    });

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'customer.updated',
      entityType: 'Customer',
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return toCustomerDto(after);
  });
}

/**
 * Deactivation and reactivation are their own routes rather than an `isActive`
 * field on the patch: §4.3 makes "never hard-deleted" the rule for a customer,
 * and a state change that important should not be reachable by assigning a
 * boolean buried in an update body. There is deliberately no delete route.
 */
async function setCustomerActive(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  isActive: boolean,
): Promise<Customer> {
  return db.$transaction(async (tx) => {
    const before = await tx.customer.findUnique({
      where: { id },
      select: CUSTOMER_SELECT,
    });
    if (before === null) {
      throw new NotFoundError('Kunden kunde inte hittas.');
    }

    if (before.isActive === isActive) {
      // Idempotent: deactivating a deactivated customer is not an error.
      return toCustomerDto(before);
    }

    const after = await tx.customer.update({
      where: { id },
      data: { isActive },
      select: CUSTOMER_SELECT,
    });

    await writeAuditLog(tx, {
      userId: actorId,
      action: isActive ? 'customer.reactivated' : 'customer.deactivated',
      entityType: 'Customer',
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return toCustomerDto(after);
  });
}

export function deactivateCustomer(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
): Promise<Customer> {
  return setCustomerActive(db, actorId, ipHash, id, false);
}

export function reactivateCustomer(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
): Promise<Customer> {
  return setCustomerActive(db, actorId, ipHash, id, true);
}

export async function getCustomer(db: Database, id: string): Promise<Customer> {
  const record = await findCustomerRecord(db, id);
  if (record === null) {
    throw new NotFoundError('Kunden kunde inte hittas.');
  }
  return toCustomerDto(record);
}
