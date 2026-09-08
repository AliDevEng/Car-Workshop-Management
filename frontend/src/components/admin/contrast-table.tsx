'use client';

import { useEffect, useRef, useState } from 'react';
import {
  contrastLevel,
  contrastRatio,
  formatRatio,
  parseHex,
  type ContrastLevel,
} from '@/lib/contrast';
import { Badge } from '@/components/ui/badge';

/**
 * F1.6.2: colour tokens shown with their **measured** contrast ratios.
 *
 * The values are read out of the live document with `getComputedStyle`
 * rather than copied into a table here. A hard-coded copy of the palette is
 * a second source of truth that drifts the first time someone adjusts a
 * token, and it would then report passing ratios for colours the application
 * no longer uses. Measuring the rendered result cannot drift.
 *
 * It also means this table works inside `.admin-scope` and outside it and
 * reports different, correct numbers for each — which is the whole reason
 * the status inks are surface-dependent.
 */

interface Pair {
  readonly label: string;
  readonly foreground: string;
  readonly background: string;
  readonly note?: string;
}

const PAIRS: readonly Pair[] = [
  { label: 'Brödtext', foreground: '--foreground', background: '--background' },
  {
    label: 'Dämpad text',
    foreground: '--muted-foreground',
    background: '--background',
  },
  {
    label: 'Text på kort',
    foreground: '--card-foreground',
    background: '--card',
  },
  {
    label: 'Primär knapp',
    foreground: '--primary-foreground',
    background: '--primary',
  },
  {
    label: 'Destruktiv text',
    foreground: '--destructive',
    background: '--background',
  },
  { label: 'Länk', foreground: '--link', background: '--background' },
  {
    label: 'Länk på kort',
    foreground: '--link',
    background: '--card',
  },
  {
    label: 'Fokusring',
    foreground: '--ring',
    background: '--background',
    note: 'Icke-text: kravet är 3:1',
  },
  {
    label: 'Status — aktiv',
    foreground: '--status-signal',
    background: '--background',
  },
  {
    label: 'Status — uppmärksamhet',
    foreground: '--status-hivis',
    background: '--background',
  },
  {
    label: 'Status — fel',
    foreground: '--status-oxide',
    background: '--background',
  },
  {
    label: 'Status — klar',
    foreground: '--status-moss',
    background: '--background',
  },
];

/** `rgb(28, 43, 51)` or `#1c2b33` → a hex string `lib/contrast` can read. */
function toHex(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) {
    return trimmed;
  }
  const numbers = trimmed.match(/\d+(\.\d+)?/g);
  if (numbers === null || numbers.length < 3) {
    return undefined;
  }
  const [r = '0', g = '0', b = '0'] = numbers;
  const channel = (part: string): string =>
    Math.round(Number(part)).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

interface Measured extends Pair {
  readonly foregroundHex: string;
  readonly backgroundHex: string;
  readonly ratio: number;
  readonly level: ContrastLevel;
}

const LEVEL_TONE: Readonly<Record<ContrastLevel, 'moss' | 'hivis' | 'oxide'>> =
  {
    AAA: 'moss',
    AA: 'moss',
    'AA-large': 'hivis',
    fail: 'oxide',
  };

export function ContrastTable() {
  const container = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<readonly Measured[]>([]);

  useEffect(() => {
    const element = container.current;
    if (element === null) {
      return;
    }
    // Resolved against this element, so the numbers describe the surface the
    // table is actually sitting on.
    const styles = getComputedStyle(element);

    setMeasured(
      PAIRS.flatMap((pair) => {
        const foregroundHex = toHex(styles.getPropertyValue(pair.foreground));
        const backgroundHex = toHex(styles.getPropertyValue(pair.background));
        if (foregroundHex === undefined || backgroundHex === undefined) {
          return [];
        }
        const foreground = parseHex(foregroundHex);
        const background = parseHex(backgroundHex);
        if (foreground === undefined || background === undefined) {
          return [];
        }
        const ratio = contrastRatio(foreground, background);
        return [
          {
            ...pair,
            foregroundHex,
            backgroundHex,
            ratio,
            level: contrastLevel(ratio),
          },
        ];
      }),
    );
  }, []);

  return (
    <div ref={container} className="overflow-x-auto">
      <table data-testid="contrast-table" className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="py-2 pr-4 font-medium">
              Par
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Prov
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Färger
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Kontrast
            </th>
            <th scope="col" className="py-2 font-medium">
              Nivå
            </th>
          </tr>
        </thead>
        <tbody>
          {measured.map((row) => (
            <tr key={row.label} className="border-b border-border/50">
              <th scope="row" className="py-2 pr-4 text-left font-normal">
                {row.label}
                {row.note === undefined ? null : (
                  <span className="block text-xs text-muted-foreground">
                    {row.note}
                  </span>
                )}
              </th>
              <td className="py-2 pr-4">
                <span
                  className="inline-block rounded-sharp px-2 py-1"
                  style={{
                    color: row.foregroundHex,
                    backgroundColor: row.backgroundHex,
                  }}
                >
                  Åäö 1 234,50
                </span>
              </td>
              <td className="py-2 pr-4 font-mono text-xs tabular-nums text-muted-foreground">
                {row.foregroundHex} / {row.backgroundHex}
              </td>
              <td className="py-2 pr-4 tabular-nums">
                {formatRatio(row.ratio)}
              </td>
              <td className="py-2">
                <Badge tone={LEVEL_TONE[row.level]}>{row.level}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {measured.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">Mäter kontrast…</p>
      ) : null}
    </div>
  );
}
