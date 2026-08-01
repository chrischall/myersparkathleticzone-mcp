import type { Team } from './normalize.js';

/**
 * Ranking for the loose team lookup.
 *
 * Substring matching alone is wrong here: "Junior Varsity" contains the word
 * "varsity", so a plain `includes` search for "varsity football" returns JV
 * Football as readily as Varsity Football — and whichever happened to come
 * first won. Terms are therefore matched against whole words, and results are
 * ordered so the team the caller obviously meant comes first.
 */

const words = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** All searchable words for a team, including its slug. */
function haystack(team: Team): string[] {
  return words([team.displayName, team.gender, team.sport, team.level, team.sportSlug].filter(Boolean).join(' '));
}

/**
 * Score a team against the query terms. Returns null when any term is
 * unmatched — every term must hit, so "varsity lacrosse" never returns a
 * football team just because "varsity" matched.
 */
function score(team: Team, terms: string[]): number | null {
  const hay = haystack(team);
  for (const term of terms) {
    if (!hay.some((w) => w === term || w.startsWith(term))) return null;
  }

  let s = 0;
  const name = words(team.displayName ?? '');
  const query = terms.join(' ');

  // Strongest signal: the display name itself contains the whole query.
  if (name.join(' ').includes(query)) s += 100;
  // Then: how many terms are in the display name rather than only in metadata.
  s += terms.filter((t) => name.some((w) => w === t)).length * 10;
  // Prefer an exact level hit ("varsity" -> Varsity, not Junior Varsity).
  if (terms.some((t) => words(team.level ?? '').length === 1 && words(team.level ?? '')[0] === t)) s += 5;
  // Tie-break toward the more specific (shorter) name.
  s -= name.length;

  return s;
}

/** Teams matching every term, best match first. */
export function rankTeams(teams: Team[], query: string): Team[] {
  const terms = words(query);
  if (terms.length === 0) return [];

  return teams
    .map((team) => ({ team, s: score(team, terms) }))
    .filter((r): r is { team: Team; s: number } => r.s !== null)
    .sort((a, b) => b.s - a.s)
    .map((r) => r.team);
}
