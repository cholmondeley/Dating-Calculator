import { FilterState } from '../types';
import { US_STATES } from '../constants';
import geo from '../data/geoTotals.json';

// Adult population by geography and the metro list, precomputed from the parquet by
// notebooks/dcalc_geo_totals.py (regenerated with every export). Keeps full-file scans out of the browser.

export const CBSA_ROWS = (() => {
  const names = new Map(geo.cbsas.map(c => [c.id, c.name]));
  return geo.cbsaStates.map(r => ({ cbsa_id: r.id, cbsa_name: names.get(r.id) ?? '', state_fips: r.state, pop: r.pop }));
})();

const cbsaPop = new Map(geo.cbsas.map(c => [String(c.id), c.pop]));

/** Adults (18+) in the filter's geography: the gauge denominator. */
export const geoPopulation = (filters: FilterState): number => {
  if (filters.selectedCBSA) return cbsaPop.get(String(Number(filters.selectedCBSA))) ?? 0;
  if (filters.selectedState && filters.selectedState !== 'US') {
    const fips = US_STATES.find(s => s.abbr === filters.selectedState)?.fips;
    if (fips) return (geo.states as Record<string, number>)[String(fips)] ?? 0;
  }
  return geo.us;
};
