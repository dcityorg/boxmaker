'use client';

import { Section } from './ui';
import { GROUP_COLORS } from '@/config/colors';
import { useDesign } from '@/store/useDesign';

export function StandoffsControls() {
  const text = useDesign((s) => s.standoffsText);
  const setText = useDesign((s) => s.setStandoffsText);
  const standoffs = useDesign((s) => s.standoffs);
  const errors = useDesign((s) => s.standoffErrors);

  return (
    <Section
      title="Standoffs"
      titleColor={GROUP_COLORS.standoffs}
      tooltip="PCB-mount cylinders rising from the floor (or hanging from the lid). Optional concentric screw hole and base fillet per standoff."
    >
      <div className="text-[10px] text-[var(--text-secondary)] italic mb-2 leading-snug">
        <div>
          Format: <code className="not-italic">Surface,X,Y,OD,Height,HoleDia,HoleDepth,BaseFillet</code>
        </div>
        <div>
          Surface: <code className="not-italic">floor</code> or <code className="not-italic">lid</code>
        </div>
        <div>Floor: 0,0 at lower-left of top view (interior back-right)</div>
        <div>Lid: 0,0 inside shoulder pocket at back-left; +Y to front</div>
        <div>
          Use <code className="not-italic">{'//'}</code> for comments
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        spellCheck={false}
        placeholder="floor,10,10,6,8,2.5,6,1"
        title="One standoff per line: Surface,X,Y,OD,Height,HoleDia,HoleDepth,BaseFillet -- // for comments"
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded p-2 text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-y"
      />
      <div className="text-[10px] text-[var(--text-secondary)] mt-1">
        {standoffs.length} standoff{standoffs.length === 1 ? '' : 's'}
        {errors.length > 0 && (
          <span className="text-red-400 ml-2">
            · {errors.length} error{errors.length === 1 ? '' : 's'} on line
            {errors.length === 1 ? '' : 's'} {errors.map((e) => e.line).join(', ')}
          </span>
        )}
      </div>
      {errors.length > 0 && (
        <ul className="text-[10px] text-red-400 mt-1 pl-3 list-disc">
          {errors.map((e, i) => (
            <li key={i}>
              line {e.line}: {e.reason}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
