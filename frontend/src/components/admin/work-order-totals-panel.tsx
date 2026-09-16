import { ore, type DocumentTotalsDto } from 'shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/format/currency';

/**
 * F9.4 — the sticky totals panel. Every figure comes straight from
 * `documentTotalsSchema`, computed once in `shared/work-order-totals.ts` and
 * never recalculated here (CLAUDE.md, §3.3): the screen cannot disagree with
 * the PDF a quote or protocol will later print from the same numbers.
 */
export function WorkOrderTotalsPanel({
  totals,
}: {
  readonly totals: DocumentTotalsDto;
}) {
  return (
    <Card className="rounded-soft">
      <CardHeader>
        <CardTitle>Summering</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Netto</span>
          <span className="tabular-nums">
            {formatCurrency(ore(totals.netOre))}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Moms</span>
          <span className="tabular-nums">
            {formatCurrency(ore(totals.vatOre))}
          </span>
        </div>
        {totals.roundingOre === 0 ? null : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Öresavrundning</span>
            <span className="tabular-nums">
              {formatCurrency(ore(totals.roundingOre))}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-base font-semibold">
          <span>Att betala</span>
          <span className="tabular-nums">
            {formatCurrency(ore(totals.roundedGrossOre))}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
