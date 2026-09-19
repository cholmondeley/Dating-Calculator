import { FilterState, BodyFlag } from '../types';
import {
  US_STATES, DUCKDB_DATASET_FILE, MIN_WAIST, MAX_WAIST, MIN_WHR, MAX_WHR, MIN_FAT, MAX_FAT, MAX_INCOME,
  EDUCATION_NO_DEGREE_CODES, EDUCATION_COLLEGE_CODES, EDUCATION_GRAD_CODES, HIGH_FINANCE_EARNINGS,
} from '../constants';

export { DATA_SOURCE } from '../services/duckDb';
import { DATA_SOURCE } from '../services/duckDb';

const BODY_FLAGS: BodyFlag[] = ['thin', 'healthy_weight', 'fit', 'overweight', 'obese'];

export const geoClause = (filters: FilterState): string => {
  if (filters.selectedCBSA && filters.selectedCBSA !== '') {
    return `cbsa_id = ${Number(filters.selectedCBSA)}`;
  }
  if (filters.selectedState && filters.selectedState !== 'US') {
    const stateObj = US_STATES.find(s => s.abbr === filters.selectedState);
    if (stateObj && stateObj.fips) return `state = ${stateObj.fips}`;
  }
  return '';
};

const inList = (col: string, values: (string | number)[]) =>
  values.length ? `${col} IN (${values.map(v => (typeof v === 'number' ? v : `'${v}'`)).join(', ')})` : '1=0';

/**
 * Row weight for the query. Rows are replicate draws whose PWGTP already carries their share of the person;
 * blue eyes and trust funds are stored as per-row probabilities (they are independent of everything else given
 * ancestry / age), so those filters multiply the weight instead of selecting rows -- an exact expected count.
 */
export const weightExpr = (filters: FilterState): string => {
  const parts = ['PWGTP'];
  if (filters.blueEyes) parts.push('p_blue_eyes');
  if (filters.trustFund) parts.push('p_trust_fund');
  return parts.join(' * ');
};

export const buildWhere = (filters: FilterState): string[] => {
  const w: string[] = [];

  // 1. Geography
  const geo = geoClause(filters);
  if (geo) w.push(geo);

  // 2. Demographics
  w.push(`sex = ${filters.gender === 'Male' ? 1 : 2}`);
  w.push(`age BETWEEN ${filters.ageRange[0]} AND ${filters.ageRange[1]}`);
  if (filters.relationship === 'single') w.push('single');
  else if (filters.relationship === 'unmarried') w.push('married != 1');

  // 3. Money, work, education
  const [incLo, incHi] = filters.incomeRange;
  if (incLo > 0) w.push(`real_income >= ${incLo * 1000}`);
  if (incHi < MAX_INCOME) w.push(`real_income <= ${incHi * 1000}`);
  if (filters.netWorthMin > 0) w.push(`net_worth >= ${filters.netWorthMin}`);
  if (filters.finance === 'core') w.push('fin_core');
  if (filters.finance === 'high') w.push(`fin_core AND earnings >= ${HIGH_FINANCE_EARNINGS}`);

  const { noDegree, college, gradDegree } = filters.education;
  if (!(noDegree && college && gradDegree)) {
    const codes = [
      ...(noDegree ? EDUCATION_NO_DEGREE_CODES : []),
      ...(college ? EDUCATION_COLLEGE_CODES : []),
      ...(gradDegree ? EDUCATION_GRAD_CODES : []),
    ];
    w.push(inList('educ', codes));
  }

  // 4. Body
  w.push(`height_inches BETWEEN ${filters.heightRange[0]} AND ${filters.heightRange[1]}`);
  const onFlags = BODY_FLAGS.filter(f => filters.physicalFlags[f]);
  if (onFlags.length === 0) w.push('1=0');
  else if (onFlags.length < BODY_FLAGS.length) w.push(`(${onFlags.join(' OR ')})`);   // types partition everyone
  if (filters.absMode === 'visible') w.push('abs');
  if (filters.absMode === 'strict') w.push('abs_strict');

  const waistCol = filters.waistMode === 'natural' ? 'natural_waist' : 'waist_circumference';
  if (filters.waistRange[0] > MIN_WAIST) w.push(`${waistCol} >= ${filters.waistRange[0]}`);
  if (filters.waistRange[1] < MAX_WAIST) w.push(`${waistCol} <= ${filters.waistRange[1]}`);
  if (filters.gender === 'Female') {
    if (filters.whrRange[0] > MIN_WHR) w.push(`whr >= ${filters.whrRange[0]}`);
    if (filters.whrRange[1] < MAX_WHR) w.push(`whr <= ${filters.whrRange[1]}`);
  }
  if (filters.fatRange[0] > MIN_FAT) w.push(`fat_pct >= ${filters.fatRange[0]}`);
  if (filters.fatRange[1] < MAX_FAT) w.push(`fat_pct <= ${filters.fatRange[1]}`);

  // 5. Race
  if (!Object.values(filters.race).every(Boolean)) {
    const codes: number[] = [];
    if (filters.race.white) codes.push(1);
    if (filters.race.black) codes.push(2);
    if (filters.race.asian) codes.push(3);
    if (filters.race.hispanic) codes.push(4);
    if (filters.race.other) codes.push(5);
    w.push(inList('race_mapped', codes));
  }

  // 6. Habits and kids
  if (!filters.smoking.smoker) w.push('is_smoker = 0');
  if (!filters.drinking.drinker) w.push('drinks_per_day = 0');
  if (filters.excludePeopleWithKids) w.push('has_kids = 0');

  // 7. Politics
  if (filters.politicsView === 'broad') {
    if (!Object.values(filters.politics).every(Boolean)) {
      const pols: string[] = [];
      if (filters.politics.conservative) pols.push('Conservative');
      if (filters.politics.moderate) pols.push('Moderate');
      if (filters.politics.liberal) pols.push('Liberal');
      if (filters.politics.apolitical) pols.push('No_Ideology');
      w.push(inList('politics_broad', pols));
    }
  } else {
    w.push(inList('politics_detailed', filters.politicsDetailed));
  }
  if (!Object.values(filters.party).every(Boolean)) {
    const parties: string[] = [];
    if (filters.party.democrat) parties.push('Democrat');
    if (filters.party.republican) parties.push('Republican');
    if (filters.party.independent) parties.push('Independent');
    w.push(inList('party', parties));
  }

  // 8. Religion
  if (filters.religionView === 'broad') {
    if (!Object.values(filters.religion).every(Boolean)) {
      const rels: string[] = [];
      if (filters.religion.christian) rels.push('Christian');
      if (filters.religion.agnosticAtheist) rels.push('Secular');
      if (filters.religion.spiritual) rels.push('Spiritual');
      if (filters.religion.other) rels.push('Other_Faith');
      w.push(inList('religion_broad', rels));
    }
  } else {
    w.push(inList('religion_detailed', filters.religionDetailed));
  }

  return w;
};

export const generateDuckDBQuery = (filters: FilterState): string => {
  const where = buildWhere(filters);
  // The evidence behind an answer is the number of DISTINCT sampled people (each dating-pool person has 8
  // replicate rows). The denominator (adults in the geography) comes from utils/geoTotals, not a full-file scan.
  return `SELECT
  count(DISTINCT person_id)::DOUBLE as people,
  count(*)::DOUBLE as row_count,
  sum(${weightExpr(filters)})::DOUBLE as weighted_population
FROM ${DATA_SOURCE}
WHERE
  ${where.join('\n  AND ')}`;
};

/** Weighted count only (no distinct-person count): cheap enough to re-run once per active filter chip. */
export const generateWeightQuery = (filters: FilterState): string =>
  `SELECT sum(${weightExpr(filters)})::DOUBLE as weighted_population FROM ${DATA_SOURCE} WHERE ${buildWhere(filters).join(' AND ')}`;
