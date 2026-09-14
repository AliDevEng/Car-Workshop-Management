import type { LucideIcon } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * A section frontend/README.md's phase hand-off explicitly defers to a later
 * iteration (F6.2.3, F6.2.5, F6.4.2, F6.4.4, F6.4.5, F6.4.6).
 *
 * Not an {@link EmptyState}: an empty state says "there is nothing here yet,
 * but there could be" about live data. This says the opposite — the section
 * cannot be live yet, on purpose, because the iteration that would wire it up
 * has not run — and F6.6.4 asks that to stay visible rather than being
 * silently counted as delivered. Naming the iteration is the point: it is
 * what stops a reserved placeholder from being read as a bug.
 */
export function ReservedSection({
  icon: Icon,
  title,
  message,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly message: string;
}) {
  return (
    <Card className="rounded-soft border-dashed">
      <CardHeader className="gap-2">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-sharp border border-dashed border-border">
            <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription>{message}</CardDescription>
      </CardContent>
    </Card>
  );
}
