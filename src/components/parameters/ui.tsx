'use client';

import { useRef, useCallback, useState, useEffect } from 'react';

/**
 * NumberInput — the BoxMaker dimension primitive.
 * Hybrid number-field + range slider, both wired to the same value.
 * Type a value, drag the slider, or focus the field and use arrow keys (Shift = ×10).
 */
export function NumberInput({
  label,
  value,
  min,
  max,
  step = 0.1,
  onChange,
  tooltip,
  suffix = ' mm',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  tooltip?: string;
  suffix?: string;
}) {
  const [draft, setDraft] = useState<string>(formatValue(value, step));
  const fieldRef = useRef<HTMLInputElement>(null);

  // Keep draft in sync when value changes externally (preset load, slider move)
  useEffect(() => {
    if (document.activeElement !== fieldRef.current) {
      setDraft(formatValue(value, step));
    }
  }, [value, step]);

  const commit = useCallback(
    (raw: string) => {
      const parsed = parseFloat(raw);
      if (!Number.isFinite(parsed)) {
        setDraft(formatValue(value, step));
        return;
      }
      const clamped = Math.min(max, Math.max(min, roundToStep(parsed, step)));
      onChange(clamped);
      setDraft(formatValue(clamped, step));
    },
    [min, max, step, value, onChange]
  );

  return (
    <div className="flex items-center gap-2 mb-2">
      <label
        className="text-sm text-[var(--text-secondary)] w-24 shrink-0"
        title={tooltip}
      >
        {label}
      </label>
      <input
        ref={fieldRef}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(formatValue(value, step));
            e.currentTarget.blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const dir = e.key === 'ArrowUp' ? 1 : -1;
            const mult = e.shiftKey ? 10 : 1;
            const next = Math.min(max, Math.max(min, roundToStep(value + dir * step * mult, step)));
            onChange(next);
            setDraft(formatValue(next, step));
          }
        }}
        className="w-14 shrink-0 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-1.5 py-0.5 text-xs text-right tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 min-w-0 h-1.5 accent-[var(--accent)]"
        title={tooltip}
      />
      <span className="text-[10px] text-[var(--text-secondary)] w-6 shrink-0 text-left">
        {suffix.trim()}
      </span>
    </div>
  );
}

function roundToStep(v: number, step: number): number {
  return Math.round(v / step) * step;
}

function formatValue(v: number, step: number): string {
  // Show as many decimals as the step implies (0.1 → 1 decimal, 0.01 → 2, 1 → 0)
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return v.toFixed(decimals);
}

/** Collapsible section wrapper — supports optional header toggle */
export function Section({
  title,
  children,
  defaultOpen = true,
  active,
  checked,
  onToggle,
  tooltip,
  titleColor,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  active?: boolean;
  checked?: boolean;
  onToggle?: (v: boolean) => void;
  tooltip?: string;
  titleColor?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const handleToggle = useCallback(() => {
    const el = detailsRef.current;
    if (!el || !el.open) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, []);

  return (
    <details ref={detailsRef} open={defaultOpen} className="mb-4" onToggle={handleToggle}>
      <summary
        className="cursor-pointer text-sm font-medium py-2 px-3 bg-[var(--bg-secondary)] rounded select-none hover:bg-[var(--border-color)] transition-colors flex items-center gap-2"
        style={titleColor ? { color: titleColor } : { color: 'var(--text-primary)' }}
        title={tooltip}
      >
        <span className="flex-1">{title}</span>
        {onToggle ? (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle(!checked);
            }}
            className={`w-8 h-4 rounded-full transition-colors shrink-0 ${
              checked ? 'bg-[var(--accent)]' : 'bg-[#888]'
            }`}
          />
        ) : (
          active && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
        )}
      </summary>
      <div className="pt-3 px-4 ml-2 border-l-2 border-[var(--border-color)]">{children}</div>
    </details>
  );
}

/** Group header label for visual separation between section groups */
export function GroupHeader({ label, color }: { label: string; color: string }) {
  return (
    <div
      className="mt-6 mb-2 px-1 text-[10px] font-semibold tracking-[0.15em] uppercase"
      style={{ color }}
    >
      {label}
    </div>
  );
}

/** Toggle switch with optional reset button */
export function Toggle({
  label,
  checked,
  onChange,
  onReset,
  tooltip,
  compact,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  onReset?: () => void;
  tooltip?: string;
  /** Drop the fixed-width label column so the toggle sits right next to the text. */
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <label
        className={
          compact
            ? 'text-sm text-[var(--text-secondary)]'
            : 'text-sm text-[var(--text-secondary)] w-24 shrink-0'
        }
        title={tooltip}
      >
        {label}
      </label>
      <button
        onClick={() => onChange(!checked)}
        className={`w-8 h-4 rounded-full transition-colors ${
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-color)]'
        }`}
      />
      {onReset && checked && (
        <button
          onClick={onReset}
          className="ml-auto text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors"
          title="Reset to defaults"
        >
          Reset
        </button>
      )}
    </div>
  );
}

/** Native color picker swatch row */
export function ColorSwatch({
  label,
  value,
  onChange,
  tooltip,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <label
        className="text-sm text-[var(--text-secondary)] w-24 shrink-0"
        title={tooltip}
      >
        {label}
      </label>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-6 rounded border border-[var(--border-color)] bg-transparent cursor-pointer p-0"
        title={tooltip}
      />
    </div>
  );
}

/** Radio-button group laid out as a row of inline pills */
export function RadioRow<T extends string>({
  label,
  value,
  options,
  onChange,
  tooltip,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <label
        className="text-sm text-[var(--text-secondary)] w-24 shrink-0"
        title={tooltip}
      >
        {label}
      </label>
      <div className="flex flex-1 min-w-0 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded overflow-hidden">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 text-xs py-1 transition-colors ${
              value === opt.value
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--border-color)]'
            }`}
            title={tooltip}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
