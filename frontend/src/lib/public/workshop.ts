import {
  publicWorkshopInfoSchema,
  WEEKDAY_LABELS,
  type OpeningHours,
  type PublicWorkshopInfo,
} from 'shared';
import { apiFetchServer } from '@/lib/api/server';

export const fallbackWorkshopInfo: PublicWorkshopInfo =
  publicWorkshopInfoSchema.parse({
    workshop: {
      name: 'Mome Bilservice',
      orgNumber: '556677-8899',
      address: 'Industrivägen 14',
      postalCode: '171 48',
      city: 'Solna',
      phone: '08-410 245 90',
      email: 'hej@verkstaden.se',
    },
    openingHours: [
      { weekday: 'MONDAY', opensAt: '07:00', closesAt: '17:00' },
      { weekday: 'TUESDAY', opensAt: '07:00', closesAt: '17:00' },
      { weekday: 'WEDNESDAY', opensAt: '07:00', closesAt: '17:00' },
      { weekday: 'THURSDAY', opensAt: '07:00', closesAt: '17:00' },
      { weekday: 'FRIDAY', opensAt: '07:00', closesAt: '15:00' },
      { weekday: 'SATURDAY', opensAt: null, closesAt: null },
      { weekday: 'SUNDAY', opensAt: null, closesAt: null },
    ],
  });

/**
 * Public pages stay usable while the settings service is unavailable. Once
 * B3.5 exposes the endpoint, the same layouts automatically render its typed
 * response; no workshop detail is read from an unvalidated boundary.
 */
export async function getWorkshopInfo(): Promise<PublicWorkshopInfo> {
  try {
    return await apiFetchServer('/public/workshop', publicWorkshopInfoSchema);
  } catch {
    return fallbackWorkshopInfo;
  }
}

export function formatOpeningHours(hours: OpeningHours) {
  return hours.map((day) => ({
    weekday: WEEKDAY_LABELS[day.weekday],
    hours:
      day.opensAt === null || day.closesAt === null
        ? 'Stängt'
        : `${day.opensAt}–${day.closesAt}`,
  }));
}

export function getMapUrl(info: PublicWorkshopInfo): string {
  const address = `${info.workshop.address}, ${info.workshop.postalCode} ${info.workshop.city}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function getTelephoneHref(phone: string): string {
  return `tel:${phone.replaceAll(/[^+\d]/g, '')}`;
}

export function serialiseJsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
