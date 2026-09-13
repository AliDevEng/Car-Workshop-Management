import {
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  ValidationError,
  createServiceRuleInputSchema,
  type CreateServiceRuleInput,
  type ServiceRuleImportRow,
  type ServiceType,
} from 'shared';

/**
 * Bulk CSV import for service rules (F11.3.5, B9.7.3).
 *
 * Pure parsing and validation, no database access — the same split
 * `low-stock-csv.ts` draws, in the opposite direction: that module builds a
 * CSV for a human to open in Excel, this one reads one back. The separator is
 * `;` for the same reason (§Swedish Excel default), but there is no decimal
 * comma to undo here — every numeric column in a rule (a year, a kilometre
 * count, a month count) is a whole number.
 */

const SEPARATOR = ';';

const HEADER = [
  'Märke',
  'Modell',
  'Motorkod',
  'Årsmodell från',
  'Årsmodell till',
  'Tjänst',
  'Intervall km',
  'Intervall månader',
  'Anteckning',
  'Källa',
] as const;

const HEADER_ERROR = `Första raden måste vara rubrikraden: ${HEADER.join(SEPARATOR)}`;

/** Reverse of `SERVICE_TYPE_LABELS`, keyed by the lower-cased Swedish label. */
const SERVICE_TYPE_BY_LABEL = new Map<string, ServiceType>(
  SERVICE_TYPES.map((type) => [SERVICE_TYPE_LABELS[type].toLowerCase(), type]),
);

/**
 * Splits one CSV line into fields, honouring `"..."` quoting and the `""`
 * escape for a literal quote — the same grammar `low-stock-csv.ts` writes, read
 * back. Good enough for a column set that is names, codes and integers; it is
 * not a general RFC 4180 parser.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i] ?? '';

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === SEPARATOR) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);

  return fields;
}

function splitIntoRows(csv: string): string[] {
  // Strip a leading BOM (the export side writes one; Excel re-saves with one
  // too) and accept both CRLF and bare LF line endings.
  const withoutBom = csv.startsWith('\uFEFF') ? csv.slice(1) : csv;
  return withoutBom.split(/\r\n|\n/).filter((line) => line.length > 0);
}

function parseOptionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseOptionalInt(
  value: string,
  errors: string[],
  fieldLabel: string,
): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    errors.push(`${fieldLabel} måste vara ett heltal, fick "${trimmed}".`);
    return undefined;
  }
  return parsed;
}

function parseServiceType(
  value: string,
  errors: string[],
): ServiceType | undefined {
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();
  if ((SERVICE_TYPES as readonly string[]).includes(upper)) {
    return upper as ServiceType;
  }
  const byLabel = SERVICE_TYPE_BY_LABEL.get(trimmed.toLowerCase());
  if (byLabel !== undefined) {
    return byLabel;
  }
  errors.push(
    `Okänd tjänst "${trimmed}". Ange en av: ${SERVICE_TYPES.join(', ')}.`,
  );
  return undefined;
}

/**
 * Parses and validates every data row against `createServiceRuleInputSchema`
 * — the identical contract a single `POST /api/service-rules` uses, so a row
 * that would be accepted there is accepted here and vice versa (B9.7.4).
 *
 * Never throws on bad *data*: a malformed row is reported back as one
 * `INVALID` entry among the others, so one typo in row 40 does not hide every
 * other row's result. A malformed **header** is the one thing that aborts the
 * whole file — without the expected columns, "row 3, column 5" is meaningless.
 */
export function parseServiceRulesCsv(csv: string): ServiceRuleImportRow[] {
  const lines = splitIntoRows(csv);
  if (lines.length === 0) {
    throw new ValidationError(HEADER_ERROR);
  }

  const header = splitCsvLine(lines[0] ?? '').map((cell) => cell.trim());
  const headerMatches =
    header.length === HEADER.length &&
    header.every((cell, index) => cell === HEADER[index]);
  if (!headerMatches) {
    throw new ValidationError(HEADER_ERROR);
  }

  return lines.slice(1).map((line, index) => {
    const lineNumber = index + 2; // 1 is the header.
    const fields = splitCsvLine(line);
    const errors: string[] = [];

    const [
      make = '',
      model = '',
      engineCode = '',
      modelYearFromRaw = '',
      modelYearToRaw = '',
      serviceTypeRaw = '',
      intervalKmRaw = '',
      intervalMonthsRaw = '',
      note = '',
      sourceNote = '',
    ] = fields;

    if (fields.length !== HEADER.length) {
      errors.push(
        `Raden har ${String(fields.length)} fält, förväntade ${String(HEADER.length)}.`,
      );
    }

    const modelYearFrom = parseOptionalInt(
      modelYearFromRaw,
      errors,
      'Årsmodell från',
    );
    const modelYearTo = parseOptionalInt(
      modelYearToRaw,
      errors,
      'Årsmodell till',
    );
    const serviceType = parseServiceType(serviceTypeRaw, errors);
    const intervalKm = parseOptionalInt(intervalKmRaw, errors, 'Intervall km');
    const intervalMonths = parseOptionalInt(
      intervalMonthsRaw,
      errors,
      'Intervall månader',
    );

    const parsedModel = parseOptionalText(model);
    const parsedEngineCode = parseOptionalText(engineCode);
    const parsedNote = parseOptionalText(note);

    const candidate: Partial<CreateServiceRuleInput> = {
      make: make.trim(),
      ...(parsedModel === undefined ? {} : { model: parsedModel }),
      ...(parsedEngineCode === undefined
        ? {}
        : { engineCode: parsedEngineCode }),
      ...(modelYearFrom === undefined ? {} : { modelYearFrom }),
      ...(modelYearTo === undefined ? {} : { modelYearTo }),
      ...(serviceType === undefined ? {} : { serviceType }),
      ...(intervalKm === undefined ? {} : { intervalKm }),
      ...(intervalMonths === undefined ? {} : { intervalMonths }),
      ...(parsedNote === undefined ? {} : { note: parsedNote }),
      sourceNote: sourceNote.trim(),
    };

    if (errors.length > 0) {
      return {
        line: lineNumber,
        status: 'INVALID',
        errors,
        rule: candidate,
      };
    }

    const parsed = createServiceRuleInputSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        line: lineNumber,
        status: 'INVALID',
        errors: parsed.error.issues.map((issue) => issue.message),
        rule: candidate,
      };
    }

    return {
      line: lineNumber,
      status: 'VALID',
      errors: [],
      rule: parsed.data,
    };
  });
}
