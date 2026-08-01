import { describe, it, expect } from 'vitest';
import { currentSchoolYear, normalizeYear } from '../src/season.js';

describe('currentSchoolYear', () => {
  it('rolls over on 1 August, when fall sports begin', () => {
    expect(currentSchoolYear(new Date('2026-07-31T12:00:00Z'))).toBe('2025-2026');
    expect(currentSchoolYear(new Date('2026-08-01T12:00:00Z'))).toBe('2026-2027');
  });

  it('keeps the same label through the spring half of the year', () => {
    expect(currentSchoolYear(new Date('2026-12-25T12:00:00Z'))).toBe('2026-2027');
    expect(currentSchoolYear(new Date('2027-05-01T12:00:00Z'))).toBe('2026-2027');
  });
});

describe('normalizeYear', () => {
  it('passes through the canonical form', () => {
    expect(normalizeYear('2026-2027')).toBe('2026-2027');
  });

  it('accepts the slash form the payload uses for team.year', () => {
    expect(normalizeYear('2026/2027')).toBe('2026-2027');
  });

  it('expands a single start year', () => {
    expect(normalizeYear('2026')).toBe('2026-2027');
  });

  it('rejects nonsense rather than silently querying the wrong season', () => {
    expect(() => normalizeYear('last year')).toThrow(/year/i);
    expect(() => normalizeYear('2026-2028')).toThrow(/consecutive/i);
  });
});
