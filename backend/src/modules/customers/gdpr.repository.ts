import type { CustomerExport } from 'shared';
import type { Database } from '../../lib/prisma.js';
import {
  BOOKING_WITH_RELATIONS_SELECT,
  toBookingWithRelationsDto,
} from '../bookings/booking.repository.js';
import {
  QUOTE_DETAIL_SELECT,
  toQuoteDetailDto,
} from '../quotes/repository.js';
import {
  SERVICE_PROTOCOL_DETAIL_SELECT,
  toServiceProtocolDetailDto,
} from '../service-protocols/repository.js';
import {
  ODOMETER_READING_SELECT,
  toOdometerReadingDto,
} from '../vehicles/odometer.repository.js';
import { toVehicleDto, VEHICLE_SELECT } from '../vehicles/repository.js';
import {
  WORK_ORDER_DETAIL_SELECT,
  toWorkOrderDetailDto,
} from '../work-orders/repository.js';
import { CUSTOMER_SELECT, toCustomerDto } from './repository.js';

/**
 * Gathering everything held about one customer (PROJECT_SPEC.md §5.5, B11.2.1).
 *
 * Every nested shape and select is borrowed from the module that owns it
 * rather than redeclared here — a second `select` for "the same work order"
 * is a second place for the two to drift, which is exactly the failure
 * CLAUDE.md's "types are defined once" rule exists to prevent. This module's
 * only job is to know which foreign key links each table back to the
 * customer.
 */
export async function gatherCustomerExport(
  db: Database,
  customerId: string,
): Promise<Omit<CustomerExport, 'exportedAt'> | null> {
  const customerRecord = await db.customer.findUnique({
    where: { id: customerId },
    select: CUSTOMER_SELECT,
  });
  if (customerRecord === null) {
    return null;
  }

  const [
    vehicleRecords,
    bookingRecords,
    workOrderRecords,
    quoteRecords,
    serviceProtocolRecords,
  ] = await Promise.all([
    db.vehicle.findMany({ where: { customerId }, select: VEHICLE_SELECT }),
    db.booking.findMany({
      where: { customerId },
      select: BOOKING_WITH_RELATIONS_SELECT,
      orderBy: { startsAt: 'desc' },
    }),
    db.workOrder.findMany({
      where: { customerId },
      select: WORK_ORDER_DETAIL_SELECT,
      orderBy: { createdAt: 'desc' },
    }),
    db.quote.findMany({
      where: { workOrder: { customerId } },
      select: QUOTE_DETAIL_SELECT,
      orderBy: { createdAt: 'desc' },
    }),
    db.serviceProtocol.findMany({
      where: { workOrder: { customerId } },
      select: SERVICE_PROTOCOL_DETAIL_SELECT,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const vehicleIds = vehicleRecords.map((vehicle) => vehicle.id);
  const odometerRecords =
    vehicleIds.length === 0
      ? []
      : await db.odometerReading.findMany({
          where: { vehicleId: { in: vehicleIds } },
          select: ODOMETER_READING_SELECT,
          orderBy: { readAt: 'desc' },
        });

  return {
    customer: toCustomerDto(customerRecord),
    vehicles: vehicleRecords.map(toVehicleDto),
    odometerReadings: odometerRecords.map(toOdometerReadingDto),
    bookings: bookingRecords.map(toBookingWithRelationsDto),
    workOrders: workOrderRecords.map(toWorkOrderDetailDto),
    quotes: quoteRecords.map(toQuoteDetailDto),
    serviceProtocols: serviceProtocolRecords.map(toServiceProtocolDetailDto),
  };
}
