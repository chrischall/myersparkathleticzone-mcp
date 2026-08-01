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

  it('inverts home/away correctly on a real away LOSS', () => {
    // Ardrey Kell 2025-10-21: raw row is home 2 / away 1, and BR are away — so
    // the school's own line is 1-2 and a loss. Pinning the away path matters:
    // a missing inversion still looks right on every home fixture.
    const away = BR.find((e: any) => e.start.startsWith('2025-10-21'));
    expect(away.game.homeScore).toBe(2);
    expect(away.game.awayScore).toBe(1);
    const n = normalizeEvent(away, BR_SCHOOL);
    expect(n.isHome).toBe(false);
    expect(n.teamScore).toBe(1);
    expect(n.opponentScore).toBe(2);
    expect(n.result).toBe('loss');
    expect(n.opponent).toBe('Ardrey Kell High School');
  });

  it('inverts home/away correctly on a real away WIN', () => {
    const away = BR.find((e: any) => e.start.startsWith('2025-10-28'));
    const n = normalizeEvent(away, BR_SCHOOL);
    expect([n.homeScore, n.awayScore]).toEqual([0, 8]);
    expect(n.isHome).toBe(false);
    expect(n.result).toBe('win');
  });

  it('still resolves home/away from awayTeam when homeTeam is missing', () => {
    // Real row (2025-10-06): game.homeTeam is null but awayTeam names our
    // school, so "we were away" IS determinable. Giving up here needlessly
    // collapses teamScore/opponentScore/result too.
    const raw = BR.find((e: any) => e.game && !e.game.homeTeam);
    expect(raw, 'fixture should contain a homeTeam-less row').toBeTruthy();
    expect(raw.game.awayTeam.schools[0].id).toBe(BR_SCHOOL);
    const n = normalizeEvent(raw, BR_SCHOOL);
    expect(n.isHome).toBe(false);
    // The home side is absent as a *team*, but game.opponent still names it.
    expect(n.opponent).toBe(raw.game.opponent.opponent.name);
  });

  it('maps scores through an awayTeam-only row', () => {
    const raw = {
      eventType: 'game',
      start: '2025-10-06T22:00:00.000Z',
      game: { homeTeam: null, awayTeam: { schools: [{ id: BR_SCHOOL }] }, homeScore: 1, awayScore: 4 },
    };
    const n = normalizeEvent(raw, BR_SCHOOL);
    expect(n.isHome).toBe(false);
    expect(n.teamScore).toBe(4);
    expect(n.opponentScore).toBe(1);
    expect(n.result).toBe('win');
  });

  it('falls back to elimination when a home side is present but is not us', () => {
    // These pages list only our own school's games, so an unfamiliar home side
    // means we are the away side. This is the pre-existing behaviour and is what
    // schedule rows rely on.
    const raw = {
      eventType: 'game',
      start: '2025-10-06T22:00:00.000Z',
      game: { homeTeam: { schools: [{ id: '999' }] }, awayTeam: null, homeScore: 1, awayScore: 4 },
    };
    const n = normalizeEvent(raw, BR_SCHOOL);
    expect(n.isHome).toBe(false);
    expect(n.teamScore).toBe(4);
  });

  it('gives up when there is no home side and the away side is not us either', () => {
    const raw = {
      eventType: 'game',
      start: '2025-10-06T22:00:00.000Z',
      game: { homeTeam: null, awayTeam: { schools: [{ id: '888' }] }, homeScore: 1, awayScore: 4 },
    };
    const n = normalizeEvent(raw, BR_SCHOOL);
    expect(n.isHome).toBeNull();
    expect(n.teamScore).toBeNull();
    expect(n.result).toBeNull();
  });

  it('never reports the positional label "Home"/"Away" as an opponent school', () => {
    // game.opponent.name is a positional label ("Away"); only the nested
    // opponent.opponent.name is a real school.
    const n = normalizeEvent(
      { eventType: 'game', start: '2024-10-17T14:42:00.000Z', game: { homeTeam: { schools: [{ id: MP_SCHOOL }] }, awayTeam: null, opponent: { name: 'Away' } } },
      MP_SCHOOL,
    );
    expect(n.opponent).toBeNull();
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
