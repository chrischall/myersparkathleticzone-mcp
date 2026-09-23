import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeEvent } from '../src/normalize.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (f: string) => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
const SCHEDULE = load('events.json');
const BR = load('scores-ballantyne.json');
const OPPONENT_BLOCK = load('scores-opponent-block.json');

const MP_SCHOOL = '10150';
const BR_SCHOOL = '21785';

// The site's `start` is the school's LOCAL wall-clock time serialised with a
// false `.000Z` suffix. Scores rows prove it: their `startUtc` (the real
// instant) is always 4h (EDT) or 5h (EST) later. Passing `start` through
// verbatim made agents convert an already-local time and report kickoffs 4-5h
// early.
describe('event start time', () => {
  it('emits the true UTC instant, not the local wall time with a fake Z', () => {
    // Friday 6:30pm Eastern kickoff, schedule page (no startUtc).
    const n = normalizeEvent(SCHEDULE[0], MP_SCHOOL);
    expect(SCHEDULE[0].start).toBe('2026-08-14T18:30:00.000Z');
    expect(n.start).toBe('2026-08-14T22:30:00.000Z');
    expect(n.startLocal).toBe('2026-08-14T18:30:00');
    expect(n.timeZone).toBe('America/New_York');
  });

  it('prefers the payload\'s own startUtc when a scores row carries it', () => {
    const raw = BR.find((e: any) => e.start === '2025-10-14T19:00:00.000Z');
    const n = normalizeEvent(raw, BR_SCHOOL);
    expect(n.start).toBe('2025-10-14T23:00:00.000Z');
    expect(n.startLocal).toBe('2025-10-14T19:00:00');
    expect(n.timeZone).toBe('America/New_York');
  });

  it('handles standard time (EST, UTC-5) as well as daylight time', () => {
    const raw = BR.find((e: any) => e.start === '2025-11-06T18:00:00.000Z');
    expect(normalizeEvent(raw, BR_SCHOOL).start).toBe('2025-11-06T23:00:00.000Z');
    // And the same answer when we must convert it ourselves.
    const { startUtc: _drop, ...noUtc } = raw;
    expect(normalizeEvent(noUtc, BR_SCHOOL).start).toBe('2025-11-06T23:00:00.000Z');
  });

  it('local->UTC conversion agrees with startUtc on every real scores row', () => {
    for (const raw of [...BR, ...OPPONENT_BLOCK]) {
      const { startUtc, ...noUtc } = raw;
      const school = BR.includes(raw) ? BR_SCHOOL : MP_SCHOOL;
      const n = normalizeEvent(noUtc, school);
      expect(n.start, raw.start).toBe(new Date(startUtc).toISOString());
      expect(n.startLocal, raw.start).toBe(raw.start.slice(0, 19));
    }
  });

  it('falls back to America/New_York when no school carries a time zone', () => {
    const n = normalizeEvent({ id: '1', eventType: 'practice', start: '2026-01-10T09:00:00.000Z' }, MP_SCHOOL);
    expect(n.start).toBe('2026-01-10T14:00:00.000Z');
    expect(n.startLocal).toBe('2026-01-10T09:00:00');
    expect(n.timeZone).toBe('America/New_York');
  });

  it('uses the school\'s own time zone when it is not Eastern', () => {
    const raw = {
      id: '1',
      eventType: 'game',
      start: '2026-03-01T19:00:00.000Z',
      game: { homeTeam: { displayName: 'Varsity', schools: [{ id: '9', unidatTimeZone: 'America/Los_Angeles' }] } },
    };
    const n = normalizeEvent(raw, '9');
    expect(n.start).toBe('2026-03-02T03:00:00.000Z');
    expect(n.timeZone).toBe('America/Los_Angeles');
  });

  it('ignores an unknown time zone name rather than throwing', () => {
    const raw = {
      id: '1',
      eventType: 'game',
      start: '2026-03-01T19:00:00.000Z',
      game: { homeTeam: { displayName: 'Varsity', schools: [{ id: '9', unidatTimeZone: 'Mars/Olympus' }] } },
    };
    const n = normalizeEvent(raw, '9');
    expect(n.timeZone).toBe('America/New_York');
    expect(n.start).toBe('2026-03-02T00:00:00.000Z');
  });

  it('degrades to null on a missing or unparseable start', () => {
    for (const start of [undefined, '', 'TBA']) {
      const n = normalizeEvent({ id: '1', eventType: 'game', start }, MP_SCHOOL);
      expect(n.start).toBeNull();
      expect(n.startLocal).toBeNull();
    }
  });
});
