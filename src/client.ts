import { readEnvVar, McpToolError, createHelpfulError, truncateErrorMessage, messageOf } from '@chrischall/mcp-utils';
import { parseFlightRows, harvest, MATCHERS, type EntityKind, type FlightObject } from './flight.js';

/** Default deployment this server targets. Both are overridable via env. */
export const DEFAULT_SITE_URL = 'https://www.myersparkathleticzone.com';
export const DEFAULT_SCHOOL_ID = '10150';

/**
 * The site's own not-found signal, carried in the page title rather than the
 * status code. Anchored to the `"children":"…"` title prop so ordinary page
 * copy containing the words "not found" cannot trip it.
 */
const NOT_FOUND_TITLE_RE = /"children"\s*:\s*"(Team [A-Za-z ]*Not Found)"/;

export interface AthleticZoneClientOptions {
  siteUrl?: string;
  schoolId?: string;
  /** Injectable for tests. Called as a method so it keeps its `this` binding. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Reads an Athletic Zone site by fetching pages as RSC flight and harvesting
 * the entities embedded in them. There is no authentication anywhere in this
 * client: the data is public.
 */
export class AthleticZoneClient {
  readonly siteUrl: string;
  readonly schoolId: string;
  private readonly doFetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: AthleticZoneClientOptions = {}) {
    this.siteUrl = (opts.siteUrl ?? readEnvVar('MPAZ_SITE_URL') ?? DEFAULT_SITE_URL).replace(/\/+$/, '');
    this.schoolId = opts.schoolId ?? readEnvVar('MPAZ_SCHOOL_ID') ?? DEFAULT_SCHOOL_ID;
    // Bind through a wrapper: a detached `globalThis.fetch` throws "Illegal
    // invocation" on some runtimes, and this also keeps vi.spyOn working.
    const impl = opts.fetchImpl;
    this.doFetch = impl ? (input, init) => impl(input, init) : (input, init) => globalThis.fetch(input, init);
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  /** Build an absolute page URL, dropping params that are unset. */
  url(path: string, query: Record<string, string | undefined> = {}): string {
    const u = new URL(path, this.siteUrl + '/');
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
    }
    return u.toString();
  }

  /** Fetch a page as an RSC flight document. */
  async flight(path: string, query: Record<string, string | undefined> = {}): Promise<string> {
    const url = this.url(path, query);
    let response: Response;
    try {
      response = await this.doFetch(url, {
        headers: { RSC: '1', accept: 'text/x-component,*/*' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new McpToolError(`Could not reach ${this.siteUrl}: ${truncateErrorMessage(messageOf(err))}`, {
        hint: 'Check network access, or set MPAZ_SITE_URL if the site moved.',
      });
    }
    if (!response.ok) {
      throw new McpToolError(`${this.siteUrl} returned ${response.status} for ${path}`, {
        hint: response.status === 404 ? 'Check the sport slug — it is "<gender>-<sport>", e.g. boys-football.' : undefined,
      });
    }
    return response.text();
  }

  /**
   * Fetch a page and harvest one kind of entity from it.
   *
   * An empty result is a legitimate answer (a season with no games, a team with
   * no published roster). A payload with *no data rows at all* is not: that is
   * the site's redirect stub, which means required query params are missing.
   */
  async entities(
    path: string,
    kind: EntityKind,
    query: Record<string, string | undefined> = {},
  ): Promise<FlightObject[]> {
    const rows = await this.rows(path, query);
    return harvest(rows, MATCHERS[kind]);
  }

  /**
   * Harvest several entity kinds from a single page fetch.
   *
   * A roster page carries both coaches and players; fetching it once per kind
   * would double the request count for no gain.
   */
  async entitiesMany<K extends EntityKind>(
    path: string,
    kinds: readonly K[],
    query: Record<string, string | undefined> = {},
  ): Promise<Record<K, FlightObject[]>> {
    const rows = await this.rows(path, query);
    return Object.fromEntries(kinds.map((k) => [k, harvest(rows, MATCHERS[k])])) as Record<K, FlightObject[]>;
  }

  /** Fetch a page and return its parsed data rows, rejecting non-content pages. */
  private async rows(path: string, query: Record<string, string | undefined>): Promise<unknown[]> {
    const body = await this.flight(path, query);

    // A stale or bogus team id neither 404s nor redirects: the site serves a
    // full HTTP 200 page whose title is "Team <Roster|Schedule|Scores> Not
    // Found". Left undetected it harvests to an empty array, which reads as
    // "this team has no games" instead of "that id is wrong".
    const notFound = NOT_FOUND_TITLE_RE.exec(body);
    if (notFound) {
      throw createHelpfulError(`The site returned "${notFound[1]}" for ${path}.`, {
        hint:
          'The team id is not valid for that school year — ids are per-year, so an id from a past season fails. ' +
          'Re-resolve it with mpaz_list_teams or mpaz_resolve_team for the year you are querying.',
      });
    }

    const rows = parseFlightRows(body);
    if (rows.length === 0) {
      throw createHelpfulError(`${path} returned no data — the site redirected instead of rendering.`, {
        hint:
          '/sport/<slug>/{schedule,roster,scores} require BOTH team and year. ' +
          'Resolve the team id first (mpaz_list_teams or mpaz_resolve_team); team ids differ per year.',
      });
    }
    return rows;
  }
}

/**
 * Module-level singleton used by the tool registrars.
 *
 * The constructor is pure — no I/O, no randomness, no timers — so importing
 * this module is safe in any runtime.
 */
export const client = new AthleticZoneClient();
