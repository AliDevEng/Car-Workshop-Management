import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface ReadOnlyColumn<Row> {
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  readonly numeric?: boolean;
}

export function ReadOnlyTable<Row>({
  rows,
  columns,
  rowKey,
  caption,
  empty,
}: {
  readonly rows: readonly Row[];
  readonly columns: readonly ReadOnlyColumn<Row>[];
  readonly rowKey: (row: Row) => string;
  readonly caption: string;
  readonly empty: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-sharp border border-border">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader className="bg-card">
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.header}
                className={column.numeric === true ? 'text-right' : undefined}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="p-0">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((column) => (
                  <TableCell
                    key={column.header}
                    className={
                      column.numeric === true
                        ? 'text-right tabular-nums'
                        : undefined
                    }
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
