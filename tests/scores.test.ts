import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeEvent } from '../src/normalize.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
// Real completed games. Myers Park had recorded no scores, so the scored
// fixtures come from Ballantyne Ridge — another tenant of the same platform,
// reached by pointing the client at its site.
const BR = JSON.parse(readFileSync(join(FIX, 'scores-ballantyne.json'), 'utf8'));
const OPPONENT_BLOCK = JSON.parse(readFileSync(join(FIX, 'scores-opponent-block.json'), 'utf8'));

const BR_SCHOOL = '21785';
const MP_SCHOOL = '10150';

describe('scores', () => {
  it('surfaces homeScore/awayScore', () => {
    const both = BR.find((e: any) => e.game.homeScore != null && e.game.awayScore != null);
    const n = normalizeEvent(both, BR_SCHOOL);
    expect(n.homeScore).toBe(both.game.homeScore);
    expect(n.awayScore).toBe(both.game.awayScore);
  });

  it('reports our score and theirs from our point of view', () => {
    for (const raw of BR) {
      const n = normalizeEvent(raw, BR_SCHOOL);
      if (n.isHome === null) continue;
      expect(n.teamScore).toBe(n.isHome ? n.homeScore : n.awayScore);
      expect(n.opponentScore).toBe(n.isHome ? n.awayScore : n.homeScore);
    }
  });

  it('derives a result only when BOTH scores are present', () => {
    // Real data has 3-null and null-4 rows: the site stores each side
    // independently, so a half-entered score must not become a win or a loss.
    for (const raw of BR) {
      const n = normalizeEvent(raw, BR_SCHOOL);
      const complete = raw.game.homeScore != null && raw.game.awayScore != null;
      if (!complete) {
        expect(n.result, `${raw.start} should have no result`).toBeNull();
      } else if (n.teamScore! > n.opponentScore!) expect(n.result).toBe('win');
      else if (n.teamScore! < n.opponentScore!) expect(n.result).toBe('loss');
      else expect(n.result).toBe('tie');
    }
  });

  it('never treats a missing score as zero', () => {
    const partial = BR.find((e: any) => (e.game.homeScore == null) !== (e.game.awayScore == null));
    expect(partial, 'fixture should contain a half-entered score').toBeTruthy();
    const n = normalizeEvent(partial, BR_SCHOOL);
    expect([n.homeScore, n.awayScore]).toContain(null);
    expect(n.result).toBeNull();
  });

  it('names the opponent from game.opponent when awayTeam is null', () => {
    // Scores pages return awayTeam: null and carry the opponent in a separate
    // block; reading only awayTeam loses the opponent entirely.
    for (const raw of OPPONENT_BLOCK) {
      expect(raw.game.awayTeam).toBeNull();
      const n = normalizeEvent(raw, MP_SCHOOL);
      expect(n.opponent).toBe(raw.game.opponent.opponent.name);
      expect(n.opponent).not.toBeNull();
    }
  });

  it('still works on schedule-shaped events, which carry no score fields', () => {
    const events = JSON.parse(readFileSync(join(FIX, 'events.json'), 'utf8'));
    const n = normalizeEvent(events[0], MP_SCHOOL);
    expect(n.homeScore).toBeNull();
    expect(n.awayScore).toBeNull();
    expect(n.result).toBeNull();
    expect(n.opponent).not.toBeNull();
  });
});
