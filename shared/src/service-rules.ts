import {
  SEVERITY_THRESHOLDS,
  type RecommendationSeverity,
  type ServiceType,
} from './schemas/service-rule.js';
import { stockholmDate } from './time.js';

/**
 * The service recommendation engine — PROJECT_SPEC.md §7.3, B9.2–B9.3.
 *
 * A pure function with no I/O: matching and due-date arithmetic are entirely
 * deterministic given a vehicle, its history and the active rule set, which is
 * what makes "100 % branch coverage" (B9's Definition of Done) a meaningful
 * target rather than a formality. The caller — `modules/service-rules` in the
 * backend — owns loading the rows and persisting the result.
 */

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** What the engine needs to know about the vehicle being evaluated. */
export type VehicleFacts = {
  readonly make: string;
  readonly model: string | null;
  readonly engineCode: string | null;
  readonly modelYear: number | null;
  /** ISO date (`YYYY-MM-DD`), or `null` if unknown. */
  readonly firstRegistrationDate: string | null;
};

/** One completed service of a given type, read from the vehicle's history. */
export type PerformedService = {
  readonly serviceType: ServiceType;
  /** ISO date the service was performed. */
  readonly performedAt: string;
  readonly odometerKm: number;
};

/** The matching and due-date inputs a `ServiceRule` row contributes. */
export type ServiceRuleFacts = {
  readonly id: string;
  readonly make: string;
  readonly model: string | null;
  readonly engineCode: string | null;
  readonly modelYearFrom: number | null;
  readonly modelYearTo: number | null;
  readonly serviceType: ServiceType;
  readonly intervalKm: number | null;
  readonly intervalMonths: number | null;
  readonly sourceNote: string;
  /** ISO date-time. Breaks a specificity tie (B9.2.2). */
  readonly updatedAt: string;
};

/** One rule's computed advice for one vehicle. */
export type ComputedRecommendation = {
  readonly serviceRuleId: string;
  readonly ruleSnapshot: ServiceRuleFacts;
  readonly serviceType: ServiceType;
  readonly dueKm: number | null;
  readonly dueDate: string | null;
  readonly severity: RecommendationSeverity;
};

// --- Matching (B9.2) ---------------------------------------------------------

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Every narrowing field a rule sets must match; an unset one matches anything.
 * A narrowing field the rule sets but the vehicle does not have (e.g. an
 * unknown `engineCode`) never matches — an unknown fact is not "anything",
 * it is "not this".
 */
function ruleMatchesVehicle(
  rule: ServiceRuleFacts,
  vehicle: VehicleFacts,
): boolean {
  if (!sameText(rule.make, vehicle.make)) {
    return false;
  }
  if (rule.model !== null) {
    if (vehicle.model === null || !sameText(rule.model, vehicle.model)) {
      return false;
    }
  }
  if (rule.engineCode !== null) {
    if (
      vehicle.engineCode === null ||
      !sameText(rule.engineCode, vehicle.engineCode)
    ) {
      return false;
    }
  }
  if (rule.modelYearFrom !== null) {
    if (vehicle.modelYear === null || vehicle.modelYear < rule.modelYearFrom) {
      return false;
    }
  }
  if (rule.modelYearTo !== null) {
    if (vehicle.modelYear === null || vehicle.modelYear > rule.modelYearTo) {
      return false;
    }
  }
  return true;
}

/**
 * `make + model + engineCode + year range` beats `make + model` beats `make`
 * (§7.3). Expressed as a count of narrowing fields set, which reproduces
 * exactly those three named tiers without hard-coding them: a rule can only
 * set more narrowing fields by being more specific, never by being equally
 * specific in a different way.
 */
function specificityScore(rule: ServiceRuleFacts): number {
  let score = 0;
  if (rule.model !== null) {
    score += 1;
  }
  if (rule.engineCode !== null) {
    score += 1;
  }
  if (rule.modelYearFrom !== null || rule.modelYearTo !== null) {
    score += 1;
  }
  return score;
}

/**
 * True when `candidate` should replace `current` as the best match for one
 * service type: higher specificity wins, then the more recently updated rule,
 * then — for two rules updated at the same instant — the larger id, purely so
 * the outcome does not depend on which one the loop happened to see first
 * (B9.2.2).
 */
function isBetterMatch(
  candidate: ServiceRuleFacts,
  current: ServiceRuleFacts,
): boolean {
  const candidateScore = specificityScore(candidate);
  const currentScore = specificityScore(current);
  if (candidateScore !== currentScore) {
    return candidateScore > currentScore;
  }

  const candidateUpdated = Date.parse(candidate.updatedAt);
  const currentUpdated = Date.parse(current.updatedAt);
  if (candidateUpdated !== currentUpdated) {
    return candidateUpdated > currentUpdated;
  }

  return candidate.id.localeCompare(current.id) > 0;
}

/**
 * The single best-matching rule per service type, for one vehicle (B9.2.1).
 * Overlapping rules are expected — B9.1.3 allows them by design — so this is
 * how ties between simultaneously-valid candidates resolve into one answer
 * per service type.
 */
export function findMatchingRules(
  vehicle: VehicleFacts,
  rules: readonly ServiceRuleFacts[],
): ReadonlyMap<ServiceType, ServiceRuleFacts> {
  const bestByType = new Map<ServiceType, ServiceRuleFacts>();

  for (const rule of rules) {
    if (!ruleMatchesVehicle(rule, vehicle)) {
      continue;
    }

    const current = bestByType.get(rule.serviceType);
    if (current === undefined || isBetterMatch(rule, current)) {
      bestByType.set(rule.serviceType, rule);
    }
  }

  return bestByType;
}

// --- Due calculation (B9.3) --------------------------------------------------

type Baseline = { readonly km: number; readonly date: string };

/**
 * The later baseline of the last performed service of this type, or the
 * vehicle's first registration (§7.3) — whichever is more recent contributes
 * *both* its km and its date, as one point. A first registration is assumed to
 * start at 0 km: it is the only baseline available for a car with no service
 * history at all, and a car is not driven before it exists.
 */
function resolveBaseline(
  serviceType: ServiceType,
  vehicle: VehicleFacts,
  history: readonly PerformedService[],
): Baseline | null {
  const lastPerformed = history
    .filter((service) => service.serviceType === serviceType)
    .reduce<PerformedService | null>((latest, service) => {
      if (
        latest === null ||
        Date.parse(service.performedAt) > Date.parse(latest.performedAt)
      ) {
        return service;
      }
      return latest;
    }, null);

  const firstRegistration = vehicle.firstRegistrationDate;

  if (lastPerformed === null) {
    return firstRegistration === null
      ? null
      : { km: 0, date: firstRegistration };
  }
  if (firstRegistration === null) {
    return { km: lastPerformed.odometerKm, date: lastPerformed.performedAt };
  }

  return Date.parse(lastPerformed.performedAt) >= Date.parse(firstRegistration)
    ? { km: lastPerformed.odometerKm, date: lastPerformed.performedAt }
    : { km: 0, date: firstRegistration };
}

/**
 * A local calendar date shifted by whole months, clamped to the shifted
 * month's last day (31 January + 1 month is 28 or 29 February, not 3 March).
 *
 * Built from integer year/month/day arithmetic and `Date.UTC`/`getUTCDate`
 * only — never a `Date`'s local getters or `date-fns`'s `addMonths`, which
 * reads and writes through them. This value is a *date*, not an instant, and
 * it must come out the same on every machine regardless of its local
 * timezone; the same reasoning `addStockholmDays` in `time.ts` already
 * follows for day arithmetic.
 */
function addCalendarMonths(localDate: string, months: number): string {
  const year = Number(localDate.slice(0, 4));
  const month = Number(localDate.slice(5, 7));
  const day = Number(localDate.slice(8, 10));

  const totalMonths = year * 12 + (month - 1) + months;
  const resultYear = Math.floor(totalMonths / 12);
  const resultMonthIndex = totalMonths - resultYear * 12;

  const daysInResultMonth = new Date(
    Date.UTC(resultYear, resultMonthIndex + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(resultYear, resultMonthIndex, Math.min(day, daysInResultMonth)),
  )
    .toISOString()
    .slice(0, 10);
}

function computeDue(
  rule: ServiceRuleFacts,
  baseline: Baseline,
): { dueKm: number | null; dueDate: string | null } {
  return {
    dueKm: rule.intervalKm === null ? null : baseline.km + rule.intervalKm,
    dueDate:
      rule.intervalMonths === null
        ? null
        : addCalendarMonths(baseline.date, rule.intervalMonths),
  };
}

// --- Severity (§7.3) ---------------------------------------------------------

/**
 * Ranked so the lower number is the more urgent severity — used only to
 * compare two already-known severities, never to look one up by number.
 */
const SEVERITY_RANK: Readonly<Record<RecommendationSeverity, number>> = {
  OVERDUE: 0,
  DUE_SOON: 1,
  UPCOMING: 2,
};

/**
 * `null` means "outside every tracked window" — §7.3 names specific windows
 * for `DUE_SOON` and `UPCOMING` rather than an unbounded one, so a service
 * merely scheduled for next year has no severity yet in this dimension.
 */
function severityForRemaining(
  remaining: number,
  dueSoon: number,
  upcoming: number,
): RecommendationSeverity | null {
  if (remaining <= 0) {
    return 'OVERDUE';
  }
  if (remaining <= dueSoon) {
    return 'DUE_SOON';
  }
  if (remaining <= upcoming) {
    return 'UPCOMING';
  }
  return null;
}

function kmSeverity(
  dueKm: number | null,
  odometerKm: number,
): RecommendationSeverity | null {
  if (dueKm === null) {
    return null;
  }
  return severityForRemaining(
    dueKm - odometerKm,
    SEVERITY_THRESHOLDS.dueSoonKm,
    SEVERITY_THRESHOLDS.upcomingKm,
  );
}

function dateSeverity(
  dueDate: string | null,
  today: Date,
): RecommendationSeverity | null {
  if (dueDate === null) {
    return null;
  }
  // Stockholm calendar date, not UTC: "today" is a local concept everywhere
  // else in this system (§3.6), and a due date one day out must not flip to
  // "due soon" a few hours early just because UTC has already turned over.
  const todayDate = stockholmDate(today);
  const remainingDays = Math.round(
    (Date.parse(dueDate) - Date.parse(todayDate)) / MILLISECONDS_PER_DAY,
  );
  return severityForRemaining(
    remainingDays,
    SEVERITY_THRESHOLDS.dueSoonDays,
    SEVERITY_THRESHOLDS.upcomingDays,
  );
}

/**
 * Whichever of km or date comes first wins (§7.3): the more urgent of the two
 * dimensions' severities, with a dimension that has no due point at all
 * losing to one that does.
 */
function computeSeverity(
  dueKm: number | null,
  dueDate: string | null,
  odometerKm: number,
  today: Date,
): RecommendationSeverity | null {
  const byKm = kmSeverity(dueKm, odometerKm);
  const byDate = dateSeverity(dueDate, today);

  if (byKm === null) {
    return byDate;
  }
  if (byDate === null) {
    return byKm;
  }
  return SEVERITY_RANK[byKm] <= SEVERITY_RANK[byDate] ? byKm : byDate;
}

// --- Entry point --------------------------------------------------------------

export type ComputeRecommendationsInput = {
  readonly vehicle: VehicleFacts;
  readonly odometerKm: number;
  readonly today: Date;
  readonly history: readonly PerformedService[];
  readonly rules: readonly ServiceRuleFacts[];
};

/**
 * Turns mileage, age and service history into concrete advice (§7.3). Pure: no
 * database, no clock other than the `today` it is given, so a test can freeze
 * every input and assert the exact output.
 */
export function computeRecommendations(
  input: ComputeRecommendationsInput,
): ComputedRecommendation[] {
  const matches = findMatchingRules(input.vehicle, input.rules);
  const recommendations: ComputedRecommendation[] = [];

  for (const rule of matches.values()) {
    const baseline = resolveBaseline(
      rule.serviceType,
      input.vehicle,
      input.history,
    );
    if (baseline === null) {
      continue;
    }

    const { dueKm, dueDate } = computeDue(rule, baseline);
    const severity = computeSeverity(
      dueKm,
      dueDate,
      input.odometerKm,
      input.today,
    );
    if (severity === null) {
      continue;
    }

    recommendations.push({
      serviceRuleId: rule.id,
      ruleSnapshot: rule,
      serviceType: rule.serviceType,
      dueKm,
      dueDate,
      severity,
    });
  }

  // Most urgent first; deterministic among equal severities so the order does
  // not depend on `Map` iteration order, which follows insertion rather than
  // any property of the rules themselves.
  return recommendations.sort((a, b) => {
    const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return rankDiff !== 0
      ? rankDiff
      : a.serviceType.localeCompare(b.serviceType);
  });
}
