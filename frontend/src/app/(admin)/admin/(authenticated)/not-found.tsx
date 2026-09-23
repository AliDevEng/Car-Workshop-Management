import { FileQuestionIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/admin/states';
import { PageHeader } from '@/components/admin/page-header';

/**
 * The admin panel's own 404 (UI_UX_AUDIT G6, F12.4.1).
 *
 * Placed inside the authenticated segment so it renders *within* the shell:
 * Next's default is a white, English page with no navigation, which reads as
 * "the application broke" rather than "that page does not exist", and all
 * user-facing text in this project is Swedish (CLAUDE.md).
 */
export default function AdminNotFound() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: 'Admin', href: '/admin' }]}
        title="Sidan finns inte"
      />
      <div className="rounded-soft border border-border bg-card">
        <EmptyState
          icon={FileQuestionIcon}
          message="Adressen leder ingenstans. Länken kan vara gammal, eller så har posten tagits bort."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin">Till översikten</Link>
            </Button>
          }
        />
      </div>
    </div>
  );
}
