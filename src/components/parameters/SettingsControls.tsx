'use client';

import { Section, ColorSwatch, Toggle, RadioRow } from './ui';
import { GROUP_COLORS } from '@/config/colors';
import { useDesign, DEFAULT_APPEARANCE } from '@/store/useDesign';

const VIEW_OPTIONS = [
  { value: 'box', label: 'Box' },
  { value: 'lid', label: 'Lid' },
  { value: 'assembled', label: 'Assembled' },
] as const;

export function SettingsControls() {
  const appearance = useDesign((s) => s.appearance);
  const setAppearance = useDesign((s) => s.setAppearance);
  const resetAppearance = useDesign((s) => s.resetAppearance);

  const isDefault =
    appearance.boxColor === DEFAULT_APPEARANCE.boxColor &&
    appearance.lidColor === DEFAULT_APPEARANCE.lidColor &&
    appearance.showRulers === DEFAULT_APPEARANCE.showRulers &&
    appearance.view === DEFAULT_APPEARANCE.view;

  return (
    <Section
      title="Appearance"
      titleColor={GROUP_COLORS.settings}
      tooltip="Viewport-only display options. None of these settings affect the exported geometry."
    >
      {!isDefault && (
        <div className="flex justify-end mb-2">
          <button
            onClick={resetAppearance}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors"
            title="Reset appearance to defaults"
          >
            Reset
          </button>
        </div>
      )}
      <ColorSwatch
        label="Box Color"
        value={appearance.boxColor}
        onChange={(v) => setAppearance({ boxColor: v })}
        tooltip="Color of the box body in the viewport"
      />
      <ColorSwatch
        label="Lid Color"
        value={appearance.lidColor}
        onChange={(v) => setAppearance({ lidColor: v })}
        tooltip="Color of the lid in the viewport"
      />
      <Toggle
        label="Show Rulers"
        checked={appearance.showRulers}
        onChange={(v) => setAppearance({ showRulers: v })}
        tooltip="Show tick-marked X / Y / Z axis rulers in the viewport"
      />
      <RadioRow
        label="View"
        value={appearance.view}
        options={VIEW_OPTIONS}
        onChange={(v) => setAppearance({ view: v })}
        tooltip="Which part(s) of the design to show"
      />
    </Section>
  );
}
