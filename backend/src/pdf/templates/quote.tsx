import type { ReactElement } from 'react';
import {
  Document,
  Page,
  Text,
  View,
  type DocumentProps,
} from '@react-pdf/renderer';
import { UNIT_LABELS, WORK_ORDER_LINE_TYPE_LABELS, ore } from 'shared';
import {
  formatDate,
  formatOre,
  formatOreWithUnit,
  formatQuantity,
  formatVatRate,
} from '../format.js';
import type { QuotePayload, QuotePayloadLine } from '../payload.js';
import { PDF_CREATOR, PDF_PRODUCER } from '../renderer.js';
import { styles } from '../theme.js';
import {
  DocumentFooter,
  DocumentHeader,
  DocumentTable,
  FieldBlock,
  TotalRow,
  type TableColumn,
} from './layout.js';

/**
 * The quote PDF (PROJECT_SPEC.md §6.6, §8.3; B7.4).
 *
 * **It renders from `QuotePayload` and from nothing else.** No database, no
 * live customer row, no `Date.now()`. That is what makes the document
 * reproducible from `payloadJson` three years later (§4.2) and what makes
 * B0.10.1's byte-identical regeneration possible at all: every varying input
 * is in the payload, so two renders of one payload have nothing left to differ
 * on.
 */

const LINE_COLUMNS: readonly TableColumn<QuotePayloadLine>[] = [
  {
    key: 'description',
    heading: 'Beskrivning',
    flex: 4,
    render: (line) => line.description,
  },
  {
    key: 'type',
    heading: 'Typ',
    flex: 1.2,
    render: (line) => WORK_ORDER_LINE_TYPE_LABELS[line.type],
  },
  {
    key: 'quantity',
    heading: 'Antal',
    flex: 1.1,
    align: 'right',
    render: (line) =>
      `${formatQuantity(line.quantity)} ${UNIT_LABELS[line.unit]}`,
  },
  {
    key: 'unitPrice',
    heading: 'À-pris',
    flex: 1.2,
    align: 'right',
    render: (line) => formatOre(ore(line.unitPriceOre)),
  },
  {
    key: 'vat',
    heading: 'Moms',
    flex: 0.8,
    align: 'right',
    render: (line) => formatVatRate(line.vatRateBps),
  },
  {
    key: 'net',
    heading: 'Summa exkl. moms',
    flex: 1.5,
    align: 'right',
    render: (line) => formatOre(ore(line.totals.netOre)),
  },
];

function CustomerBlock(props: {
  readonly customer: QuotePayload['customer'];
}): ReactElement {
  const { customer } = props;

  return (
    <FieldBlock heading="Kund">
      <Text style={styles.strong}>{customer.name}</Text>
      {customer.orgNumber === null ? null : (
        <Text>Org.nr {customer.orgNumber}</Text>
      )}
      {customer.address === null ? null : <Text>{customer.address}</Text>}
      <Text>{customer.phone}</Text>
      {customer.email === null ? null : <Text>{customer.email}</Text>}
    </FieldBlock>
  );
}

function VehicleBlock(props: {
  readonly vehicle: QuotePayload['vehicle'];
}): ReactElement {
  const { vehicle } = props;

  return (
    <FieldBlock heading="Fordon">
      <Text style={styles.strong}>{vehicle.registrationNumberDisplay}</Text>
      <Text>
        {vehicle.make} {vehicle.model}
        {vehicle.modelYear === null ? '' : ` (${String(vehicle.modelYear)})`}
      </Text>
      {vehicle.vin === null ? null : <Text>VIN {vehicle.vin}</Text>}
    </FieldBlock>
  );
}

/**
 * The VAT summary, one row per rate (B7.4.1).
 *
 * Every figure is a sum of already-rounded line values, computed once in
 * `quotes/payload.ts` and carried in the payload — never recomputed from the
 * document net, which is §3.3's trap and differs by öre.
 */
function VatSummary(props: {
  readonly rows: QuotePayload['vatSummary'];
}): ReactElement {
  return (
    <View style={[styles.column, { flexGrow: 1, flexBasis: 0 }]}>
      <Text style={styles.sectionHeading}>Momssammanställning</Text>
      {props.rows.map((row) => (
        <View key={String(row.vatRateBps)} style={styles.spread}>
          <Text style={styles.label}>
            {formatVatRate(row.vatRateBps)} på {formatOre(ore(row.netOre))}
          </Text>
          <Text>{formatOre(ore(row.vatOre))}</Text>
        </View>
      ))}
    </View>
  );
}

function Totals(props: {
  readonly totals: QuotePayload['totals'];
}): ReactElement {
  const { totals } = props;

  return (
    <View style={[styles.column, { flexGrow: 1, flexBasis: 0 }]}>
      <TotalRow
        label="Summa exkl. moms"
        value={formatOre(ore(totals.netOre))}
      />
      <TotalRow label="Moms" value={formatOre(ore(totals.vatOre))} />
      <TotalRow
        label="Summa inkl. moms"
        value={formatOre(ore(totals.grossOre))}
      />
      {/* Öresavrundning is its own line and comes from the stored field
          (B7.4.2). It is display-only and is never fed back into a line
          value (§3.3) — showing it is how the customer can check that the
          rounded total is the sum they were quoted plus a known öre. */}
      {totals.roundingOre === 0 ? null : (
        <TotalRow
          label="Öresavrundning"
          value={formatOre(ore(totals.roundingOre))}
        />
      )}
      <TotalRow
        label="Att betala"
        value={formatOreWithUnit(ore(totals.roundedGrossOre))}
        emphasis
      />
    </View>
  );
}

export function QuoteDocument(
  payload: QuotePayload,
): ReactElement<DocumentProps> {
  return (
    <Document
      title={`Offert ${payload.number}`}
      author={payload.workshop.name}
      subject={`Offert för ${payload.vehicle.registrationNumberDisplay}`}
      // Pinned from the payload, never from the clock (B7.4.4). B0.10.1
      // measured that this is the difference between two renders that match
      // and two that do not.
      creationDate={new Date(payload.generatedAt)}
      modificationDate={new Date(payload.generatedAt)}
      producer={PDF_PRODUCER}
      creator={PDF_CREATOR}
      language="sv-SE"
    >
      <Page size="A4" style={styles.page}>
        <DocumentHeader
          workshop={payload.workshop}
          title="Offert"
          number={payload.number}
          meta={[
            ['Datum', formatDate(payload.generatedAt.slice(0, 10))],
            ['Giltig till', formatDate(payload.validUntil)],
            ...(payload.workOrder.number === null
              ? []
              : ([['Arbetsorder', payload.workOrder.number]] as const)),
          ]}
        />

        <View style={[styles.row, styles.section]}>
          <CustomerBlock customer={payload.customer} />
          <VehicleBlock vehicle={payload.vehicle} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Avser</Text>
          <Text>{payload.workOrder.description}</Text>
        </View>

        <View style={styles.section}>
          <DocumentTable
            columns={LINE_COLUMNS}
            rows={payload.lines}
            // The index, not `sortOrder`: the payload's order **is** the
            // document's order, and a duplicated `sortOrder` — briefly
            // possible on the work order this was copied from — would collide
            // as a key and drop a line from the table.
            rowKey={(_line, index) => String(index)}
          />
        </View>

        <View style={[styles.row, styles.section]}>
          <VatSummary rows={payload.vatSummary} />
          <View style={{ width: 24 }} />
          <Totals totals={payload.totals} />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>
            Offerten är giltig till och med {formatDate(payload.validUntil)}.
            Priserna anges i svenska kronor. Angivna belopp är beräknade per rad
            och summerade därefter.
          </Text>
        </View>

        <DocumentFooter workshop={payload.workshop} />
      </Page>
    </Document>
  );
}
