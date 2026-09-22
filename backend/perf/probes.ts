import {
  findLowStockArticles,
  listArticles,
} from '../src/modules/articles/repository.js';
import { listStockMovements } from '../src/modules/articles/stock.repository.js';
import { listAuditLog } from '../src/modules/audit/repository.js';
import { listBookingsInWindow } from '../src/modules/bookings/booking.repository.js';
import { listBookingRequests } from '../src/modules/bookings/request.repository.js';
import { listChecklistTemplates } from '../src/modules/checklist-templates/repository.js';
import { listCustomers } from '../src/modules/customers/repository.js';
import { getDashboard } from '../src/modules/dashboard/service.js';
import { listPartnerLinks } from '../src/modules/partner-links/repository.js';
import { listQuotes } from '../src/modules/quotes/repository.js';
import { search } from '../src/modules/search/service.js';
import { listServiceProtocols } from '../src/modules/service-protocols/repository.js';
import { listServiceRecommendations } from '../src/modules/service-recommendations/repository.js';
import { listServiceRules } from '../src/modules/service-rules/repository.js';
import { listUsers } from '../src/modules/users/service.js';
import { listReadings } from '../src/modules/vehicles/odometer.repository.js';
import { listVehicles } from '../src/modules/vehicles/repository.js';
import {
  listCustomerHistory,
  listVehicleHistory,
} from '../src/modules/work-orders/history.service.js';
import {
  findWorkOrderDetailRecord,
  listWorkOrders,
} from '../src/modules/work-orders/repository.js';
import type { Database } from '../src/lib/prisma.js';

/**
 * What B13.2 audits: every list read in the system, invoked through the very
 * function the route calls.
 *
 * Calling the repository directly rather than driving HTTP is deliberate and
 * complementary — `run-budgets.ts` measures what a client experiences, this
 * measures what the database is asked to do. Reimplementing the queries here
 * as hand-written SQL would audit a second, parallel set of queries that
 * nothing in production runs; a `?q=` clause that gained an `OR` last month
 * would still look fine.
 */

export type ProbeContext = {
  readonly workOrderId: string;
  readonly customerId: string;
  readonly vehicleId: string;
  readonly articleId: string;
  readonly searchTerm: string;
  readonly now: Date;
};

export type Probe = {
  /** How the run reports it — the route this read serves. */
  readonly name: string;
  /**
   * The read itself. Its **query count** is what B13.2.1 looks at: a count
   * that grows with the number of rows returned is the N+1 signature, and none
   * of these should have one.
   */
  readonly run: (db: Database, context: ProbeContext) => Promise<unknown>;
};

const PAGE = { limit: 25 } as const;

export const PROBES: readonly Probe[] = [
  {
    name: 'GET /api/search',
    run: (db, context) => search(db, context.searchTerm),
  },
  {
    name: 'GET /api/work-orders',
    run: (db) => listWorkOrders(db, PAGE),
  },
  {
    name: 'GET /api/work-orders?status=IN_PROGRESS',
    run: (db) => listWorkOrders(db, { ...PAGE, status: 'IN_PROGRESS' }),
  },
  {
    name: 'GET /api/work-orders/:id',
    run: (db, context) => findWorkOrderDetailRecord(db, context.workOrderId),
  },
  {
    name: 'GET /api/customers',
    run: (db) => listCustomers(db, PAGE),
  },
  {
    name: 'GET /api/customers?q',
    run: (db, context) => listCustomers(db, { ...PAGE, q: context.searchTerm }),
  },
  {
    name: 'GET /api/customers/:id/work-orders',
    run: (db, context) => listCustomerHistory(db, context.customerId, PAGE),
  },
  {
    name: 'GET /api/vehicles',
    run: (db) => listVehicles(db, PAGE),
  },
  {
    name: 'GET /api/vehicles?inspectionDueSoon',
    run: (db) => listVehicles(db, { ...PAGE, inspectionDueSoon: true }),
  },
  {
    name: 'GET /api/vehicles/:id/work-orders',
    run: (db, context) => listVehicleHistory(db, context.vehicleId, PAGE),
  },
  {
    name: 'GET /api/vehicles/:id/odometer-readings',
    run: (db, context) => listReadings(db, context.vehicleId, PAGE),
  },
  {
    name: 'GET /api/articles',
    run: (db) => listArticles(db, PAGE),
  },
  {
    name: 'GET /api/articles?q',
    run: (db, context) => listArticles(db, { ...PAGE, q: context.searchTerm }),
  },
  {
    name: 'GET /api/articles?lowStock',
    run: (db) => listArticles(db, { ...PAGE, lowStock: true }),
  },
  {
    name: 'GET /api/articles/low-stock',
    run: (db) => findLowStockArticles(db),
  },
  {
    name: 'GET /api/articles/:id/movements',
    run: (db, context) => listStockMovements(db, context.articleId, PAGE),
  },
  {
    name: 'GET /api/bookings (calendar)',
    run: (db, context) =>
      listBookingsInWindow(db, {
        from: new Date(context.now.getTime() - 14 * 86_400_000),
        to: new Date(context.now.getTime() + 28 * 86_400_000),
      }),
  },
  {
    name: 'GET /api/booking-requests',
    run: (db) => listBookingRequests(db, PAGE),
  },
  {
    name: 'GET /api/quotes?workOrderId',
    run: (db, context) =>
      listQuotes(db, { ...PAGE, workOrderId: context.workOrderId }),
  },
  {
    name: 'GET /api/service-protocols?workOrderId',
    run: (db, context) =>
      listServiceProtocols(db, { ...PAGE, workOrderId: context.workOrderId }),
  },
  {
    name: 'GET /api/service-rules',
    run: (db) => listServiceRules(db, PAGE),
  },
  {
    name: 'GET /api/service-recommendations',
    run: (db) => listServiceRecommendations(db, PAGE),
  },
  {
    name: 'GET /api/checklist-templates',
    run: (db) => listChecklistTemplates(db, PAGE),
  },
  {
    name: 'GET /api/partner-links',
    run: (db) => listPartnerLinks(db, {}),
  },
  {
    name: 'GET /api/users',
    run: (db) => listUsers(db, PAGE),
  },
  {
    name: 'GET /api/audit-log',
    run: (db) => listAuditLog(db, PAGE),
  },
  {
    name: 'GET /api/dashboard',
    run: (db) => getDashboard(db, {}),
  },
];
