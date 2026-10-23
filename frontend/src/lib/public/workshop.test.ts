import { describe, expect, it } from 'vitest';
import { getTelephoneHref, getWhatsAppUrl, WHATSAPP_MESSAGE } from './workshop';

describe('public workshop contact links', () => {
  it('turns a displayed Swedish number into a callable telephone link', () => {
    expect(getTelephoneHref('+46 765 79 54 90')).toBe('tel:+46765795490');
  });

  it('opens the international WhatsApp number with the standard message', () => {
    const url = new URL(getWhatsAppUrl('+46 737 01 84 04'));

    expect(url.origin).toBe('https://wa.me');
    expect(url.pathname).toBe('/46737018404');
    expect(url.searchParams.get('text')).toBe(WHATSAPP_MESSAGE);
  });
});
