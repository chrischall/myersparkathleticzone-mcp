import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFlightRows, harvest, MATCHERS } from '../src/flight.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const events = JSON.parse(readFileSync(join(FIX, 'events.json'), 'utf8'));

/** Build a flight document the way the site streams it: `<hexid>:<payload>` lines. */
function flight(...rows: unknown[]): string {
  const lines = [
    '1:"$Sreact.fragment"',
    '2:I[86747,["/_next/static/chunks/a.js"],"AdProvider"]',
    '23:T5bd,M16.6662 3.33096C14.633 1.29699 8.10384 1.34676',
    ...rows.map((r, i) => `${(i + 0x40).toString(16)}:${JSON.stringify(r)}`),
  ];
  return lines.join('\n');
}

describe('parseFlightRows', () => {
  it('keeps JSON data rows and skips module refs, text chunks and prose', () => {
    const rows = parseFlightRows(flight({ a: 1 }, [2, 3]));
    expect(rows).toEqual([{ a: 1 }, [2, 3]]);
  });

  it('returns an empty array for a redirect body', () => {
    expect(parseFlightRows('Redirecting...')).toEqual([]);
  });

  it('skips a truncated/streamed row instead of throwing', () => {
    const doc = ['40:{"ok":true}', '41:{"broken":'].join('\n');
    expect(parseFlightRows(doc)).toEqual([{ ok: true }]);
  });
});

describe('harvest', () => {
  it('finds events nested inside a React element tree', () => {
    const tree = ['$', 'div', null, { className: 'x', children: { data: events } }];
    const found = harvest(parseFlightRows(flight(tree)), MATCHERS.events);
    expect(found).toHaveLength(events.length);
    expect(found[0]).toMatchObject({ eventType: 'game', start: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
  });

  it('de-duplicates objects repeated across rows', () => {
    const found = harvest(parseFlightRows(flight({ e: events[0] }, { again: events[0] })), MATCHERS.events);
    expect(found).toHaveLength(1);
  });

  it('descends into a matched object so nested entities are still found', () => {
    // event.game.homeTeam is itself a team — teams must be found *inside* events.
    const found = harvest(parseFlightRows(flight(events)), MATCHERS.teams);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]).toHaveProperty('id');
  });

  it('does not match a team-shaped object that lacks an id', () => {
    // The homepage carries display-only labels: sport+gender+level but no id.
    const label = { sport: { name: 'Basketball' }, gender: { name: 'Girls' }, level: { name: 'Varsity' } };
    expect(harvest(parseFlightRows(flight(label)), MATCHERS.teams)).toEqual([]);
  });
});
