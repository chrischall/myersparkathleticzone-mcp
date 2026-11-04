import { z } from 'zod';
import { minifiedResult, UNTRUSTED_CONTENT_RULE, untrustedEnvelope } from '@chrischall/mcp-utils';
import type { NormalizedEvent } from '../normalize.js';

/**
 * Context-group hints, published on each tool as `_meta.mint` (mcp-host's
 * `mintHintSchema`, the context-groups contract). Inert data: a host that
 * does not read them sees an extra `_meta` key and nothing else. The shape is
 * fixed by the host's contract, so it is restated here rather than imported —
 * this server takes no dependency on mcp-host.
 *
 * No tool here names a `subject`: the site is one public school's athletics
 * page, so there is no listable set of the person's own subjects (children,
 * accounts) to publish. Teams are the site's, not the person's.
 */
export type MintIntent =
  | 'whats-new' | 'whats-due' | 'whats-on' | 'lookup' | 'turn-on-off' | 'send' | 'change' | 'other';

export interface MintHint {
  domain: 'school';
  intent: MintIntent;
  canonical?: true;
  subject?: string;
  when?: { start: string; end: string };
  aliases?: string[];
}

/** `_meta` for a tool on this server: every tool here is in the `school` domain. */
export function schoolMeta(
  intent: MintIntent,
  extra: Omit<MintHint, 'domain' | 'intent'> = {},
): { mint: MintHint } {
  return { mint: { domain: 'school', intent, ...extra } };
}

/** The `view` argument every canonical read takes. */
export const ViewArg = z
  .enum(['full', 'brief'])
  .optional()
  .describe(
    '"full" (default) returns the structured result; "brief" returns one line per item: ' +
      'title — <ISO date or "no date"> — <status>.',
  );

const BRIEF_MAX = 120;

/**
 * `title — date — status`, cut to ≤ 120 chars as a WHOLE by shortening the
 * title first. A line that would start with `-- ` (a note) or `\` (the
 * escape itself) gets one leading `\`, which the host strips after its note
 * check — so a site-written title can never masquerade as a note line.
 */
function line(rawTitle: string, date: string | null | undefined, status: string): string {
  const title = rawTitle.startsWith('-- ') || rawTitle.startsWith('\\') ? `\\${rawTitle}` : rawTitle;
  const tail = ` — ${date ?? 'no date'} — ${status}`;
  const room = BRIEF_MAX - tail.length;
  const shown = title.length > room ? `${title.slice(0, Math.max(room - 1, 0))}…` : title;
  return `${shown}${tail}`;
}

type BriefEvent = Pick<
  NormalizedEvent,
  'team' | 'opponent' | 'isHome' | 'start' | 'isCancelled' | 'isPostponed' | 'isTba' | 'result' | 'eventType'
>;

/**
 * One event as one line: `<team> vs|at <opponent> — <UTC ISO start | no date> — <status>`.
 * The status is the most decisive fact: cancelled, postponed, the result, a
 * TBA time, else home/away (or "scheduled" when the side is unknown).
 */
export function briefEventLine(e: BriefEvent): string {
  const title = e.team
    ? e.opponent
      ? `${e.team} ${e.isHome === false ? 'at' : 'vs'} ${e.opponent}`
      : e.team
    : e.opponent ?? e.eventType ?? '(untitled)';
  const status = e.isCancelled
    ? 'cancelled'
    : e.isPostponed
      ? 'postponed'
      : e.result
        ? e.result
        : e.isTba
          ? 'time tba'
          : e.isHome === true
            ? 'home'
            : e.isHome === false
              ? 'away'
              : 'scheduled';
  return line(title, e.start, status);
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

/** One news post as one line: `<title> — <published ISO | no date> — posted`. */
export function briefNewsLine(post: Record<string, unknown>): string {
  return line(str(post.title) ?? '(untitled)', str(post.publishedDatetimeUtc), 'posted');
}

/**
 * A brief answer. Every title here is text the athletics site published (news
 * posts, team names, opponent schools), so the lines ride inside the fleet's
 * untrusted-data envelope as `data: string[]`, minified, markers first. An
 * empty read answers the single note line `-- none`.
 */
export function briefResult(lines: string[], whoWrote: string) {
  return minifiedResult(
    untrustedEnvelope(lines.length === 0 ? ['-- none'] : lines, { note: `${whoWrote} ${UNTRUSTED_CONTENT_RULE}` }),
  );
}
