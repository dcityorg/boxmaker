'use client';

import { Section } from './ui';
import { GROUP_COLORS } from '@/config/colors';
import { useDesign } from '@/store/useDesign';

export function CutoutsControls() {
  const text = useDesign((s) => s.cutoutsText);
  const setText = useDesign((s) => s.setCutoutsText);
  const cutouts = useDesign((s) => s.cutouts);
  const errors = useDesign((s) => s.cutoutErrors);

  return (
    <Section
      title="Cutouts"
      titleColor={GROUP_COLORS.cutouts}
      tooltip="Holes through any wall, floor, or the lid. Round (5 fields) or rectangular with optional corner fillet (7 fields)."
    >
      <div className="text-[10px] text-[var(--text-secondary)] italic mb-2 leading-snug">
        <div>
          Round: <code className="not-italic">Surface,Round,X,Y,Diameter</code>
        </div>
        <div>
          Rect: <code className="not-italic">Surface,Rect,X,Y,HoleX,HoleY,CornerRadius</code>
        </div>
        <div>Surface: front, back, left, right, floor, or lid</div>
        <div>X,Y = center of cutout (mm) on the surface sketch.</div>
        <div>Walls: 0,0 at interior bottom-left viewed from outside.</div>
        <div>Floor: 0,0 at lower-left of top view (interior back-right).</div>
        <div>Lid: 0,0 inside shoulder pocket at back-left; +Y grows to front.</div>
        <div>HoleX, HoleY = rectangle width and height (Rect only)</div>
        <div>
          Use <code className="not-italic">{'//'}</code> for comments
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        spellCheck={false}
        placeholder={'lid,Rect,50,35,20,10,1\nleft,Round,30,15,5.5'}
        title="One cutout per line. Round: Surface,Round,X,Y,Diameter -- Rect: Surface,Rect,X,Y,HoleX,HoleY,CornerRadius -- // for comments"
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded p-2 text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-y"
      />
      <div className="text-[10px] text-[var(--text-secondary)] mt-1">
        {cutouts.length} cutout{cutouts.length === 1 ? '' : 's'}
        {errors.length > 0 && (
          <span className="text-red-400 ml-2">
            * {errors.length} error{errors.length === 1 ? '' : 's'} on line
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
