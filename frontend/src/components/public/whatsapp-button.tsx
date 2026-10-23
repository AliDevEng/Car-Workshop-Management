import { MessageCircle } from 'lucide-react';
import { getWhatsAppUrl } from '@/lib/public/workshop';

export function WhatsAppButton({ phone }: { readonly phone: string }) {
  return (
    <a
      href={getWhatsAppUrl(phone)}
      className="whatsapp-button"
      target="_blank"
      rel="noreferrer"
      aria-label={`Skriv till oss på WhatsApp, ${phone}`}
    >
      <MessageCircle aria-hidden="true" className="size-5" />
      <span>WhatsApp</span>
    </a>
  );
}
