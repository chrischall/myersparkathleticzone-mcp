import { describe, it, expect } from 'vitest';
import { rankTeams } from '../src/match.js';
import type { Team } from '../src/normalize.js';

const team = (id: string, displayName: string, level: string, sport = 'Football', gender = 'Boys'): Team => ({
  id,
  displayName,
  gender,
  sport,
  level,
  year: '2026/2027',
  sportSlug: `${gender.toLowerCase()}-${sport.toLowerCase()}`,
});

const VARSITY = team('7840877', 'Varsity Football', 'Varsity');
const JV = team('7840888', 'JV Football', 'Junior Varsity');
const VBALL = team('7840893', 'Girls Varsity Volleyball', 'Varsity', 'Volleyball', 'Girls');

describe('rankTeams', () => {
  it('puts Varsity ahead of JV for "varsity football"', () => {
    // "Junior Varsity" contains the word "varsity", so JV legitimately matches
    // — but the exact team must rank first.
    expect(rankTeams([JV, VARSITY], 'varsity football')[0]).toBe(VARSITY);
  });

  it('puts JV ahead of Varsity for "jv football"', () => {
    expect(rankTeams([VARSITY, JV], 'jv football')[0]).toBe(JV);
  });

  it('matches on the level name too', () => {
    expect(rankTeams([VARSITY, JV], 'junior varsity')[0]).toBe(JV);
  });

  it('keeps both football teams for a bare sport query', () => {
    const got = rankTeams([VARSITY, JV, VBALL], 'football');
    expect(got).toHaveLength(2);
    expect(got).not.toContain(VBALL);
  });

  it('matches gender + sport', () => {
    expect(rankTeams([VARSITY, JV, VBALL], 'girls volleyball')).toEqual([VBALL]);
  });

  it('matches the sport slug', () => {
    expect(rankTeams([VARSITY, VBALL], 'girls-volleyball')).toEqual([VBALL]);
  });

  it('requires every term to match, so an impossible combination returns nothing', () => {
    expect(rankTeams([VARSITY, JV, VBALL], 'varsity lacrosse')).toEqual([]);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(rankTeams([VARSITY, JV], '  VARSITY   Football ')[0]).toBe(VARSITY);
  });
});
