import { describe, expect, it } from 'vitest';
import { VEHICLE_CATALOGUE_OTHER } from 'shared';
import {
  EMPTY_VEHICLE_MODEL_PICKER,
  isFreeTextModel,
  resolveVehicleMakeModel,
  type VehicleModelPickerValue,
} from './vehicle-model-picker';

/**
 * The catalogue picker's pure part — what the two dropdowns resolve to.
 *
 * Tested on its own rather than through the dialog, for the reason F1.3.8
 * gives about the converting inputs: the interesting rules are in the mapping,
 * and a component test would assert that a `<select>` renders while missing
 * the case that actually shipped broken.
 */

function picker(
  overrides: Partial<VehicleModelPickerValue>,
): VehicleModelPickerValue {
  return { ...EMPTY_VEHICLE_MODEL_PICKER, ...overrides };
}

describe('isFreeTextModel', () => {
  it('is true when the model itself is "Övrigt"', () => {
    expect(
      isFreeTextModel(picker({ modelChoice: VEHICLE_CATALOGUE_OTHER })),
    ).toBe(true);
  });

  it('is true when the MAKE is "Övrigt", even with no model choice', () => {
    // A make the catalogue does not know has no model list to offer, so the
    // model field is free text without the model dropdown ever being touched.
    expect(
      isFreeTextModel(picker({ makeChoice: VEHICLE_CATALOGUE_OTHER })),
    ).toBe(true);
  });

  it('is false for a catalogue make and model', () => {
    expect(
      isFreeTextModel(picker({ makeChoice: 'Volvo', modelChoice: 'V70' })),
    ).toBe(false);
  });
});

describe('resolveVehicleMakeModel', () => {
  it('passes a catalogue selection straight through', () => {
    expect(
      resolveVehicleMakeModel(
        picker({ makeChoice: 'Volvo', modelChoice: 'V70' }),
      ),
    ).toEqual({ make: 'Volvo', model: 'V70' });
  });

  it('keeps a free-text model typed under a free-text make', () => {
    /*
     * The regression this file exists for. The resolver used to ask only
     * whether `modelChoice` was "Övrigt" — but when the *make* is "Övrigt" the
     * model dropdown never renders, so `modelChoice` stays `''` and the typed
     * model was silently dropped. A Saab 9000 was stored as
     * "Saab / Okänd modell", and the e2e test did not notice because it
     * asserted the success toast rather than the row that was written.
     */
    expect(
      resolveVehicleMakeModel(
        picker({
          makeChoice: VEHICLE_CATALOGUE_OTHER,
          makeText: 'Saab',
          modelText: '9000 Turbo',
        }),
      ),
    ).toEqual({ make: 'Saab', model: '9000 Turbo' });
  });

  it('keeps a free-text model typed under a catalogue make', () => {
    expect(
      resolveVehicleMakeModel(
        picker({
          makeChoice: 'Volvo',
          modelChoice: VEHICLE_CATALOGUE_OTHER,
          modelText: '245 GL',
        }),
      ),
    ).toEqual({ make: 'Volvo', model: '245 GL' });
  });

  it('trims what was typed', () => {
    expect(
      resolveVehicleMakeModel(
        picker({
          makeChoice: VEHICLE_CATALOGUE_OTHER,
          makeText: '  Saab  ',
          modelText: '  9-5  ',
        }),
      ),
    ).toEqual({ make: 'Saab', model: '9-5' });
  });

  it('reports nothing chosen as undefined, never as an empty string', () => {
    // The request omits the field entirely; the placeholder names are the
    // server's to apply, not the client's to invent in a second place.
    expect(resolveVehicleMakeModel(EMPTY_VEHICLE_MODEL_PICKER)).toEqual({
      make: undefined,
      model: undefined,
    });
  });

  it('reports an "Övrigt" left blank as undefined', () => {
    expect(
      resolveVehicleMakeModel(
        picker({ makeChoice: VEHICLE_CATALOGUE_OTHER, makeText: '   ' }),
      ),
    ).toEqual({ make: undefined, model: undefined });
  });
});
