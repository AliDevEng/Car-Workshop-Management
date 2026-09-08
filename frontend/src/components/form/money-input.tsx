'use client';

import type { Ore } from 'shared';
import { formatCurrency } from '@/lib/format';
import { formatOreForInput, parseKronorToOre } from '@/lib/form/money-input';
import {
  ConvertingInput,
  type ConvertingInputProps,
  type FailureMessages,
} from './converting-input';

const MESSAGES: FailureMessages = {
  empty: 'Ange ett belopp.',
  malformed: 'Ange beloppet med siffror, till exempel 1 250,50.',
  precision: 'Ett belopp har högst två decimaler.',
  range: 'Beloppet är för stort.',
};

/**
 * Kronor in, öre out (F1.3.4).
 *
 * The preview line is doing real work here rather than reassuring: `1,500`
 * is read as a thousands group because öre have two decimals, and a user who
 * meant one and a half kronor sees `1 500,00 kr` under the field
 * immediately. Guessing silently on a price field is a 1000× error.
 */
export type MoneyInputProps = Omit<
  ConvertingInputProps<Ore>,
  'parse' | 'format' | 'preview' | 'messages'
>;

export function MoneyInput({ value, onChange, ...props }: MoneyInputProps) {
  return (
    <ConvertingInput<Ore>
      {...props}
      value={value}
      onChange={onChange}
      parse={parseKronorToOre}
      format={formatOreForInput}
      preview={formatCurrency}
      messages={MESSAGES}
      // `decimal` rather than `numeric`: a phone keyboard then offers the
      // separator key, and `type="number"` is avoided entirely because it
      // rejects a comma outright in several browsers.
      inputMode="decimal"
      autoComplete="off"
    />
  );
}
