import React, { useEffect, useRef, useState } from 'react';
import { FilterState } from '../types';
import { MIN_WAIST, MAX_WAIST } from '../constants';
import { runQuery } from '../services/duckDb';
import { generateDuckDBQuery } from '../utils/sqlBuilder';
import { geoPopulation } from '../utils/geoTotals';
import { Database, AlertCircle, Loader2 } from 'lucide-react';

interface ResultGaugeProps {
  filters: FilterState;
  dbConnected: boolean;
  loading: boolean;
  loadingLabel?: string;
}

const TOTAL_ADULTS = 262_300_000;   // ACS 2023 adults 18+; fallback only (denominators come from the data)

// How much sample stands behind an answer. Rows are replicate draws, so this counts distinct surveyed people.
const Evidence: React.FC<{ people?: number; expected: boolean; dbConnected: boolean }> = ({ people, expected, dbConnected }) => {
  if (!dbConnected || people === undefined) return null;
  const n = Math.round(people);
  const rough = n < 20;
  return (
    <div className={`mt-2 text-xs ${rough ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
      Based on {n.toLocaleString()} surveyed {n === 1 ? 'person' : 'people'}
      {rough ? ' - a rough estimate' : ''}
      {expected ? ' - eye colour / trust fund are applied as probabilities' : ''}
    </div>
  );
};

const ResultGauge: React.FC<ResultGaugeProps> = ({ filters, dbConnected, loading, loadingLabel }) => {
  const [primaryMetrics, setPrimaryMetrics] = useState<{ pct: number; population: number; people?: number }>({ pct: 100, population: 262_000_000 });
  const [nationalMetrics, setNationalMetrics] = useState<{ pct: number; population: number; people?: number } | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const fetchData = async (requestId: number) => {
      const runFiltersQuery = async (customFilters: FilterState) => {
        const sql = generateDuckDBQuery(customFilters);
        const results = await runQuery(sql);
        if (results && results.length > 0) {
          const row = results[0];
          // PWGTP is already persons per row (replicate rows carry a share of their person's weight);
          // the old x100 rescaling for low average weights must not be applied.
          const weightedPop = Number(row.weighted_population) || 0;
          const denom = geoPopulation(customFilters) || TOTAL_ADULTS;
          const pct = denom > 0 ? (weightedPop / denom) * 100 : 0;
          return {
            pct,
            population: Math.round(weightedPop),
            people: Number(row.people) || 0,
          };
        }
        return { pct: 0, population: 0, people: 0 };
      };

      const runSimulation = (customFilters: FilterState) => {
        let p = 1.0;

        if (customFilters.selectedCBSA) {
          p *= 0.005;
        } else if (customFilters.selectedState && customFilters.selectedState !== 'US') {
          p *= 0.02;
        }

        const ageSpread = customFilters.ageRange[1] - customFilters.ageRange[0];
        p *= (ageSpread / 100);
        p *= 0.5; // gender split

        if (customFilters.incomeRange[0] > 50) p *= 0.6;
        if (customFilters.incomeRange[0] > 100) p *= 0.3;
        if (customFilters.incomeRange[0] > 200) p *= 0.1;
        if (customFilters.incomeRange[0] > 400) p *= 0.02;

        if (customFilters.gender === 'Male' && customFilters.heightRange[0] > 72) p *= 0.15;
        if (customFilters.gender === 'Male' && customFilters.heightRange[0] > 74) p *= 0.05;
        if (customFilters.gender === 'Female' && customFilters.heightRange[0] > 67) p *= 0.15;

        const bodyTypeFlags = Object.keys(customFilters.physicalFlags) as Array<keyof FilterState['physicalFlags']>;
        const enabledBodyFlags = bodyTypeFlags.filter(flag => customFilters.physicalFlags[flag]);
        if (enabledBodyFlags.length === 0) {
          p *= 0.000001;
        } else if (enabledBodyFlags.length < bodyTypeFlags.length) {
          p *= enabledBodyFlags.length / bodyTypeFlags.length;
        }

        if (customFilters.absMode === 'visible') p *= 0.04;
        if (customFilters.absMode === 'strict') p *= 0.015;

        const waistSpan = customFilters.waistRange[1] - customFilters.waistRange[0];
        const waistRatio = Math.max(0.2, waistSpan / (MAX_WAIST - MIN_WAIST));
        p *= waistRatio;

        const selectedPolitics = Object.values(customFilters.politics).filter(Boolean).length;
        const selectedReligions = Object.values(customFilters.religion).filter(Boolean).length;
        if (selectedPolitics < 4) p *= 0.9;
        if (selectedReligions < 4) p *= 0.9;

        if (customFilters.excludePeopleWithKids) p *= 0.6;
        if (!customFilters.smoking.smoker) p *= 0.85;
        if (customFilters.relationship === 'single') p *= 0.5;

        p = Math.max(0.000001, Math.min(p, 1.0));
        return { pct: p * 100, population: Math.round(TOTAL_ADULTS * p) };
      };

      if (dbConnected) {
        try {
          const primary = await runFiltersQuery(filters);
          if (requestId !== requestIdRef.current) return;
          setPrimaryMetrics(primary);

          if (filters.selectedCBSA) {
            const national = await runFiltersQuery({ ...filters, selectedCBSA: '', selectedState: 'US' });
            if (requestId !== requestIdRef.current) return;
            setNationalMetrics(national);
          } else {
            setNationalMetrics(null);
          }
        } catch (err: any) {
          console.error("DB Query failed", err);
          if (requestId === requestIdRef.current) {
            setError(err.message || "Query Failed. Check console.");
            setNationalMetrics(null);
          }
        } finally {
          if (requestId === requestIdRef.current) {
            setIsAnimating(false);
          }
        }
      } else {
        const simulatedPrimary = runSimulation(filters);
        if (requestId !== requestIdRef.current) return;
        setPrimaryMetrics(simulatedPrimary);

        if (filters.selectedCBSA) {
          const nationalSim = runSimulation({ ...filters, selectedCBSA: '', selectedState: 'US' });
          if (requestId !== requestIdRef.current) return;
          setNationalMetrics(nationalSim);
        } else {
          setNationalMetrics(null);
        }
        if (requestId === requestIdRef.current) {
          setIsAnimating(false);
        }
      }
    };

    const timeoutId = window.setTimeout(() => {
      const currentRequest = ++requestIdRef.current;
      setIsAnimating(true);
      setError(null);
      fetchData(currentRequest);
    }, 350);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [filters, dbConnected]);

  // Color interpolation based on scarcity
  const getColor = (pct: number) => {
    if (pct > 5) return 'text-emerald-500';
    if (pct > 1) return 'text-indigo-500';
    if (pct > 0.1) return 'text-amber-500';
    return 'text-rose-600';
  };

  const formatPct = (pct: number) =>
    pct >= 1 ? `${pct.toFixed(1)}%` : pct >= 0.01 ? `${pct.toFixed(2)}%` : pct > 0 ? `1 in ${Math.round(100 / pct).toLocaleString()}` : '0%';
  const hasCBSA = Boolean(filters.selectedCBSA);
  const expected = filters.blueEyes || filters.trustFund;
  const colorClass = getColor(primaryMetrics.pct);
  const showLoading = (dbConnected && isAnimating) || (!dbConnected && loading && !error);
  const formatPopulation = (value: number) =>
    value < 1000
      ? new Intl.NumberFormat('en-US', { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)
      : new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(value);

  return (
    <div className="sticky top-20 z-30 bg-white rounded-3xl shadow-xl p-8 text-center border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-50"></div>
        
        <div className="flex items-center justify-center gap-2 mb-2">
           <h2 className="text-slate-400 font-medium uppercase tracking-wider text-xs">Your available dating pool:</h2>
           {!dbConnected && (
             <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-bold">SIMULATED</span>
           )}
           {dbConnected && (
             <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
               <Database size={10} /> REAL DATA
             </span>
           )}
        </div>
        
        <div className={`transition-opacity duration-300 ${isAnimating ? 'opacity-70' : 'opacity-100'}`}>
          {showLoading ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
              <Loader2 size={40} className="animate-spin text-indigo-500" />
              <p className="mt-3 text-sm font-semibold">{!dbConnected && loadingLabel ? loadingLabel : 'Loading...'}</p>
            </div>
          ) : hasCBSA && nationalMetrics ? (
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 text-left">
              <div className="md:w-1/3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">National Benchmark</p>
                <div className="text-2xl font-bold text-slate-600">{formatPct(nationalMetrics.pct)}</div>
                <div className="text-slate-400 text-sm">~{formatPopulation(nationalMetrics.population)} people nationwide</div>
              </div>

              <div className="flex-1 text-center md:text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">This Metro</p>
                <div className={`text-6xl md:text-7xl font-bold tracking-tight mb-2 ${colorClass}`}>
                  {formatPct(primaryMetrics.pct)}
                </div>
                <div className="text-slate-500 font-medium">
                  ~{formatPopulation(primaryMetrics.population)} people in this metro{expected ? ' (expected)' : ''}
                </div>
                <Evidence people={primaryMetrics.people} expected={expected} dbConnected={dbConnected} />
              </div>
            </div>
          ) : (
            <>
              <div className={`text-6xl md:text-7xl font-bold tracking-tight mb-2 ${colorClass}`}>
                {formatPct(primaryMetrics.pct)}
              </div>
              <div className="text-slate-500 font-medium text-lg">
                ~{formatPopulation(primaryMetrics.population)} people{expected ? ' (expected)' : ''}
              </div>
              <Evidence people={primaryMetrics.people} expected={expected} dbConnected={dbConnected} />
            </>
          )}
        </div>

        {error && (
            <div className="mt-4 bg-rose-50 text-rose-600 px-4 py-3 rounded-lg text-xs font-mono break-all text-left flex items-start gap-2 border border-rose-100">
                <AlertCircle size={16} className="shrink-0 mt-0.5" /> 
                <span>{error}</span>
            </div>
        )}

        {primaryMetrics.pct < 0.01 && !isAnimating && !error && (
          <div className="mt-4 inline-block bg-rose-50 text-rose-700 px-3 py-1 rounded-full text-xs font-bold animate-pulse">
            🦄 Unicorn Territory
          </div>
        )}
    </div>
  );
};

export default ResultGauge;
