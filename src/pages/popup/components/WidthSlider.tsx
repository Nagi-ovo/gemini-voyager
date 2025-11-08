import React from 'react';

interface WidthSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  narrowLabel: string;
  wideLabel: string;
  onChange: (value: number) => void;
  onChangeComplete?: (value: number) => void;
}

/**
 * Reusable width adjustment slider component
 * Used for chat width and edit input width settings
 */
export default function WidthSlider({
  label,
  value,
  min,
  max,
  step,
  narrowLabel,
  wideLabel,
  onChange,
  onChangeComplete,
}: WidthSliderProps) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {label}
        </label>
        <span className="text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
          {value}px
        </span>
      </div>
      <div className="px-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onMouseUp={onChangeComplete ? () => onChangeComplete(value) : undefined}
          className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:bg-blue-700 [&::-webkit-slider-thumb]:transition-colors"
        />
        <div className="flex justify-between items-center mt-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{narrowLabel}</span>
          <span>{wideLabel}</span>
        </div>
      </div>
    </div>
  );
}
