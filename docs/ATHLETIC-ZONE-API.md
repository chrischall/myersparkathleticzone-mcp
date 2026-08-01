# Athletic Zone read surface

Captured live against `https://www.myersparkathleticzone.com` on 2026-08-01. Everything here is public — there is no authentication anywhere in this server.

## Platform

Myers Park High School's athletics site runs on the PlayOn Sports / SportsEngine **"Athletic Zone"** platform: a multi-tenant Next.js (App Router) app on Vercel, routed by `x-matched-path: /[domain]`. Identifiers for this tenant:

- school id `10150` (GoFan/PlayOn)
- SportsEngine org UUID `da1be037-22fc-c58a-aec3-a129a4bab2d1`
- apex `myersparkathleticzone.com` 308-redirects to `www.`

Both the origin and the school id are configurable (`MPAZ_SITE_URL`, `MPAZ_SCHOOL_ID`), so the server can point at another Athletic Zone tenant.

## Transport: RSC flight, not an API

The pages are fully server-rendered. Sending the **`RSC: 1`** request header returns the React Server Components flight payload (`text/x-component`) instead of HTML — the same data, ~30% smaller:

```
curl -sH 'RSC: 1' 'https://www.myersparkathleticzone.com/schedule?year=2026-2027'
```

A flight document is a sequence of `<hexid>:<payload>` lines. Data rows are JSON; `I[...]` (client module refs) and `T<len>,<text>` (text chunks) are not. Domain objects live as props inside serialized React element trees, so `src/flight.ts` parses every JSON row and deep-walks it, harvesting objects that match an entity signature.

### The `/api/*` routes are NOT usable

The client bundle contains an api client for eight same-origin routes:

```
/api/news  /api/schedule  /api/team/schedule  /api/events/scores
/api/media/photos  /api/media/photos/gallery  /api/socials/facebook  /api/socials/facebook/post
```

It ships a hardcoded bearer — `4525116d-b7c9-4af3-ae24-932092b3f887` — which is **not a secret**: it is served to every anonymous visitor in a public JS chunk. It is recorded here only because it is part of the observed request shape.

These routes are called by the Next.js server, not the browser. Verified over ~35 probes: every combination of `schoolId`, `organizationId`, `globalOrganizationId`, `domain`, `page`/`size`/`limit`/`offset`/`count`/`take`, `startDate`/`endDate`, `teamId`, `galleryId`, `seasonId`, `year`, `timezone` returns `400 {"error":"Missing required query parameters"}`. The only route that answers is `/api/socials/facebook?schoolId=10150`, which then fails upstream on Facebook's own token. Ruled out as a data source.

Also ruled out: source maps (404), `sitemap.xml` / `robots.txt` (the `[domain]` catch-all serves the app shell), and browser network capture (no XHR/fetch to `/api/*` fires on the schedule, scores or photo pages — year navigation is a full RSC navigation).

## Routes

| Path | Required query | Notes |
|---|---|---|
| `/` | — | news, broadcast links, team labels |
| `/schedule` | `year` | all-school; **a window of upcoming events, not a season** |
| `/sport/<slug>/schedule` | `team`, `year` | one team's full season |
| `/sport/<slug>/roster` | `team`, `year` | coaches, players |
| `/sport/<slug>/scores` | `team`, `year` | completed games + scores; different shape to `/schedule` |
| `/media/photos` | — | galleries; `/media/photos/<uuid>` for one |
| `/page/<uuid>` | — | CMS pages (forms, coach contacts, links) |

Sport slugs are `<gender>-<sport>`: `boys-football`, `girls-volleyball`, `girls-field-hockey`, `boys-soccer`, `boys-cross-country`, `girls-cross-country`, `coed-competitive-cheer`, `girls-flag-football`, `girls-golf`, `girls-tennis`.

**The slug is decorative.** `/sport/not-a-sport/roster?team=7840877&year=2026-2027` returns Myers Park's football roster: the `team` id alone selects the data. The slug still has to be *present* to route, so the tools require it, but it is not a filter and must never be trusted as one.

## Failure modes (all verified live)

These matter more than the happy path, because none of them look like failures:

- **A stale or bogus `team` id returns HTTP 200**, with a full page titled `Team Roster Not Found` / `Team Scores Not Found`. Harvesting it yields an empty array that reads as "this team has no games". Detected via the title prop — see `NOT_FOUND_TITLE_RE` in `src/client.ts`.
- **Team ids are per school year.** `4931777` (8th-grade football, 2024/2025) is not valid for 2026-2027.
- **Omitting `team`/`year` 307-redirects**, and `fetch` follows redirects by default, so the request silently lands on a data-less shell rather than erroring. The tools require both params so this cannot be reached through them.
- **Myers Park's all-school `/schedule` is empty for past years** (`2025-2026`, `2024-2025` → zero events) **even though its per-team pages still serve them** — `/sport/boys-football/scores?team=5105193&year=2024-2025` returns 6 real games. This is tenant-specific: Ballantyne Ridge's all-school `/schedule?year=2025-2026` returns events normally. So "past seasons are empty" is false as a platform property; only the discovery path differs, which is why `collectTeams` falls back to the sport pages' cross-year team selector.

## Entity shapes

### Event (`eventType` + `start`)

```jsonc
{
  "id": "38076875",
  "globalEventId": "d74a8514-d62e-4357-9b60-0a07b06aa76c",
  "eventType": "game",
  "start": "2026-08-14T18:30:00.000Z",     // ISO UTC; the site displays America/New_York
  "isCancelled": false, "isPostponed": false, "isScrimmage": false, "isTba": false,
  "teamEvents": [ { "id": "77493385", "team": { "id": "7840877", "schools": [ { "id": "10150", "name": "Myers Park High School" } ] } } ],
  "location": { "name": "Julius L. Chambers High School", "state": { "abbreviation": "NC" }, "school": { "id": "10150" } },
  "game": { "id": "38076875", "homeTeam": { "id": "7840877", "displayName": "Varsity Football", "schools": [ /* … */ ] }, "awayTeam": { /* … */ } }
}
```

Two traps encoded in `src/normalize.ts`:

- **`game.homeTeam` is authoritative for home/away** — `teamEvents` order is not.
- **Name the opponent by its school** (`schools[0].name`), never by `displayName`: both sides' `displayName` is the sport label, so using it renders `Girls JV Volleyball at Girls JV Volleyball`.

`location.name` is the venue and can differ from the home school (neutral sites).

### Team (`sport` + `gender` + `level` + `id`)

```jsonc
{
  "id": "7840877", "displayName": "Varsity Football", "hideGender": true,
  "gender": { "id": "1", "name": "Boys" },
  "sport":  { "id": "41", "name": "Football", "sportNames": [] },
  "level":  { "id": "1", "name": "Varsity" },
  "levelNameOverride": null,
  "year":   { "id": "32", "name": "2026/2027" }   // on sport-page selectors; absent on schedule-derived teams
}
```

`id` is required by the matcher on purpose: the homepage carries display-only `sport`+`gender`+`level` labels with **no id**, which are not addressable teams.

The all-school schedule embeds **opponent teams alongside ours**, so results must be filtered on `schools[].id === schoolId` — otherwise the school appears to field both sides of every game. Myers Park teams with events for 2026-2027:

| id | displayName |
|---|---|
| 7840877 | Varsity Football |
| 7840888 | JV Football |
| 7840893 | Girls Varsity Volleyball |
| 7840894 | Girls JV Volleyball |
| 7840933 | Girls JV Field Hockey |

**Sport pages carry a second, cross-year team selector** whose entries have **no `schools` array** — they are implicitly the school's own, being listed on its own sport page, so the opponent filter must *not* be applied to them. This is the only route to a past season's team ids when the all-school schedule is empty. It is sport-dependent: boys-football exposes historical middle-school teams, girls-volleyball and girls-field-hockey expose none.

| id | displayName | year |
|---|---|---|
| 5105193 | Boys Middle School Football | 2024/2025 |
| 4931777 | Boys 8th Grade Football | 2024/2025 |
| 5527213 | Boys Middle School Football | 2023/2024 |
| 5020814 | Boys 8th Grade Football | 2023/2024 |

### Coach (`coachPosition`)

```jsonc
{
  "id": "3377209", "firstName": null, "lastName": null, "photoUrl": null,
  "coachPosition": { "id": "1", "name": "Head Coach" },
  "user": { "firstName": "Chris ", "lastName": "James", "photoUrl": null }
}
```

The name lives under **`.user`**; the sibling top-level `firstName`/`lastName` are `null` on every record observed. Values carry stray whitespace, so collapse it.

### Players

The roster container exposes `roster.players`, **empty (`[]`) on every team checked** — this school publishes coaches but not players. The player shape is therefore **unverified**; `MATCHERS.players` is a best-effort signature (`jerseyNumber`, or a name plus `graduationYear`) and `mpaz_get_roster` returns raw player objects rather than a projection invented from guesswork.

### News (`publishedDatetimeUtc`), Videos (`sourceUrl` + `videoLengthSeconds`)

Videos are **NFHS Network links, not hosted clips**: `sourceUrlType` is `{"id":"2","name":"Anchor Href"}` and `videoLengthSeconds` is `0` on every entry, with `title` holding the team name and `startDatetimeUtc` the game date. A `0` duration is expected, not missing data.

## Scores

Verified 2026-08-01 against completed games. Myers Park's own 2026-2027 season had not started, so the *scored* captures come from **Ballantyne Ridge** (`ballantyneridgeathleticzone.com`, school id `21785`) — another tenant, reached by pointing the client at its site. Myers Park's own historical games (2023-2024, 2024-2025 middle-school football) were used for the null-`awayTeam` variant.

The scores page returns a **different event shape** to the schedule page:

```jsonc
{
  "eventType": "game",
  "id": "24855916",
  "start": "2024-10-17T14:42:00.000Z",
  "startUtc": "2024-10-17T18:42:00Z",        // extra, scores pages only
  "isCancelled": false,
  "teamEvents": [ { "id": "47225592", "eventLinks": [] } ],   // eventLinks, NOT team
  "game": {
    "id": "24855916",
    "homeTeam": { "id": "5105193", "displayName": "…", "schools": [ … ], "sport": {…}, "level": {…}, "gender": {…} },
    "awayTeam": null,                         // often null — see below
    "opponent": { "id": "1139270", "name": "Away", "opponent": { "id": "21785", "name": "Ballantyne Ridge High School", … } },
    "homeScore": null,
    "awayScore": null
  }
}
```

Differences that matter, each of which broke the first implementation:

- **`game.homeScore` / `game.awayScore`** are the score fields — integers or `null`.
- **The two scores are independently nullable.** Real rows include `0-8`, `3-null`, `null-4` and `null-null`. A missing score is *unknown*, not zero, so `result` is derived only when both are present; otherwise it is `null`.
- **`awayTeam` is frequently `null`**, with the opponent in a separate nested `game.opponent.opponent` block. Reading only `awayTeam` silently loses the opponent on exactly the pages where the result matters.
- **`homeTeam` can be absent too** on some rows, so home/away detection must degrade to `null` rather than assume.
- Scores events carry **no `globalEventId`, `isPostponed`, `isScrimmage` or `isTba`** — those flags exist only on schedule pages.

**Myers Park records almost no scores**: every completed game of theirs observed (8 across three seasons) has `null-null`. A season of fixtures with no results is that school's data entry, not a parsing fault.
