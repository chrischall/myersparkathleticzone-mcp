// Projections from the site's raw flight objects to compact, agent-friendly
// records. Kept deliberately loose: this is a reverse-engineered payload, so we
// read only fields observed on real responses and return null rather than
// throwing when one is absent.

import type { FlightObject } from './flight.js';

/** Sport slugs are "<gender>-<sport>", lowercased and hyphenated. */
export function sportSlug(gender: string | null, sport: string | null): string | null {
  if (!sport) return null;
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return gender ? `${norm(gender)}-${norm(sport)}` : norm(sport);
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const named = (v: unknown): string | null => str((v as FlightObject | undefined)?.name);

export interface Team {
  id: string | null;
  displayName: string | null;
  gender: string | null;
  sport: string | null;
  level: string | null;
  year: string | null;
  sportSlug: string | null;
}

export function normalizeTeam(raw: FlightObject): Team {
  const gender = named(raw.gender);
  const sport = named(raw.sport);
  return {
    id: str(raw.id),
    displayName: str(raw.displayName),
    gender,
    sport,
    level: named(raw.level),
    year: named(raw.year),
    sportSlug: sportSlug(gender, sport),
  };
}

const schoolIds = (team: unknown): string[] =>
  (((team as FlightObject | undefined)?.schools as FlightObject[] | undefined) ?? [])
    .map((s) => str(s?.id))
    .filter((v): v is string => v !== null);

/**
 * Keep only teams belonging to `schoolId`, de-duplicated by team id.
 *
 * Necessary because a schedule payload carries opponent teams alongside ours —
 * an unfiltered list reads as if the school fielded both sides of every game.
 */
export function ownTeams(raw: FlightObject[], schoolId: string): Team[] {
  const byId = new Map<string, Team>();
  for (const t of raw) {
    if (!schoolIds(t).includes(schoolId)) continue;
    const team = normalizeTeam(t);
    if (team.id && !byId.has(team.id)) byId.set(team.id, team);
  }
  return [...byId.values()];
}

export interface NormalizedEvent {
  id: string | null;
  eventType: string | null;
  start: string | null;
  team: string | null;
  opponent: string | null;
  isHome: boolean | null;
  venue: string | null;
  isCancelled: boolean;
  isPostponed: boolean;
  isScrimmage: boolean;
  isTba: boolean;
  /** Present on scores pages; null on schedule pages and for unplayed games. */
  homeScore: number | null;
  awayScore: number | null;
  /** The same two scores from our school's point of view. */
  teamScore: number | null;
  opponentScore: number | null;
  result: 'win' | 'loss' | 'tie' | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The opponent's school name.
 *
 * Scores pages return `awayTeam: null` and put the opponent in a separate
 * `game.opponent` block (itself nested: `opponent.opponent.name`), so reading
 * only `awayTeam` silently loses the opponent on exactly the pages where the
 * result matters.
 */
function opponentName(game: FlightObject | undefined, theirs: FlightObject | undefined): string | null {
  const fromTeam = str(((theirs?.schools as FlightObject[] | undefined) ?? [])[0]?.name);
  if (fromTeam) return fromTeam;
  const block = game?.opponent as FlightObject | undefined;
  const nested = str((block?.opponent as FlightObject | undefined)?.name);
  if (nested) return nested;
  // `block.name` is a POSITIONAL label ("Away"/"Home"), not a school — only the
  // nested opponent.opponent.name is real. Returning it would print
  // "Varsity Football vs Away".
  const label = str(block?.name);
  return label && !/^(home|away)$/i.test(label.trim()) ? label : null;
}

/**
 * Project one event from our school's point of view.
 *
 * `game.homeTeam` is authoritative for home/away — the `teamEvents` array order
 * is not. The opponent is named by its *school* because both teams' displayName
 * is the sport label ("Girls JV Volleyball"), which would otherwise render an
 * event as "Girls JV Volleyball at Girls JV Volleyball".
 */
export function normalizeEvent(raw: FlightObject, schoolId: string): NormalizedEvent {
  const game = raw.game as FlightObject | undefined;
  const home = game?.homeTeam as FlightObject | undefined;
  const away = game?.awayTeam as FlightObject | undefined;

  // Resolve our side by identifying our school directly, and only then fall
  // back to elimination. Reading `homeTeam` alone throws away a determinable
  // answer on scores rows where `homeTeam` is null but `awayTeam` names us —
  // and that also needlessly collapses teamScore/opponentScore/result.
  const isHome =
    home && schoolIds(home).includes(schoolId)
      ? true
      : away && schoolIds(away).includes(schoolId)
        ? false
        : home
          ? // These pages only list our own school's games, so a home side that
            // is someone else means we are the away side.
            false
          : null;
  const mine = isHome === null ? undefined : isHome ? home : away;
  const theirs = isHome === null ? undefined : isHome ? away : home;

  const homeScore = num((game as FlightObject | undefined)?.homeScore);
  const awayScore = num((game as FlightObject | undefined)?.awayScore);
  const teamScore = isHome === null ? null : isHome ? homeScore : awayScore;
  const opponentScore = isHome === null ? null : isHome ? awayScore : homeScore;

  // Each side's score is stored independently upstream, so half-entered rows
  // (3-null, null-4) are common. A missing score is unknown, never zero — so a
  // result is derived only when both are present.
  const result =
    teamScore === null || opponentScore === null
      ? null
      : teamScore > opponentScore
        ? 'win'
        : teamScore < opponentScore
          ? 'loss'
          : 'tie';

  return {
    id: str(raw.id),
    eventType: str(raw.eventType),
    start: str(raw.start),
    team: str(mine?.displayName),
    opponent: opponentName(game, theirs),
    isHome,
    venue: named(raw.location),
    isCancelled: raw.isCancelled === true,
    isPostponed: raw.isPostponed === true,
    isScrimmage: raw.isScrimmage === true,
    isTba: raw.isTba === true,
    homeScore,
    awayScore,
    teamScore,
    opponentScore,
    result,
  };
}

export interface Coach {
  id: string | null;
  name: string | null;
  position: string | null;
}

/**
 * Project a coach record. The real name lives under `.user`; the sibling
 * top-level `firstName`/`lastName` are null on every record observed.
 */
export function normalizeCoach(raw: FlightObject): Coach {
  const user = (raw.user as FlightObject | undefined) ?? {};
  const first = str(user.firstName) ?? str(raw.firstName);
  const last = str(user.lastName) ?? str(raw.lastName);
  const name = [first, last].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return {
    id: str(raw.id),
    name: name.length > 0 ? name : null,
    position: named(raw.coachPosition),
  };
}
