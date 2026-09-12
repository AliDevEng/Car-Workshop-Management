import type { ReactElement } from 'react';
import {
  Document,
  Page,
  Text,
  View,
  type DocumentProps,
} from '@react-pdf/renderer';
import {
  CHECKLIST_RESULT_LABELS,
  UNIT_LABELS,
  WORK_ORDER_LINE_TYPE_LABELS,
  type ChecklistAnswer,
} from 'shared';
import { formatDate, formatOdometerMil, formatQuantity } from '../format.js';
import type {
  ServiceProtocolPayload,
  ServiceProtocolPayloadLine,
} from '../payload.js';
import { PDF_CREATOR, PDF_PRODUCER } from '../renderer.js';
import { styles } from '../theme.js';
import {
  DocumentFooter,
  DocumentHeader,
  DocumentTable,
  FieldBlock,
  type TableColumn,
} from './layout.js';

/**
 * The service protocol PDF (PROJECT_SPEC.md §6.7, §8.3; B8.3).
 *
 * Renders through the same layout primitives as `QuoteDocument` — B7.1.4's
 * `DocumentHeader`/`DocumentFooter`/`DocumentTable`/`FieldBlock` — on purpose:
 * a workshop's two documents should look like they came from the same
 * workshop, and **it renders from `ServiceProtocolPayload` and nothing else**,
 * for the same reproducibility reason `QuoteDocument` does (§4.2, B0.10.1).
 */

const LINE_COLUMNS: readonly TableColumn<ServiceProtocolPayloadLine>[] = [
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
    flex: 1.2,
    align: 'right',
    render: (line) =>
      `${formatQuantity(line.quantity)} ${UNIT_LABELS[line.unit]}`,
  },
  {
    key: 'articleSku',
    heading: 'Artikelnr',
    flex: 1.3,
    align: 'right',
    render: (line) => line.articleSku ?? '—',
  },
];

const CHECKLIST_COLUMNS: readonly TableColumn<ChecklistAnswer>[] = [
  {
    key: 'label',
    heading: 'Kontrollpunkt',
    flex: 3,
    render: (answer) => answer.label,
  },
  {
    key: 'result',
    heading: 'Resultat',
    flex: 1.3,
    render: (answer) => CHECKLIST_RESULT_LABELS[answer.result],
  },
  {
    key: 'note',
    heading: 'Anmärkning',
    flex: 3,
    render: (answer) => answer.note ?? '',
  },
];

function CustomerBlock(props: {
  readonly customer: ServiceProtocolPayload['customer'];
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
  readonly vehicle: ServiceProtocolPayload['vehicle'];
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

function WorkBlock(props: {
  readonly payload: ServiceProtocolPayload;
}): ReactElement {
  const { payload } = props;

  return (
    <FieldBlock heading="Uppgifter om utförandet">
      <Text>Mätarställning: {formatOdometerMil(payload.odometerKm)}</Text>
      <Text>Mekaniker: {payload.mechanicName}</Text>
      <Text>Datum: {formatDate(payload.performedAt.slice(0, 10))}</Text>
    </FieldBlock>
  );
}

function NextService(props: {
  readonly payload: ServiceProtocolPayload;
}): ReactElement | null {
  const { nextServiceDueKm, nextServiceDueDate } = props.payload;

  if (nextServiceDueKm === null && nextServiceDueDate === null) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>Nästa service</Text>
      {nextServiceDueKm === null ? null : (
        <Text>Vid: {formatOdometerMil(nextServiceDueKm)}</Text>
      )}
      {nextServiceDueDate === null ? null : (
        <Text>Senast: {formatDate(nextServiceDueDate)}</Text>
      )}
    </View>
  );
}

/** B8.3.2: a signature area for the mechanic. */
function SignatureArea(props: {
  readonly mechanicName: string;
}): ReactElement {
  return (
    <View style={[styles.section, { marginTop: 24 }]}>
      <View style={[styles.rule, { marginBottom: 6, width: 220 }]} />
      <Text style={styles.label}>
        Mekanikerns signatur — {props.mechanicName}
      </Text>
    </View>
  );
}

export function ServiceProtocolDocument(
  payload: ServiceProtocolPayload,
): ReactElement<DocumentProps> {
  return (
    <Document
      title={`Serviceprotokoll ${payload.number}`}
      author={payload.workshop.name}
      subject={`Serviceprotokoll för ${payload.vehicle.registrationNumberDisplay}`}
      // Pinned from the payload, never from the clock — see `QuoteDocument`
      // and B0.10.1 for why this is what makes a re-render byte-identical.
      creationDate={new Date(payload.generatedAt)}
      modificationDate={new Date(payload.generatedAt)}
      producer={PDF_PRODUCER}
      creator={PDF_CREATOR}
      language="sv-SE"
    >
      <Page size="A4" style={styles.page}>
        <DocumentHeader
          workshop={payload.workshop}
          title="Serviceprotokoll"
          number={payload.number}
          meta={[
            ['Datum', formatDate(payload.performedAt.slice(0, 10))],
            ...(payload.workOrder.number === null
              ? []
              : ([['Arbetsorder', payload.workOrder.number]] as const)),
          ]}
        />

        <View style={[styles.row, styles.section]}>
          <CustomerBlock customer={payload.customer} />
          <VehicleBlock vehicle={payload.vehicle} />
          <WorkBlock payload={payload} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Avser</Text>
          <Text>{payload.workOrder.description}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Utfört arbete</Text>
          <DocumentTable
            columns={LINE_COLUMNS}
            rows={payload.lines}
            // The index, not `sortOrder`: the payload's order **is** the
            // document's order (see `QuoteDocument` for why `sortOrder` alone
            // is not a safe key).
            rowKey={(_line, index) => String(index)}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Checklista</Text>
          <DocumentTable
            columns={CHECKLIST_COLUMNS}
            rows={payload.checklist}
            rowKey={(answer) => answer.key}
          />
        </View>

        {payload.notes === null || payload.notes === '' ? null : (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Anteckningar</Text>
            <Text>{payload.notes}</Text>
          </View>
        )}

        <NextService payload={payload} />

        <SignatureArea mechanicName={payload.mechanicName} />

        <DocumentFooter workshop={payload.workshop} />
      </Page>
    </Document>
  );
}
