import { CalendarClockIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function BookingBadge() {
  return (
    <Badge tone="neutral" className="hidden lg:inline-flex">
      <CalendarClockIcon aria-hidden="true" />
      Kopplas i F8
    </Badge>
  );
}
