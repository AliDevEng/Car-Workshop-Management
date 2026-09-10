import type { ReactNode } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { WorkshopDetails } from 'shared';
import { COLOURS, styles } from '../theme.js';

/**
 * The layout primitives every document shares (B7.1.4).
 *
 * A header carrying the workshop's details, a footer with page numbers, and a
 * table. B8's service protocol renders through exactly these, which is the
 * point: a workshop's two documents should look like they came from the same
 * workshop, and that only stays true if the header is one component rather
 * than two that started identical.
 */

// --- Header ------------------------------------------------------------------

export type DocumentHeaderProps = {
  readonly workshop: WorkshopDetails;
  /** `Offert` / `Serviceprotokoll` — the Swedish name of the document (§9.7). */
  readonly title: string;
  readonly number: string;
  /** `[label, value]` pairs shown under the number — issued date, validity. */
  readonly meta: readonly (readonly [string, string])[];
};

export function DocumentHeader(props: DocumentHeaderProps): ReactNode {
  const { workshop, title, number, meta } = props;

  return (
    <View>
      <View style={styles.spread}>
        <View style={styles.column}>
          <Text style={styles.strong}>{workshop.name}</Text>
          <Text style={styles.label}>{workshop.address}</Text>
          <Text style={styles.label}>
            {workshop.postalCode} {workshop.city}
          </Text>
          <Text style={styles.label}>{workshop.phone}</Text>
          <Text style={styles.label}>{workshop.email}</Text>
          <Text style={styles.label}>Org.nr {workshop.orgNumber}</Text>
        </View>

        <View style={[styles.column, { alignItems: 'flex-end' }]}>
          <Text style={styles.documentTitle}>{title}</Text>
          <Text style={styles.strong}>{number}</Text>
          {meta.map(([label, value]) => (
            <Text key={label} style={styles.label}>
              {label}: {value}
            </Text>
          ))}
        </View>
      </View>

      <View style={[styles.rule, { marginTop: 12 }]} />
    </View>
  );
}

// --- Footer ------------------------------------------------------------------

export type DocumentFooterProps = {
  readonly workshop: WorkshopDetails;
};

/**
 * `fixed` repeats it on every page, and the page numbers come from
 * `render`, which react-pdf calls once per page after layout — the only way to
 * know a total that depends on how the content broke.
 */
export function DocumentFooter(props: DocumentFooterProps): ReactNode {
  const { workshop } = props;

  return (
    <View style={styles.footer} fixed>
      <Text>
        {workshop.name} · Org.nr {workshop.orgNumber} · {workshop.phone}
      </Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `Sida ${String(pageNumber)} av ${String(totalPages)}`
        }
      />
    </View>
  );
}

// --- Labelled blocks ---------------------------------------------------------

export type FieldBlockProps = {
  readonly heading: string;
  readonly children: ReactNode;
};

export function FieldBlock(props: FieldBlockProps): ReactNode {
  return (
    <View style={[styles.column, { flexGrow: 1, flexBasis: 0 }]}>
      <Text style={styles.sectionHeading}>{props.heading}</Text>
      {props.children}
    </View>
  );
}

// --- Table -------------------------------------------------------------------

/**
 * A column declaration. `flex` distributes the row's width and `align` decides
 * whether the cell is a label or a figure — every numeric column is
 * right-aligned, without which a price column cannot be scanned (§9.3).
 */
export type TableColumn<Row> = {
  readonly key: string;
  readonly heading: string;
  readonly flex: number;
  readonly align?: 'left' | 'right';
  readonly render: (row: Row) => string;
};

export type DocumentTableProps<Row> = {
  readonly columns: readonly TableColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row, index: number) => string;
};

function cellStyle<Row>(column: TableColumn<Row>): {
  flexGrow: number;
  flexShrink: number;
  flexBasis: number;
  paddingRight: number;
} {
  return {
    flexGrow: column.flex,
    flexShrink: 1,
    // `flexBasis: 0` rather than `auto`: with `auto`, a long description takes
    // its content width first and the declared ratios only divide what is
    // left, so one wordy line silently re-columns the whole table.
    flexBasis: 0,
    paddingRight: 6,
  };
}

export function DocumentTable<Row>(props: DocumentTableProps<Row>): ReactNode {
  const { columns, rows, rowKey } = props;

  return (
    <View>
      {/* `fixed` repeats the head after a page break, so a second page of
          lines is still readable as a table rather than as loose figures. */}
      <View style={styles.tableHead} fixed>
        {columns.map((column) => (
          <Text
            key={column.key}
            style={[
              styles.cellHead,
              cellStyle(column),
              column.align === 'right' ? styles.numeric : {},
            ]}
          >
            {column.heading}
          </Text>
        ))}
      </View>

      {rows.map((row, index) => (
        // `wrap={false}` keeps one line whole: a row split across a page
        // boundary puts a description on one page and its price on the next.
        <View key={rowKey(row, index)} style={styles.tableRow} wrap={false}>
          {columns.map((column) => (
            <Text
              key={column.key}
              style={[
                styles.cell,
                cellStyle(column),
                column.align === 'right' ? styles.numeric : {},
              ]}
            >
              {column.render(row)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

// --- Totals ------------------------------------------------------------------

export type TotalRowProps = {
  readonly label: string;
  readonly value: string;
  readonly emphasis?: boolean;
};

export function TotalRow(props: TotalRowProps): ReactNode {
  const { label, value, emphasis = false } = props;

  return (
    <View
      style={[
        styles.spread,
        {
          paddingVertical: 4,
          paddingHorizontal: 6,
          ...(emphasis ? { backgroundColor: COLOURS.wash, marginTop: 2 } : {}),
        },
      ]}
    >
      <Text style={emphasis ? styles.strong : {}}>{label}</Text>
      <Text style={emphasis ? styles.strong : {}}>{value}</Text>
    </View>
  );
}
