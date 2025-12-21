import React, { useEffect, useState } from 'react';
import { FilterState } from '../types';
import { runQuery } from '../services/duckDb';
import { generateDuckDBQuery } from '../utils/sqlBuilder';
import { Database, AlertCircle } from 'lucide-react';

interface ResultGaugeProps {
  filters: FilterState;
  dbConnected: boolean;
  globalAvgWeight: number;
}

const TOTAL_ADULTS = 260_000_000;

const ResultGauge: React.FC<ResultGaugeProps> = ({ filters, dbConnected, globalAvgWeight }) => {
  const [primaryMetrics, setPrimaryMetrics] = useState({ pct: 100, population: 330_000_000 });
  const [nationalMetrics, setNationalMetrics] = useState<{ pct: number; population: number } | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsAnimating(true);
      setError(null);

      const computeMetricsFromRow = (row: any) => {
        let weightedPop = Number(row.weighted_population) || 0;
        if (globalAvgWeight < 50 && weightedPop > 0) {
          weightedPop = weightedPop * 100;
        }
        const p = (weightedPop / TOTAL_ADULTS) * 100;
        return { pct: p, population: Math.round(weightedPop) };
      };

      const runFiltersQuery = async (customFilters: FilterState) => {
        const sql = generateDuckDBQuery(customFilters);
        const results = await runQuery(sql);
        if (results && results.length > 0) {
          const row = results[0];
          let weightedPop = Number(row.weighted_population) || 0;
          if (globalAvgWeight < 50 && weightedPop > 0) {
            weightedPop = weightedPop * 100;
          }

          let denom = TOTAL_ADULTS;
          if (customFilters.selectedCBSA && row.total_cbsa_pop) {
            denom = Number(row.total_cbsa_pop) || denom;
          }

          const pct = denom > 0 ? (weightedPop / denom) * 100 : 0;
          return {
            pct,
            population: Math.round(weightedPop),
          };
        }
        return { pct: 0, population: 0 };
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

        const selectedBodyTypes = customFilters.bodyTypes.length;
        if (selectedBodyTypes < 3) p *= 0.8;
        if (selectedBodyTypes < 2) p *= 0.4;

        const selectedPolitics = Object.values(customFilters.politics).filter(Boolean).length;
        const selectedReligions = Object.values(customFilters.religion).filter(Boolean).length;
        if (selectedPolitics < 4) p *= 0.9;
        if (selectedReligions < 4) p *= 0.9;

        if (customFilters.excludePeopleWithKids) p *= 0.6;
        if (!customFilters.smoking.smoker) p *= 0.85;
        if (!customFilters.includeMarried) p *= 0.55;

        p = Math.max(0.000001, Math.min(p, 1.0));
        return { pct: p * 100, population: Math.round(TOTAL_ADULTS * p) };
      };

      if (dbConnected) {
        try {
          const primary = await runFiltersQuery(filters);
          setPrimaryMetrics(primary);

          if (filters.selectedCBSA) {
            const national = await runFiltersQuery({ ...filters, selectedCBSA: '' });
            setNationalMetrics(national);
          } else {
            setNationalMetrics(null);
          }
        } catch (err: any) {
          console.error("DB Query failed", err);
          setError(err.message || "Query Failed. Check console.");
          setNationalMetrics(null);
        } finally {
          setIsAnimating(false);
        }
      } else {
        setTimeout(() => {
          const simulatedPrimary = runSimulation(filters);
          setPrimaryMetrics(simulatedPrimary);

          if (filters.selectedCBSA) {
            const nationalSim = runSimulation({ ...filters, selectedCBSA: '' });
            setNationalMetrics(nationalSim);
          } else {
            setNationalMetrics(null);
          }

          setIsAnimating(false);
        }, 400);
      }
    };

    fetchData();
  }, [filters, dbConnected, globalAvgWeight]);

  // Color interpolation based on scarcity
  const getColor = (pct: number) => {
    if (pct > 5) return 'text-emerald-500';
    if (pct > 1) return 'text-indigo-500';
    if (pct > 0.1) return 'text-amber-500';
    return 'text-rose-600';
  };

  const hasCBSA = Boolean(filters.selectedCBSA);
  const colorClass = getColor(primaryMetrics.pct);
  const formatPopulation = (value: number) =>
    new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(value);

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
        
        <div className={`transition-opacity duration-300 ${isAnimating ? 'opacity-50 blur-sm' : 'opacity-100'}`}>
          {hasCBSA && nationalMetrics ? (
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 text-left">
              <div className="md:w-1/3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">National Benchmark</p>
                <div className="text-2xl font-bold text-slate-600">{nationalMetrics.pct.toFixed(1)}%</div>
                <div className="text-slate-400 text-sm">~{formatPopulation(nationalMetrics.population)} people nationwide</div>
              </div>

              <div className="flex-1 text-center md:text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">This Metro</p>
                <div className={`text-6xl md:text-7xl font-bold tracking-tight mb-2 ${colorClass}`}>
                  {primaryMetrics.pct.toFixed(1)}%
                </div>
                <div className="text-slate-500 font-medium">
                  ~{formatPopulation(primaryMetrics.population)} people in this CBSA
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className={`text-6xl md:text-7xl font-bold tracking-tight mb-2 ${colorClass}`}>
                {primaryMetrics.pct.toFixed(1)}%
              </div>
              <div className="text-slate-500 font-medium text-lg">
                ~{formatPopulation(primaryMetrics.population)} people
              </div>
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
