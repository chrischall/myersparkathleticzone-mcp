---
name: myersparkathleticzone-mcp
description: Schedules, teams, rosters, coaches, news and game broadcast links for Myers Park High School (Mustangs) athletics. Use when the user asks about Myers Park games, when a team plays, who a team's coach is, opponents, home/away fixtures, or school sports news.
---

# Myers Park Athletic Zone

Reads the public Myers Park athletics site. **No account or credentials** — every tool is a public read, and the server is fully functional the moment it starts.

## Resolve the team first

Team-scoped tools need a **numeric team id and a sport slug**, and **team ids differ per school year** — an id from a past season fails. Never guess one:

1. `mpaz_resolve_team` with a loose name ("varsity football", "girls JV volleyball"), or `mpaz_list_teams` to see them all.
2. Pass the returned `id` and `sportSlug` to `mpaz_get_team_schedule` / `mpaz_get_roster` / `mpaz_get_scores`.

If a team tool reports "Team … Not Found", the id is stale — re-resolve it for the year you're asking about.

## Picking the right tool

- **What's coming up across the school** → `mpaz_get_schedule`. Returns a *window* of upcoming events, not a full season.
- **One team's whole season** → `mpaz_get_team_schedule`.
- **Who coaches a team** → `mpaz_get_roster`. Most teams publish coaches but **not players**, so an empty `players` list is normal.
- **Results** → `mpaz_get_scores`, but see the caveat below.
- **News / broadcasts / photos** → `mpaz_list_news`, `mpaz_list_videos`, `mpaz_list_photo_galleries`.
- **Is it up?** → `mpaz_healthcheck`.

## Reading the results

- `start` is **ISO UTC**; the school is in America/New_York, so convert before telling the user a kickoff time.
- `isHome` says whether Myers Park hosts; `opponent` is the other **school**; `venue` can differ from either on neutral sites.
- `team` is Myers Park's side of the fixture.
- Check `isCancelled` / `isPostponed` / `isTba` before stating a game is on.

## Caveats worth stating out loud

- **Only the current school year holds data.** A past year returns nothing — that's the site, not a failure. Say so rather than implying the team had no games.
- **Scores are unverified.** No completed game existed when this server was built, so the score fields were never observed. An empty result most likely means no games have been played yet — don't present it as "lost all games" or invent a record.
- **Broadcast links are NFHS Network links, not clips** — `videoLengthSeconds` is always `0` and `title` is the team name. Don't report a 0-second video.
