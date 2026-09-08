/**
 * Every API contract, one file per domain area (B1.5.1).
 *
 * `primitives.ts` first: the field-level building blocks the rest are
 * assembled from. The remaining files are listed in dependency order, which is
 * also roughly the order the iterations build them.
 */
export * from './primitives.js';
export * from './common.js';
export * from './health.js';

export * from './user.js';
export * from './auth.js';
export * from './customer.js';
export * from './vehicle.js';
export * from './odometer.js';
export * from './article.js';
export * from './stock.js';
export * from './booking.js';
export * from './work-order.js';
export * from './document.js';
export * from './quote.js';
export * from './service-rule.js';
export * from './service-protocol.js';
export * from './partner-link.js';
export * from './settings.js';
export * from './vehicle-data.js';
export * from './audit.js';
export * from './search.js';
