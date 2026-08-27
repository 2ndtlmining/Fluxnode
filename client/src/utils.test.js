import {
  dayjs,
  split_duration,
  format_duration,
  format_minutes,
  format_seconds,
  blocksToHumanLong,
  shortImageName,
  hide_sensitive_number,
  hide_sensitive_string,
  format_amount,
  pad_start,
} from './utils';

/*
 * The fact that this file imports at all is half the point.
 *
 * utils.js used to do `import * as dayjs from 'dayjs'` and
 * `import * as duration from 'dayjs/plugin/duration'`. That only works because
 * webpack's CJS interop hands back module.exports directly; under Jest it
 * yields a Module namespace object, so `dayjs.extend(duration)` threw on line 3
 * and every test importing utils — or anything importing utils, which includes
 * apidata.js — died before reaching the code under test.
 *
 * These tests pin the duration maths so the interop change is provably
 * behaviour-preserving, and keep the module importable from now on.
 */

describe('dayjs wiring', () => {
  it('exports a callable dayjs', () => {
    expect(typeof dayjs).toBe('function');
  });

  it('has the duration plugin applied', () => {
    expect(typeof dayjs.duration).toBe('function');
    expect(dayjs.duration({ minutes: 90 }).asHours()).toBe(1.5);
  });
});

describe('split_duration', () => {
  it('splits a duration into days, hours, minutes and seconds', () => {
    // 2d 3h 4m 5s
    const d = dayjs.duration({ days: 2, hours: 3, minutes: 4, seconds: 5 });
    expect(split_duration(d)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
  });

  it('handles a duration under a minute', () => {
    expect(split_duration(dayjs.duration({ seconds: 42 }))).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 42,
    });
  });

  it('handles exactly one day', () => {
    expect(split_duration(dayjs.duration({ days: 1 }))).toEqual({
      days: 1,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });
});

describe('format_minutes / format_seconds', () => {
  it('formats minutes into a human duration', () => {
    // 1500 minutes = 1d 1h 0m
    expect(format_minutes(1500)).toEqual(format_duration(dayjs.duration({ minutes: 1500 })));
    expect(typeof format_minutes(1500)).toBe('string');
    expect(format_minutes(1500).length).toBeGreaterThan(0);
  });

  it('formats seconds into a human duration', () => {
    expect(typeof format_seconds(3661)).toBe('string');
    expect(format_seconds(0).length).toBeGreaterThan(0);
  });
});

describe('blocksToHumanLong', () => {
  it('treats a block as 30 seconds', () => {
    // 2880 blocks/day at 30s each
    expect(blocksToHumanLong(2880)).toMatch(/1\s*d/i);
  });

  it('handles zero without throwing', () => {
    expect(typeof blocksToHumanLong(0)).toBe('string');
  });
});

describe('shortImageName', () => {
  it('strips registry prefixes and the tag', () => {
    expect(shortImageName('ghcr.io/girderworks/feather:1.0.14')).toBe('girderworks/feather');
    expect(shortImageName('docker.io/library/mysql:8.3.0')).toBe('mysql');
    expect(shortImageName('quay.io/pussthecatorg/libremdb:latest')).toBe('pussthecatorg/libremdb');
    expect(shortImageName('runonflux/wp-nginx:latest')).toBe('runonflux/wp-nginx');
  });

  it('handles empty and missing input', () => {
    expect(shortImageName('')).toBe('');
    expect(shortImageName(undefined)).toBe('');
  });
});

describe('privacy helpers', () => {
  it('masks digits but keeps the shape', () => {
    expect(hide_sensitive_number('1,234.56')).toBe('X,XXX.XX');
    expect(hide_sensitive_number(1234)).toBe('XXXX');
  });

  it('masks alphanumerics in a string', () => {
    expect(hide_sensitive_string('t1abc123')).toBe('XXXXXXXX');
  });

  it('format_amount masks only when privacy is on', () => {
    expect(format_amount(1234.5, false, 2)).toBe('1,234.5');
    expect(format_amount(1234.5, true, 2)).toBe('XXXX.X');
  });
});

describe('pad_start', () => {
  it('pads to the requested width', () => {
    expect(pad_start(7)).toBe('07');
    expect(pad_start(7, 4)).toBe('0007');
    expect(pad_start(123, 2)).toBe('23');
  });
});
