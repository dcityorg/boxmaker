'use client';

import { Section, NumberInput, RadioRow } from './ui';
import { GROUP_COLORS } from '@/config/colors';
import {
  useDesign,
  exteriorDimensions,
  interiorDimensions,
  interiorToExterior,
  type DimensionMode,
} from '@/store/useDesign';

const MODE_OPTIONS = [
  { value: 'exterior', label: 'Exterior' },
  { value: 'interior', label: 'Interior' },
] as const satisfies readonly { value: DimensionMode; label: string }[];

export function BoxControls() {
  const box = useDesign((s) => s.box);
  const setBox = useDesign((s) => s.setBox);

  // What we display in the L/W/H fields depends on the mode; the underlying
  // store always holds exterior dimensions. Edits in interior mode are
  // converted back to exterior before writing.
  const ext = exteriorDimensions(box);
  const intr = interiorDimensions(box);
  const shown = box.mode === 'exterior' ? ext : intr;

  const writeShownLength = (v: number) => {
    if (box.mode === 'exterior') {
      setBox({ length: v });
    } else {
      setBox(interiorToExterior({ length: v }, box));
    }
  };
  const writeShownWidth = (v: number) => {
    if (box.mode === 'exterior') {
      setBox({ width: v });
    } else {
      setBox(interiorToExterior({ width: v }, box));
    }
  };
  const writeShownHeight = (v: number) => {
    if (box.mode === 'exterior') {
      setBox({ height: v });
    } else {
      setBox(interiorToExterior({ height: v }, box));
    }
  };

  const otherLabel = box.mode === 'exterior' ? 'Interior' : 'Exterior';
  const other = box.mode === 'exterior' ? intr : ext;

  return (
    <>
      <Section
        title="Dimensions"
        titleColor={GROUP_COLORS.box}
        tooltip="Box outer dimensions. Use the Showing toggle to enter interior dimensions instead -- the other set is shown beneath the inputs."
      >
        <RadioRow
          label="Showing"
          value={box.mode}
          options={MODE_OPTIONS}
          onChange={(v) => setBox({ mode: v })}
          tooltip="Choose whether the L/W/H fields below show the box's exterior or interior dimensions. The box itself does not change — only which numbers you edit."
        />
        <NumberInput
          label="Length"
          value={shown.length}
          min={10}
          max={500}
          step={0.1}
          onChange={writeShownLength}
          tooltip={`Box ${box.mode} length along the X axis`}
        />
        <NumberInput
          label="Width"
          value={shown.width}
          min={10}
          max={500}
          step={0.1}
          onChange={writeShownWidth}
          tooltip={`Box ${box.mode} width along the Y axis`}
        />
        <NumberInput
          label="Height"
          value={shown.height}
          min={5}
          max={300}
          step={0.1}
          onChange={writeShownHeight}
          tooltip={`Box ${box.mode} height along the Z axis`}
        />
        <p className="text-[10px] text-[var(--text-secondary)] mt-2 leading-relaxed">
          {otherLabel}: {other.length.toFixed(1)} × {other.width.toFixed(1)} ×{' '}
          {other.height.toFixed(1)} mm
        </p>
      </Section>

      <Section
        title="Walls & Floor"
        titleColor={GROUP_COLORS.box}
        tooltip="Material thickness of the four side walls and the bottom floor"
      >
        <NumberInput
          label="Wall"
          value={box.wallThickness}
          min={0.4}
          max={10}
          step={0.1}
          onChange={(v) => setBox({ wallThickness: v })}
          tooltip="Thickness of the four side walls"
        />
        <NumberInput
          label="Floor"
          value={box.floorThickness}
          min={0.4}
          max={10}
          step={0.1}
          onChange={(v) => setBox({ floorThickness: v })}
          tooltip="Thickness of the bottom floor"
        />
      </Section>

      <Section
        title="Corner Radii"
        titleColor={GROUP_COLORS.box}
        defaultOpen={false}
        tooltip="Vertical-edge rounding for the box's outer shell and inner cavity"
      >
        <NumberInput
          label="Outer"
          value={box.outerCornerRadius}
          min={0}
          max={20}
          step={0.1}
          onChange={(v) => setBox({ outerCornerRadius: v })}
          tooltip="Rounding on the box's four outer vertical edges"
        />
        <NumberInput
          label="Inner"
          value={box.innerCornerRadius}
          min={0}
          max={20}
          step={0.1}
          onChange={(v) => setBox({ innerCornerRadius: v })}
          tooltip="Rounding on the cavity's four inner vertical edges"
        />
      </Section>
    </>
  );
}
