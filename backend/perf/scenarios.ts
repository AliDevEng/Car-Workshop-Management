import type { RequestSpec } from './driver.js';

/**
 * The endpoint mix, declared once (B13.2.2, B13.3, B13.4.1).
 *
 * Both runs read this list: `run-budgets.ts` measures each scenario on its own
 * against its budget, `run-load.ts` draws from it by weight for five minutes.
 * One declaration rather than two, for the same reason §8.2 keeps one
 * definition of "due soon" — two lists drift, and the drift is invisible until
 * the load test is quietly exercising something the budgets never covered.
 */

/** The five budgets B13.3 names. `none` is measured but not judged. */
export type BudgetName = 'search' | 'list' | 'workOrderDetail' | 'pdf' | 'none';

export const BUDGETS_MS: Readonly<Record<Exclude<BudgetName, 'none'>, number>> =
  {
    /** B13.3.1 */
    search: 100,
    /** B13.3.2 */
    list: 200,
    /** B13.3.3 */
    workOrderDetail: 150,
    /** B13.3.4 */
    pdf: 3_000,
  };

/** B13.3.5, in bytes. */
export const MEMORY_BUDGET_BYTES = 512 * 1024 * 1024;

/**
 * Real ids and terms, read out of the API at the start of a run rather than
 * out of the database. A measurement harness that opened its own Prisma
 * connection would be measuring a system it is also loading.
 */
export type Fixtures = {
  readonly workOrderIds: readonly string[];
  readonly customerIds: readonly string[];
  readonly vehicleIds: readonly string[];
  readonly articleIds: readonly string[];
  readonly userIds: readonly string[];
  /** Terms that actually match seeded rows — an empty result measures nothing. */
  readonly searchTerms: readonly string[];
  /** The calendar window's start, as an ISO instant. */
  readonly calendarFrom: string;
  readonly calendarTo: string;
};

export type Scenario = {
  readonly name: string;
  readonly budget: BudgetName;
  /**
   * The role this endpoint requires (§5.3). Declared so a virtual user signed
   * in as a `MECHANIC` never draws an `ADMIN`-only scenario — without it, a
   * load run reports correct `403`s as failures and B13.4.2's "zero errors"
   * can never be reached however healthy the system is.
   */
  readonly role?: 'ADMIN';
  /**
   * Relative frequency in the load mix. Weighted by what a two-person workshop
   * actually does: the work-order screen and the search box all day, the audit
   * log almost never.
   */
  readonly weight: number;
  /** Excluded from the sustained load run — see `mutating` below. */
  readonly mutating?: boolean;
  readonly build: (
    fixtures: Fixtures,
    pick: <T>(values: readonly T[]) => T,
  ) => RequestSpec;
};

function get(path: string): RequestSpec {
  return { method: 'GET', path };
}

/**
 * Read scenarios. Every list endpoint in the system appears here, which is
 * B13.2.2's requirement restated as code — a new list endpoint that is not
 * added to this array is a list endpoint nobody measured.
 */
export const READ_SCENARIOS: readonly Scenario[] = [
  // --- The search box (B13.3.1) ---
  {
    name: 'GET /api/search',
    budget: 'search',
    weight: 14,
    build: (fixtures, pick) =>
      get(`/api/search?q=${encodeURIComponent(pick(fixtures.searchTerms))}`),
  },

  // --- Work order detail (B13.3.3) ---
  {
    name: 'GET /api/work-orders/:id',
    budget: 'workOrderDetail',
    weight: 18,
    build: (fixtures, pick) =>
      get(`/api/work-orders/${pick(fixtures.workOrderIds)}`),
  },

  // --- Lists (B13.3.2) ---
  {
    name: 'GET /api/work-orders',
    budget: 'list',
    weight: 10,
    build: () => get('/api/work-orders?limit=25'),
  },
  {
    name: 'GET /api/work-orders?status=IN_PROGRESS',
    budget: 'list',
    weight: 8,
    build: () => get('/api/work-orders?status=IN_PROGRESS&limit=25'),
  },
  {
    name: 'GET /api/work-orders?assignedUserId',
    budget: 'list',
    weight: 4,
    build: (fixtures, pick) =>
      get(`/api/work-orders?assignedUserId=${pick(fixtures.userIds)}&limit=25`),
  },
  {
    name: 'GET /api/customers',
    budget: 'list',
    weight: 6,
    build: () => get('/api/customers?limit=25'),
  },
  {
    name: 'GET /api/customers?q',
    budget: 'list',
    weight: 5,
    build: (fixtures, pick) =>
      get(
        `/api/customers?q=${encodeURIComponent(pick(fixtures.searchTerms))}&limit=25`,
      ),
  },
  {
    name: 'GET /api/customers/:id',
    budget: 'list',
    weight: 5,
    build: (fixtures, pick) =>
      get(`/api/customers/${pick(fixtures.customerIds)}`),
  },
  {
    name: 'GET /api/customers/:id/work-orders',
    budget: 'list',
    weight: 4,
    build: (fixtures, pick) =>
      get(`/api/customers/${pick(fixtures.customerIds)}/work-orders?limit=10`),
  },
  {
    name: 'GET /api/vehicles',
    budget: 'list',
    weight: 6,
    build: () => get('/api/vehicles?limit=25'),
  },
  {
    name: 'GET /api/vehicles?inspectionDueSoon',
    budget: 'list',
    weight: 3,
    build: () => get('/api/vehicles?inspectionDueSoon=true&limit=25'),
  },
  {
    name: 'GET /api/vehicles/:id',
    budget: 'list',
    weight: 5,
    build: (fixtures, pick) =>
      get(`/api/vehicles/${pick(fixtures.vehicleIds)}`),
  },
  {
    name: 'GET /api/vehicles/:id/odometer-readings',
    budget: 'list',
    weight: 3,
    build: (fixtures, pick) =>
      get(
        `/api/vehicles/${pick(fixtures.vehicleIds)}/odometer-readings?limit=25`,
      ),
  },
  {
    name: 'GET /api/vehicles/:id/work-orders',
    budget: 'list',
    weight: 4,
    build: (fixtures, pick) =>
      get(`/api/vehicles/${pick(fixtures.vehicleIds)}/work-orders?limit=10`),
  },
  {
    name: 'GET /api/vehicles/:id/service-recommendations',
    budget: 'list',
    weight: 2,
    build: (fixtures, pick) =>
      get(`/api/vehicles/${pick(fixtures.vehicleIds)}/service-recommendations`),
  },
  {
    name: 'GET /api/articles',
    budget: 'list',
    weight: 5,
    build: () => get('/api/articles?limit=25'),
  },
  {
    name: 'GET /api/articles?q',
    budget: 'list',
    weight: 4,
    build: (fixtures, pick) =>
      get(
        `/api/articles?q=${encodeURIComponent(pick(fixtures.searchTerms))}&limit=25`,
      ),
  },
  {
    name: 'GET /api/articles?lowStock',
    budget: 'list',
    weight: 2,
    build: () => get('/api/articles?lowStock=true&limit=25'),
  },
  {
    name: 'GET /api/articles/low-stock',
    budget: 'list',
    weight: 2,
    build: () => get('/api/articles/low-stock'),
  },
  {
    name: 'GET /api/articles/:id/movements',
    budget: 'list',
    weight: 3,
    build: (fixtures, pick) =>
      get(`/api/articles/${pick(fixtures.articleIds)}/movements?limit=25`),
  },
  {
    name: 'GET /api/bookings (calendar)',
    budget: 'list',
    weight: 8,
    build: (fixtures) =>
      get(
        `/api/bookings?from=${encodeURIComponent(fixtures.calendarFrom)}&to=${encodeURIComponent(fixtures.calendarTo)}`,
      ),
  },
  {
    name: 'GET /api/booking-requests',
    budget: 'list',
    weight: 5,
    build: () => get('/api/booking-requests?limit=25'),
  },
  {
    name: 'GET /api/quotes?workOrderId',
    budget: 'list',
    weight: 3,
    build: (fixtures, pick) =>
      get(`/api/quotes?workOrderId=${pick(fixtures.workOrderIds)}&limit=25`),
  },
  {
    name: 'GET /api/service-protocols?workOrderId',
    budget: 'list',
    weight: 2,
    build: (fixtures, pick) =>
      get(
        `/api/service-protocols?workOrderId=${pick(fixtures.workOrderIds)}&limit=25`,
      ),
  },
  {
    name: 'GET /api/service-rules',
    budget: 'list',
    role: 'ADMIN',
    weight: 2,
    build: () => get('/api/service-rules?limit=25'),
  },
  {
    name: 'GET /api/service-recommendations',
    budget: 'list',
    weight: 2,
    build: () => get('/api/service-recommendations?limit=25'),
  },
  {
    name: 'GET /api/checklist-templates',
    budget: 'list',
    weight: 1,
    build: () => get('/api/checklist-templates?limit=25'),
  },
  {
    name: 'GET /api/partner-links',
    budget: 'list',
    weight: 1,
    build: () => get('/api/partner-links'),
  },
  {
    name: 'GET /api/users',
    budget: 'list',
    role: 'ADMIN',
    weight: 1,
    build: () => get('/api/users?limit=25'),
  },
  {
    name: 'GET /api/audit-log',
    budget: 'list',
    role: 'ADMIN',
    weight: 1,
    build: () => get('/api/audit-log?limit=25'),
  },
  {
    name: 'GET /api/dashboard',
    budget: 'list',
    weight: 6,
    build: () => get('/api/dashboard'),
  },
  {
    name: 'GET /api/settings',
    budget: 'list',
    weight: 1,
    build: () => get('/api/settings'),
  },
  {
    name: 'GET /api/auth/me',
    budget: 'none',
    weight: 4,
    build: () => get('/api/auth/me'),
  },
];

/**
 * The public site's own read path. Separate because it is unauthenticated and
 * rate-limited in its own right (§7.1, B10.4) — a staff client's session must
 * not be what makes it answer.
 */
export const PUBLIC_SCENARIOS: readonly Scenario[] = [
  {
    name: 'GET /api/public/workshop',
    budget: 'list',
    weight: 2,
    build: () => get('/api/public/workshop'),
  },
  {
    name: 'GET /api/public/privacy-policy',
    budget: 'none',
    weight: 1,
    build: () => get('/api/public/privacy-policy'),
  },
];

export function totalWeight(scenarios: readonly Scenario[]): number {
  return scenarios.reduce((sum, scenario) => sum + scenario.weight, 0);
}

/**
 * Picks a scenario by weight. `roll` is in `[0, 1)`; the caller owns the PRNG,
 * so a load run is reproducible from its seed.
 */
export function chooseScenario(
  scenarios: readonly Scenario[],
  roll: number,
): Scenario {
  const target = roll * totalWeight(scenarios);
  let seen = 0;

  for (const scenario of scenarios) {
    seen += scenario.weight;
    if (target < seen) {
      return scenario;
    }
  }

  const last = scenarios.at(-1);
  if (last === undefined) {
    throw new Error('chooseScenario() called with no scenarios');
  }
  return last;
}

/**
 * The scenarios a client with this role may actually call. `undefined` means
 * "no session" — the public pair only.
 */
export function scenariosForRole(
  role: 'ADMIN' | 'MECHANIC',
): readonly Scenario[] {
  return [...READ_SCENARIOS, ...PUBLIC_SCENARIOS].filter(
    (scenario) =>
      // Nothing that spends a document number or deducts stock: a five-minute
      // run would burn thousands of §4.4 numbers and thousands of PDFs, and
      // the write path's own cost is B13.3.4's measurement, not this one's.
      scenario.mutating !== true &&
      (scenario.role === undefined || scenario.role === role),
  );
}
