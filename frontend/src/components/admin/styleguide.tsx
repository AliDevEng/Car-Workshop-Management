'use client';

import {
  BoxesIcon,
  CalendarDaysIcon,
  CarFrontIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  FileTextIcon,
  PackageIcon,
  SettingsIcon,
  UsersRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ore, type Ore } from 'shared';
import {
  accentEdge,
  accentInk,
  accentSurface,
  type Accent,
} from '@/components/admin/accent';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { ContrastTable } from '@/components/admin/contrast-table';
import { DataTable } from '@/components/admin/data-table';
import {
  notifyError,
  notifyInfo,
  notifySuccess,
  notifyWarning,
} from '@/components/admin/notify';
import {
  EmptyState,
  ErrorState,
  TableSkeleton,
} from '@/components/admin/states';
import { StatusBadge } from '@/components/admin/status-badge';
import {
  bookingRequestStatus,
  quoteStatus,
  workOrderStatus,
} from '@/components/admin/status';
import { MoneyInput } from '@/components/form/money-input';
import { OdometerInput } from '@/components/form/odometer-input';
import { QuantityInput } from '@/components/form/quantity-input';
import { RegNrInput } from '@/components/form/reg-nr-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError } from '@/lib/api';
import { formatCurrency, formatOdometer, formatRegNr } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * `/admin/styleguide` (F1.6.1): every component, in every state.
 *
 * It is a working page rather than a screenshot because the states that
 * actually break are the interactive ones — a focus ring against the wrong
 * background, a dialog that does not return focus, a button that changes
 * width when it starts loading. Those cannot be reviewed from a static
 * image, and this page is where the next eleven iterations come to check
 * what already exists before inventing something.
 */

function Section({
  title,
  id,
  children,
  description,
}: {
  readonly title: string;
  readonly id: string;
  readonly children: ReactNode;
  readonly description?: string;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div>
        <h2 id={id} className="type-display text-xl font-semibold">
          {title}
        </h2>
        {description === undefined ? null : (
          <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * One sample per category accent, with the icon that section actually uses,
 * so a drifted pairing shows up here rather than on a real screen.
 */
const ACCENT_SAMPLES: readonly {
  readonly accent: Accent;
  readonly label: string;
  readonly icon: LucideIcon;
}[] = [
  { accent: 'peach', label: 'Idag', icon: CheckCircle2Icon },
  { accent: 'blue', label: 'Planering', icon: CalendarDaysIcon },
  {
    accent: 'lilac',
    label: 'Arbetsordrar och dokument',
    icon: ClipboardListIcon,
  },
  { accent: 'rose', label: 'Kunder', icon: UsersRoundIcon },
  { accent: 'teal', label: 'Fordon', icon: CarFrontIcon },
  { accent: 'amber', label: 'Lager', icon: BoxesIcon },
  { accent: 'mint', label: 'Klart och hämtning', icon: FileTextIcon },
  { accent: 'neutral', label: 'Inställningar', icon: SettingsIcon },
];

function Row({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3">{children}</div>;
}

interface DemoRow {
  readonly id: string;
  readonly regNr: string;
  readonly customer: string;
  readonly amountOre: Ore;
  readonly odometerKm: number;
}

const DEMO_ROWS: readonly DemoRow[] = [
  {
    id: '1',
    regNr: 'ABC123',
    customer: 'Åsa Öberg',
    amountOre: ore(125050),
    odometerKm: 123456,
  },
  {
    id: '2',
    regNr: 'XYZ789',
    customer: 'Björn Ärlig',
    amountOre: ore(4900),
    odometerKm: 8900,
  },
  {
    id: '3',
    regNr: 'DEF45G',
    customer: 'Cecilia Ångström',
    amountOre: ore(1899900),
    odometerKm: 254010,
  },
];

export function Styleguide() {
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [amount, setAmount] = useState<Ore | null>(ore(125050));
  const [quantity, setQuantity] = useState<string | null>('2.5');
  const [odometer, setOdometer] = useState<number | null>(123456);
  const [regNr, setRegNr] = useState('ABC123');
  const [sort, setSort] = useState({
    column: 'customer',
    direction: 'asc' as const,
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-12 p-8">
      <header>
        <h1 className="type-display text-3xl font-bold">Stilguide</h1>
        <p className="mt-2 max-w-[68ch] text-muted-foreground">
          Komponentbiblioteket för adminpanelen. Varje komponent visas i alla
          sina lägen. Bygg inget nytt förrän du har tittat här.
        </p>
      </header>

      <Section
        id="colour"
        title="Färg och kontrast"
        description="Färg är information, inte dekoration. Kontrastvärdena nedan mäts i webbläsaren mot den yta sidan faktiskt använder."
      >
        <ContrastTable />
      </Section>

      <Section
        id="accents"
        title="Sektionsfärger"
        description="Färgfamiljen som säger vilken del av verkstaden du tittar på. Den är skild från status: en lila ikon för arbetsordrar betyder inte att ordern har en lila status, och en rosa kundikon är inte ett fel. Status uttrycks alltid med StatusBadge."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ACCENT_SAMPLES.map((sample) => (
            <div
              key={sample.accent}
              className={cn(
                'flex items-center gap-3 rounded-soft border p-4',
                accentSurface(sample.accent),
                accentEdge(sample.accent),
              )}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-soft bg-card">
                <sample.icon
                  aria-hidden="true"
                  className={cn('size-5', accentInk(sample.accent))}
                />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {sample.label}
                </span>
                <span className="block font-mono text-xs text-muted-foreground">
                  {sample.accent}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="admin-rail flex flex-col gap-2 rounded-soft p-4">
          <p className="text-sm font-medium">
            Navigationsskenan (<code>.admin-rail</code>)
          </p>
          <p className="text-sm text-muted-foreground">
            Samma semantiska lager, en nivå in. Primitiv som hamnar här — en
            knapp, en bricka, en fokusring — blir rätt utan att veta var de är.
          </p>
          <Row>
            <Button size="sm">Primär</Button>
            <Button variant="secondary" size="sm">
              Sekundär
            </Button>
            <Button variant="ghost" size="sm">
              Diskret
            </Button>
            <StatusBadge status={workOrderStatus('IN_PROGRESS')} />
            <StatusBadge status={workOrderStatus('READY_FOR_PICKUP')} />
          </Row>
        </div>
      </Section>

      <Section
        id="status"
        title="Status"
        description="Fem betydelser, fasta i hela systemet. Alltid färg, text och ikon tillsammans."
      >
        <Row>
          <StatusBadge status={workOrderStatus('DRAFT')} />
          <StatusBadge status={workOrderStatus('IN_PROGRESS')} />
          <StatusBadge status={workOrderStatus('AWAITING_PARTS')} />
          <StatusBadge status={workOrderStatus('READY_FOR_PICKUP')} />
          <StatusBadge status={workOrderStatus('COMPLETED')} />
          <StatusBadge status={workOrderStatus('CANCELLED')} />
        </Row>
        <Row>
          <StatusBadge status={bookingRequestStatus('PENDING')} />
          <StatusBadge status={bookingRequestStatus('CONFIRMED')} />
          <StatusBadge status={quoteStatus('SENT')} />
          <StatusBadge status={quoteStatus('EXPIRED')} />
          <StatusBadge status={quoteStatus('DECLINED')} />
        </Row>
      </Section>

      <Section
        id="typography"
        title="Typografi"
        description="Archivo för gränssnitt och all data, Source Serif 4 för publik brödtext. Siffror alltid med tabular-nums."
      >
        <div className="flex flex-col gap-2">
          <p className="type-display text-[49px] leading-tight font-bold">
            Åäö Verkstad 49
          </p>
          <p className="type-display text-[28px] font-semibold">
            Åäö Arbetsorder 28
          </p>
          <p className="text-base">Brödtext i adminpanelen, 16 px.</p>
          <p className="text-sm">Datatext, 14 px — täthet är poängen här.</p>
          <p className="font-body-public text-[18px] leading-[1.65]">
            Publik brödtext i Source Serif 4, 18 px med 1,65 radavstånd.
          </p>
          <p className="tabular-nums">
            1 234,50 kr · 8 999,00 kr · 18 999,00 kr
          </p>
        </div>
      </Section>

      <Section
        id="buttons"
        title="Knappar"
        description="Fyra varianter, tre storlekar. lg är 44 px — minsta träffyta för en surfplatta i verkstaden."
      >
        <Row>
          <Button variant="primary">Spara</Button>
          <Button variant="secondary">Avbryt</Button>
          <Button variant="outline">Filtrera</Button>
          <Button variant="ghost">Mer</Button>
          <Button variant="destructive">Ta bort</Button>
          <Button variant="link">Läs mer</Button>
        </Row>
        <Row>
          <Button size="sm">Liten</Button>
          <Button size="md">Mellan</Button>
          <Button size="lg">Stor — 44 px</Button>
        </Row>
        <Row>
          <Button disabled>Inaktiverad</Button>
          <Button variant="destructive" disabled>
            Inaktiverad
          </Button>
          <Button
            isPending={pending}
            onClick={() => {
              setPending(true);
              setTimeout(() => {
                setPending(false);
              }, 1500);
            }}
          >
            Klicka för att ladda
          </Button>
          <span className="text-xs text-muted-foreground">
            Bredden ändras inte när den laddar.
          </span>
        </Row>
      </Section>

      <Section
        id="forms"
        title="Formulär"
        description="Alla fyra konverterande fält visar vad de förstod. Både komma och punkt fungerar som decimaltecken."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-money">Pris</Label>
            <MoneyInput
              id="sg-money"
              value={amount}
              onChange={setAmount}
              placeholder="0,00"
            />
            <p className="text-xs text-muted-foreground tabular-nums">
              Skickas som {amount === null ? '—' : `${String(amount)} öre`}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-quantity">Antal</Label>
            <QuantityInput
              id="sg-quantity"
              value={quantity}
              onChange={setQuantity}
              unit="LITRE"
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground tabular-nums">
              Skickas som {quantity ?? '—'}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-odometer">Mätarställning (mil)</Label>
            <OdometerInput
              id="sg-odometer"
              value={odometer}
              onChange={setOdometer}
              placeholder="0,0"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-regnr">Registreringsnummer</Label>
            <RegNrInput id="sg-regnr" value={regNr} onChange={setRegNr} />
            <p className="text-xs text-muted-foreground">
              Lagras som {regNr === '' ? '—' : regNr}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-invalid">Fält med fel</Label>
            <Input
              id="sg-invalid"
              aria-invalid
              aria-describedby="sg-invalid-error"
              defaultValue="fel värde"
            />
            <p
              id="sg-invalid-error"
              role="alert"
              className="text-xs text-destructive"
            >
              Ange ett giltigt värde.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-disabled">Inaktiverat fält</Label>
            <Input id="sg-disabled" disabled defaultValue="Kan inte ändras" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-select">Enhet</Label>
            <Select defaultValue="PIECE">
              <SelectTrigger id="sg-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PIECE">Styck</SelectItem>
                <SelectItem value="LITRE">Liter</SelectItem>
                <SelectItem value="HOUR">Timme</SelectItem>
                <SelectItem value="KIT">Sats</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Section
        id="data"
        title="Tabeller"
        description="Sortering erbjuds bara på kolumner som API:t har deklarerat som sorterbara. Klicka en rad, eller använd piltangenter och Retur."
      >
        <DataTable
          caption="Exempel på arbetsordrar"
          columns={[
            {
              id: 'regNr',
              header: 'Reg.nr',
              cell: (row) => (
                <span className="font-medium tabular-nums">
                  {formatRegNr(row.regNr)}
                </span>
              ),
            },
            { id: 'customer', header: 'Kund', cell: (row) => row.customer },
            {
              id: 'odometer',
              header: 'Mätarställning',
              numeric: true,
              cell: (row) => formatOdometer(row.odometerKm),
            },
            {
              id: 'amount',
              header: 'Belopp',
              numeric: true,
              cell: (row) => formatCurrency(row.amountOre),
            },
          ]}
          rows={DEMO_ROWS}
          rowKey={(row) => row.id}
          // Only these two — `odometer` and `amount` deliberately have no
          // sort control, to show what an undeclared column looks like.
          sortableColumns={['customer', 'regNr']}
          sort={sort}
          onSortChange={(next) => {
            setSort({ column: next.column, direction: 'asc' });
          }}
          onRowActivate={(row) => {
            notifyInfo(`Öppnade ${formatRegNr(row.regNr)}`);
          }}
          pagination={{
            nextCursor: 'demo',
            onNext: () => {
              notifyInfo('Nästa sida');
            },
            onPrevious: () => {
              notifyInfo('Föregående sida');
            },
            canGoBack: false,
          }}
        />
      </Section>

      <Section
        id="states"
        title="Tomt, fel och laddning"
        description="Alla tre lägen finns för varje skärm — det är ett krav i §10, inte en ambition."
      >
        <Tabs defaultValue="empty">
          <TabsList>
            <TabsTrigger value="empty">Tomt</TabsTrigger>
            <TabsTrigger value="error">Fel</TabsTrigger>
            <TabsTrigger value="loading">Laddar</TabsTrigger>
          </TabsList>
          <TabsContent value="empty">
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={PackageIcon}
                  message="Inga artiklar än. Lägg till den första."
                  action={<Button size="sm">Ny artikel</Button>}
                />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="error">
            <Card>
              <CardContent className="p-0">
                <ErrorState
                  message="Kunde inte hämta artiklarna."
                  requestId="req-3f9a2c81"
                  onRetry={() => {
                    notifyInfo('Försöker igen');
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="loading">
            <Card>
              <CardContent className="p-0">
                <TableSkeleton />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Section>

      <Section
        id="feedback"
        title="Återkoppling"
        description="Fel försvinner inte av sig själva. Allt annat gör det."
      >
        <Row>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              notifySuccess('Arbetsordern är slutförd');
            }}
          >
            Lyckades
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              notifyInfo('Ändringen är sparad');
            }}
          >
            Information
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              notifyWarning('Lagersaldot är lågt');
            }}
          >
            Varning
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              notifyError(
                new ApiError({
                  code: 'CONFLICT',
                  message: 'Arbetsordern har ändrats av någon annan.',
                  requestId: 'req-91ba77de',
                }),
              );
            }}
          >
            Fel (stannar kvar)
          </Button>
        </Row>

        <Row>
          <Button
            variant="destructive"
            onClick={() => {
              setConfirmOpen(true);
            }}
          >
            Ta bort arbetsorder
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">Öppna panel</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Filtrera</SheetTitle>
                <SheetDescription>
                  Panelen fångar fokus och lämnar tillbaka det när den stängs.
                </SheetDescription>
              </SheetHeader>
              <div className="p-4">
                <Button size="lg">Knapp i panelen</Button>
              </div>
            </SheetContent>
          </Sheet>
        </Row>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Ta bort arbetsorder"
          description="Arbetsordern och dess rader tas bort. Det går inte att ångra."
          confirmLabel="Ta bort arbetsorder"
          onConfirm={() => {
            setConfirmOpen(false);
            notifySuccess('Arbetsordern är borttagen');
          }}
        />
      </Section>

      <Section
        id="cards"
        title="Ytor"
        description="Två radier med betydelse: skarpt för data, mjukt för innehåll."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Kort — mjuk radie</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Innehåll och berättande text.
            </CardContent>
          </Card>
          <div className="rounded-sharp border border-border bg-card p-4">
            <p className="text-sm font-medium">Datayta — skarp radie</p>
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">
              1 234,50 kr
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
