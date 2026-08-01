# myersparkathleticzone-mcp

MCP server for [Myers Park High School](https://www.myersparkathleticzone.com) (Mustangs) athletics — schedules, teams, rosters, coaches, news and game broadcast links.

**No credentials.** Everything this server reads is public. There is no login, no API key, no browser extension and nothing to configure before it works.

> Developed and maintained by AI. Use at your own discretion.

## Install

```bash
npx myersparkathleticzone-mcp
```

Or in an MCP host's config:

```json
{
  "mcpServers": {
    "myersparkathleticzone": {
      "command": "npx",
      "args": ["-y", "myersparkathleticzone-mcp"]
    }
  }
}
```

## Tools

| Tool | What it does |
|---|---|
| `mpaz_list_teams` | The school's teams for a year, with the ids the other tools need |
| `mpaz_resolve_team` | Loose name ("varsity football") → team id |
| `mpaz_get_schedule` | Upcoming events across every team |
| `mpaz_get_team_schedule` | One team's full season |
| `mpaz_get_scores` | One team's results, with win/loss/tie from the school's point of view |
| `mpaz_get_roster` | A team's coaching staff and players |
| `mpaz_list_news` | Recent news posts |
| `mpaz_list_videos` | Games with an NFHS Network broadcast link |
| `mpaz_list_photo_galleries` | Published photo galleries |
| `mpaz_healthcheck` | Verify the site is reachable and parseable |

Every tool is read-only; the server performs no writes.

Team-scoped tools need a **numeric team id and a sport slug**, and **team ids differ per school year**. Resolve them with `mpaz_resolve_team` rather than guessing — a stale id makes the site serve a `Team … Not Found` page (with HTTP 200), which the client detects and reports.

## Configuration

Both optional:

| Variable | Default | Purpose |
|---|---|---|
| `MPAZ_SITE_URL` | `https://www.myersparkathleticzone.com` | Point at another Athletic Zone school site |
| `MPAZ_SCHOOL_ID` | `10150` | GoFan/PlayOn school id, used to tell your teams from opponents |

The site is one tenant of the PlayOn Sports / SportsEngine "Athletic Zone" platform, so setting both points the server at another school on it. Verified against Ballantyne Ridge (`https://www.ballantyneridgeathleticzone.com`, school id `21785`) as well as Myers Park.

## Known limits

These are properties of the upstream site, not bugs, and the tools say so in their output rather than guessing:

- **A missing score is unknown, never zero.** Each side's score is stored independently upstream, so half-entered games (`3-null`, `null-4`) are common. `result` is derived only when both sides are present.
- **Myers Park records few scores.** Every completed game of theirs observed so far has null scores, so a season may return fixtures with no results at all — that is the school's data entry, not a fault.
- **Past seasons are reachable, but not via the all-school schedule.** Myers Park's `/schedule` is empty for past years even though the per-team pages still serve them, so `mpaz_list_teams` falls back to the sport pages' cross-year team selector to find those ids.
- **Most teams publish coaches but not players**, so an empty roster is normal.
- **The all-school schedule is a window of upcoming events**, not a full season — use `mpaz_get_team_schedule` for that.
- **Broadcast links are NFHS Network links, not hosted clips** — durations are always `0`.

## How it works

The site is a fully server-rendered Next.js app whose own `/api/*` routes are server-only and reject outside requests. The data ships inside the page's React Server Components flight payload, so this server requests pages with the `RSC: 1` header and harvests the entities embedded in them.

`docs/ATHLETIC-ZONE-API.md` pins the captured request/response shapes, the routes, the failure modes, and what was ruled out.

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
