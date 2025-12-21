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

const ResultGauge: React.FC<ResultGaugeProps> = ({ filters, dbConnected, globalAvgWeight }) => {
  const [percentage, setPercentage] = useState(100);
  const [population, setPopulation] = useState(330000000);
  const [isAnimating, setIsAnimating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsAnimating(true);
      setError(null);

      if (dbConnected) {
        try {
          const sql = generateDuckDBQuery(filters);
          // Debugging SQL
          // console.log("Executing SQL:", sql);
          
          const results = await runQuery(sql);
          
          if (results && results.length > 0) {
            const row = results[0];
            const count = Number(row.count) || 0;
            let weightedPop = Number(row.weighted_population) || 0;
            
            // LOGIC FOR 1% SAMPLE SCALING
            if (globalAvgWeight < 50 && weightedPop > 0) {
                // Weights seem small/unadjusted, apply 100x multiplier
                weightedPop = weightedPop * 100;
            }

            // Using 260M US Adults as the denominator for "Incidence" %
            const TOTAL_ADULTS = 260_000_000; 
            
            const p = (weightedPop / TOTAL_ADULTS) * 100;
            setPopulation(Math.round(weightedPop));
            setPercentage(p);
          } else {
             setPopulation(0);
             setPercentage(0);
          }
        } catch (err: any) {
          console.error("DB Query failed", err);
          // Show the actual error message to help debugging
          setError(err.message || "Query Failed. Check console.");
        } finally {
          setIsAnimating(false);
        }
      } else {
        // --- MOCK SIMULATION LOGIC ---
        setTimeout(() => {
          let p = 1.0;

          // Geo
          if (filters.selectedCBSA) {
            p *= 0.005; 
          } else if (filters.selectedState && filters.selectedState !== 'US') {
            p *= 0.02; 
          }

          // Age
          const ageSpread = filters.ageRange[1] - filters.ageRange[0];
          p *= (ageSpread / 100); 

          // Gender
          p *= 0.5; 

          // Income
          if (filters.incomeRange[0] > 50) p *= 0.6;
          if (filters.incomeRange[0] > 100) p *= 0.3;
          if (filters.incomeRange[0] > 200) p *= 0.1;
          if (filters.incomeRange[0] > 400) p *= 0.02;

          // Height
          if (filters.gender === 'Male' && filters.heightRange[0] > 72) p *= 0.15;
          if (filters.gender === 'Male' && filters.heightRange[0] > 74) p *= 0.05;
          if (filters.gender === 'Female' && filters.heightRange[0] > 67) p *= 0.15;

          // Body Type
          const selectedBodyTypes = filters.bodyTypes.length;
          if (selectedBodyTypes < 3) p *= 0.8;
          if (selectedBodyTypes < 2) p *= 0.4;

          // Politics & Religion
          const selectedPolitics = Object.values(filters.politics).filter(Boolean).length;
          const selectedReligions = Object.values(filters.religion).filter(Boolean).length;
          if (selectedPolitics < 4) p *= 0.9;
          if (selectedReligions < 4) p *= 0.9;

          // Dealbreakers
          if (filters.excludePeopleWithKids) p *= 0.6; 
          if (!filters.smoking.smoker) p *= 0.85; 
          if (!filters.includeMarried) p *= 0.55;

          p = Math.max(0.000001, Math.min(p, 1.0));
          
          setPercentage(p * 100);
          setPopulation(Math.round(260000000 * p));
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

  const colorClass = getColor(percentage);

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
          <div className={`text-6xl md:text-7xl font-bold tracking-tight mb-2 ${colorClass}`}>
            {percentage.toFixed(1)}%
          </div>
          <div className="text-slate-500 font-medium text-lg">
            ~{new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(population)} people
          </div>
        </div>

        {error && (
            <div className="mt-4 bg-rose-50 text-rose-600 px-4 py-3 rounded-lg text-xs font-mono break-all text-left flex items-start gap-2 border border-rose-100">
                <AlertCircle size={16} className="shrink-0 mt-0.5" /> 
                <span>{error}</span>
            </div>
        )}

        {percentage < 0.01 && !isAnimating && !error && (
          <div className="mt-4 inline-block bg-rose-50 text-rose-700 px-3 py-1 rounded-full text-xs font-bold animate-pulse">
            🦄 Unicorn Territory
          </div>
        )}
    </div>
  );
};

export default ResultGauge;