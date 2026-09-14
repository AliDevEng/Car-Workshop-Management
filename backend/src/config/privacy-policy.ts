import { privacyPolicySchema, type PrivacyPolicy } from 'shared';

/**
 * `GET /api/public/privacy-policy` (PROJECT_SPEC.md §5.5, §6.1's
 * `/integritetspolicy`; B11.2.4).
 *
 * Content lives here rather than hard-coded into the frontend: it is a
 * statement about what *this backend* does with personal data — the same
 * facts §5.5 already fixes (data minimisation, retention windows,
 * anonymisation over deletion, salted IP hashing) — so the backend is the
 * source of truth for it, the same way it is for opening hours and the
 * workshop's own contact details (`config/settings.ts`).
 *
 * Parsed through its own schema at load time, exactly like
 * `DEFAULT_WORKSHOP_DETAILS`: a typo here is a failed import, not a surprise
 * on the public site.
 */
const PRIVACY_POLICY_UPDATED_AT = '2026-09-14T00:00:00.000Z';

export const PRIVACY_POLICY: PrivacyPolicy = privacyPolicySchema.parse({
  updatedAt: PRIVACY_POLICY_UPDATED_AT,
  sections: [
    {
      heading: 'Vilka uppgifter vi samlar in',
      body:
        'Vid en bokningsförfrågan sparar vi namn, telefonnummer, valfri ' +
        'e-postadress, registreringsnummer och ett fritextmeddelande — inget ' +
        'annat. Som kund hos verkstaden sparar vi även fordonets ' +
        'servicehistorik och de dokument som hör till uppdragen.',
    },
    {
      heading: 'Hur länge vi sparar uppgifterna',
      body:
        'Bokningsförfrågningar som avvisas eller markeras som skräppost ' +
        'anonymiseras automatiskt efter 90 dagar. Kunder utan uppdrag under de ' +
        'senaste 36 månaderna anonymiseras på samma sätt. Bokföringsunderlag ' +
        'sparas i sju år enligt bokföringslagen, men utan att peka ut vem de ' +
        'gäller.',
    },
    {
      heading: 'Rätten att bli glömd',
      body:
        'Du kan begära att dina uppgifter anonymiseras. Eftersom ' +
        'bokföringslagen kräver att vi behåller ekonomiska underlag i sju år ' +
        'raderar vi inte dina tidigare uppdrag, offerter och protokoll — vi ' +
        'tar i stället bort namn, telefonnummer, e-postadress och adress från ' +
        'kunduppgiften.',
    },
    {
      heading: 'Fordonsuppgifter',
      body:
        'Uppslag av registreringsnummer hämtar endast tekniska ' +
        'fordonsuppgifter, aldrig ägaruppgifter, från vår leverantör.',
    },
    {
      heading: 'IP-adresser',
      body:
        'Vi sparar aldrig en rå IP-adress. Vid en bokningsförfrågan sparas en ' +
        'saltad kontrollsumma, som gör det möjligt att upptäcka missbruk utan ' +
        'att kunna identifiera vem som skickade förfrågan.',
    },
  ],
});
