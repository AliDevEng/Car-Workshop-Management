import { CarFrontIcon, ClipboardListIcon, WrenchIcon } from 'lucide-react';
import { EmptyState } from '@/components/admin/states';
import { DetailLayout } from '@/components/admin/detail-layout';
import { ListPage } from '@/components/admin/list-page';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';

export default function AdminOverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={<span>Admin / Översikt</span>}
        title="Adminpanelen"
        description="Här samlas dagens arbete när dashboarden kopplas in i F5."
        actions={
          <Button variant="secondary" size="sm">
            <WrenchIcon aria-hidden="true" />
            Ny arbetsorder
          </Button>
        }
      />

      <DetailLayout
        main={
          <ListPage
            filters={
              <div className="flex min-h-11 items-center text-sm text-muted-foreground">
                Filter och dashboardkort kopplas till riktiga data i F5.
              </div>
            }
            table={
              <EmptyState
                icon={ClipboardListIcon}
                message="Inga dashboardrader är kopplade än. Använd sökfältet för att öppna kunder och fordon."
              />
            }
          />
        }
        aside={
          <section className="rounded-sharp border border-border bg-card p-4">
            <h2 className="font-medium">Snabbt vidare</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Bokningar, kunder, fordon och lager får sina listor i kommande
              iterationer.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button asChild variant="secondary" size="sm">
                <a href="/admin/fordon">
                  <CarFrontIcon aria-hidden="true" />
                  Fordon
                </a>
              </Button>
            </div>
          </section>
        }
      />
    </div>
  );
}
