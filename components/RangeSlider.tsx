import React, { useRef, useState, useEffect } from 'react';

interface RangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  formatLabel?: (val: number) => string;
  step?: number;
  /** One thumb: the second value is not a filter, so it gets no handle and no label. */
  single?: boolean;
  /** Ticks drawn under the track, e.g. [[4.33, "1x/wk"]]. */
  ticks?: [number, string][];
}

const RangeSlider: React.FC<RangeSliderProps> = ({ min, max, value, onChange, formatLabel, step = 1, single = false, ticks }) => {
  const [localValue, setLocalValue] = useState(value);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const getPercent = (val: number) => Math.round(((val - min) / (max - min)) * 100);

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    const newVal = single ? val : Math.min(val, localValue[1] - step);
    setLocalValue([newVal, localValue[1]]);
    onChange([newVal, localValue[1]]);
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    const newVal = Math.max(val, localValue[0] + step);
    setLocalValue([localValue[0], newVal]);
    onChange([localValue[0], newVal]);
  };

  return (
    <div className="relative w-full pt-8 pb-4 px-2">
       {/* CSS Injection to force interaction on thumbs and transparency on tracks */}
       <style>{`
        .range-slider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          pointer-events: auto;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: white;
          border: 2px solid #6366f1; /* Indigo-500 */
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          cursor: grab;
          z-index: 50;
        }
        .range-slider-input::-moz-range-thumb {
          pointer-events: auto;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: white;
          border: 2px solid #6366f1;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          cursor: grab;
          z-index: 50;
        }
        /* Remove default track styles so ours shows through */
        .range-slider-input::-webkit-slider-runnable-track {
          -webkit-appearance: none;
          background: transparent;
          height: 100%;
        }
        .range-slider-input::-moz-range-track {
          background: transparent;
          height: 100%;
        }
      `}</style>

      {/* Floating Labels */}
      <div className="flex justify-between text-xs font-medium text-slate-500 mb-2 absolute top-0 left-0 w-full px-2">
        {single ? (
          <>
            <span className="text-slate-400">{formatLabel ? formatLabel(min) : min}</span>
            <span className="text-slate-400">{formatLabel ? formatLabel(max) : max}</span>
          </>
        ) : (
          <>
            <span>{formatLabel ? formatLabel(localValue[0]) : localValue[0]}</span>
            <span>{formatLabel ? formatLabel(localValue[1]) : localValue[1]}</span>
          </>
        )}
      </div>
      
      {/* Track Background */}
      <div className="relative h-2 bg-slate-200 rounded-full w-full" ref={trackRef}>
        {/* Active Range Highlight */}
        <div 
          className="absolute h-2 bg-indigo-500 rounded-full z-10"
          style={
            single
              ? { left: 0, width: `${getPercent(localValue[0])}%` }
              : { left: `${getPercent(localValue[0])}%`, width: `${getPercent(localValue[1]) - getPercent(localValue[0])}%` }
          }
        />
        
        {/* The thumbs themselves are transparent, so single mode draws a visible knob at the value */}
        {single && (
          <div
            className="absolute z-30 w-5 h-5 -translate-x-1/2 -translate-y-1/2 top-1 rounded-full bg-white border-2 border-indigo-500 shadow pointer-events-none"
            style={{ left: `${getPercent(localValue[0])}%` }}
          />
        )}

        {/* Input: Min */}
        <input
          type="range"
          min={min} max={max} step={step}
          value={localValue[0]}
          onChange={handleMinChange}
          className="range-slider-input absolute w-full h-2 opacity-0 appearance-none pointer-events-none z-20 top-0 left-0 m-0"
          style={{ zIndex: !single && localValue[0] > max - 10 ? 25 : 20 }}
        />
        
        {/* Input: Max -- omitted entirely in single mode, so there is nothing to grab */}
        {!single && (
          <input
            type="range"
            min={min} max={max} step={step}
            value={localValue[1]}
            onChange={handleMaxChange}
            className="range-slider-input absolute w-full h-2 opacity-0 appearance-none pointer-events-none z-20 top-0 left-0 m-0"
            style={{ zIndex: 20 }}
          />
        )}

        {ticks && (
          <div className="absolute top-3 left-0 w-full">
            {ticks.map(([v, label]) => (
              <div key={label} className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${getPercent(v)}%` }}>
                <div className="w-px h-1.5 bg-slate-300" />
                <span className="mt-0.5 text-[10px] text-slate-400 whitespace-nowrap">{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RangeSlider;