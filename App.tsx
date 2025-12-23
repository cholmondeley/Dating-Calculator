import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { INITIAL_STATE, FilterState, Gender, BodyType } from './types';
import { US_STATES, CBSA_DATA, BODY_TYPES_FEMALE, BODY_TYPES_MALE, MIN_AGE, MAX_AGE, MIN_INCOME, MAX_INCOME, MIN_HEIGHT, MAX_HEIGHT, POLITICS_DETAILED_OPTIONS, RELIGION_DETAILED_OPTIONS, MIN_WAIST, MAX_WAIST, MIN_RFM, MAX_RFM } from './constants';
import RangeSlider from './components/RangeSlider';
import ResultGauge from './components/ResultGauge';
import SearchableSelect from './components/SearchableSelect';
import DataInspector from './components/DataInspector';
import { generateDuckDBQuery } from './utils/sqlBuilder';
import { initAndConnect, getDistinctCBSAs, getAverageWeight } from './services/duckDb';
import { MapPin, Users, ChevronDown, ChevronUp, DollarSign, Ruler, Wine, Baby, Cigarette, Check, Database, Eye, Heart, Loader2, AlertTriangle } from 'lucide-react';

// Helper to format inches to Feet'Inches"
const formatHeight = (inches: number) => {
  const ft = Math.floor(inches / 12);
  const inc = inches % 12;
  return `${ft}'${inc}"`;
};

const BODY_TYPE_FLAG_MAP: Record<BodyType, keyof FilterState['physicalFlags']> = {
  Thin: 'thin',
  Fit: 'fit',
  Curvy: 'overweight',
  Big: 'obese',
};

// Helper for labels
const SectionHeader: React.FC<{ icon: React.ReactNode, title: string, isOpen?: boolean, onClick?: () => void, collapsible?: boolean }> = ({ icon, title, isOpen, onClick, collapsible }) => (
  <div 
    className={`flex items-center justify-between p-4 ${collapsible ? 'cursor-pointer hover:bg-slate-50' : ''} transition-colors`}
    onClick={collapsible ? onClick : undefined}
  >
    <div className="flex items-center gap-3 text-slate-700">
      <div className="text-indigo-500">{icon}</div>
      <h3 className="font-semibold text-lg">{title}</h3>
    </div>
    {collapsible && (
      <div className="text-slate-400">
        {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </div>
    )}
  </div>
);

function App() {
  const [state, setState] = useState<FilterState>(INITIAL_STATE);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const [showPhysicalDetails, setShowPhysicalDetails] = useState(false);
  
  // DB State
  const [dbConnected, setDbConnected] = useState(false);
  const [loadingDb, setLoadingDb] = useState(true); 
  const [dbError, setDbError] = useState<string | null>(null);
  const [showInspector, setShowInspector] = useState(false);
  
  // Store raw CBSA rows: { cbsa_id, cbsa_name, state_fips, pop }
  const [rawCBSAData, setRawCBSAData] = useState<any[]>([]);
  const [datasetAvgWeight, setDatasetAvgWeight] = useState<number>(100); 

  // Initialize DB and Load Data on Mount
  useEffect(() => {
    const initData = async () => {
      try {
        console.log("Connecting to database...");
        await initAndConnect();
        setDbConnected(true);
        setDbError(null);
        
        // After connection, load metadata
        getDistinctCBSAs().then(rows => {
            if (rows && rows.length > 0) {
                setRawCBSAData(rows);
            }
        });

        getAverageWeight().then(avg => {
            console.log("Dataset Average Weight:", avg);
            if (avg > 0) {
                setDatasetAvgWeight(avg);
            }
        });

      } catch (err: any) {
        console.error("Failed to load database:", err);
        setDbConnected(false);
        setDbError(err.message || "Unknown Connection Error");
      } finally {
        setLoadingDb(false);
      }
    };

    initData();
  }, []);

  const updateState = useCallback((updates: Partial<FilterState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const toggleBodyTypeFlag = (type: BodyType) => {
    const flag = BODY_TYPE_FLAG_MAP[type];
    const nextVal = !state.physicalFlags[flag];
    updateState({ physicalFlags: { ...state.physicalFlags, [flag]: nextVal } });
  };

  const setPhysicalFlag = (flag: keyof FilterState['physicalFlags'], checked: boolean) => {
    updateState({ physicalFlags: { ...state.physicalFlags, [flag]: checked } });
  };

  const [sixPresetActive, setSixPresetActive] = useState(false);
  useEffect(() => {
    setSixPresetActive(
      state.gender === 'Male' &&
      state.heightRange[0] >= 72 &&
      state.incomeRange[0] >= 100 &&
      state.physicalFlags.abs
    );
  }, [state.gender, state.heightRange, state.incomeRange, state.physicalFlags.abs]);

  const resetFilters = () => {
    setState(INITIAL_STATE);
  };

  const applySixesPreset = () => {
    if (sixPresetActive) {
      resetFilters();
      return;
    }
    updateState({
      gender: 'Male',
      heightRange: [Math.max(72, state.heightRange[0]), state.heightRange[1]],
      incomeRange: [Math.max(100, state.incomeRange[0]), state.incomeRange[1]],
      physicalFlags: { ...state.physicalFlags, abs: true },
    });
    if (!showAdvanced) setShowAdvanced(true);
  };

  const togglePoliticsDetailed = (opt: string) => {
    setState(prev => {
      const current = prev.politicsDetailed;
      if (current.includes(opt)) return { ...prev, politicsDetailed: current.filter(o => o !== opt) };
      return { ...prev, politicsDetailed: [...current, opt] };
    });
  };

  const toggleReligionDetailed = (opt: string) => {
    setState(prev => {
      const current = prev.religionDetailed;
      if (current.includes(opt)) return { ...prev, religionDetailed: current.filter(o => o !== opt) };
      return { ...prev, religionDetailed: [...current, opt] };
    });
  };

  const currentBodyTypes = state.gender === 'Female' ? BODY_TYPES_FEMALE : BODY_TYPES_MALE;
  const isBodyTypeActive = (type: BodyType) => state.physicalFlags[BODY_TYPE_FLAG_MAP[type]];

  const religionOptions = [
    { key: 'christian', label: 'Christian' },
    { key: 'agnosticAtheist', label: 'Agnostic / Atheist' },
    { key: 'spiritual', label: 'Spiritual' },
    { key: 'other', label: 'Other' },
  ];

  // Options for Dropdowns
  const stateOptions = useMemo(() => 
    US_STATES.map(s => ({ value: s.abbr, label: s.name })), 
  []);

  // Compute CBSA options based on Raw Data + Selected State
  const cbsaOptions = useMemo(() => {
    if (dbConnected) {
      if (rawCBSAData.length === 0) return [];

      let filtered = rawCBSAData;

      // Filter by State if a specific state is selected
      if (state.selectedState && state.selectedState !== 'US') {
         const stateObj = US_STATES.find(s => s.abbr === state.selectedState);
         const targetFips = stateObj ? stateObj.fips : null;
         
         if (targetFips) {
             filtered = rawCBSAData.filter(r => Number(r.state_fips) === targetFips);
         }
      }

      // Aggregate Population by CBSA ID 
      const cbsaMap = new Map<string, { label: string, pop: number }>();

      filtered.forEach(r => {
          const id = String(r.cbsa_id);
          const current = cbsaMap.get(id) || { label: r.cbsa_name, pop: 0 };
          current.pop += Number(r.pop || 0); 
          cbsaMap.set(id, current);
      });

      return Array.from(cbsaMap.entries())
          .map(([id, data]) => ({
              value: id,
              label: data.label,
              pop: data.pop
          }))
          .sort((a, b) => b.pop - a.pop); 
    }
    
    // Fallback Mock Data
    let baseData = CBSA_DATA;
    if (state.selectedState && state.selectedState !== 'US') {
        baseData = CBSA_DATA.filter(c => c.states.includes(state.selectedState));
    }
    return baseData.map(c => ({ value: c.id, label: c.name }));
  }, [state.selectedState, dbConnected, rawCBSAData]);

  const sqlQuery = useMemo(() => generateDuckDBQuery(state), [state]);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 bg-opacity-80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">
              %
            </div>
            <h1 className="font-bold text-slate-800 text-lg tracking-tight hidden sm:block">How big is your dating pool, really?</h1>
          </div>
          
          <div className="flex items-center gap-3">
             {loadingDb ? (
                 <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold border border-slate-200">
                    <Loader2 size={14} className="animate-spin" />
                    Connecting...
                 </div>
             ) : dbConnected ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold border border-emerald-100">
                    <Database size={14} />
                    Connected
                  </div>
                  <button 
                    onClick={() => setShowInspector(true)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Inspect Data Structure"
                  >
                    <Eye size={18} />
                  </button>
                </div>
             ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold border border-rose-100" title={dbError || "Connection Failed"}>
                    <AlertTriangle size={14} />
                    {dbError ? "Error" : "Load Failed"}
                </div>
             )}
          </div>
        </div>
      </header>

      {/* Error Banner for DB */}
      {dbError && !loadingDb && (
        <div className="max-w-3xl mx-auto px-4 mt-4">
             <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={20} />
                <div>
                    <h3 className="font-bold text-rose-700 text-sm">Database Connection Failed</h3>
                    <p className="text-xs text-rose-600 mt-1 font-mono">{dbError}</p>
                    <p className="text-xs text-rose-500 mt-2">Falling back to simulated data mode.</p>
                </div>
             </div>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        
        {/* Result Card */}
        <ResultGauge filters={state} dbConnected={dbConnected} globalAvgWeight={datasetAvgWeight} />

        {/* --- Primary Filters (Geo & Demographics) --- */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <SectionHeader icon={<MapPin />} title="Geography" />
          <div className="px-6 pb-6">
            
            {/* Dynamic Geo Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">STATE</label>
                    <SearchableSelect 
                        options={stateOptions}
                        value={state.selectedState}
                        onChange={(val) => {
                            // If changing state, clear the CBSA to avoid mismatches
                            updateState({ selectedState: val, selectedCBSA: '' });
                        }}
                        placeholder="Select State..."
                    />
                </div>
                
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">METRO AREA (Optional)</label>
                    <SearchableSelect 
                        options={cbsaOptions}
                        value={state.selectedCBSA}
                        onChange={(val) => updateState({ selectedCBSA: val })}
                        placeholder={state.selectedState && state.selectedState !== 'US' ? `Metro Areas in ${state.selectedState}...` : "All Top Metro Areas..."}
                    />
                    {!dbConnected && !loadingDb && state.selectedState && state.selectedState !== 'US' && cbsaOptions.length === 0 && (
                        <p className="text-xs text-rose-500 mt-1">No top metro areas found for this state in our curated list.</p>
                    )}
                </div>
            </div>
            
          </div>

          <div className="h-px bg-slate-100 mx-6"></div>

          <SectionHeader icon={<Users />} title="The Basics" />
          <div className="px-6 pb-8 space-y-6">
            {/* Gender Toggle */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">Looking For</label>
              <div className="flex bg-slate-100 p-1 rounded-xl">
                {(['Male', 'Female'] as Gender[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => {
                        // Dynamically set height defaults based on gender selection
                        const newHeightRange: [number, number] = g === 'Female' 
                          ? [MIN_HEIGHT, 78] // Min to 6'6" for Female
                          : [66, 90];        // 5'6" to 7'6" for Male

                        updateState({ 
                            gender: g,
                            heightRange: newHeightRange
                        });
                    }}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${state.gender === g ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-600'}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Age Slider */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Age Range</label>
              <RangeSlider 
                min={MIN_AGE} max={MAX_AGE} 
                value={state.ageRange} 
                onChange={(v) => updateState({ ageRange: v })} 
              />
            </div>
          </div>
        </div>

        {/* --- Advanced Filters Toggle --- */}
        <button 
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full py-4 text-slate-500 font-medium text-sm flex items-center justify-center gap-2 hover:text-indigo-600 transition-colors"
        >
          {showAdvanced ? "Hide Detailed Filters" : "Show Detailed Filters (Income, Height, Politics...)"}
          {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {/* --- Advanced Filters Content --- */}
        {showAdvanced && (
          <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
            
            {/* Socioeconomic */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
               <SectionHeader icon={<DollarSign />} title="Financials & Education" />
               <div className="px-6 pb-8 space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Annual Income (Thousands)</label>
                    <RangeSlider 
                      min={MIN_INCOME} max={MAX_INCOME} step={10}
                      value={state.incomeRange} 
                      onChange={(v) => updateState({ incomeRange: v })}
                      formatLabel={(v) => v === MAX_INCOME ? `$${v}k+` : `$${v}k`}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">Education Required</label>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { k: 'noDegree', l: 'No Degree' },
                        { k: 'college', l: 'College' },
                        { k: 'gradDegree', l: 'Grad Degree' }
                      ].map((opt) => (
                        <label key={opt.k} className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg cursor-pointer hover:border-indigo-300 transition-colors">
                          <input 
                            type="checkbox" 
                            checked={state.education[opt.k as keyof typeof state.education]}
                            onChange={(e) => updateState({ education: { ...state.education, [opt.k]: e.target.checked } })}
                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300" 
                          />
                          <span className="text-sm font-medium text-slate-700">{opt.l}</span>
                        </label>
                      ))}
                    </div>
                  </div>
               </div>
            </div>

            {/* Physical */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
               <SectionHeader icon={<Ruler />} title="Physical Traits" />
               <div className="px-6 pb-8 space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Height</label>
                    <RangeSlider 
                      min={MIN_HEIGHT} max={MAX_HEIGHT} 
                      value={state.heightRange} 
                      onChange={(v) => updateState({ heightRange: v })}
                      formatLabel={formatHeight}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-semibold text-slate-700">Body Type</label>
                      <span className="text-[10px] font-semibold uppercase text-slate-400">Preset</span>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {currentBodyTypes.map(type => (
                        <button
                          key={type}
                          onClick={() => toggleBodyTypeFlag(type as BodyType)}
                          className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                            isBodyTypeActive(type as BodyType)
                              ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={applySixesPreset}
                        className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                          sixPresetActive
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white border-slate-200 text-indigo-600 hover:border-indigo-300'
                        }`}
                      >
                        Show me the 6 feet, 6 figures, 6 pack men!
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPhysicalDetails(prev => !prev)}
                      className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                    >
                      {showPhysicalDetails ? 'Hide detailed physical filters' : 'Detailed physical filters'}
                      {showPhysicalDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {showPhysicalDetails && (
                      <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-5">
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Body Flags</p>
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { key: 'thin', label: 'Thin' },
                              { key: 'fit', label: 'Fit' },
                              { key: 'abs', label: 'Abs' },
                              { key: 'overweight', label: 'Overweight' },
                              { key: 'obese', label: 'Obese' },
                            ].map(({ key, label }) => (
                              <label key={key} className="flex items-center gap-2 text-sm text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={state.physicalFlags[key as keyof FilterState['physicalFlags']]}
                                  onChange={(e) => setPhysicalFlag(key as keyof FilterState['physicalFlags'], e.target.checked)}
                                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded"
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">
                            Waist Circumference (inches)
                          </label>
                          <RangeSlider
                            min={MIN_WAIST}
                            max={MAX_WAIST}
                            value={state.waistRange}
                            onChange={(v) => updateState({ waistRange: v })}
                            formatLabel={(val) => `${val}"`}
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">
                            Relative Fat Mass (RFM)
                          </label>
                          <RangeSlider
                            min={MIN_RFM}
                            max={MAX_RFM}
                            value={state.rfmRange}
                            onChange={(v) => updateState({ rfmRange: v })}
                            formatLabel={(val) => `${val}%`}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  
                   <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">Race / Ethnicity</label>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.keys(state.race).map((r) => (
                        <label key={r} className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={state.race[r as keyof typeof state.race]}
                            onChange={(e) => updateState({ race: { ...state.race, [r]: e.target.checked } })}
                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
                          />
                          <span className="text-sm text-slate-700 capitalize">{r}</span>
                        </label>
                      ))}
                    </div>
                  </div>
               </div>
            </div>

            {/* Lifestyle & Politics */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
               <SectionHeader icon={<Wine />} title="Lifestyle & Values" />
               <div className="px-6 pb-8 space-y-6">
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Habits */}
                    <div className="space-y-3">
                       <label className="block text-sm font-semibold text-slate-700">Habits</label>
                       
                       <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <span className="text-sm text-slate-600 flex items-center gap-2">
                            <Cigarette size={16}/> Smoking Okay?
                          </span>
                          <input 
                            type="checkbox"
                            checked={state.smoking.smoker}
                            onChange={(e) => updateState({ smoking: { ...state.smoking, smoker: e.target.checked } })}
                            className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
                          />
                       </div>
                       
                       <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <span className="text-sm text-slate-600 flex items-center gap-2">
                             <Wine size={16}/> Alcohol Okay?
                          </span>
                          <input 
                            type="checkbox"
                            checked={state.drinking.drinker}
                            onChange={(e) => updateState({ drinking: { ...state.drinking, drinker: e.target.checked } })}
                            className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
                          />
                       </div>
                    </div>

                    {/* Dealbreakers */}
                    <div className="space-y-3">
                       <label className="block text-sm font-semibold text-slate-700">Dealbreakers</label>
                       
                       <div className="flex items-center justify-between p-3 bg-white border border-rose-100 rounded-lg shadow-sm">
                          <span className="text-sm text-slate-700 font-medium flex items-center gap-2">
                             <Baby size={16} className="text-rose-400"/> Must have NO kids
                          </span>
                          <input 
                            type="checkbox"
                            checked={state.excludePeopleWithKids}
                            onChange={(e) => updateState({ excludePeopleWithKids: e.target.checked })}
                            className="w-5 h-5 text-rose-500 rounded focus:ring-rose-500 border-slate-300"
                          />
                       </div>

                       <div className="flex items-center justify-between p-3 bg-white border border-indigo-100 rounded-lg shadow-sm">
                          <span className="text-sm text-slate-700 font-medium flex items-center gap-2">
                             <Heart size={16} className="text-indigo-400"/> Include Married?
                          </span>
                          <input 
                            type="checkbox"
                            checked={state.includeMarried}
                            onChange={(e) => updateState({ includeMarried: e.target.checked })}
                            className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
                          />
                       </div>
                    </div>
                  </div>

                  <div className="h-px bg-slate-100"></div>

                  {/* Politics */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                        <label className="text-sm font-semibold text-slate-700">Politics</label>
                        <div className="flex bg-slate-100 rounded-lg p-0.5">
                           <button 
                              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${state.politicsView === 'broad' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-600'}`}
                              onClick={() => updateState({ politicsView: 'broad' })}
                           >
                              Simple
                           </button>
                           <button 
                              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${state.politicsView === 'detailed' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-600'}`}
                              onClick={() => updateState({ politicsView: 'detailed' })}
                           >
                              Detailed
                           </button>
                        </div>
                    </div>
                    
                    {state.politicsView === 'broad' ? (
                        <div className="grid grid-cols-2 gap-2">
                           {['Conservative', 'Moderate', 'Liberal', 'Apolitical'].map(pol => {
                             const key = pol.toLowerCase() as keyof typeof state.politics;
                             const isSelected = state.politics[key];
                             return (
                               <button
                                 key={pol}
                                 onClick={() => updateState({ politics: { ...state.politics, [key]: !isSelected } })}
                                 className={`flex items-center px-3 py-2 rounded-lg text-sm border font-medium transition-all ${
                                   isSelected 
                                   ? 'bg-indigo-50 border-indigo-500 text-indigo-700' 
                                   : 'bg-white border-slate-200 text-slate-500 opacity-80 hover:opacity-100'
                                 }`}
                               >
                                 <div className={`w-4 h-4 rounded border mr-2 flex items-center justify-center transition-colors ${
                                   isSelected ? 'bg-indigo-500 border-indigo-500' : 'bg-white border-slate-300'
                                 }`}>
                                   {isSelected && <Check size={12} className="text-white" />}
                                 </div>
                                 {pol}
                               </button>
                             )
                           })}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                           {POLITICS_DETAILED_OPTIONS.map(opt => {
                               const isSelected = state.politicsDetailed.includes(opt);
                               return (
                                   <label key={opt} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${isSelected ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                                       <input 
                                         type="checkbox"
                                         checked={isSelected}
                                         onChange={() => togglePoliticsDetailed(opt)}
                                         className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
                                       />
                                       <span className={`text-xs font-medium ${isSelected ? 'text-indigo-700' : 'text-slate-600'}`}>{opt}</span>
                                   </label>
                               )
                           })}
                        </div>
                    )}
                  </div>

                  {/* Religion */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                        <label className="text-sm font-semibold text-slate-700">Religion</label>
                        <div className="flex bg-slate-100 rounded-lg p-0.5">
                           <button 
                              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${state.religionView === 'broad' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-600'}`}
                              onClick={() => updateState({ religionView: 'broad' })}
                           >
                              Simple
                           </button>
                           <button 
                              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${state.religionView === 'detailed' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-600'}`}
                              onClick={() => updateState({ religionView: 'detailed' })}
                           >
                              Detailed
                           </button>
                        </div>
                    </div>

                    {state.religionView === 'broad' ? (
                        <div className="grid grid-cols-2 gap-2">
                           {religionOptions.map(rel => {
                             const isSelected = state.religion[rel.key as keyof typeof state.religion];
                             return (
                               <button
                                 key={rel.key}
                                 onClick={() => updateState({ religion: { ...state.religion, [rel.key]: !isSelected } })}
                                 className={`flex items-center px-3 py-2 rounded-lg text-sm border font-medium transition-all ${
                                   isSelected 
                                   ? 'bg-indigo-50 border-indigo-500 text-indigo-700' 
                                   : 'bg-white border-slate-200 text-slate-500 opacity-80 hover:opacity-100'
                                 }`}
                               >
                                 <div className={`w-4 h-4 rounded border mr-2 flex items-center justify-center transition-colors ${
                                   isSelected ? 'bg-indigo-500 border-indigo-500' : 'bg-white border-slate-300'
                                 }`}>
                                   {isSelected && <Check size={12} className="text-white" />}
                                 </div>
                                 {rel.label}
                               </button>
                             )
                           })}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                           {RELIGION_DETAILED_OPTIONS.map(opt => {
                               const isSelected = state.religionDetailed.includes(opt);
                               return (
                                   <label key={opt} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${isSelected ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                                       <input 
                                         type="checkbox"
                                         checked={isSelected}
                                         onChange={() => toggleReligionDetailed(opt)}
                                         className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
                                       />
                                       <span className={`text-xs font-medium ${isSelected ? 'text-indigo-700' : 'text-slate-600'}`}>{opt.replace('_', ' ')}</span>
                                   </label>
                               )
                           })}
                        </div>
                    )}
                  </div>

               </div>
            </div>

            {/* SQL Debug View */}
            <div className="mt-8 border-t border-slate-200 pt-6">
                <button 
                  onClick={() => setShowSql(!showSql)}
                  className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 text-sm font-medium transition-colors"
                >
                  <Database size={16} />
                  {showSql ? "Hide Generated SQL" : "Show Generated SQL (DuckDB)"}
                </button>
                {showSql && (
                  <div className="mt-4 bg-slate-800 rounded-xl p-4 overflow-x-auto">
                    <pre className="text-xs text-indigo-100 font-mono whitespace-pre-wrap">
                      {sqlQuery}
                    </pre>
                  </div>
                )}
            </div>

          </div>
        )}
      </main>

      <DataInspector isOpen={showInspector} onClose={() => setShowInspector(false)} />
    </div>
  );
}

export default App;
