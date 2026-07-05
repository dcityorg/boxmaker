'use client';

import { useMemo } from 'react';
import { Section, NumberInput, WarningList } from './ui';
import { GROUP_COLORS } from '@/config/colors';
import { useDesign } from '@/store/useDesign';
import { lidPlateWarnings, lidShoulderWarnings } from '@/validation/checks';

export function LidControls() {
  const lid = useDesign((s) => s.lid);
  const setLid = useDesign((s) => s.setLid);

  const plateWarnings = useMemo(() => lidPlateWarnings(lid), [lid]);
  const shoulderWarnings = useMemo(() => lidShoulderWarnings(lid), [lid]);

  return (
    <>
      <Section
        title="Lid Plate"
        titleColor={GROUP_COLORS.box}
        tooltip="The visible top of the lid. Edge and center thickness are independent so you can save filament in the middle while keeping a sturdy rim."
      >
        <WarningList warnings={plateWarnings} />
        <NumberInput
          label="Edge thick"
          value={lid.coverThicknessAtEdge}
          min={0.4}
          max={10}
          step={0.1}
          onChange={(v) => setLid({ coverThicknessAtEdge: v })}
          tooltip="Lid plate thickness around the rim"
        />
        <NumberInput
          label="Center thick"
          value={lid.coverThicknessAtCenter}
          min={0.4}
          max={10}
          step={0.1}
          onChange={(v) => setLid({ coverThicknessAtCenter: v })}
          tooltip="Lid plate thickness at the center (independently settable for weight or cost — the center is pocketed)"
        />
      </Section>

      <Section
        title="Lid Shoulder"
        titleColor={GROUP_COLORS.box}
        tooltip="The block under the lid plate that fits inside the box opening. Depth equals the snap-fit engagement distance."
      >
        <WarningList warnings={shoulderWarnings} />
        <NumberInput
          label="Wall"
          value={lid.coverShoulderWallThickness}
          min={0.4}
          max={10}
          step={0.1}
          onChange={(v) => setLid({ coverShoulderWallThickness: v })}
          tooltip="Wall thickness of the shoulder block that fits inside the box opening"
        />
        <NumberInput
          label="Depth"
          value={lid.coverShoulderDepth}
          min={0}
          max={30}
          step={0.1}
          onChange={(v) => setLid({ coverShoulderDepth: v })}
          tooltip="How far the shoulder extends down into the box (also the snap-fit engagement depth)"
        />
        <NumberInput
          label="Box gap"
          value={lid.boxGap}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => setLid({ boxGap: v })}
          tooltip="Slip-fit clearance between the shoulder and the box interior wall"
        />
      </Section>
    </>
  );
}
