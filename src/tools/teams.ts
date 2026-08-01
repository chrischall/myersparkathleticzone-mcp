import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations, createHelpfulError } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { ownTeams, sportSlug, type Team } from '../normalize.js';
import { rankTeams } from '../match.js';
import { currentSchoolYear, normalizeYear } from '../season.js';

const YearArg = z
  .string()
  .optional()
  .describe('School year, e.g. "2026-2027". Defaults to the current one. Only the current year holds data.');

/**
 * The all-school schedule is the reliable source of team ids: it embeds the
 * full team record for every team playing in the window, ours and opponents'.
 */
async function listTeams(year: string): Promise<Team[]> {
  const raw = await client.entities('/schedule', 'teams', { year });
  return ownTeams(raw, client.schoolId).sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
}

const NOTE =
  'Team ids differ per school year — an id from a past season 404s. Only teams with scheduled events in the ' +
  'current window are listed.';

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
              : `No teams found for ${season}. Only the current school year holds data on this site.`,
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
