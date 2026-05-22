'use client';

import { Section, NumberInput, Toggle } from './ui';
import { GROUP_COLORS } from '@/config/colors';
import { useDesign } from '@/store/useDesign';

export function SnapFitControls() {
  const snap = useDesign((s) => s.snap);
  const setSnap = useDesign((s) => s.setSnap);

  const anyEnabled = snap.snapFront || snap.snapBack || snap.snapLeft || snap.snapRight;

  return (
    <Section
      title="Snap-Fit Clips"
      titleColor={GROUP_COLORS.box}
      checked={anyEnabled}
      onToggle={(v) =>
        setSnap({ snapFront: v, snapBack: v, snapLeft: v, snapRight: v })
      }
      tooltip="Triangular nubs on the box interior that engage matching cavities in the lid shoulder. Per-side toggles let you skip walls where another feature gets in the way."
    >
      <div className="grid grid-cols-2 gap-x-2">
        <Toggle
          compact
          label="Front"
          checked={snap.snapFront}
          onChange={(v) => setSnap({ snapFront: v })}
          tooltip="Enable snap-fit clip on the front wall"
        />
        <Toggle
          compact
          label="Back"
          checked={snap.snapBack}
          onChange={(v) => setSnap({ snapBack: v })}
          tooltip="Enable snap-fit clip on the back wall"
        />
        <Toggle
          compact
          label="Left"
          checked={snap.snapLeft}
          onChange={(v) => setSnap({ snapLeft: v })}
          tooltip="Enable snap-fit clip on the left wall"
        />
        <Toggle
          compact
          label="Right"
          checked={snap.snapRight}
          onChange={(v) => setSnap({ snapRight: v })}
          tooltip="Enable snap-fit clip on the right wall"
        />
      </div>
      <NumberInput
        label="Nub height"
        value={snap.nubHeight}
        min={1}
        max={15}
        step={0.1}
        onChange={(v) => setSnap({ nubHeight: v })}
        tooltip="Wall-side length of the right-isoceles cross-section (apex angle 90°). Apex depth = nubHeight/2. If this exceeds shoulder wall thickness or shoulder depth, the cavity will visibly break through."
      />
      <NumberInput
        label="Lid lead-in"
        value={snap.nubChamferAmountOnCover}
        min={0}
        max={3}
        step={0.1}
        onChange={(v) => setSnap({ nubChamferAmountOnCover: v })}
        tooltip="45° lead-in chamfer on the lower-outer edge of the lid cutout — eases the nub past first contact. 0.9 mm is the print-tested sweet spot; 0 disables."
      />
      <NumberInput
        label="Width %"
        value={snap.nubWidthRatio}
        min={5}
        max={80}
        step={1}
        onChange={(v) => setSnap({ nubWidthRatio: v })}
        suffix=" %"
        tooltip="Nub width as a percent of the interior wall length"
      />
      <NumberInput
        label="Min width"
        value={snap.nubWidthMin}
        min={3}
        max={50}
        step={0.5}
        onChange={(v) => setSnap({ nubWidthMin: v })}
        tooltip="Lower clamp on nub width — applied if the percentage gives a smaller value"
      />
      <NumberInput
        label="Max width"
        value={snap.nubWidthMax}
        min={5}
        max={100}
        step={0.5}
        onChange={(v) => setSnap({ nubWidthMax: v })}
        tooltip="Upper clamp on nub width"
      />
      <NumberInput
        label="Box shrink"
        value={snap.nubBoxShrink}
        min={0}
        max={5}
        step={0.1}
        onChange={(v) => setSnap({ nubBoxShrink: v })}
        tooltip="How much narrower the box nub is than the lid cavity, for easier alignment during insertion"
      />
    </Section>
  );
}
