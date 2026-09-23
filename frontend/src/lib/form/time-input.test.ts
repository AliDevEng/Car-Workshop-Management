import { describe, expect, it } from 'vitest';
import {
  formatTimeOfDay,
  HOUR_OPTIONS,
  minuteOptions,
  parseTimeOfDay,
} from './time-input';

describe('parseTimeOfDay', () => {
  it.each([
    ['00:00', 0, 0],
    ['07:00', 7, 0],
    ['09:05', 9, 5],
    ['13:45', 13, 45],
    ['23:59', 23, 59],
  ])('reads %s', (input, hour, minute) => {
    expect(parseTimeOfDay(input)).toEqual({ hour, minute });
  });

  it.each([
    ['', 'nothing chosen yet'],
    ['9:00', 'an unpadded hour'],
    ['24:00', 'an hour past the day'],
    ['12:60', 'a minute past the hour'],
    ['09:00:00', 'seconds the calendar never stores'],
    ['7 PM', 'what a non-Swedish locale would have offered'],
  ])('refuses %s (%s)', (input) => {
    expect(parseTimeOfDay(input)).toBeNull();
  });
});

describe('formatTimeOfDay', () => {
  it('pads both halves, so 7:0 can never reach the wire', () => {
    expect(formatTimeOfDay({ hour: 7, minute: 0 })).toBe('07:00');
  });

  it('round-trips every hour the picker offers', () => {
    for (const hour of HOUR_OPTIONS) {
      const formatted = formatTimeOfDay({ hour, minute: 30 });
      expect(parseTimeOfDay(formatted)).toEqual({ hour, minute: 30 });
    }
  });
});

describe('minuteOptions', () => {
  it('offers five-minute steps for the whole hour', () => {
    expect(minuteOptions(0)).toEqual([
      0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55,
    ]);
  });

  it('offers the same steps when nothing is chosen', () => {
    expect(minuteOptions(null)).toEqual(minuteOptions(30));
  });

  it('keeps an off-grid minute, in order, so editing cannot move a booking', () => {
    const options = minuteOptions(7);
    expect(options).toContain(7);
    expect(options.indexOf(7)).toBe(options.indexOf(5) + 1);
    expect(options).toHaveLength(13);
  });
});
