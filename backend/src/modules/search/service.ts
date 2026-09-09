import {
  SEARCH_RESULTS_PER_CATEGORY,
  type SearchResponse,
  type SearchResult,
} from 'shared';
import type { Database } from '../../lib/prisma.js';
import { articleSearchWhere } from '../articles/repository.js';
import { customerSearchWhere } from '../customers/repository.js';
import { vehicleSearchWhere } from '../vehicles/repository.js';

/**
 * The one search box in the top bar (PROJECT_SPEC.md §6.3, B3.4, B4.6).
 *
 * Customers, vehicles and articles from one field. Each category is capped so
 * one crowded kind cannot fill the list, and the result is a discriminated
 * union so the frontend's per-kind switch is exhaustive at compile time.
 *
 * The `WHERE` predicates are reused from the two repositories rather than
 * rebuilt here — the list endpoints and this box must agree on what "matches"
 * means, including the two-column phone rule (§8.2).
 */

async function searchCustomers(
  db: Database,
  q: string,
): Promise<SearchResult[]> {
  const rows = await db.customer.findMany({
    where: { isActive: true, ...customerSearchWhere(q) },
    select: { id: true, name: true, type: true, phone: true },
    orderBy: { updatedAt: 'desc' },
    take: SEARCH_RESULTS_PER_CATEGORY,
  });

  return rows.map((row): SearchResult => ({
    type: 'CUSTOMER',
    id: row.id,
    name: row.name,
    customerType: row.type,
    phone: row.phone,
  }));
}

async function searchVehicles(
  db: Database,
  q: string,
): Promise<SearchResult[]> {
  const rows = await db.vehicle.findMany({
    where: vehicleSearchWhere(q),
    select: {
      id: true,
      registrationNumber: true,
      registrationNumberDisplay: true,
      make: true,
      model: true,
      customer: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: SEARCH_RESULTS_PER_CATEGORY,
  });

  return rows.map((row): SearchResult => ({
    type: 'VEHICLE',
    id: row.id,
    registrationNumber: row.registrationNumber,
    registrationNumberDisplay: row.registrationNumberDisplay,
    make: row.make,
    model: row.model,
    customerName: row.customer?.name ?? null,
  }));
}

async function searchArticles(
  db: Database,
  q: string,
): Promise<SearchResult[]> {
  const rows = await db.article.findMany({
    where: { isActive: true, ...articleSearchWhere(q) },
    select: { id: true, sku: true, name: true, unit: true },
    orderBy: { updatedAt: 'desc' },
    take: SEARCH_RESULTS_PER_CATEGORY,
  });

  return rows.map((row): SearchResult => ({
    type: 'ARTICLE',
    id: row.id,
    sku: row.sku,
    name: row.name,
    unit: row.unit,
  }));
}

export async function search(db: Database, q: string): Promise<SearchResponse> {
  const [customers, vehicles, articles] = await Promise.all([
    searchCustomers(db, q),
    searchVehicles(db, q),
    searchArticles(db, q),
  ]);

  return { query: q, results: [...customers, ...vehicles, ...articles] };
}
