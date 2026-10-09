import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTestHarness } from './helpers.js';
import { registerScheduleTools } from '../src/tools/schedule.js';
import { client } from '../src/client.js';
import { normalizePlayer } from '../src/normalize.js';

// No tenant checked publishes players (every Myers Park and Ballantyne Ridge
// roster has `players: []`), so this shape is synthetic: it carries the fields
// a youth roster plausibly holds and that must NOT be passed through.
const rawPlayer = {
  id: '991',
  user: { firstName: 'Sam', lastName: 'Rivera', email: 'sam@example.com', birthDate: '2009-04-01' },
  firstName: null,
  lastName: null,
  jerseyNumber: 12,
  position: { id: '4', name: 'Midfielder' },
  graduationYear: 2027,
  photoUrl: 'https://cdn.example.com/p/991.jpg',
  internalPersonId: 'abc-123',
  parentPhone: '555-0100',
};

describe('normalizePlayer', () => {
  it('projects a player to an allow-listed shape, dropping everything else', () => {
    expect(normalizePlayer(rawPlayer)).toEqual({
      id: '991',
      name: 'Sam Rivera',
      jerseyNumber: '12',
      position: 'Midfielder',
      graduationYear: '2027',
    });
  });

  it('reads top-level names and a plain-string position when that is where they are', () => {
    expect(
      normalizePlayer({ firstName: 'Ana', lastName: 'Lee', jerseyNumber: '7', position: 'Goalkeeper', graduationYear: '2028' }),
    ).toEqual({ id: null, name: 'Ana Lee', jerseyNumber: '7', position: 'Goalkeeper', graduationYear: '2028' });
  });
});

describe('mpaz_get_roster', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns projected players, never the raw upstream object', async () => {
    vi.spyOn(client, 'entitiesMany').mockResolvedValue({ coaches: [], players: [rawPlayer] } as never);
    const harness = await createTestHarness(registerScheduleTools);
    const res = await harness.client.callTool({
      name: 'mpaz_get_roster',
      arguments: { sportSlug: 'boys-soccer', teamId: '7840890', year: '2026-2027' },
    });
    const text = (res.content as { type: string; text: string }[])[0].text;
    const body = JSON.parse(text);
    expect(body.players).toEqual([normalizePlayer(rawPlayer)]);
    expect(text).not.toMatch(/email|birthDate|photoUrl|parentPhone|internalPersonId/);
    await harness.close();
  });
});
