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

- **A null score is unknown, never zero.** Each side is stored independently upstream, so `3-null` and `null-4` are common; `result` is null unless both sides are present. Never report a null as `0` or infer a win/loss from a half-entered game.
- **Myers Park records few scores.** Every completed game of theirs seen so far has null scores, so results may be missing across a whole season — say the school didn't record them rather than implying the games weren't played.
- **Past seasons are partial.** When the all-school schedule has nothing for a year, `mpaz_list_teams` falls back to the sport pages' cross-year selector — which is reached through a *current* team id, so only sports **in season right now** can be searched. The result carries a `coverage` note listing what was searched. An empty list there means "not reachable this way", **not** "the school fielded no teams" — say which, and don't let the answer imply a sport didn't exist.
- **`scored` is not `played`.** In `mpaz_get_scores`, `scored` counts games with BOTH sides recorded. Every game returned was played; the rest simply have no usable score.
- **Broadcast links are NFHS Network links, not clips** — `videoLengthSeconds` is always `0` and `title` is the team name. Don't report a 0-second video.
