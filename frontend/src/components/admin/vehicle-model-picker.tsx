'use client';

import { useMemo, type ChangeEvent } from 'react';
import {
  VEHICLE_CATALOGUE_OTHER,
  type VehicleMake,
  type VehicleModel,
} from 'shared';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useVehicleMakes } from '@/lib/api/vehicle-catalogue';

/**
 * Make, then model — two dropdowns over the seeded catalogue, with a free-text
 * field behind "Övrigt" in each.
 *
 * The catalogue covers the ten makes a Swedish workshop actually sees and the
 * eight models under each, which is most telephone calls answered in two
 * clicks instead of two spellings of "Volkswagen". **It is a shortcut, never a
 * gate:** choosing Övrigt in either list swaps that dropdown for a text input,
 * because a 1987 Saab must not be harder to book than a new Golf.
 *
 * The component's own state is the two selections; what it reports upward is
 * the resolved pair of strings, so its caller never learns that a catalogue
 * exists. That is what lets the same control sit on the vehicle form later
 * without either screen knowing about the other.
 */

export interface VehicleMakeModel {
  /** The resolved make, or `undefined` while nothing usable is chosen. */
  readonly make: string | undefined;
  readonly model: string | undefined;
}

export interface VehicleModelPickerValue {
  /** A make name from the catalogue, `OTHER`, or `''` for nothing chosen. */
  readonly makeChoice: string;
  /** The free-text make, used only while `makeChoice` is `OTHER`. */
  readonly makeText: string;
  readonly modelChoice: string;
  readonly modelText: string;
}

export const EMPTY_VEHICLE_MODEL_PICKER: VehicleModelPickerValue = {
  makeChoice: '',
  makeText: '',
  modelChoice: '',
  modelText: '',
};

/**
 * True when the model is entered as free text rather than chosen from a list.
 *
 * **Either** condition is enough, and that is the whole point: a make the
 * catalogue does not know has no model list to offer, so choosing "Övrigt" for
 * the *make* puts the model field into free text too, without the model
 * dropdown ever being touched.
 *
 * Exported so the component's rendering and
 * {@link resolveVehicleMakeModel}'s reading cannot disagree about it. They did:
 * the resolver used to test `modelChoice === OTHER` alone, so a Saab 9000
 * typed under an "Övrigt" make was **silently discarded** — `modelChoice` was
 * still `''`, the model never reached the request, and the vehicle was stored
 * as "Saab / Okänd modell". The e2e test did not catch it, because it asserted
 * the success toast rather than what was written; reading the row in the
 * database is what found it.
 */
export function isFreeTextModel(value: VehicleModelPickerValue): boolean {
  return (
    value.makeChoice === VEHICLE_CATALOGUE_OTHER ||
    value.modelChoice === VEHICLE_CATALOGUE_OTHER
  );
}

/**
 * The two strings a picker state resolves to.
 *
 * `undefined` rather than an empty string for "not chosen": the API's vehicle
 * branch omits `make`/`model` entirely rather than sending blanks, and the
 * placeholder names ("Okänt fabrikat") are the server's to apply, not a
 * client's to invent in two places.
 */
export function resolveVehicleMakeModel(
  value: VehicleModelPickerValue,
): VehicleMakeModel {
  const make =
    value.makeChoice === VEHICLE_CATALOGUE_OTHER
      ? value.makeText.trim()
      : value.makeChoice;
  const model = isFreeTextModel(value)
    ? value.modelText.trim()
    : value.modelChoice;

  return {
    make: make === '' ? undefined : make,
    model: model === '' ? undefined : model,
  };
}

export function VehicleModelPicker({
  value,
  onChange,
  disabled = false,
  idPrefix,
}: {
  readonly value: VehicleModelPickerValue;
  readonly onChange: (value: VehicleModelPickerValue) => void;
  readonly disabled?: boolean;
  /** Distinguishes the labels when two pickers share a page. */
  readonly idPrefix: string;
}) {
  const makesQuery = useVehicleMakes({ enabled: !disabled });
  const makes = useMemo(() => makesQuery.data?.data ?? [], [makesQuery.data]);

  const selectedMake = makes.find(
    (make: VehicleMake) => make.name === value.makeChoice,
  );
  const models = selectedMake?.models ?? [];
  const makeIsOther = value.makeChoice === VEHICLE_CATALOGUE_OTHER;

  /*
   * Derived, not written into state by an effect: the alternative is a
   * dropdown that shows a stale Volvo model list for one render after the make
   * changes. Shared with the resolver so the two cannot disagree about which
   * field holds the answer.
   */
  const modelIsFreeText = isFreeTextModel(value);

  function selectMake(next: string): void {
    // The model always clears with the make. Leaving "V70" selected under
    // Toyota is the kind of silent mismatch that reaches a printed protocol.
    onChange({
      ...EMPTY_VEHICLE_MODEL_PICKER,
      makeChoice: next,
      // The typed make survives a trip through the dropdown and back, so
      // re-opening it to check does not lose what was typed.
      makeText: value.makeText,
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" id={`${idPrefix}-make-label`}>
          Märke
        </span>
        <Select
          value={value.makeChoice}
          onValueChange={selectMake}
          disabled={disabled}
        >
          <SelectTrigger
            className="w-full"
            aria-labelledby={`${idPrefix}-make-label`}
          >
            <SelectValue placeholder="Välj märke" />
          </SelectTrigger>
          <SelectContent>
            {makes.map((make: VehicleMake) => (
              <SelectItem key={make.id} value={make.name}>
                {make.name}
              </SelectItem>
            ))}
            <SelectItem value={VEHICLE_CATALOGUE_OTHER}>
              Övrigt — skriv själv
            </SelectItem>
          </SelectContent>
        </Select>
        {makeIsOther ? (
          <Input
            autoFocus
            id={`${idPrefix}-make-text`}
            aria-label="Märke, eget"
            value={value.makeText}
            disabled={disabled}
            placeholder="Till exempel Saab"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              onChange({ ...value, makeText: event.currentTarget.value });
            }}
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" id={`${idPrefix}-model-label`}>
          Modell
        </span>
        {modelIsFreeText ? (
          <Input
            id={`${idPrefix}-model-text`}
            aria-label="Modell, egen"
            value={value.modelText}
            disabled={disabled}
            placeholder="Till exempel 9-5"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              onChange({ ...value, modelText: event.currentTarget.value });
            }}
          />
        ) : (
          <Select
            value={value.modelChoice}
            onValueChange={(next: string) => {
              onChange({ ...value, modelChoice: next, modelText: '' });
            }}
            // A model cannot be chosen before its make, and a disabled control
            // says so more clearly than an empty list would.
            disabled={disabled || selectedMake === undefined}
          >
            <SelectTrigger
              className="w-full"
              aria-labelledby={`${idPrefix}-model-label`}
            >
              <SelectValue
                placeholder={
                  selectedMake === undefined
                    ? 'Välj märke först'
                    : 'Välj modell'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {models.map((model: VehicleModel) => (
                <SelectItem key={model.id} value={model.name}>
                  {model.name}
                </SelectItem>
              ))}
              <SelectItem value={VEHICLE_CATALOGUE_OTHER}>
                Övrigt — skriv själv
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
