import { z } from 'zod';
import { bookingWithRelationsSchema } from './booking.js';
import { customerSchema } from './customer.js';
import { odometerReadingSchema } from './odometer.js';
import { isoDateTimeSchema } from './primitives.js';
import { quoteDetailSchema } from './quote.js';
import { serviceProtocolDetailSchema } from './service-protocol.js';
import { vehicleSchema } from './vehicle.js';
import { workOrderDetailSchema } from './work-order.js';

/**
 * GDPR export and erasure — PROJECT_SPEC.md §5.5, B11.2.
 *
 * Declared in its own file rather than added to `customer.ts`: it draws on
 * every domain that hangs off a customer (vehicles, bookings, work orders,
 * quotes, protocols, odometer history), and `customer.ts` must not depend on
 * all of those just to describe an export nobody reads except an ADMIN
 * answering an erasure request.
 */

/**
 * `GET /api/customers/:id/export` — "everything held about one customer, as
 * JSON" (§5.5). Every nested shape is the same one an authenticated screen
 * already returns, so the export can never describe a field the rest of the
 * system does not.
 */
export const customerExportSchema = z.object({
  exportedAt: isoDateTimeSchema,
  customer: customerSchema,
  vehicles: z.array(vehicleSchema),
  odometerReadings: z.array(odometerReadingSchema),
  bookings: z.array(bookingWithRelationsSchema),
  workOrders: z.array(workOrderDetailSchema),
  quotes: z.array(quoteDetailSchema),
  serviceProtocols: z.array(serviceProtocolDetailSchema),
});
export type CustomerExport = z.infer<typeof customerExportSchema>;

/**
 * `POST /api/customers/:id/anonymise` answers with the customer as it now
 * reads — contact fields nulled, `anonymisedAt` set — which is the same shape
 * every other customer mutation answers with.
 */
export const anonymiseCustomerResponseSchema = customerSchema;
export type AnonymiseCustomerResponse = z.infer<
  typeof anonymiseCustomerResponseSchema
>;

/**
 * `GET /api/public/privacy-policy` (§5.5, §6.1's `/integritetspolicy`).
 * Content lives in the backend rather than hard-coded into the frontend
 * because it describes what *this system* does with personal data, which is
 * a statement about the backend's own behaviour, not marketing copy.
 */
export const privacyPolicySectionSchema = z.object({
  heading: z.string().min(1),
  body: z.string().min(1),
});
export const privacyPolicySchema = z.object({
  updatedAt: isoDateTimeSchema,
  sections: z.array(privacyPolicySectionSchema).min(1),
});
export type PrivacyPolicy = z.infer<typeof privacyPolicySchema>;
