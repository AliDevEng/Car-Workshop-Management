import { vehicleDataResultSchema, type VehicleDataResult } from 'shared';
import {
  VehicleDataHttpError,
  type HttpJsonClient,
  type HttpJsonRequest,
} from './http-client.js';
import type { VehicleDataProvider } from './provider.js';

/**
 * A paid vehicle-data provider reached over HTTP (PROJECT_SPEC.md §7.1,
 * B10.5).
 *
 * Everything that differs between Biluppgifter, Car.info and
 * Transportstyrelsen is the two functions a concrete provider passes in:
 *
 * - `buildRequest` — its URL layout and where its credential goes. The key
 *   arrives from `Env` (B10.5.3) and is placed in a header, never in the URL:
 *   a URL is what proxies, access logs and error reports record.
 * - `mapResponse` — its response shape, mapped to `VehicleDataResult`. This
 *   is the one file per provider B10.5.2 asks for, and the only place that
 *   provider's field names may appear (§7.1).
 *
 * What stays the same for all of them lives here: a `404` is a confirmed "no
 * such registration number" rather than a failure, any other `4xx` is a
 * failure, and the mapped result is parsed once more against the shared
 * schema — which strips any field it does not declare, so a mapper that
 * copied one provider field too many still cannot put an owner's name in a
 * public response (B10.4.2).
 */

export type VehicleDataResponseMapper = (body: unknown) => VehicleDataResult;

export type HttpVehicleDataProviderOptions = {
  readonly name: string;
  readonly client: HttpJsonClient;
  readonly buildRequest: (normalisedRegNr: string) => HttpJsonRequest;
  readonly mapResponse: VehicleDataResponseMapper;
};

export function createHttpVehicleDataProvider(
  options: HttpVehicleDataProviderOptions,
): VehicleDataProvider {
  const { name, client, buildRequest, mapResponse } = options;

  return {
    name,

    async lookup(normalisedRegNr) {
      const response = await client.getJson(buildRequest(normalisedRegNr));

      if (response.status === 404) {
        return null;
      }
      if (response.status >= 400) {
        // A rejected key, an exhausted quota, a plate the provider refused to
        // parse: the caller counts it against the circuit breaker and
        // degrades to cache, exactly like a timeout.
        throw new VehicleDataHttpError(
          `Vehicle-data provider "${name}" answered ${String(response.status)}`,
          response.status,
        );
      }

      // A mapper throws on a shape it does not recognise; so does this parse
      // on a result that does not satisfy the shared contract. Both reach the
      // caller as a rejection, which B10.3.4 turns into a degraded answer
      // rather than a crash.
      const result = vehicleDataResultSchema.parse(mapResponse(response.body));

      // The result is cached against the plate that was asked about. An
      // answer about any other plate — a provider's fuzzy match, a mapper
      // reading the wrong field — would put one car's inspection dates on
      // another car's page for thirty days.
      if (result.registrationNumber !== normalisedRegNr) {
        throw new Error(
          `Vehicle-data provider "${name}" answered for a different registration number`,
        );
      }
      return result;
    },
  };
}
