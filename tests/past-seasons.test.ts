import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectTeams } from '../src/tools/teams.js';
import type { AthleticZoneClient } from '../src/client.js';
import { harvest, MATCHERS } from '../src/flight.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const events = JSON.parse(readFileSync(join(FIX, 'events.json'), 'utf8'));

// Real shapes: schedule-derived teams carry `schools`; the sport page's
// cross-year selector teams do NOT (they are implicitly the school's own).
const currentTeam = { id: '7840877', displayName: 'Varsity Football', schools: [{ id: '10150' }], gender: { name: 'Boys' }, sport: { name: 'Football' }, level: { name: 'Varsity' }, year: { name: '2026/2027' } };
const pastTeam = { id: '5105193', displayName: 'Boys Middle School Football', gender: { name: 'Boys' }, sport: { name: 'Football' }, level: { name: '8th Grade' }, year: { name: '2024/2025' } };

function fakeClient(routes: Record<string, unknown[]>): AthleticZoneClient {
  const entities = vi.fn(async (path: string, _kind: string, q: Record<string, string> = {}) => {
    return routes[`${path}?${q.year ?? ''}`] ?? routes[path] ?? [];
  });
  return { schoolId: '10150', entities } as unknown as AthleticZoneClient;
}

describe('collectTeams', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the all-school schedule when it has teams', async () => {
    const c = fakeClient({ '/schedule?2026-2027': [currentTeam] });
    const got = await collectTeams(c, '2026-2027', '2026-2027');
    expect(got.teams.map((t) => t.id)).toEqual(['7840877']);
    expect(got.viaFallback).toBe(false);
    expect(c.entities).toHaveBeenCalledTimes(1);
  });

  it('falls back to the sport-page selector for a past season', async () => {
    // Myers Park's all-school schedule is empty for past years even though the
    // per-team pages still serve those seasons, so the ids must come from the
    // sport page's cross-year selector.
    const c = fakeClient({
      '/schedule?2024-2025': [],
      '/schedule?2026-2027': [currentTeam],
      '/sport/boys-football/schedule': [currentTeam, pastTeam],
    });
    const got = await collectTeams(c, '2024-2025', '2026-2027');
    expect(got.teams.map((t) => t.id)).toEqual(['5105193']);
    expect(got.teams[0].year).toBe('2024/2025');
    expect(got.viaFallback).toBe(true);
    expect(got.searchedSports).toEqual(['boys-football']);
  });

  it('keeps selector teams even though they carry no schools array', async () => {
    expect(pastTeam).not.toHaveProperty('schools');
    const c = fakeClient({
      '/schedule?2024-2025': [],
      '/schedule?2026-2027': [currentTeam],
      '/sport/boys-football/schedule': [pastTeam],
    });
    expect((await collectTeams(c, '2024-2025', '2026-2027')).teams).toHaveLength(1);
  });

  it('does not fall back when the requested year IS the current one', async () => {
    // Nothing more to discover, and the sweep would cost a request per sport.
    const c = fakeClient({ '/schedule?2026-2027': [] });
    expect((await collectTeams(c, '2026-2027', '2026-2027')).teams).toEqual([]);
    expect(c.entities).toHaveBeenCalledTimes(1);
  });

  it('still filters opponents out of the all-school payload', async () => {
    const opponent = { ...currentTeam, id: '8171843', schools: [{ id: '10066' }] };
    const c = fakeClient({ '/schedule?2026-2027': [currentTeam, opponent] });
    const got = await collectTeams(c, '2026-2027', '2026-2027');
    expect(got.teams.map((t) => t.id)).toEqual(['7840877']);
  });

  it('finds our teams in what the client harvests from real event payloads', async () => {
    // client.entities(..., 'teams', ...) returns teams harvested out of the
    // flight, not the raw events — mirror that here rather than feeding events
    // straight in, which no real call ever does.
    const harvested = harvest(events, MATCHERS.teams);
    const c = fakeClient({ '/schedule?2026-2027': harvested });
    const got = await collectTeams(c, '2026-2027', '2026-2027');
    expect(got.teams.length).toBeGreaterThan(0);
    expect(got.teams.every((t) => t.id)).toBe(true);
    // and opponents are excluded even though they are in the same payload
    expect(got.teams.length).toBeLessThan(harvested.length);
  });
});

describe('collectTeams partial coverage', () => {
  it('reports which sports it could search, so an empty result is not read as "no teams"', async () => {
    const volley = { ...currentTeam, id: '7840893', displayName: 'Girls Varsity Volleyball', sport: { name: 'Volleyball' }, gender: { name: 'Girls' } };
    const c = fakeClient({
      '/schedule?2024-2025': [],
      '/schedule?2026-2027': [currentTeam, volley],
      '/sport/boys-football/schedule': [pastTeam],
      '/sport/girls-volleyball/schedule': [],
    });
    const got = await collectTeams(c, '2024-2025', '2026-2027');
    // Only sports with a CURRENT team id are reachable — the selector is keyed
    // by team, not by slug — so coverage is inherently partial.
    expect(got.searchedSports).toEqual(['boys-football', 'girls-volleyball']);
    expect(got.teams.map((t) => t.id)).toEqual(['5105193']);
  });

  it('keeps the sports that worked when one sport page throws', async () => {
    const volley = { ...currentTeam, id: '7840893', sport: { name: 'Volleyball' }, gender: { name: 'Girls' } };
    const entities = vi.fn(async (path: string, _k: string, q: Record<string, string> = {}) => {
      if (path === '/schedule') return q.year === '2026-2027' ? [currentTeam, volley] : [];
      if (path === '/sport/girls-volleyball/schedule') throw new Error('Team Schedule Not Found');
      return [pastTeam];
    });
    const c = { schoolId: '10150', entities } as unknown as AthleticZoneClient;
    const got = await collectTeams(c, '2024-2025', '2026-2027');
    expect(got.teams.map((t) => t.id)).toEqual(['5105193']);
    expect(got.failedSports).toEqual(['girls-volleyball']);
  });
});
