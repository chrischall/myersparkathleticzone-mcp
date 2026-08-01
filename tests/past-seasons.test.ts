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
    expect(got.map((t) => t.id)).toEqual(['7840877']);
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
    expect(got.map((t) => t.id)).toEqual(['5105193']);
    expect(got[0].year).toBe('2024/2025');
  });

  it('keeps selector teams even though they carry no schools array', async () => {
    expect(pastTeam).not.toHaveProperty('schools');
    const c = fakeClient({
      '/schedule?2024-2025': [],
      '/schedule?2026-2027': [currentTeam],
      '/sport/boys-football/schedule': [pastTeam],
    });
    expect(await collectTeams(c, '2024-2025', '2026-2027')).toHaveLength(1);
  });

  it('does not fall back when the requested year IS the current one', async () => {
    // Nothing more to discover, and the sweep would cost a request per sport.
    const c = fakeClient({ '/schedule?2026-2027': [] });
    expect(await collectTeams(c, '2026-2027', '2026-2027')).toEqual([]);
    expect(c.entities).toHaveBeenCalledTimes(1);
  });

  it('still filters opponents out of the all-school payload', async () => {
    const opponent = { ...currentTeam, id: '8171843', schools: [{ id: '10066' }] };
    const c = fakeClient({ '/schedule?2026-2027': [currentTeam, opponent] });
    const got = await collectTeams(c, '2026-2027', '2026-2027');
    expect(got.map((t) => t.id)).toEqual(['7840877']);
  });

  it('finds our teams in what the client harvests from real event payloads', async () => {
    // client.entities(..., 'teams', ...) returns teams harvested out of the
    // flight, not the raw events — mirror that here rather than feeding events
    // straight in, which no real call ever does.
    const harvested = harvest(events, MATCHERS.teams);
    const c = fakeClient({ '/schedule?2026-2027': harvested });
    const got = await collectTeams(c, '2026-2027', '2026-2027');
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((t) => t.id)).toBe(true);
    // and opponents are excluded even though they are in the same payload
    expect(got.length).toBeLessThan(harvested.length);
  });
});
