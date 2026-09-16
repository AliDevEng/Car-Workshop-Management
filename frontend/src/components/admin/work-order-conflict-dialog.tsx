'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface WorkOrderConflictChange {
  readonly label: string;
  readonly value: string;
}

/**
 * F9.6.2/F9.6.3 — shown when a header or status write comes back `409`
 * because `version` no longer matches (§6.5's optimistic lock). Lines are
 * never version-checked (F9.6.1), so this dialog is only ever reached from a
 * header field save or a status change.
 *
 * The unsaved attempt is shown rather than discarded silently (F9.6.3) —
 * "Fortsätt redigera" just closes the dialog, leaving that value exactly
 * where the user left it so they can retry once they have looked at what
 * changed; "Ladda om" refetches the order and gives it up.
 */
export function WorkOrderConflictDialog({
  open,
  onOpenChange,
  change,
  onReload,
  isReloading = false,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly change: WorkOrderConflictChange;
  readonly onReload: () => void;
  readonly isReloading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Arbetsordern har ändrats</DialogTitle>
          <DialogDescription>
            Någon annan har sparat en ändring på arbetsordern sedan den lästes
            in senast. Din ändring nedan är inte sparad.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-sharp border border-border p-3 text-sm">
          <p className="text-xs font-medium text-muted-foreground">
            Din osparade ändring
          </p>
          <p className="font-medium">{change.label}</p>
          <p className="text-muted-foreground">{change.value}</p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={isReloading}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Fortsätt redigera
          </Button>
          <Button
            type="button"
            variant="destructive"
            isPending={isReloading}
            onClick={onReload}
          >
            Ladda om
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
