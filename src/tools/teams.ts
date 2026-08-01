import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations, createHelpfulError } from '@chrischall/mcp-utils';
import { client, type AthleticZoneClient } from '../client.js';
import { ownTeams, normalizeTeam, sportSlug, type Team } from '../normalize.js';
import { rankTeams } from '../match.js';
import { currentSchoolYear, normalizeYear } from '../season.js';

const YearArg = z
  .string()
  .optional()
  .describe(
    'School year, e.g. "2026-2027". Defaults to the current one. Past seasons often work but coverage is ' +
    'partial — see the `coverage` note in the result.',
  );

const byName = (a: Team, b: Team) => (a.displayName ?? '').localeCompare(b.displayName ?? '');

/** Team.year is rendered with a slash ("2024/2025"); the query param uses a dash. */
const toSlashYear = (year: string) => year.replace('-', '/');

/** The result of a team lookup, including how complete it is. */
export interface TeamLookup {
  teams: Team[];
  /** True when the ids came from the sport-page selector rather than the schedule. */
  viaFallback: boolean;
  /** Sports the fallback could search. Empty unless `viaFallback`. */
  searchedSports: string[];
  /** Sport pages that errored; their teams are missing from `teams`. */
  failedSports: string[];
}

/**
 * Team ids for a school year.
 *
 * The all-school schedule is the primary source — it embeds the full team
 * record for everything playing that year, ours and opponents'. It can be empty
 * for a past season even while the per-team pages still serve it (true of Myers
 * Park), so we then fall back to the cross-year team selector carried on each
 * sport page, using the current year's teams as entry points.
 *
 * Selector teams have no `schools` array — they are implicitly the school's own,
 * being listed on its own sport page — so the opponent filter must not be
 * applied to them.
 */
export async function collectTeams(
  api: Pick<AthleticZoneClient, 'entities' | 'schoolId'>,
  year: string,
  current: string,
): Promise<TeamLookup> {
  const own = ownTeams(await api.entities('/schedule', 'teams', { year }), api.schoolId);
  if (own.length > 0 || year === current) {
    return { teams: own.sort(byName), viaFallback: false, searchedSports: [], failedSports: [] };
  }

  // Entry points can only come from the current schedule: the selector is keyed
  // by TEAM, not by sport slug (passing a football team id to the volleyball
  // page returns football teams), so there is no way to reach a sport that has
  // no current team id. The current schedule is an upcoming-events window, so
  // coverage is limited to sports in season now — hence `searchedSports`, which
  // lets the caller see what was actually looked at instead of assuming the
  // answer is complete.
  const entryPoints = new Map<string, string>();
  for (const t of ownTeams(await api.entities('/schedule', 'teams', { year: current }), api.schoolId)) {
    if (t.sportSlug && t.id && !entryPoints.has(t.sportSlug)) entryPoints.set(t.sportSlug, t.id);
  }

  const wanted = toSlashYear(year);
  const found = new Map<string, Team>();
  const failedSports: string[] = [];
  for (const [slug, teamId] of entryPoints) {
    try {
      const raw = await api.entities(`/sport/${slug}/schedule`, 'teams', { team: teamId, year: current });
      for (const t of raw.map(normalizeTeam)) {
        if (t.id && t.year === wanted && !found.has(t.id)) found.set(t.id, t);
      }
    } catch {
      // One bad sport page must not lose the sports that did resolve.
      failedSports.push(slug);
    }
  }
  return {
    teams: [...found.values()].sort(byName),
    viaFallback: true,
    searchedSports: [...entryPoints.keys()],
    failedSports,
  };
}

const listTeams = (year: string): Promise<TeamLookup> => collectTeams(client, year, currentSchoolYear());

/** Explains partial coverage, so a caller never reads an empty list as "no teams existed". */
function coverageNote(lookup: TeamLookup, year: string): string | undefined {
  if (!lookup.viaFallback) return undefined;
  const searched = lookup.searchedSports.length ? lookup.searchedSports.join(', ') : 'none';
  return (
    `The all-school schedule holds nothing for ${year}, so these ids come from the sport pages' cross-year ` +
    `team selector. That selector is reached through a CURRENT team id, so only sports in season right now ` +
    `could be searched (${searched}); teams from other sports that year are not reachable this way, and this ` +
    `coverage changes with the calendar.` +
    (lookup.failedSports.length ? ` Failed to read: ${lookup.failedSports.join(', ')}.` : '')
  );
}

const NOTE =
  'Team ids differ per school year — an id from one season fails against another. A past year is answered from ' +
  'the sport pages when the schedule has nothing, which reaches only sports currently in season; the result ' +
  'carries a `coverage` note saying so, and an empty list there does NOT mean the school fielded no teams.';

export function registerTeamTools(server: McpServer): void {
  server.registerTool(
    'mpaz_list_teams',
    {
      title: 'List the school\'s teams',
      description:
        'List this school\'s athletic teams for a school year, with the team id needed by the schedule, roster and ' +
        'scores tools. ' + NOTE + ' Read-only.',
      annotations: toolAnnotations({
        title: 'List the school\'s teams',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: { year: YearArg },
    },
    async ({ year }) => {
      const season = year ? normalizeYear(year) : currentSchoolYear();
      const lookup = await listTeams(season);
      return textResult({
        year: season,
        schoolId: client.schoolId,
        count: lookup.teams.length,
        teams: lookup.teams,
        coverage: coverageNote(lookup, season),
      });
    },
  );

  server.registerTool(
    'mpaz_resolve_team',
    {
      title: 'Resolve a team name to its id',
      description:
        'Find a team id from a loose name like "varsity football", "girls JV volleyball" or just "field hockey". ' +
        'Use this before mpaz_get_team_schedule / mpaz_get_roster / mpaz_get_scores rather than guessing an id. ' +
        'Returns every candidate when the query is ambiguous. Read-only.',
      annotations: toolAnnotations({
        title: 'Resolve a team name to its id',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        query: z.string().min(1).describe('Team name fragment, e.g. "varsity football"'),
        year: YearArg,
      },
    },
    async ({ query, year }) => {
      const season = year ? normalizeYear(year) : currentSchoolYear();
      const lookup = await listTeams(season);
      const teams = lookup.teams;

      const matches = rankTeams(teams, query);

      if (matches.length === 0) {
        throw createHelpfulError(`No ${season} team matches "${query}".`, {
          hint:
            teams.length > 0
              ? `Known teams: ${teams.map((t) => t.displayName).join(', ')}`
              : coverageNote(lookup, season) ??
                `No teams found for ${season}. The school may not have fielded teams that year, or may not ` +
                  `publish them — try the current school year.`,
        });
      }

      return textResult({
        year: season,
        query,
        matched: matches.length,
        ambiguous: matches.length > 1,
        // Best match first — see src/match.ts for why plain substring search is wrong.
        teams: matches,
        coverage: coverageNote(lookup, season),
      });
    },
  );
}

/** Exported for reuse by the schedule/roster tools. */
export { listTeams, sportSlug };
