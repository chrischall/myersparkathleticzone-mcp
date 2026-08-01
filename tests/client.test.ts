import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AthleticZoneClient } from '../src/client.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const events = JSON.parse(readFileSync(join(FIX, 'events.json'), 'utf8'));

function flightBody(...rows: unknown[]): string {
  return ['1:"$Sreact.fragment"', ...rows.map((r, i) => `${(i + 0x40).toString(16)}:${JSON.stringify(r)}`)].join('\n');
}

function res(body: string, init: { status?: number; contentType?: string } = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'text/x-component' },
  });
}

describe('AthleticZoneClient', () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  let client: AthleticZoneClient;

  beforeEach(() => {
    fetchImpl = vi.fn();
    client = new AthleticZoneClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
  });

  afterEach(() => vi.restoreAllMocks());

  it('requests the page with the RSC header, which is what returns flight instead of HTML', async () => {
    fetchImpl.mockResolvedValue(res(flightBody({ data: events })));
    await client.entities('/schedule', 'events', { year: '2026-2027' });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://www.myersparkathleticzone.com/schedule?year=2026-2027');
    expect((init.headers as Record<string, string>)['RSC']).toBe('1');
  });

  it('omits undefined query params rather than sending "undefined"', async () => {
    fetchImpl.mockResolvedValue(res(flightBody({ data: events })));
    await client.entities('/schedule', 'events', { year: '2026-2027', team: undefined });
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://www.myersparkathleticzone.com/schedule?year=2026-2027');
  });

  it('returns harvested entities', async () => {
    fetchImpl.mockResolvedValue(res(flightBody({ data: events })));
    const got = await client.entities('/schedule', 'events', {});
    expect(got).toHaveLength(events.length);
  });

  it('throws an actionable error when the page redirects for want of query params', async () => {
    // The real signature of a missing team/year: a 15-byte "Redirecting..." body.
    fetchImpl.mockResolvedValue(res('Redirecting...'));
    const err = await client.entities('/sport/boys-football/roster', 'coaches', {}).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/redirect/i);
    // The hint is what tells the caller how to recover — assert the guidance,
    // not merely that something was thrown.
    expect(err.hint).toMatch(/team/i);
    expect(err.hint).toMatch(/year/i);
  });

  it('detects the site\'s "Not Found" page, which it serves with HTTP 200', async () => {
    // A stale or bogus team id does NOT 404 and does NOT redirect — the site
    // renders a full 200 page titled "Team Roster Not Found". Without this
    // check the caller just gets an empty list and reads it as "no coaches".
    const notFound = flightBody(['$', 'title', '0', { children: 'Team Roster Not Found' }]);
    fetchImpl.mockResolvedValue(res(notFound));
    const err = await client
      .entities('/sport/boys-football/roster', 'coaches', { team: '999999', year: '2026-2027' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/not found/i);
    expect(err.hint).toMatch(/year/i);
  });

  it('does not mistake ordinary content for the Not Found page', async () => {
    const ok = flightBody({ data: events }, ['$', 'p', null, { children: 'Lost and found table by the gym' }]);
    fetchImpl.mockResolvedValue(res(ok));
    await expect(client.entities('/schedule', 'events', {})).resolves.toHaveLength(events.length);
  });

  it('surfaces a non-2xx status', async () => {
    fetchImpl.mockResolvedValue(res('nope', { status: 500 }));
    await expect(client.entities('/schedule', 'events', {})).rejects.toThrow(/500/);
  });

  it('returns an empty array for a real page that genuinely has no such entity', async () => {
    // A prior season renders the page shell with no events — not an error.
    fetchImpl.mockResolvedValue(res(flightBody({ some: 'shell', children: [] })));
    await expect(client.entities('/schedule', 'events', { year: '2024-2025' })).resolves.toEqual([]);
  });

  it('honours a configured site origin and school id', async () => {
    const other = new AthleticZoneClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      siteUrl: 'https://www.example-athletics.com',
      schoolId: '99',
    });
    fetchImpl.mockResolvedValue(res(flightBody({ data: events })));
    await other.entities('/schedule', 'events', {});
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://www.example-athletics.com/schedule');
    expect(other.schoolId).toBe('99');
  });
});
