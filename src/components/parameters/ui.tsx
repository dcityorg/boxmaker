'use client';

import { useRef, useCallback, useState, useEffect } from 'react';

/**
 * NumberInput -- the BoxMaker dimension primitive.
 * Hybrid number-field + range slider, both wired to the same value.
 *
 * Input methods, all sharing the same modifier scheme:
 *   - Type a value into the text field (Enter commits, Escape reverts)
 *   - Arrow keys on the text field or slider: +/- step (Right/Left also work on slider)
 *   - Drag the slider: 1 px = step
 *
 * Mouse wheel deliberately does NOT change slider values -- sliders live
 * inside a scrollable sidebar, and intercepting wheel events causes
 * accidental value changes when the user just wants to scroll.
 *
 * Modifiers (apply to all of the above):
 *   - Shift = 10 x step (coarse)
 *   - Alt   = 0.1 x step (fine)
 *   - Alt wins if both held
 *
 * Slider drag is a pure relative scrub from the current value -- clicking
 * the track without dragging does nothing (no jump-to-absolute), which keeps
 * "click then drag" from causing a value jump before the scrub begins.
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
  // Display / fine-grid precision is one decimal finer than step, because Alt
  // can produce values at that resolution. So a step=1 field shows 1 decimal,
  // a step=0.1 field shows 2, etc. Typed values are also rounded to this grid
  // so users can enter fine values directly.
  const displayBase = step * 0.1;

  const [draft, setDraft] = useState<string>(formatValue(value, displayBase));
  const fieldRef = useRef<HTMLInputElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    startX: number;
    startValue: number;
    hasMoved: boolean;
  } | null>(null);

  // Drag-update rAF batching: pointermove can fire at 100+ Hz on modern
  // hardware, and each onChange triggers a full geometry rebuild. Without
  // batching, a fast scrub freezes the main thread. We coalesce all events
  // within a frame into a single onChange.
  const dragRafRef = useRef<number | null>(null);
  const dragPendingRef = useRef<number | null>(null);

  // valueRef tracks the latest value so the pointer-drag handler can
  // re-anchor after a native click-to-jump updated the value.
  const valueRef = useRef(value);
  valueRef.current = value;

  // Keep draft in sync when value changes externally (preset load, slider move,
  // undo/redo). Skip while the user is typing into the field.
  useEffect(() => {
    if (document.activeElement !== fieldRef.current) {
      setDraft(formatValue(value, displayBase));
    }
  }, [value, displayBase]);

  const nudge = useCallback(
    (dir: 1 | -1, mods: { altKey: boolean; shiftKey: boolean }) => {
      const mult = mods.altKey ? 0.1 : mods.shiftKey ? 10 : 1;
      // Always snap to displayBase so the value's existing fractional offset
      // (e.g. an Alt-introduced .1) is preserved by plain Up/Down nudges.
      const next = Math.min(
        max,
        Math.max(min, roundToStep(valueRef.current + dir * step * mult, displayBase))
      );
      onChange(next);
      setDraft(formatValue(next, displayBase));
    },
    [step, displayBase, min, max, onChange]
  );

  const commit = useCallback(
    (raw: string) => {
      const parsed = parseFloat(raw);
      if (!Number.isFinite(parsed)) {
        setDraft(formatValue(value, displayBase));
        return;
      }
      const clamped = Math.min(max, Math.max(min, roundToStep(parsed, displayBase)));
      onChange(clamped);
      setDraft(formatValue(clamped, displayBase));
    },
    [min, max, displayBase, value, onChange]
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
            setDraft(formatValue(value, displayBase));
            e.currentTarget.blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            nudge(e.key === 'ArrowUp' ? 1 : -1, e);
          }
        }}
        className="w-14 shrink-0 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-1.5 py-0.5 text-xs text-right tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
      <input
        ref={sliderRef}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          // Pointer events are fully suppressed (see onPointerDown), so the only
          // way this fires is from keyboard input we don't intercept (PageUp / End / etc).
          // For those, accept the native value as-is.
          onChange(parseFloat(e.target.value));
        }}
        onPointerDown={(e) => {
          // Suppress native click-to-jump entirely: we use pure relative drag
          // from the current value. preventDefault also blocks default focus,
          // so we focus the element manually for keyboard accessibility.
          e.preventDefault();
          const el = e.currentTarget as HTMLInputElement;
          el.setPointerCapture(e.pointerId);
          el.focus();
          dragRef.current = {
            startX: e.clientX,
            startValue: valueRef.current,
            hasMoved: false,
          };
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag) return;
          const dx = e.clientX - drag.startX;
          if (!drag.hasMoved) {
            if (Math.abs(dx) < 2) return; // ignore tiny wobble on a click without intent to drag
            drag.hasMoved = true;
          }
          e.preventDefault();
          const mult = e.altKey ? 0.1 : e.shiftKey ? 10 : 1;
          // Always snap to displayBase so a drag preserves the value's
          // existing fractional offset (matches the keyboard nudge behavior).
          const raw = drag.startValue + dx * step * mult;
          const next = Math.min(max, Math.max(min, roundToStep(raw, displayBase)));
          dragPendingRef.current = next;
          if (dragRafRef.current === null) {
            dragRafRef.current = requestAnimationFrame(() => {
              dragRafRef.current = null;
              const v = dragPendingRef.current;
              if (v === null) return;
              dragPendingRef.current = null;
              onChange(v);
              setDraft(formatValue(v, displayBase));
            });
          }
        }}
        onPointerUp={(e) => {
          (e.currentTarget as HTMLInputElement).releasePointerCapture(e.pointerId);
          dragRef.current = null;
        }}
        onPointerCancel={(e) => {
          (e.currentTarget as HTMLInputElement).releasePointerCapture(e.pointerId);
          dragRef.current = null;
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            nudge(1, e);
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            nudge(-1, e);
          }
        }}
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

/**
 * Amber warning boxes for design-validation results (src/validation/checks.ts).
 * Semantic warnings only -- parse errors keep the existing red list style.
 * Warnings with a `line` get a "line N:" prefix pointing at the textarea. A
 * warning from a COMPILED feature has no line -- it names its source instead,
 * e.g. `board "OLED2-42inch" mount 3`, because pointing at a textarea row that
 * does not contain it would send the reader to the wrong place.
 */
export function WarningList({
  warnings,
}: {
  warnings: { line?: number; source?: string; message: string }[];
}) {
  if (warnings.length === 0) return null;
  return (
    <div className="mt-2 mb-1 flex flex-col gap-1.5">
      {warnings.map((w, i) => (
        <div
          key={i}
          className="text-[10px] px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-[var(--text-secondary)] leading-snug"
        >
          <span className="font-medium text-amber-400">
            Warning:{' '}
            {w.line !== undefined ? `line ${w.line}: ` : w.source ? `${w.source}: ` : ''}
          </span>
          {w.message}
        </div>
      ))}
    </div>
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
