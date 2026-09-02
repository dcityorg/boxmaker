'use client';

import { Section } from './ui';
import { GROUP_COLORS } from '@/config/colors';
import { useDesign } from '@/store/useDesign';

export function ObjectsControls() {
  const text = useDesign((s) => s.objectsText);
  const setText = useDesign((s) => s.setObjectsText);
  const objects = useDesign((s) => s.objects);
  const errors = useDesign((s) => s.objectErrors);

  return (
    <Section
      title="Objects"
      titleColor={GROUP_COLORS.boards}
      tooltip="Anything else that takes up room in the box -- a battery, a speaker, a relay. Drawn as a translucent box so you can see what fits. Advisory only: objects never add or remove material and never appear in an export."
    >
      <details className="mb-2">
        <summary className="text-[10px] text-[var(--text-secondary)] cursor-pointer select-none hover:text-[var(--text-primary)]">
          Object format
        </summary>
        <div className="text-[10px] text-[var(--text-secondary)] italic mt-1 leading-snug">
          <div>
            Format: <code className="not-italic">Surface,​X,​Y,​SizeX,​SizeY,​Depth,​Offset,​Name</code>
          </div>
          <div>
            Surface: <code className="not-italic">floor</code>, <code className="not-italic">lid</code>,{' '}
            <code className="not-italic">front</code>, <code className="not-italic">back</code>,{' '}
            <code className="not-italic">left</code> or <code className="not-italic">right</code> — what the
            object sits on or is stuck to
          </div>
          <div>
            X,Y = CENTER of the object on that surface, in the same frame that surface&apos;s cutouts use
            (walls measure Y up from the interior floor)
          </div>
          <div>SizeX,SizeY = its footprint on that surface (mm)</div>
          <div>Depth = how far it stands off the surface, into the box (mm) — height, for a floor object</div>
          <div>Offset = gap between the surface and the object (mm); 0 = touching</div>
          <div>Name = anything; commas inside the name are kept</div>
          <div>
            Use <code className="not-italic">{'//'}</code> for comments
          </div>
          <div className="mt-1">
            Objects are a design aid only. They never cut or add material, and they are not exported. Turn
            the drawing off under Settings &rarr; Show Clearance.
          </div>
        </div>
      </details>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        spellCheck={false}
        placeholder="left, 40, 25, 55, 30, 12, 0, LiPo battery"
        title="One object per line: Surface,X,Y,SizeX,SizeY,Depth,Offset,Name -- // for comments"
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded p-2 text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-y"
      />
      <div className="text-[10px] text-[var(--text-secondary)] mt-1">
        {objects.length} object{objects.length === 1 ? '' : 's'}
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
