import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeEvent, normalizeCoach, ownTeams, normalizeTeam } from '../src/normalize.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const events = JSON.parse(readFileSync(join(FIX, 'events.json'), 'utf8'));
const coaches = JSON.parse(readFileSync(join(FIX, 'coaches.json'), 'utf8'));

const SCHOOL = '10150';

describe('normalizeEvent', () => {
  it('names the opponent by SCHOOL, not by team displayName', () => {
    // Both sides' displayName is the sport label ("Girls JV Volleyball"), so
    // using it for the opponent renders "Girls JV Volleyball at Girls JV
    // Volleyball". The opponent must come from schools[0].name.
    const home = events.find((e: any) => e.game?.homeTeam?.schools?.[0]?.id === SCHOOL);
    const n = normalizeEvent(home, SCHOOL);
    expect(n.opponent).toBe(home.game.awayTeam.schools[0].name);
    expect(n.opponent).not.toBe(n.team);
  });

  it('marks home vs away from game.homeTeam, not teamEvents order', () => {
    for (const raw of events) {
      const n = normalizeEvent(raw, SCHOOL);
      expect(n.isHome).toBe(raw.game.homeTeam.schools[0].id === SCHOOL);
    }
  });

  it('reports our own team name on both home and away fixtures', () => {
    for (const raw of events) {
      const n = normalizeEvent(raw, SCHOOL);
      const mine = n.isHome ? raw.game.homeTeam : raw.game.awayTeam;
      expect(n.team).toBe(mine.displayName);
    }
  });

  it('carries schedule status flags and the venue', () => {
    const n = normalizeEvent(events[0], SCHOOL);
    expect(n).toMatchObject({
      id: events[0].id,
      eventType: events[0].eventType,
      start: events[0].start,
      isCancelled: false,
      isTba: false,
    });
    expect(n.venue).toBe(events[0].location.name);
  });

  it('degrades to null rather than throwing on an event with no game block', () => {
    const n = normalizeEvent({ id: '1', eventType: 'practice', start: '2026-09-01T20:00:00.000Z' }, SCHOOL);
    expect(n.opponent).toBeNull();
    expect(n.isHome).toBeNull();
  });
});

describe('ownTeams', () => {
  it('keeps only this school and de-duplicates by id', () => {
    const mixed = [
      { id: '1', displayName: 'Varsity Football', schools: [{ id: SCHOOL }] },
      { id: '1', displayName: 'Varsity Football', schools: [{ id: SCHOOL }] },
      { id: '2', displayName: 'Boys Varsity Football', schools: [{ id: '10066' }] },
    ];
    const got = ownTeams(mixed as any, SCHOOL);
    expect(got.map((t) => t.id)).toEqual(['1']);
  });

  it('finds our teams nested inside real event payloads', () => {
    const teams = events.flatMap((e: any) => [e.game?.homeTeam, e.game?.awayTeam]).filter(Boolean);
    const got = ownTeams(teams, SCHOOL);
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((t) => t.id && t.displayName)).toBe(true);
  });
});

describe('normalizeTeam', () => {
  it('flattens the nested lookup objects', () => {
    const t = normalizeTeam({
      id: '7840877',
      displayName: 'Varsity Football',
      gender: { name: 'Boys' },
      sport: { name: 'Football' },
      level: { name: 'Varsity' },
      year: { name: '2026/2027' },
    } as any);
    expect(t).toEqual({
      id: '7840877',
      displayName: 'Varsity Football',
      gender: 'Boys',
      sport: 'Football',
      level: 'Varsity',
      year: '2026/2027',
      sportSlug: 'boys-football',
    });
  });
});

describe('normalizeCoach', () => {
  it('reads the name from .user, where it actually lives', () => {
    // The sibling top-level firstName/lastName are null on every real record.
    const got = coaches.map(normalizeCoach);
    expect(got.every((c: any) => c.name && c.name.trim().length > 0)).toBe(true);
    const head = got.find((c: any) => c.position === 'Head Coach');
    expect(head.name).toBe('Chris James');
  });
});
