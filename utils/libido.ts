import libido from '../data/libido.json';
import { Gender } from '../types';

/**
 * Libido matching (notebooks/Libido matching - Natsal desire.ipynb).
 *
 * Desire is compared with desire. Natsal-3 (Britain, 2010-12) asks partnered people how many times they had sex
 * in the last four weeks AND whether they wanted more, the same or less, so desired frequency is recovered as
 * interval-censored data and fitted per sex. A stated frequency is then read against the other sex's desired
 * frequency directly -- no drive-scale constant, no assumption that frequency ranks the same as desire.
 *
 * Frankenbach's g = 0.69 is kept only for the explainer: it measures sex drive (including masturbation and
 * fantasy), where the gap is wider than it is for desired frequency with a partner (d = 0.3-0.5).
 *
 * The result is a probability, not a row filter: like blue eyes, it multiplies weights for an expected count.
 */
type Row = { monthly: number; pct: number; atLeast: number; atMost: number };

/**
 * Which way the constraint runs. A man's problem is usually finding someone who wants it at least as often;
 * a woman's is the mirror image -- someone who will not want it more often than she does. Both are 24.5% at
 * the median, because it is the same 0.69 SD gap read from opposite ends.
 */
export type LibidoDirection = 'atLeast' | 'atMost';

/** The direction that actually binds for whoever is doing the asking. */
export const defaultDirection = (seeking: Gender): LibidoDirection => (seeking === 'Female' ? 'atLeast' : 'atMost');

const TABLE: Record<Gender, Row[]> = {
  Female: libido.seekingWomen as Row[],   // he states the frequency, we count women
  Male: libido.seekingMen as Row[],       // she states it, we count men
};

export const LIBIDO_G = libido.g as number;
/** Share of partnered 25-40s who want more sex than they get (Natsal-3). */
export const WANT_MORE = { men: libido.wantMoreMen as number, women: libido.wantMoreWomen as number };
export const MEDIAN_WANTED = { men: libido.medianWantedMen as number, women: libido.medianWantedWomen as number };
export const MIN_LIBIDO = 1;
export const MAX_LIBIDO = 30;

const lookup = (seeking: Gender, monthly: number): Row => {
  const rows = TABLE[seeking];
  const clamped = Math.min(Math.max(monthly, rows[0].monthly), rows[rows.length - 1].monthly);
  let best = rows[0];
  for (const r of rows) if (Math.abs(r.monthly - clamped) < Math.abs(best.monthly - clamped)) best = r;
  return best;
};

/** Share of the sought gender who fit, in the requested direction. */
export const libidoShare = (seeking: Gender, monthly: number, dir: LibidoDirection): number =>
  lookup(seeking, monthly)[dir];

/** Where the stated frequency sits among partnered people of the stater's own sex. */
export const libidoPercentile = (seeking: Gender, monthly: number): number => lookup(seeking, monthly).pct;

/** "2x a week" for a monthly figure. */
export const perWeek = (monthly: number): string => {
  const w = monthly / 4.33;
  if (w < 0.85) return monthly <= 1.2 ? 'about once a month' : `${monthly.toFixed(0)}x a month`;
  return `${w < 1.4 ? 'once' : `${Math.round(w)}x`} a week`;
};
