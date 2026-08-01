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
  .describe('School year, e.g. "2026-2027". Defaults to the current one. Past seasons are supported.');

const byName = (a: Team, b: Team) => (a.displayName ?? '').localeCompare(b.displayName ?? '');

/** Team.year is rendered with a slash ("2024/2025"); the query param uses a dash. */
const toSlashYear = (year: string) => year.replace('-', '/');

/**
 * Team ids for a school year.
 *
 * The all-school schedule is the primary source — it embeds the full team
 * record for everything playing that year, ours and opponents'. But it can be
 * empty for a past season even while the per-team pages still serve it (true of
 * Myers Park), so we then fall back to the cross-year team selector carried on
 * each sport page, using the current year's teams as entry points.
 *
 * Selector teams have no `schools` array — they are implicitly the school's own,
 * being listed on its own sport page — so the opponent filter must not be
 * applied to them.
 */
export async function collectTeams(
  api: Pick<AthleticZoneClient, 'entities' | 'schoolId'>,
  year: string,
  current: string,
): Promise<Team[]> {
  const own = ownTeams(await api.entities('/schedule', 'teams', { year }), api.schoolId);
  if (own.length > 0 || year === current) return own.sort(byName);

  const entryPoints = new Map<string, string>();
  for (const t of ownTeams(await api.entities('/schedule', 'teams', { year: current }), api.schoolId)) {
    if (t.sportSlug && t.id && !entryPoints.has(t.sportSlug)) entryPoints.set(t.sportSlug, t.id);
  }

  const wanted = toSlashYear(year);
  const found = new Map<string, Team>();
  for (const [slug, teamId] of entryPoints) {
    const raw = await api.entities(`/sport/${slug}/schedule`, 'teams', { team: teamId, year: current });
    for (const t of raw.map(normalizeTeam)) {
      if (t.id && t.year === wanted && !found.has(t.id)) found.set(t.id, t);
    }
  }
  return [...found.values()].sort(byName);
}

const listTeams = (year: string): Promise<Team[]> => collectTeams(client, year, currentSchoolYear());

const NOTE =
  'Team ids differ per school year — an id from one season fails against another. Past seasons are reachable, ' +
  'though the school may list fewer teams for them.';

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
      const teams = await listTeams(season);
      return textResult({ year: season, schoolId: client.schoolId, count: teams.length, teams });
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
      const teams = await listTeams(season);

      const matches = rankTeams(teams, query);

      if (matches.length === 0) {
        throw createHelpfulError(`No ${season} team matches "${query}".`, {
          hint:
            teams.length > 0
              ? `Known teams: ${teams.map((t) => t.displayName).join(', ')}`
              : `No teams found for ${season}. The school may not have fielded teams that year, or may not ` +
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
      });
    },
  );
}

/** Exported for reuse by the schedule/roster tools. */
export { listTeams, sportSlug };
