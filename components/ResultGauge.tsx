import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FilterState } from '../types';
import { US_STATES } from '../constants';
import { runQuery } from '../services/duckDb';
import { generateDuckDBQuery, generateWeightQuery } from '../utils/sqlBuilder';
import { geoPopulation, CBSA_ROWS } from '../utils/geoTotals';
import { activeFilters } from '../utils/filterSummary';
import { Database, AlertCircle, Loader2, X, RotateCcw, SlidersHorizontal } from 'lucide-react';

interface ResultGaugeProps {
  filters: FilterState;
  dbConnected: boolean;
  loading: boolean;
  loadingLabel?: string;
  onChange: (next: FilterState) => void;
  onReset: () => void;
  canReset: boolean;   // something differs from the defaults
}

type Metrics = { pct: number; population: number; people?: number };

const TOTAL_ADULTS = 262_300_000;   // ACS 2023 adults 18+; fallback only (denominators come from data/geoTotals.json)
const CHIPS_COLLAPSED = typeof window !== 'undefined' && window.innerWidth < 640 ? 3 : 4;   // the card is sticky: keep it short on phones

const noun = (men: boolean, n: number) => (men ? (n === 1 ? 'man' : 'men') : n === 1 ? 'woman' : 'women');

const geoName = (f: FilterState) => {
  if (f.selectedCBSA) {
    const name = CBSA_ROWS.find(r => String(r.cbsa_id) === String(Number(f.selectedCBSA)))?.cbsa_name ?? '';
    return name ? `the ${name.split(',')[0].split('-')[0]} metro` : 'this metro';
  }
  if (f.selectedState && f.selectedState !== 'US') return US_STATES.find(s => s.abbr === f.selectedState)?.name ?? f.selectedState;
  return 'the US';
};

const formatPct = (pct: number) =>
  pct >= 1 ? `${pct.toFixed(1)}%` : pct >= 0.01 ? `${pct.toFixed(2)}%` : pct > 0 ? `1 in ${Math.round(100 / pct).toLocaleString()}` : '0%';

const formatPopulation = (value: number) =>
  value < 1000
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)
    : new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(value);

const getColor = (pct: number) =>
  pct > 5 ? 'text-emerald-500' : pct > 1 ? 'text-indigo-500' : pct > 0.1 ? 'text-amber-500' : 'text-rose-600';

const ResultGauge: React.FC<ResultGaugeProps> = ({ filters, dbConnected, loading, loadingLabel, onChange, onReset, canReset }) => {
  const [primary, setPrimary] = useState<Metrics | null>(null);
  const [national, setNational] = useState<Metrics | null>(null);
  const [impacts, setImpacts] = useState<Record<string, number>>({});
  const [isAnimating, setIsAnimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllChips, setShowAllChips] = useState(false);
  const requestIdRef = useRef(0);

  const chips = useMemo(() => activeFilters(filters), [filters]);
  const men = filters.gender === 'Male';
  const expected = filters.blueEyes || filters.trustFund;

  useEffect(() => {
    if (!dbConnected) return;
    const run = async (requestId: number) => {
      const stale = () => requestId !== requestIdRef.current;
      const metrics = async (f: FilterState): Promise<Metrics> => {
        const row = (await runQuery(generateDuckDBQuery(f)))?.[0];
        const population = Number(row?.weighted_population) || 0;
        const denom = geoPopulation(f) || TOTAL_ADULTS;
        return { pct: (population / denom) * 100, population, people: Number(row?.people) || 0 };
      };
      try {
        const p = await metrics(filters);
        if (stale()) return;
        setPrimary(p);
        setIsAnimating(false);

        if (filters.selectedCBSA) {
          const n = await metrics({ ...filters, selectedCBSA: '', selectedState: 'US' });
          if (stale()) return;
          setNational(n);
        } else {
          setNational(null);
        }

        // How much each active filter shrinks the pool: re-run without it (weights only; the data is local)
        const next: Record<string, number> = {};
        for (const chip of activeFilters(filters)) {
          const row = (await runQuery(generateWeightQuery(chip.clear(filters))))?.[0];
          if (stale()) return;
          const without = Number(row?.weighted_population) || 0;
          next[chip.key] = without > 0 ? 1 - p.population / without : 0;
          setImpacts({ ...next });
        }
      } catch (err: any) {
        console.error('DB Query failed', err);
        if (!stale()) {
          setError(err.message || 'Query failed. Check console.');
          setIsAnimating(false);
        }
      }
    };
    const timeoutId = window.setTimeout(() => {
      const id = ++requestIdRef.current;
      setIsAnimating(true);
      setError(null);
      setImpacts({});
      run(id);
    }, 350);
    return () => clearTimeout(timeoutId);
  }, [filters, dbConnected]);

  // biggest cuts first; chips still being measured go last in their natural order
  const ranked = useMemo(
    () => [...chips].sort((a, b) => (impacts[b.key] ?? -1) - (impacts[a.key] ?? -1)),
    [chips, impacts],
  );
  const visibleChips = showAllChips ? ranked : ranked.slice(0, CHIPS_COLLAPSED);
  const hiddenCount = ranked.length - visibleChips.length;

  const pct = primary?.pct ?? 0;
  const pop = primary?.population ?? 0;
  const people = Math.round(primary?.people ?? 0);
  const where = geoName(filters);
  const failed = !loading && !dbConnected;

  return (
    <div className="bg-white rounded-3xl shadow-xl px-5 py-5 md:px-8 md:py-6 text-center border border-slate-100 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-50"></div>

      <div className="flex items-center justify-center gap-2 mb-1">
        <h2 className="text-slate-400 font-medium uppercase tracking-wider text-xs">Your dating pool</h2>
        {dbConnected && (
          <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
            <Database size={10} /> REAL DATA
          </span>
        )}
      </div>

      <div className={`transition-opacity duration-300 ${isAnimating ? 'opacity-60' : 'opacity-100'}`}>
        {failed ? (
          <p className="py-6 text-sm text-rose-600 font-semibold">The data couldn't be loaded. Please refresh to try again.</p>
        ) : !primary ? (
          <div className="flex flex-col items-center justify-center py-6 text-slate-500">
            <Loader2 size={36} className="animate-spin text-indigo-500" />
            <p className="mt-3 text-sm font-semibold">{loading && loadingLabel ? loadingLabel : 'Loading...'}</p>
          </div>
        ) : (
          <>
            <div className={`text-5xl md:text-6xl font-bold tracking-tight ${getColor(pct)}`}>
              ~{formatPopulation(pop)} {noun(men, pop)}
            </div>
            <div className="text-slate-500 text-sm mt-1">
              {expected ? 'expected · ' : ''}
              <span className="font-semibold text-slate-600">{formatPct(pct)}</span> of all adults in {where}
              {national && (
                <span className="text-slate-400"> · nationally ~{formatPopulation(national.population)} ({formatPct(national.pct)})</span>
              )}
            </div>
            <div className={`mt-1 text-xs ${people < 20 ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
              Based on {people.toLocaleString()} surveyed {noun(men, people)}
              {people < 20 ? ' - a rough estimate' : ''}
              {expected ? ' · eye colour and trust fund applied as probabilities' : ''}
            </div>
          </>
        )}
      </div>

      {/* What is narrowing the pool: every active filter, biggest cut first, each removable */}
      <div className="mt-4 pt-3 border-t border-slate-100 text-left">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <SlidersHorizontal size={13} className="shrink-0" />
            {chips.length === 0 ? (
              <span>No filters: all adult {men ? 'men' : 'women'} in {where}</span>
            ) : (
              <span>
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 mr-1 rounded-full bg-indigo-600 text-white text-[11px]">{chips.length}</span>
                {chips.length === 1 ? 'filter' : 'filters'} narrowing this pool
              </span>
            )}
          </div>
          {canReset && (
            <button
              type="button"
              onClick={() => { setShowAllChips(false); onReset(); }}
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors shrink-0"
              title="Back to the defaults: single, 18-35, no kids (keeps the place and men/women)"
            >
              <RotateCcw size={12} /> Reset filters
            </button>
          )}
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {visibleChips.map(c => {
              const cut = impacts[c.key];
              return (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs"
                  title={cut === undefined || cut < 0.005 ? c.label
                    : `Without this filter the pool would be ${cut >= 0.995 ? '100x+' : `${(1 / (1 - cut)).toFixed(1)}x`} larger`}
                >
                  {c.label}
                  {cut !== undefined && cut >= 0.005 && (
                    <span className="font-semibold text-rose-600">−{cut >= 0.995 ? '99+' : Math.round(cut * 100)}%</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onChange(c.clear(filters))}
                    className="ml-0.5 p-0.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200"
                    aria-label={`Remove filter: ${c.label}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })}
            {ranked.length > CHIPS_COLLAPSED && (
              <button
                type="button"
                onClick={() => setShowAllChips(v => !v)}
                className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
              >
                {showAllChips ? 'Show fewer' : `+${hiddenCount} more`}
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 bg-rose-50 text-rose-600 px-4 py-3 rounded-lg text-xs font-mono break-all text-left flex items-start gap-2 border border-rose-100">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default ResultGauge;
