#!/usr/bin/env node
import { runMcp } from '@chrischall/mcp-utils';
import { VERSION } from './version.js';
import { registerTeamTools } from './tools/teams.js';
import { registerScheduleTools } from './tools/schedule.js';
import { registerContentTools } from './tools/content.js';

// Every tool is a public read — the site requires no authentication of any
// kind, so there is no credential to defer and the server is always fully
// functional at boot.
await runMcp({
  name: 'myersparkathleticzone-mcp',
  version: VERSION,
  banner:
    '[myersparkathleticzone-mcp] This project was developed and is maintained by AI. Use at your own discretion.',
  tools: [registerTeamTools, registerScheduleTools, registerContentTools],
});
