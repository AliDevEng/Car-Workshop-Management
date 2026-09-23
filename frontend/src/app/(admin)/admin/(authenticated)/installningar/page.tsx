import { SettingsIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/admin/states';
import { PageHeader } from '@/components/admin/page-header';

export const metadata: Metadata = { title: 'Inställningar' };

/**
 * A placeholder, not the real screen. The navigation has carried
 * "Inställningar" since F4, and the route it points at did not exist — so the
 * item dropped the user out of the admin shell onto Next's own white,
 * English 404 (UI_UX_AUDIT G6).
 *
 * The item is kept rather than hidden because the navigation is also a map of
 * what the system will do. F11 replaces this file with workshop details,
 * opening hours, service rules and partner links.
 */
export default function InstallningarPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Inställningar' },
        ]}
        title="Inställningar"
        description="Verkstadens uppgifter, öppettider, serviceregler och partnerlänkar."
      />
      <div className="rounded-soft border border-border bg-card">
        <EmptyState
          icon={SettingsIcon}
          message="Inställningarna är under arbete och öppnas här när de är klara. Kontakta systemansvarig om något behöver ändras innan dess."
        />
      </div>
    </div>
  );
}
