import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { registerTeamTools } from '../src/tools/teams.js';
import { registerScheduleTools } from '../src/tools/schedule.js';
import { registerContentTools } from '../src/tools/content.js';
import { client } from '../src/client.js';
import { briefEventLine, briefNewsLine } from '../src/tools/hints.js';
import type { FlightObject } from '../src/flight.js';

/**
 * Context-group hints (`_meta.mint`, the mcp-host context-groups contract),
 * asserted against what a host actually sees: the served `tools/list`.
 */
type Listed = {
  name: string;
  annotations?: { readOnlyHint?: boolean };
  inputSchema: { properties?: Record<string, unknown> };
  _meta?: { mint?: Record<string, any> };
};

const register = (server: Parameters<typeof registerTeamTools>[0]) => {
  registerTeamTools(server);
  registerScheduleTools(server);
  registerContentTools(server);
};

async function callText(name: string, args: Record<string, unknown>): Promise<string> {
  const h = await createTestHarness(register);
  const res = await h.callTool(name, args);
  await h.close();
  const block = res.content[0] as { type: string; text: string };
  return block.text;
}

async function served(): Promise<Listed[]> {
  const h = await createTestHarness(register);
  const { tools } = await h.client.listTools();
  await h.close();
  return tools as Listed[];
}

const DOMAINS = ['school', 'home', 'work', 'family', 'health', 'money', 'travel', 'food'];
const INTENTS = ['whats-new', 'whats-due', 'whats-on', 'lookup', 'turn-on-off', 'send', 'change', 'other'];
const CANONICAL_INTENTS = ['whats-new', 'whats-due', 'whats-on'];
const KEYS = ['domain', 'intent', 'canonical', 'subject', 'when', 'aliases'];

/** The intent every tool declares — this table is the assertion. */
const EXPECTED_INTENT: Record<string, string> = {
  mpaz_get_schedule: 'whats-on',
  mpaz_get_team_schedule: 'whats-on',
  mpaz_get_scores: 'lookup',
  mpaz_get_roster: 'lookup',
  mpaz_list_teams: 'lookup',
  mpaz_resolve_team: 'lookup',
  mpaz_list_news: 'whats-new',
  mpaz_list_videos: 'lookup',
  mpaz_list_photo_galleries: 'lookup',
};

/** A line `title — <ISO date | no date> — <status>`, at most 120 chars. */
const BRIEF = /^.+ — (\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?|no date) — \S.*$/;

afterEach(() => vi.restoreAllMocks());

describe('_meta.mint on the served tool list', () => {
  it('every tool except the healthcheck carries domain school and its intent', async () => {
    const tools = await served();
    const hinted = tools.filter((t) => !t.name.endsWith('_healthcheck'));
    expect(hinted.map((t) => t.name).sort()).toEqual(Object.keys(EXPECTED_INTENT).sort());
    for (const t of hinted) {
      const m = t._meta?.mint;
      expect(m, t.name).toBeDefined();
      expect(m!.domain, t.name).toBe('school');
      expect(m!.intent, t.name).toBe(EXPECTED_INTENT[t.name]);
    }
    const health = tools.find((t) => t.name === 'mpaz_healthcheck');
    expect(health?._meta?.mint).toBeUndefined();
  });

  it('every hint is shaped per the host contract', async () => {
    for (const t of await served()) {
      const m = t._meta?.mint;
      if (!m) continue;
      const props = t.inputSchema.properties ?? {};
      expect(Object.keys(m).filter((k) => !KEYS.includes(k)), t.name).toEqual([]);
      expect(DOMAINS, t.name).toContain(m.domain);
      expect(INTENTS, t.name).toContain(m.intent);
      if ('canonical' in m) {
        expect(m.canonical, t.name).toBe(true);
        expect(t.annotations?.readOnlyHint, t.name).toBe(true);
        expect(CANONICAL_INTENTS, t.name).toContain(m.intent);
      }
      if ('subject' in m) expect(props, t.name).toHaveProperty(m.subject);
      if ('when' in m) {
        expect(Object.keys(m.when).sort(), t.name).toEqual(['end', 'start']);
        expect(props, t.name).toHaveProperty(m.when.start);
        expect(props, t.name).toHaveProperty(m.when.end);
      }
      if ('aliases' in m) {
        expect(m.aliases.length, t.name).toBeLessThanOrEqual(8);
        for (const a of m.aliases as string[]) {
          expect(a.length, t.name).toBeLessThanOrEqual(40);
          expect(a, t.name).toBe(a.toLowerCase());
        }
      }
    }
  });

  it('at most one canonical read per intent: the schedule for whats-on, news for whats-new', async () => {
    const canonical = (await served())
      .filter((t) => t._meta?.mint?.canonical === true)
      .map((t) => [t.name, t._meta!.mint!.intent]);
    expect(canonical.sort()).toEqual([
      ['mpaz_get_schedule', 'whats-on'],
      ['mpaz_list_news', 'whats-new'],
    ]);
    const intents = canonical.map(([, i]) => i);
    expect(new Set(intents).size).toBe(intents.length);
  });

  it('no subject: a public school site has no listable subjects of the person', async () => {
    for (const t of await served()) expect(t._meta?.mint ?? {}, t.name).not.toHaveProperty('subject');
  });

  it('every canonical read accepts view: brief', async () => {
    for (const t of (await served()).filter((t) => t._meta?.mint?.canonical)) {
      const view = t.inputSchema.properties?.view as { enum?: string[] } | undefined;
      expect(view?.enum, t.name).toEqual(['full', 'brief']);
    }
  });
});

const rawEvent = (over: Record<string, unknown> = {}): FlightObject => ({
  id: '1',
  eventType: 'game',
  start: '2026-09-04T19:00:00.000Z',
  isCancelled: false,
  isPostponed: false,
  isScrimmage: false,
  isTba: false,
  game: {
    homeTeam: { displayName: 'Varsity Football', schools: [{ id: '10150', name: 'Home High', unidatTimeZone: 'America/New_York' }] },
    awayTeam: { displayName: 'Varsity Football', schools: [{ id: '999', name: 'Rival Academy' }] },
  },
  ...over,
});

describe('view: brief', () => {
  it('mpaz_get_schedule answers one line per event', async () => {
    vi.spyOn(client, 'entities').mockResolvedValue([
      rawEvent(),
      rawEvent({ id: '2', start: '2026-09-05T15:00:00.000Z', isCancelled: true }),
      rawEvent({ id: '3', start: null, game: { homeTeam: null, awayTeam: null } }),
    ] as never);
    const text = await callText('mpaz_get_schedule', { view: 'brief' });
    const lines = text.split('\n');
    expect(lines).toHaveLength(3);
    for (const l of lines) {
      expect(l.length, l).toBeLessThanOrEqual(120);
      expect(l, l).toMatch(BRIEF);
    }
    // Oldest first, as the full view; an event with no start sorts first.
    expect(lines[0]).toBe('game — no date — scheduled');
    expect(lines[1]).toBe('Varsity Football vs Rival Academy — 2026-09-04T23:00:00.000Z — home');
    expect(lines[2]).toMatch(/— cancelled$/);
  });

  it('mpaz_get_schedule still answers the full shape by default', async () => {
    vi.spyOn(client, 'entities').mockResolvedValue([rawEvent()] as never);
    const text = await callText('mpaz_get_schedule', {});
    expect(JSON.parse(text)).toMatchObject({ count: 1, events: [{ opponent: 'Rival Academy' }] });
  });

  it('mpaz_list_news answers one line per post, newest first', async () => {
    vi.spyOn(client, 'entities').mockResolvedValue([
      { id: 'a', title: 'Older post', publishedDatetimeUtc: '2026-01-01T12:00:00.000Z' },
      { id: 'b', title: 'Newer post', publishedDatetimeUtc: '2026-03-01T12:00:00.000Z' },
      { id: 'c', title: 'x'.repeat(200) },
    ] as never);
    const text = await callText('mpaz_list_news', { view: 'brief' });
    const lines = text.split('\n');
    expect(lines).toHaveLength(3);
    for (const l of lines) {
      expect(l.length, l).toBeLessThanOrEqual(120);
      expect(l, l).toMatch(BRIEF);
    }
    expect(lines[0]).toBe('Newer post — 2026-03-01T12:00:00.000Z — posted');
    expect(lines[2]).toMatch(/… — no date — posted$/);
  });
});

describe('brief line statuses', () => {
  const ev = (over: Partial<Parameters<typeof briefEventLine>[0]>) =>
    briefEventLine({
      team: 'Girls Volleyball', opponent: 'Rival Academy', isHome: false, start: '2026-09-04T23:00:00.000Z',
      isCancelled: false, isPostponed: false, isTba: false, result: null, eventType: 'game', ...over,
    });

  it('names the result, postponement, tba, home/away, and an untitled event', () => {
    expect(ev({})).toBe('Girls Volleyball at Rival Academy — 2026-09-04T23:00:00.000Z — away');
    expect(ev({ result: 'win' })).toMatch(/— win$/);
    expect(ev({ isPostponed: true })).toMatch(/— postponed$/);
    expect(ev({ isTba: true })).toMatch(/— time tba$/);
    expect(ev({ isHome: null })).toMatch(/— scheduled$/);
    expect(ev({ opponent: null })).toMatch(/^Girls Volleyball — /);
    expect(ev({ team: null, opponent: null, eventType: null })).toMatch(/^\(untitled\) — /);
  });

  it('a news post with no title is untitled', () => {
    expect(briefNewsLine({})).toBe('(untitled) — no date — posted');
  });
});
