'use client';

import { useEffect, useRef, useState } from 'react';
import { UI_MUTED } from '@/config/colors';
import { PRESETS, type Preset } from '@/data/presets';

/**
 * Toolbar preset picker -- click to drop down a list of bundled starter
 * designs. Selecting one calls onSelect(preset); the parent handles the
 * dirty-check guard and the actual load.
 *
 * Custom dropdown (not a native <select>) so we can show a description
 * line under each preset name and match the dark theme exactly.
 */
export function PresetPicker({ onSelect }: { onSelect: (preset: Preset) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside (matches the vasemaker-ui.md §9 pattern).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Escape closes too.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-left flex items-center justify-between hover:bg-[var(--border-color)] transition-colors"
        style={{ color: UI_MUTED }}
        title="Load a built-in starter design"
      >
        <span>Load Example...</span>
        <span className="text-[10px] ml-1">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded shadow-xl z-50 max-h-[70vh] overflow-y-auto sidebar-scroll">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setOpen(false);
                onSelect(p);
              }}
              className="w-full px-2 py-1.5 hover:bg-[var(--border-color)] transition-colors text-left block"
              title={p.description}
            >
              <div className="text-xs text-[var(--text-primary)] font-medium">{p.name}</div>
              <div className="text-[10px] text-[var(--text-secondary)] truncate">{p.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
