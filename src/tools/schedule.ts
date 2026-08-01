import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { normalizeEvent, normalizeCoach } from '../normalize.js';
import { currentSchoolYear, normalizeYear } from '../season.js';

const YearArg = z
  .string()
  .optional()
  .describe('School year, e.g. "2026-2027". Defaults to the current one. Past seasons are supported.');

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
        'Completed games with results for a single team: `homeScore`/`awayScore` plus `teamScore`/`opponentScore`/' +
        '`result` from this school\'s point of view. Each side\'s score is stored independently upstream, so a ' +
        'half-entered game yields a null score and `result: null` — a missing score is unknown, never zero. ' +
        'Prefer mpaz_get_team_schedule for upcoming fixtures. Read-only.',
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
        played: events.filter((e) => e.result !== null).length,
        note:
          'A null score means the school never recorded it, not zero; `result` is derived only when both ' +
          'sides are present.',
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
