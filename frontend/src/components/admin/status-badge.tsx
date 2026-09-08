import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleXIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  STATUS_PRESENTATION,
  type IconName,
  type StatusDescriptor,
} from './status';

const ICONS: Readonly<Record<IconName, LucideIcon>> = {
  'circle-dashed': CircleDashedIcon,
  'circle-dot': CircleDotIcon,
  'triangle-alert': TriangleAlertIcon,
  'circle-x': CircleXIcon,
  'circle-check': CircleCheckIcon,
};

/**
 * A status, rendered the same way everywhere (F1.4.3).
 *
 * Takes a {@link StatusDescriptor} rather than a raw enum value, so the
 * mapping from domain status to colour happens in `status.ts` and cannot be
 * re-decided here. Colour, text and icon together — never colour alone.
 */
export function StatusBadge({
  status,
  className,
}: {
  readonly status: StatusDescriptor;
  readonly className?: string;
}) {
  const { tone, icon } = STATUS_PRESENTATION[status.meaning];
  const Icon = ICONS[icon];

  return (
    <Badge tone={tone} className={cn('gap-1.5', className)}>
      <Icon aria-hidden="true" />
      {status.label}
    </Badge>
  );
}
