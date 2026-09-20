import { FilterState, BodyFlag } from '../types';
import { libidoShare, perWeek } from './libido';
import {
  MIN_AGE, MAX_AGE, MIN_HEIGHT, MAX_HEIGHT, MAX_INCOME, MIN_WAIST, MAX_WAIST, MIN_WHR, MAX_WHR, MIN_FAT, MAX_FAT,
  POLITICS_DETAILED_OPTIONS, RELIGION_DETAILED_OPTIONS,
} from '../constants';

/**
 * Every way the pool can be narrowed, as a removable "chip". The result card lists the active ones so a slider
 * left behind in a collapsed section can never silently shrink the answer. Each chip knows how to clear itself
 * (back to "everyone", not back to the app defaults) so its impact can be measured by re-running without it.
 */
export type FilterGroup = 'basics' | 'details' | 'meme';

export interface ActiveFilter {
  key: string;
  label: string;
  group: FilterGroup;
  clear: (s: FilterState) => FilterState;
}

const inches = (v: number) => `${Math.floor(v / 12)}'${v % 12}"`;
const money = (v: number) => (v >= 1_000_000 ? `$${v / 1_000_000}M` : `$${Math.round(v / 1000)}k`);

const range = (lo: number, hi: number, min: number, max: number, fmt: (v: number) => string, unit = '') =>
  lo > min && hi < max ? `${fmt(lo)}–${fmt(hi)}${unit}` : lo > min ? `${fmt(lo)}+${unit}` : `≤ ${fmt(hi)}${unit}`;

/** "Only A, B" or "No C" -- whichever is shorter to read. */
const subset = (all: Record<string, boolean>, labels: Record<string, string>) => {
  const on = Object.keys(all).filter(k => all[k]);
  const off = Object.keys(all).filter(k => !all[k]);
  if (on.length === 0) return 'none selected';
  return on.length <= off.length ? `only ${on.map(k => labels[k] ?? k).join(', ')}` : `no ${off.map(k => labels[k] ?? k).join(', ')}`;
};

const BODY_LABELS: Record<BodyFlag, string> = {
  thin: 'thin', healthy_weight: 'healthy weight', fit: 'fit', overweight: 'overweight', obese: 'obese',
};

export const activeFilters = (s: FilterState): ActiveFilter[] => {
  const f: ActiveFilter[] = [];
  const men = s.gender === 'Male';

  // basics
  if (s.ageRange[0] > MIN_AGE || s.ageRange[1] < MAX_AGE)
    f.push({ key: 'age', group: 'basics', label: s.ageRange[1] < MAX_AGE ? `Age ${s.ageRange[0]}–${s.ageRange[1]}` : `Age ${s.ageRange[0]}+`,
             clear: x => ({ ...x, ageRange: [MIN_AGE, MAX_AGE] }) });
  if (s.relationship !== 'any')
    f.push({ key: 'relationship', group: 'basics',
             label: s.relationship === 'single' ? 'Single (not living together)' : 'Not married',
             clear: x => ({ ...x, relationship: 'any' }) });
  if (s.excludePeopleWithKids)
    f.push({ key: 'kids', group: 'basics', label: 'No kids', clear: x => ({ ...x, excludePeopleWithKids: false }) });

  if (s.libidoMonthly)
    f.push({ key: 'libido', group: 'basics',
             label: `Libido: ${s.libidoDirection === 'atLeast' ? 'wants' : 'wants no more than'} ${perWeek(s.libidoMonthly)}`,
             clear: x => ({ ...x, libidoMonthly: null }) });

  // details
  if (s.incomeRange[0] > 0 || s.incomeRange[1] < MAX_INCOME)
    f.push({ key: 'income', group: 'details',
             label: `Income ${range(s.incomeRange[0], s.incomeRange[1], 0, MAX_INCOME, v => `$${v}k`)}`,
             clear: x => ({ ...x, incomeRange: [0, MAX_INCOME] }) });
  if (s.netWorthMin > 0)
    f.push({ key: 'networth', group: 'details', label: `Net worth ${money(s.netWorthMin)}+`,
             clear: x => ({ ...x, netWorthMin: 0 }) });
  if (!Object.values(s.education).every(Boolean))
    f.push({ key: 'education', group: 'details',
             label: `Education: ${subset(s.education, { noDegree: 'no degree', college: 'college', gradDegree: 'grad degree' })}`,
             clear: x => ({ ...x, education: { noDegree: true, college: true, gradDegree: true } }) });
  if (s.heightRange[0] > MIN_HEIGHT || s.heightRange[1] < MAX_HEIGHT)
    f.push({ key: 'height', group: 'details',
             label: `Height ${range(s.heightRange[0], s.heightRange[1], MIN_HEIGHT, MAX_HEIGHT, inches)}`,
             clear: x => ({ ...x, heightRange: [MIN_HEIGHT, MAX_HEIGHT] }) });
  if (!Object.values(s.physicalFlags).every(Boolean))
    f.push({ key: 'body', group: 'details', label: `Body type: ${subset(s.physicalFlags, BODY_LABELS)}`,
             clear: x => ({ ...x, physicalFlags: { thin: true, healthy_weight: true, fit: true, overweight: true, obese: true } }) });
  if (!Object.values(s.race).every(Boolean))
    f.push({ key: 'race', group: 'details', label: `Race: ${subset(s.race, {})}`,
             clear: x => ({ ...x, race: { white: true, black: true, asian: true, hispanic: true, other: true } }) });
  if (!s.smoking.smoker)
    f.push({ key: 'smoking', group: 'details', label: 'Non-smokers', clear: x => ({ ...x, smoking: { ...x.smoking, smoker: true } }) });
  if (!s.drinking.drinker)
    f.push({ key: 'drinking', group: 'details', label: "Doesn't drink", clear: x => ({ ...x, drinking: { ...x.drinking, drinker: true } }) });
  if (s.politicsView === 'broad' ? !Object.values(s.politics).every(Boolean) : s.politicsDetailed.length < POLITICS_DETAILED_OPTIONS.length)
    f.push({ key: 'politics', group: 'details',
             label: s.politicsView === 'broad' ? `Politics: ${subset(s.politics, {})}` : `Politics: ${s.politicsDetailed.length} of ${POLITICS_DETAILED_OPTIONS.length}`,
             clear: x => ({ ...x, politics: { conservative: true, moderate: true, liberal: true, apolitical: true },
                            politicsDetailed: [...POLITICS_DETAILED_OPTIONS] }) });
  if (!Object.values(s.party).every(Boolean))
    f.push({ key: 'party', group: 'details', label: `Party: ${subset(s.party, {})}`,
             clear: x => ({ ...x, party: { democrat: true, republican: true, independent: true } }) });
  if (s.religionView === 'broad' ? !Object.values(s.religion).every(Boolean) : s.religionDetailed.length < RELIGION_DETAILED_OPTIONS.length)
    f.push({ key: 'religion', group: 'details',
             label: s.religionView === 'broad'
               ? `Religion: ${subset(s.religion, { christian: 'Christian', agnosticAtheist: 'agnostic/atheist', spiritual: 'nothing in particular', other: 'other' })}`
               : `Religion: ${s.religionDetailed.length} of ${RELIGION_DETAILED_OPTIONS.length}`,
             clear: x => ({ ...x, religion: { christian: true, agnosticAtheist: true, spiritual: true, other: true },
                            religionDetailed: [...RELIGION_DETAILED_OPTIONS] }) });

  // meme stuff
  if (s.finance !== 'any')
    f.push({ key: 'finance', group: 'meme', label: 'Works in finance', clear: x => ({ ...x, finance: 'any' }) });
  if (s.trustFund)
    f.push({ key: 'trust', group: 'meme', label: 'Trust fund', clear: x => ({ ...x, trustFund: false }) });
  if (s.blueEyes)
    f.push({ key: 'eyes', group: 'meme', label: 'Blue eyes', clear: x => ({ ...x, blueEyes: false }) });
  if (s.absMode !== 'off')
    f.push({ key: 'abs', group: 'meme', label: s.absMode === 'strict' ? 'Strict abs' : 'Visible abs', clear: x => ({ ...x, absMode: 'off' }) });
  if (s.waistRange[0] > MIN_WAIST || s.waistRange[1] < MAX_WAIST)
    f.push({ key: 'waist', group: 'meme',
             label: `Waist ${range(s.waistRange[0], s.waistRange[1], MIN_WAIST, MAX_WAIST, String, '"')}`,
             clear: x => ({ ...x, waistRange: [MIN_WAIST, MAX_WAIST] }) });
  if (!men && (s.whrRange[0] > MIN_WHR || s.whrRange[1] < MAX_WHR))
    f.push({ key: 'whr', group: 'meme', label: `WHR ${range(s.whrRange[0], s.whrRange[1], MIN_WHR, MAX_WHR, v => v.toFixed(2))}`,
             clear: x => ({ ...x, whrRange: [MIN_WHR, MAX_WHR] }) });
  if (s.fatRange[0] > MIN_FAT || s.fatRange[1] < MAX_FAT)
    f.push({ key: 'fat', group: 'meme', label: `Body fat ${range(s.fatRange[0], s.fatRange[1], MIN_FAT, MAX_FAT, String, '%')}`,
             clear: x => ({ ...x, fatRange: [MIN_FAT, MAX_FAT] }) });
  return f;
};

export const countByGroup = (s: FilterState) => {
  const c: Record<FilterGroup, number> = { basics: 0, details: 0, meme: 0 };
  for (const a of activeFilters(s)) c[a.group] += 1;
  return c;
};
