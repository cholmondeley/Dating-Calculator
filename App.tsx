import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { INITIAL_STATE, FilterState, Gender, BodyType, BodyFlag, BODY_TYPE_FLAG, AbsMode, Relationship, Finance } from './types';
import { US_STATES, CBSA_DATA, BODY_TYPES, MIN_AGE, MAX_AGE, MIN_INCOME, MAX_INCOME, MIN_HEIGHT, MAX_HEIGHT, POLITICS_DETAILED_OPTIONS, RELIGION_DETAILED_OPTIONS, MIN_WAIST, MAX_WAIST, MIN_WHR, MAX_WHR, MIN_FAT, MAX_FAT, NET_WORTH_STEPS } from './constants';
import RangeSlider from './components/RangeSlider';
import ResultGauge from './components/ResultGauge';
import SearchableSelect from './components/SearchableSelect';
import DataInspector from './components/DataInspector';
import { generateDuckDBQuery } from './utils/sqlBuilder';
import { initAndConnect } from './services/duckDb';
import { CBSA_ROWS } from './utils/geoTotals';
import { countByGroup } from './utils/filterSummary';
import { libidoShare, libidoPercentile, perWeek, defaultDirection, LibidoDirection, WANT_MORE, MEDIAN_WANTED, MIN_LIBIDO, MAX_LIBIDO } from './utils/libido';
import { MapPin, Users, ChevronDown, ChevronUp, DollarSign, Ruler, Wine, Baby, Cigarette, Check, Database, Eye, Heart, Loader2, AlertTriangle, Link2, Sparkles, SlidersHorizontal, Flame } from 'lucide-react';

// Helper to format inches to Feet'Inches"
const formatHeight = (inches: number) => {
  const ft = Math.floor(inches / 12);
  const inc = inches % 12;
  return `${ft}'${inc}"`;
};

const RELIGION_LABELS: Record<string, string> = {
  Atheist_Agnostic: 'Atheist / Agnostic',
  Spiritual_None: 'Nothing in particular',
  Other_Faith: 'Other faith',
};

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'][(n % 100 - n % 10 !== 10 ? n % 10 : 0)] ?? 'th';
  return `${n}${n % 10 > 3 || (n % 100 >= 11 && n % 100 <= 13) ? 'th' : s}`;
};

const formatMoney = (v: number) =>
  v >= 1_000_000 ? `$${v / 1_000_000}M` : v >= 1000 ? `$${v / 1000}k` : `$${v}`;

// Shareable links: the whole filter state rides in the URL hash (#f=<base64 JSON>).
const encodeState = (s: FilterState) => btoa(unescape(encodeURIComponent(JSON.stringify(s))));
const decodeState = (h: string): FilterState | null => {
  try {
    const m = h.match(/[#&]f=([^&]+)/);
    if (!m) return null;
    const parsed = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    const s: FilterState = { ...INITIAL_STATE, ...parsed };
    // old links: "high finance" limited income behind the slider's back; now it is finance + the income slider
    if ((s.finance as string) === 'high') return { ...s, finance: 'core', incomeRange: [Math.max(150, s.incomeRange[0]), s.incomeRange[1]] };
    return s;
  } catch {
    return null;
  }
};

// Segmented control used for small either/or choices.
const Segmented = <T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) => (
  <div className="flex bg-slate-100 rounded-lg p-0.5 flex-wrap">
    {options.map(o => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${value === o.value ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-600'}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

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
  const [state, setState] = useState<FilterState>(() => decodeState(window.location.hash) ?? INITIAL_STATE);
  const [showWhr, setShowWhr] = useState(false);
  const [copied, setCopied] = useState(false);

  // keep the URL in sync so any result can be linked
  useEffect(() => {
    const hash = `#f=${encodeState(state)}`;
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }, [state]);

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  const [showAdvanced, setShowAdvanced] = useState(() => countByGroup(decodeState(window.location.hash) ?? INITIAL_STATE).details > 0);
  const [showSql, setShowSql] = useState(false);
  const [showMeme, setShowMeme] = useState(() => countByGroup(decodeState(window.location.hash) ?? INITIAL_STATE).meme > 0);
  const [showLibido, setShowLibido] = useState(() => Boolean((decodeState(window.location.hash) ?? INITIAL_STATE).libidoMonthly));
  const [showLibidoHow, setShowLibidoHow] = useState(false);
  
  // DB State
  const [dbConnected, setDbConnected] = useState(false);
  const [loadingDb, setLoadingDb] = useState(true); 
  const [dbError, setDbError] = useState<string | null>(null);
  const [loadPct, setLoadPct] = useState<number | null>(null);   // dataset download progress
  const [showInspector, setShowInspector] = useState(false);
  
  // Metro rows { cbsa_id, cbsa_name, state_fips, pop } are precomputed from the parquet (data/geoTotals.json)
  const rawCBSAData = CBSA_ROWS;

  // Initialize DB and Load Data on Mount
  useEffect(() => {
    const initData = async () => {
      try {
        await initAndConnect((loaded, total) => setLoadPct(total ? Math.floor((100 * loaded) / total) : null));
        setDbConnected(true);
        setDbError(null);

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
    const flag = BODY_TYPE_FLAG[type];
    setState(prev => ({ ...prev, physicalFlags: { ...prev.physicalFlags, [flag]: !prev.physicalFlags[flag] } }));
  };

  const setPhysicalFlag = (flag: BodyFlag, checked: boolean) => {
    setState(prev => ({
      ...prev,
      physicalFlags: { ...prev.physicalFlags, [flag]: checked },
    }));
  };

  const allBodyTypes = { thin: true, healthy_weight: true, fit: true, overweight: true, obese: true };

  const FINANCE_NOTE = "Finance here is the Census securities/investment industry plus finance roles in banking and insurance: it includes retail finance (wealth advisors, brokers, fund operations) nationwide, not just Wall Street, so only ~1 in 5 live in the NYC metro.";

  // Presets reproduce the WHR follow-up post's definitions (single, 25-40 for men / 20-29 for women, no filters on kids).
  const PRESETS: { key: string; label: string; state: Partial<FilterState> }[] = [
    {
      key: 'sixes', label: '6 feet, 6 figures, 6 pack',
      state: { gender: 'Male', ageRange: [25, 40], relationship: 'single', excludePeopleWithKids: false,
               heightRange: [72, MAX_HEIGHT], incomeRange: [100, MAX_INCOME], physicalFlags: allBodyTypes, absMode: 'strict' },
    },
    {
      key: 'finance', label: 'Finance, trust fund, 6\'5", blue eyes',
      state: { gender: 'Male', ageRange: [25, 40], relationship: 'single', excludePeopleWithKids: false,
               heightRange: [77, MAX_HEIGHT], finance: 'core', trustFund: true, blueEyes: true, physicalFlags: allBodyTypes },
    },
    {
      key: 'whr', label: 'Waist-to-hip 0.74 or lower',
      state: { gender: 'Female', ageRange: [20, 29], relationship: 'single', excludePeopleWithKids: false,
               whrRange: [MIN_WHR, 0.74], physicalFlags: allBodyTypes },
    },
  ];
  const presetMatches = (ps: Partial<FilterState>) =>
    Object.entries(ps).every(([k, v]) => JSON.stringify((state as any)[k]) === JSON.stringify(v));
  const applyPreset = (ps: Partial<FilterState>, key: string) => {
    if (presetMatches(ps)) {
      resetFilters();
      return;
    }
    setState({ ...INITIAL_STATE, selectedState: state.selectedState, selectedCBSA: state.selectedCBSA, ...ps });
    setShowMeme(true);
    if (key === 'sixes') setShowAdvanced(true);
    if (key === 'whr') setShowWhr(true);
  };

  // Reset keeps where you are and who you're looking for; everything else goes back to the defaults
  const resetFilters = () => {
    setShowLibidoHow(false);
    setState(prev => ({ ...INITIAL_STATE, selectedState: prev.selectedState, selectedCBSA: prev.selectedCBSA, gender: prev.gender }));
    setShowWhr(false);
  };
  const canReset = useMemo(() => {
    const strip = (x: FilterState) => JSON.stringify({ ...x, selectedState: '', selectedCBSA: '', gender: 'Male', politicsView: '', religionView: '', waistMode: '' });
    return strip(state) !== strip(INITIAL_STATE);
  }, [state]);
  const groupCounts = useMemo(() => countByGroup(state), [state]);

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

  const isBodyTypeActive = (type: BodyType) => state.physicalFlags[BODY_TYPE_FLAG[type]];

  const religionOptions = [
    { key: 'christian', label: 'Christian' },
    { key: 'agnosticAtheist', label: 'Agnostic / Atheist' },
    { key: 'spiritual', label: 'Nothing in particular' },
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
             <button
               onClick={copyLink}
               className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600"
               title="Copy a link to exactly these filters"
             >
               <Link2 size={14} /> {copied ? 'Copied!' : 'Share'}
             </button>
             {loadingDb ? (
                 <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold border border-slate-200">
                    <Loader2 size={14} className="animate-spin" />
                    {loadPct === null ? 'Starting...' : loadPct < 100 ? `Loading data ${loadPct}%` : 'Preparing...'}
                 </div>
             ) : dbConnected ? (
                <div className="flex items-center gap-2">
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

      <main className="max-w-3xl mx-auto px-4 pt-5 pb-8 space-y-6">

        {/* Result card: the answer, what it's made of, and how to undo it */}
        {/* sticky strip in the page colour, so content never shows between the header and the card */}
        <div className="sticky top-16 z-30 -mx-4 px-4 pt-3 pb-2 bg-slate-50">
        <ResultGauge
          filters={state}
          dbConnected={dbConnected}
          loading={loadingDb}
          loadingLabel={loadPct === null ? 'Starting...' : loadPct < 100 ? `Loading data ${loadPct}% (first visit only)` : 'Preparing...'}
          onChange={setState}
          onReset={resetFilters}
          canReset={canReset}
        />
        </div>

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
            {/* Who: the one choice every number depends on, so it is big and plural */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">Looking for</label>
              <div className="grid grid-cols-2 gap-2">
                {(['Male', 'Female'] as Gender[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => updateState({ gender: g, libidoDirection: defaultDirection(g) })}
                    className={`py-3 rounded-xl text-base font-bold border-2 transition-all ${state.gender === g ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'}`}
                  >
                    {g === 'Male' ? 'Men' : 'Women'}
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

            {/* Defaults that shrink the pool live up here, in plain sight */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Heart size={16} className="text-indigo-400"/> Relationship status
                </span>
                <Segmented<Relationship>
                  value={state.relationship}
                  onChange={(v) => updateState({ relationship: v })}
                  options={[
                    { value: 'single', label: 'Single' },
                    { value: 'unmarried', label: '+ living together' },
                    { value: 'any', label: '+ married' },
                  ]}
                />
              </div>
              <label className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer self-end">
                <span className="text-sm text-slate-700 font-medium flex items-center gap-2">
                  <Baby size={16} className="text-rose-400"/> No kids
                </span>
                <input
                  type="checkbox"
                  checked={state.excludePeopleWithKids}
                  onChange={(e) => updateState({ excludePeopleWithKids: e.target.checked })}
                  className="w-5 h-5 text-rose-500 rounded focus:ring-rose-500 border-slate-300"
                />
              </label>
            </div>

            {/* Presets from the post */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Try a meme</label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(p => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPreset(p.state, p.key)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                      presetMatches(p.state)
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white border-slate-200 text-indigo-600 hover:border-indigo-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* --- Detailed filters --- */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full py-3 text-slate-600 font-semibold text-sm flex items-center justify-center gap-2 hover:text-indigo-600 transition-colors"
        >
          <SlidersHorizontal size={16} />
          {showAdvanced ? 'Hide detailed filters' : <>Detailed filters<span className="hidden sm:inline">: income, height, politics...</span></>}
          {groupCounts.details > 0 && <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-indigo-600 text-white text-[11px] font-bold">{groupCounts.details}</span>}
          {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showAdvanced && (
          <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
               <SectionHeader icon={<DollarSign />} title="Money & Education" />
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Net worth at least</label>
                      <select
                        value={state.netWorthMin}
                        onChange={(e) => updateState({ netWorthMin: Number(e.target.value) })}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white"
                      >
                        {NET_WORTH_STEPS.map(v => (
                          <option key={v} value={v}>{v === 0 ? 'Any' : `${formatMoney(v)}${v === NET_WORTH_STEPS[NET_WORTH_STEPS.length - 1] ? '+' : ''}`}</option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">Household net worth for married people; today's asset prices.</p>
                    </div>
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

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
               <SectionHeader icon={<Ruler />} title="Looks & Background" />
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
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Body Type</label>
                    <div className="flex flex-wrap gap-2 items-center">
                      {BODY_TYPES.map(type => (
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
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">Fit = lean and muscular (DXA body fat and muscle); the others are BMI bands (thin &lt;22, healthy 22-25, overweight 25-30, obese 30+).</p>

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

                  {/* Party */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">Party (including leaners)</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([['democrat', 'Democrat'], ['republican', 'Republican'], ['independent', 'Independent']] as const).map(([key, label]) => {
                        const isSelected = state.party[key];
                        return (
                          <button
                            key={key}
                            onClick={() => updateState({ party: { ...state.party, [key]: !isSelected } })}
                            className={`flex items-center px-3 py-2 rounded-lg text-sm border font-medium transition-all ${
                              isSelected ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 opacity-80 hover:opacity-100'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border mr-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'bg-white border-slate-300'}`}>
                              {isSelected && <Check size={12} className="text-white" />}
                            </div>
                            {label}
                          </button>
                        );
                      })}
                    </div>
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
                                       <span className={`text-xs font-medium ${isSelected ? 'text-indigo-700' : 'text-slate-600'}`}>{RELIGION_LABELS[opt] ?? opt.replace('_', ' ')}</span>
                                   </label>
                               )
                           })}
                        </div>
                    )}
                  </div>

               </div>
            </div>
          </div>
        )}

        {/* --- Meme stuff: the post's definitions; niche, so tucked away --- */}
        <button
          onClick={() => setShowMeme(!showMeme)}
          className="w-full py-3 text-slate-600 font-semibold text-sm flex items-center justify-center gap-2 hover:text-indigo-600 transition-colors"
        >
          <Sparkles size={16} />
          {showMeme ? 'Hide meme stuff' : <>Meme stuff<span className="hidden sm:inline">: finance, trust fund, abs, waist...</span></>}
          {groupCounts.meme > 0 && <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-indigo-600 text-white text-[11px] font-bold">{groupCounts.meme}</span>}
          {showMeme ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showMeme && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
            <SectionHeader icon={<Sparkles />} title="Meme stuff" />
            <div className="px-6 pb-8 space-y-6">
              <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.finance !== 'any'}
                  onChange={(e) => updateState({ finance: e.target.checked ? 'core' : 'any' })}
                  className="w-4 h-4 mt-0.5 text-indigo-600 rounded border-slate-300"
                />
                <span className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-700">Works in finance</span>
                  <span className="block text-xs text-slate-400">{FINANCE_NOTE} For Wall Street money, add an income floor in Detailed filters.</span>
                </span>
              </label>
                  <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state.trustFund}
                      onChange={(e) => updateState({ trustFund: e.target.checked })}
                      className="w-4 h-4 mt-0.5 text-indigo-600 rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-600">
                      <span className="font-semibold text-slate-700">Trust fund</span>
                      <span className="block text-xs text-slate-400">$100k+ inherited or gifted from family, or a family trust (SCF). Applied as a probability by age.</span>
                    </span>
                  </label>
                  
                  <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state.blueEyes}
                      onChange={(e) => updateState({ blueEyes: e.target.checked })}
                      className="w-4 h-4 mt-0.5 text-indigo-600 rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-600">
                      <span className="font-semibold text-slate-700">Blue eyes</span>
                      <span className="block text-xs text-slate-400">No US survey records eye colour: estimated by ancestry (about 30% of young white Americans, 7% Hispanic, ~1% Black or Asian). Applied as a probability.</span>
                    </span>
                  </label>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Abs</label>
                      <Segmented<AbsMode>
                        value={state.absMode}
                        onChange={(v) => updateState({ absMode: v })}
                        options={[
                          { value: 'off', label: "Doesn't matter" },
                          { value: 'visible', label: 'Visible abs' },
                          ...(state.gender === 'Male' ? [{ value: 'strict' as AbsMode, label: 'Strict abs (<12% bf)' }] : []),
                        ]}
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Visible: DXA body fat &le;{state.gender === 'Male' ? '20' : '24'}% with above-average muscle.
                        {state.gender === 'Male' ? ' Strict: DXA \u226417% (about 10-13% on calipers).' : ''}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm font-semibold text-slate-700">Waist (inches)</label>
                        <Segmented<'natural' | 'nhanes'>
                          value={state.waistMode}
                          onChange={(v) => updateState({ waistMode: v })}
                          options={[{ value: 'natural', label: 'Natural waist' }, { value: 'nhanes', label: 'At the hip bone' }]}
                        />
                      </div>
                      <RangeSlider
                        min={MIN_WAIST}
                        max={MAX_WAIST}
                        value={state.waistRange}
                        onChange={(v) => updateState({ waistRange: v })}
                        formatLabel={(val) => `${val}"`}
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Natural = narrowest point (what a tape at home or a dress size means). Hip bone = the medical survey's protocol, usually 2-3" larger.</p>
                      {state.gender === 'Female' && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => setShowWhr(v => !v)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                          >
                            {showWhr ? 'Hide waist-to-hip ratio' : 'Waist-to-hip ratio'}
                            {showWhr ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                          {showWhr && (
                            <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                              <RangeSlider
                                min={MIN_WHR}
                                max={MAX_WHR}
                                step={0.01}
                                value={state.whrRange}
                                onChange={(v) => updateState({ whrRange: [Number(v[0].toFixed(2)), Number(v[1].toFixed(2))] })}
                                formatLabel={(val) => val.toFixed(2)}
                              />
                              <p className="text-[11px] text-slate-400 mt-1">Measured at the hip bone and the widest point of the hips (NHANES).</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">
                            Body fat % (DXA scan)
                          </label>
                          <RangeSlider
                            min={MIN_FAT}
                            max={MAX_FAT}
                            value={state.fatRange}
                            onChange={(v) => updateState({ fatRange: v })}
                            formatLabel={(val) => `${val}%`}
                          />
                          <p className="text-[11px] text-slate-400 mt-1">DXA reads several points higher than calipers or smart scales.</p>
                        </div>
                    </div>
                  
            </div>
          </div>
        )}

        {/* --- Libido match --- */}
        <button
          onClick={() => setShowLibido(!showLibido)}
          className="w-full py-3 text-slate-600 font-semibold text-sm flex items-center justify-center gap-2 hover:text-indigo-600 transition-colors"
        >
          <Flame size={16} />
          {showLibido ? 'Hide libido match' : <>Libido match<span className="hidden sm:inline">: how often do you want sex?</span></>}
          {state.libidoMonthly ? <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-indigo-600 text-white text-[11px] font-bold">1</span> : null}
          {showLibido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showLibido && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
            <SectionHeader icon={<Flame />} title="Libido match" />
            <div className="px-6 pb-8 space-y-5">
              <p className="text-sm text-slate-600">
                Nobody checks this before committing, and the gap is bigger than the one everyone argues about.
                In Britain's national sex survey, <span className="font-semibold text-slate-700">{(WANT_MORE.men * 100).toFixed(0)}% of partnered
                men aged 25-40 want more sex than they are having</span>, against {(WANT_MORE.women * 100).toFixed(0)}% of women - and it
                barely improves at the top: a third of the men having sex 15+ times a month still want more.
              </p>
              <p className="text-sm text-slate-600">
                Say how often you'd want it, and this counts the {state.gender === 'Male' ? 'men' : 'women'} who want about the same.
                Which way the constraint runs depends on who's asking: men run short of partners who want it
                <em> at least </em> as often, women of partners who want it <em> no more </em> often.
              </p>

              <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.libidoMonthly !== null}
                  onChange={(e) => updateState({ libidoMonthly: e.target.checked ? 8.67 : null, libidoDirection: defaultDirection(state.gender) })}
                  className="w-4 h-4 mt-0.5 text-indigo-600 rounded border-slate-300"
                />
                <span className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-700">Require a libido match</span>
                  <span className="block text-xs text-slate-400">Applied as a probability, like eye colour: it scales the pool rather than picking rows.</span>
                </span>
              </label>

              {state.libidoMonthly !== null && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-baseline justify-between mb-1">
                      <label className="text-sm font-semibold text-slate-700">How often you'd want sex</label>
                      <span className="text-sm font-bold text-indigo-600">
                        {perWeek(state.libidoMonthly)} ({state.libidoMonthly.toFixed(1)}/month)
                      </span>
                    </div>
                    <RangeSlider
                      single
                      min={MIN_LIBIDO}
                      max={MAX_LIBIDO}
                      step={0.5}
                      value={[state.libidoMonthly, MAX_LIBIDO]}
                      onChange={(v) => updateState({ libidoMonthly: Number(v[0].toFixed(1)) })}
                      formatLabel={(val) => `${val}/mo`}
                      ticks={[[4.33, 'weekly'], [8.67, '2x/wk'], [13, '3x/wk'], [21.7, '5x/wk']]}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">You're looking for someone who…</label>
                    <Segmented<LibidoDirection>
                      value={state.libidoDirection}
                      onChange={(v) => updateState({ libidoDirection: v })}
                      options={[
                        { value: 'atLeast', label: 'wants it at least as often' },
                        { value: 'atMost', label: "won't want it more often" },
                      ]}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-400">That puts you at</div>
                      <div className="text-2xl font-bold text-indigo-700">
                        {ordinal(Math.round(libidoPercentile(state.gender, state.libidoMonthly) * 100))} percentile
                      </div>
                      <div className="text-xs text-slate-500">
                        of partnered {state.gender === 'Male' ? 'women' : 'men'} 25-40, by how often they say they <em>want</em> sex
                        (the median is {state.gender === 'Male' ? MEDIAN_WANTED.women : MEDIAN_WANTED.men}/month)
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-100">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-rose-400">{state.libidoDirection === 'atLeast' ? 'Match or better' : "Won't want more"}</div>
                      <div className="text-2xl font-bold text-rose-700">
                        {(() => { const sh = libidoShare(state.gender, state.libidoMonthly!, state.libidoDirection); return sh >= 0.1 ? `${(sh * 100).toFixed(0)}%` : sh >= 0.01 ? `${(sh * 100).toFixed(1)}%` : `1 in ${Math.round(1 / sh)}`; })()}
                      </div>
                      <div className="text-xs text-slate-500">
                        of {state.gender === 'Male' ? 'men' : 'women'} want it {state.libidoDirection === 'atLeast' ? 'at least that often' : 'no more often than that'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowLibidoHow(v => !v)}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    {showLibidoHow ? 'Hide how this works' : 'How this works'}
                    {showLibidoHow ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showLibidoHow && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 text-sm text-slate-600">
                      <p>
                        <span className="font-semibold text-slate-700">Desire, compared with desire.</span> Britain's Natsal-3 survey
                        asks partnered people both how many times they had sex in the last four weeks and whether they wanted more,
                        the same, or less. That pins each person's wanted frequency between bounds, which gives a fitted distribution
                        of what each sex actually wants - so your answer is compared with other people's answers to the same question,
                        not with what couples end up doing.
                      </p>
                      <p>
                        <span className="font-semibold text-slate-700">Why not just use frequency?</span> Because what couples do is a
                        compromise, not a preference. {(WANT_MORE.men * 100).toFixed(0)}% of partnered men and
                        {' '}{(WANT_MORE.women * 100).toFixed(0)}% of women want more than they get, so ranking a wish against achieved
                        frequency makes everyone look more demanding than they are. The median man wants {MEDIAN_WANTED.men}/month, the
                        median woman {MEDIAN_WANTED.women}/month.
                      </p>
                      <p>
                        <span className="font-semibold text-slate-700">Two checks.</span> The fitted share of women wanting sex less than
                        monthly is 12.4%; in US data (GSS), 12.0% of partnered women actually have it that rarely. And Natsal's achieved
                        frequency looks like the American distribution, which is what makes the transfer defensible.
                      </p>
                      <p>
                        The famous number below - Frankenbach's meta-analysis, g = 0.69 - measures sex <em>drive</em>, including
                        masturbation and fantasy, where the sexes differ most. On desired frequency with a partner the gap is smaller
                        (d = 0.3-0.5), so the calculator uses the frequency version, which is what it asks you about.
                      </p>
                      <img src={`${import.meta.env.BASE_URL}images/libido-frankenbach.png`} alt="Male and female sex drive distributions, Frankenbach 2022"
                           className="w-full rounded-lg border border-slate-200 bg-white" loading="lazy" />
                      <img src={`${import.meta.env.BASE_URL}images/libido-matching.png`} alt="GSS frequency distribution and the matching curve"
                           className="w-full rounded-lg border border-slate-200 bg-white" loading="lazy" />
                      <p className="text-xs text-slate-500">
                        <span className="font-semibold">What this assumes.</span> Natsal is British, and the answers come from people
                        already in relationships, so what they say they want is anchored by what is on offer. The size of "a bit more"
                        has to be assumed: capping it at twice the achieved count gives a median man wanting 5.4/month, leaving it
                        unbounded gives 12.7. The calculator ships the cautious version, so treat these as the low end.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

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

      </main>

      <DataInspector isOpen={showInspector} onClose={() => setShowInspector(false)} />
    </div>
  );
}

export default App;
