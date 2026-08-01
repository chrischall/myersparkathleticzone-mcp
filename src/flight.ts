// Parsing for the Next.js App Router RSC flight payload.
//
// Athletic Zone sites are fully server-rendered: every page ships its data
// inside the RSC flight stream rather than calling a browser-visible API. The
// site's own `/api/*` routes are server-only and reject every request from
// outside (400 `Missing required query parameters`), so the flight payload is
// the supported read path — and it needs no auth of any kind.
//
// A flight document is a sequence of `<hexid>:<payload>` lines. Data rows are
// JSON; `I[...]` (client module refs) and `T<len>,<text>` (text chunks) are not,
// and are skipped. The domain objects live as props inside serialized React
// element trees, so we deep-walk every row and harvest objects that match an
// entity signature.

/** An object harvested from the flight payload. Shapes are upstream-defined. */
export type FlightObject = Record<string, unknown>;

/** Predicate identifying one kind of domain entity. */
export type Matcher = (o: FlightObject) => boolean;

/**
 * Entity signatures, keyed by the name used in tool arguments.
 *
 * Chosen from fields observed on real responses. `teams` requires `id` on
 * purpose: the homepage carries display-only `sport`+`gender`+`level` labels
 * with no id, which are not addressable teams.
 */
export const MATCHERS = {
  events: (o) => 'eventType' in o && 'start' in o,
  teams: (o) => 'sport' in o && 'gender' in o && 'level' in o && 'id' in o,
  coaches: (o) => 'coachPosition' in o,
  players: (o) => 'jerseyNumber' in o || (('firstName' in o || 'lastName' in o) && 'graduationYear' in o),
  news: (o) => 'publishedDatetimeUtc' in o,
  videos: (o) => 'sourceUrl' in o && 'videoLengthSeconds' in o,
  galleries: (o) => 'photoCount' in o || ('thumbnailUrl' in o && 'title' in o && !('sourceUrl' in o)),
} satisfies Record<string, Matcher>;

export type EntityKind = keyof typeof MATCHERS;

export const ENTITY_KINDS = Object.keys(MATCHERS) as EntityKind[];

const ROW_RE = /^[0-9a-f]+:(.*)$/;

/**
 * Split a flight document into its parsed JSON data rows.
 *
 * Non-JSON rows are skipped rather than reported: a row can also be truncated
 * mid-stream, and one unparseable row must not lose the rest of the page.
 */
export function parseFlightRows(text: string): unknown[] {
  const out: unknown[] = [];
  for (const line of text.split('\n')) {
    const m = ROW_RE.exec(line);
    if (!m) continue;
    const payload = m[1];
    if (!(payload.startsWith('{') || payload.startsWith('['))) continue;
    try {
      out.push(JSON.parse(payload));
    } catch {
      // partial / streamed row
    }
  }
  return out;
}

/**
 * Deep-walk `node`, collecting every distinct object satisfying `match`.
 *
 * Walking continues *through* a matched object, because entities nest others
 * (an event carries `game.homeTeam`; a roster carries `players`). Identity is
 * structural, so the same entity reached by two paths is returned once.
 */
export function harvest(node: unknown, match: Matcher): FlightObject[] {
  const acc: FlightObject[] = [];
  const seen = new Set<string>();

  const walk = (n: unknown): void => {
    if (n === null || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      for (const c of n) walk(c);
      return;
    }
    const o = n as FlightObject;
    if (match(o)) {
      const k = JSON.stringify(o);
      if (!seen.has(k)) {
        seen.add(k);
        acc.push(o);
      }
    }
    for (const v of Object.values(o)) walk(v);
  };

  walk(node);
  return acc;
}
