import { describe, it, expect } from 'vitest';
import { createTestHarness } from './helpers.js';
import { registerTeamTools } from '../src/tools/teams.js';
import { registerScheduleTools } from '../src/tools/schedule.js';
import { registerContentTools } from '../src/tools/content.js';

const EXPECTED = [
  'mpaz_get_roster',
  'mpaz_get_schedule',
  'mpaz_get_scores',
  'mpaz_get_team_schedule',
  'mpaz_healthcheck',
  'mpaz_list_news',
  'mpaz_list_photo_galleries',
  'mpaz_list_teams',
  'mpaz_list_videos',
  'mpaz_resolve_team',
];

describe('tool roster', () => {
  it('registers exactly the expected tools', async () => {
    const harness = await createTestHarness((server) => {
      registerTeamTools(server);
      registerScheduleTools(server);
      registerContentTools(server);
    });
    const { tools } = await harness.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(EXPECTED);
    await harness.close();
  });

  it('marks every tool read-only — this server performs no writes', async () => {
    const harness = await createTestHarness((server) => {
      registerTeamTools(server);
      registerScheduleTools(server);
      registerContentTools(server);
    });
    const { tools } = await harness.client.listTools();
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint, `${t.name} should be read-only`).toBe(true);
    }
    await harness.close();
  });

  it('warns in the scores description that a missing score is not zero', async () => {
    // Real data has half-entered games (3-null, null-4). A caller that reads a
    // null as 0 invents a scoreline, so the description must say so.
    const harness = await createTestHarness(registerScheduleTools);
    const { tools } = await harness.client.listTools();
    const scores = tools.find((t) => t.name === 'mpaz_get_scores');
    expect(scores?.description).toMatch(/never zero|not zero/i);
    expect(scores?.description).not.toMatch(/unverified/i);
    await harness.close();
  });
});
