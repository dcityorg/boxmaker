'use client';

import { Section, NumberInput, Toggle } from './ui';
import { GROUP_COLORS } from '@/config/colors';
import { useDesign, type LidParams, type SnapFitParams } from '@/store/useDesign';

/**
 * Geometric and sizing warnings for the snap-fit clip. Returns 0..4 warning
 * strings ready to render. Pure function -- no store deps.
 *
 * Geometric (hard "will break") cases:
 *   - Apex of the nub (depth = nubHeight / 2) cuts into the lid shoulder. If
 *     it exceeds shoulder wall thickness, the cavity pokes through to the
 *     inner face.
 *   - Cavity height = nubHeight. If it exceeds shoulder depth, the cavity
 *     extends past the shoulder bottom and the nub can't seat.
 *
 * Sizing (heuristic "may") cases:
 *   - Nub heights below 2 mm tend to print poorly.
 *   - Nub heights above 5 mm make the lid hard to seat (wall flex limits).
 */
function computeSnapFitWarnings(snap: SnapFitParams, lid: LidParams): string[] {
  const warnings: string[] = [];
  const apexDepth = snap.nubHeight / 2;
  if (apexDepth > lid.coverShoulderWallThickness) {
    warnings.push(
      `Nub apex (${apexDepth.toFixed(2)} mm) exceeds shoulder wall thickness (${lid.coverShoulderWallThickness.toFixed(2)} mm). The cavity will break through the inner face of the lid shoulder. Reduce Nub height or increase Lid shoulder wall.`
    );
  }
  if (snap.nubHeight > lid.coverShoulderDepth) {
    warnings.push(
      `Nub height (${snap.nubHeight.toFixed(2)} mm) exceeds shoulder depth (${lid.coverShoulderDepth.toFixed(2)} mm). The cavity will extend past the bottom of the lid shoulder. Reduce Nub height or increase Lid shoulder depth.`
    );
  }
  if (snap.nubHeight < 2) {
    warnings.push(
      `Nub height (${snap.nubHeight.toFixed(2)} mm) is below 2 mm -- the printed nub may not form cleanly.`
    );
  }
  if (snap.nubHeight > 5) {
    warnings.push(
      `Nub height (${snap.nubHeight.toFixed(2)} mm) is above 5 mm -- the lid may be difficult to get on.`
    );
  }
  return warnings;
}

export function SnapFitControls() {
  const snap = useDesign((s) => s.snap);
  const setSnap = useDesign((s) => s.setSnap);
  const lid = useDesign((s) => s.lid);

  const anyEnabled = snap.snapFront || snap.snapBack || snap.snapLeft || snap.snapRight;
  const warnings = anyEnabled ? computeSnapFitWarnings(snap, lid) : [];

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
      {warnings.length > 0 && (
        <div className="mt-2 mb-1 flex flex-col gap-1.5">
          {warnings.map((w, i) => (
            <div
              key={i}
              className="text-[10px] px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-[var(--text-secondary)] leading-snug"
            >
              <span className="font-medium text-amber-400">Warning: </span>
              {w}
            </div>
          ))}
        </div>
      )}
      <NumberInput
        label="Nub height"
        value={snap.nubHeight}
        min={1}
        max={15}
        step={0.1}
        onChange={(v) => setSnap({ nubHeight: v })}
        tooltip="Wall-side length of the right-isoceles cross-section (apex angle 90°). Shorter boxes typically need smaller nubs because the walls don't flex as much during insertion; taller boxes can take larger nubs. Apex depth = nubHeight/2 must stay within the lid shoulder wall thickness; nubHeight itself must stay within the lid shoulder depth -- otherwise the cavity in the lid breaks through. The sidebar shows a warning when either is violated."
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
