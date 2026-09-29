/** Offline checks for the run-history parsers the journey relies on. Needs no login. */
import { test, expect } from '@playwright/test';
import { parseDuration, parseStatus } from '../pages';
import { uniqueName } from '../../support/env';

test.describe('run-history parsers', () => {
  for (const [input, want] of [
    ['Success', 'Success'], ['Succeeded', 'Success'], ['Failure', 'Failure'],
    ['Failed', 'Failure'], ['In Progress', 'In Progress'], ['Running', 'In Progress'], ['???', 'Unknown'],
  ] as const) {
    test(`parseStatus("${input}") -> ${want}`, () => expect(parseStatus(input)).toBe(want));
  }

  test('parseDuration handles h/m/s and hh:mm:ss', () => {
    expect(parseDuration('1m 23s')).toBe(83);
    expect(parseDuration('83s')).toBe(83);
    expect(parseDuration('00:01:23')).toBe(83);
    expect(parseDuration('1h 2m')).toBe(3720);
    expect(parseDuration('—')).toBeNull();
  });

  test('uniqueName is timestamped and unique', () => {
    const a = uniqueName('conn');
    expect(a).toMatch(/^qa-conn-\d{8}T\d{6}Z-[a-z0-9]{1,4}$/);
    expect(uniqueName('conn')).not.toBe(a);
  });
});
