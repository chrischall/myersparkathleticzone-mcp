import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { normalizeEvent, normalizeCoach } from '../normalize.js';
import { currentSchoolYear, normalizeYear } from '../season.js';

const YearArg = z
  .string()
  .optional()
  .describe('School year, e.g. "2026-2027". Defaults to the current one. Only the current year holds data.');

const SportSlugArg = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)+$/, 'Expected a slug like "boys-football"')
  .describe('Sport slug, "<gender>-<sport>", e.g. boys-football, girls-volleyball. From mpaz_list_teams.');

const TeamIdArg = z
  .string()
  .regex(/^\d+$/, 'Team ids are numeric')
  .describe('Numeric team id from mpaz_list_teams / mpaz_resolve_team. Ids differ per school year.');

const byStart = (a: { start: string | null }, b: { start: string | null }) => (a.start ?? '').localeCompare(b.start ?? '');

export function registerScheduleTools(server: McpServer): void {
  server.registerTool(
    'mpaz_get_schedule',
    {
      title: 'Get the all-school schedule',
      description:
        'Upcoming events across every team, oldest first. Note this page returns a WINDOW of upcoming events ' +
        '(10 observed), not a whole season — for a team\'s full season use mpaz_get_team_schedule. Read-only.',
      annotations: toolAnnotations({
        title: 'Get the all-school schedule',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: { year: YearArg },
    },
    async ({ year }) => {
      const season = year ? normalizeYear(year) : currentSchoolYear();
      const raw = await client.entities('/schedule', 'events', { year: season });
      const events = raw.map((e) => normalizeEvent(e, client.schoolId)).sort(byStart);
      return textResult({
        year: season,
        count: events.length,
        window: 'upcoming events only — not the full season',
        events,
      });
    },
  );

  server.registerTool(
    'mpaz_get_team_schedule',
    {
      title: 'Get one team\'s full schedule',
      description:
        'A single team\'s complete season, oldest first. Requires BOTH the sport slug and the team id — resolve them ' +
        'with mpaz_list_teams or mpaz_resolve_team first. Read-only.',
      annotations: toolAnnotations({
        title: 'Get one team\'s full schedule',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: { sportSlug: SportSlugArg, teamId: TeamIdArg, year: YearArg },
    },
    async ({ sportSlug, teamId, year }) => {
      const season = year ? normalizeYear(year) : currentSchoolYear();
      const raw = await client.entities(`/sport/${sportSlug}/schedule`, 'events', { team: teamId, year: season });
      const events = raw.map((e) => normalizeEvent(e, client.schoolId)).sort(byStart);
      return textResult({ year: season, sportSlug, teamId, count: events.length, events });
    },
  );

  server.registerTool(
    'mpaz_get_scores',
    {
      title: 'Get one team\'s results',
      description:
        'Completed games with results for a single team. UNVERIFIED: this school had no completed games when the ' +
        'server was built, so no scores payload has ever been observed and the score fields are unknown — the tool ' +
        'returns whatever events the page yields, with a note. Prefer mpaz_get_team_schedule for fixtures. Read-only.',
      annotations: toolAnnotations({
        title: 'Get one team\'s results',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: { sportSlug: SportSlugArg, teamId: TeamIdArg, year: YearArg },
    },
    async ({ sportSlug, teamId, year }) => {
      const season = year ? normalizeYear(year) : currentSchoolYear();
      const raw = await client.entities(`/sport/${sportSlug}/scores`, 'events', { team: teamId, year: season });
      const events = raw.map((e) => normalizeEvent(e, client.schoolId)).sort(byStart);
      return textResult({
        year: season,
        sportSlug,
        teamId,
        count: events.length,
        note:
          'Score fields are unverified — none were observable when this server was built. ' +
          'An empty result most likely means no games have been played yet.',
        events,
      });
    },
  );

  server.registerTool(
    'mpaz_get_roster',
    {
      title: 'Get a team\'s roster and coaches',
      description:
        'Coaching staff and players for one team. Most teams on this site publish coaches but NOT players, so an ' +
        'empty players list is normal, not an error. Requires the sport slug and team id. Read-only.',
      annotations: toolAnnotations({
        title: 'Get a team\'s roster and coaches',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: { sportSlug: SportSlugArg, teamId: TeamIdArg, year: YearArg },
    },
    async ({ sportSlug, teamId, year }) => {
      const season = year ? normalizeYear(year) : currentSchoolYear();
      const harvested = await client.entitiesMany(`/sport/${sportSlug}/roster`, ['coaches', 'players'] as const, {
        team: teamId,
        year: season,
      });
      return textResult({
        year: season,
        sportSlug,
        teamId,
        coaches: harvested.coaches.map(normalizeCoach),
        players: harvested.players,
        playersNote:
          harvested.players.length === 0 ? 'This team publishes no player roster — coaches only.' : undefined,
      });
    },
  );
}
