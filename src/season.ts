import { createHelpfulError } from '@chrischall/mcp-utils';

/**
 * The site labels seasons by school year ("2026-2027"). Fall sports start in
 * mid-August and the site's own upcoming-events window opens on 1 August, so
 * that is the rollover point used here.
 */
export function currentSchoolYear(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const startYear = now.getUTCMonth() >= 7 ? y : y - 1; // month 7 === August
  return `${startYear}-${startYear + 1}`;
}

const RANGE_RE = /^(\d{4})\s*[-/]\s*(\d{4})$/;
const SINGLE_RE = /^(\d{4})$/;

/**
 * Accept the forms a caller plausibly supplies and return the canonical
 * "YYYY-YYYY" the site expects. Rejects anything ambiguous: querying the wrong
 * season silently returns an empty page, which reads as "no games".
 */
export function normalizeYear(input: string): string {
  const value = input.trim();

  const single = SINGLE_RE.exec(value);
  if (single) {
    const y = Number(single[1]);
    return `${y}-${y + 1}`;
  }

  const range = RANGE_RE.exec(value);
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2])];
    if (b !== a + 1) {
      throw createHelpfulError(`"${input}" is not a school year — the two years must be consecutive.`, {
        hint: 'Use "2026-2027" (or just "2026").',
      });
    }
    return `${a}-${b}`;
  }

  throw createHelpfulError(`Could not read "${input}" as a school year.`, {
    hint: 'Use "2026-2027", "2026/2027" or "2026".',
  });
}
