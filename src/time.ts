// Event times. The site's `start` is the school's LOCAL wall-clock time
// serialised with a false `.000Z` suffix — scores rows prove it, since their
// `startUtc` (the real instant) is always 4h (EDT) or 5h (EST) later. Treating
// `start` as UTC reports every kickoff 4-5 hours early, so it is re-read here as
// wall time in the school's zone and converted to a genuine UTC instant.

/** Every tenant observed so far (Myers Park, Ballantyne Ridge) is in Charlotte, NC. */
export const DEFAULT_TIME_ZONE = 'America/New_York';

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;

export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `tz` from UTC, in ms, at the instant `utcMs`. */
function offsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

export interface EventTime {
  /** The real UTC instant, ISO-8601 with `Z`. */
  start: string | null;
  /** The school's local wall-clock time, no offset: "2026-08-14T18:30:00". */
  startLocal: string | null;
}

/**
 * Resolve an event's time. `startUtc` (scores rows only) is authoritative when
 * present; otherwise `start` is read as wall time in `timeZone` and converted.
 */
export function eventTime(rawStart: unknown, rawStartUtc: unknown, timeZone: string): EventTime {
  const m = typeof rawStart === 'string' ? WALL.exec(rawStart) : null;
  const startLocal = m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}` : null;

  const fromPayload = typeof rawStartUtc === 'string' ? Date.parse(rawStartUtc) : NaN;
  if (Number.isFinite(fromPayload)) return { start: new Date(fromPayload).toISOString(), startLocal };
  if (!m) return { start: null, startLocal: null };

  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  // Two passes: the offset guessed at the naive instant can be wrong across a
  // DST change, so re-read it at the first estimate.
  const guess = naive - offsetMs(naive, timeZone);
  const utc = naive - offsetMs(guess, timeZone);
  return { start: new Date(utc).toISOString(), startLocal };
}
