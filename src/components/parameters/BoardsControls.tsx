'use client';

import { useRef } from 'react';
import { Section } from './ui';
import { GROUP_COLORS } from '@/config/colors';
import { useDesign } from '@/store/useDesign';
import { parseBoardFile } from '@/board/parseBoard';
import { useEffectiveFeatures } from '@/board/compileAll';

export function BoardsControls() {
  const text = useDesign((s) => s.boardsText);
  const setText = useDesign((s) => s.setBoardsText);
  const placements = useDesign((s) => s.boards);
  const errors = useDesign((s) => s.boardErrors);
  const library = useDesign((s) => s.boardLibrary);
  const addBoard = useDesign((s) => s.addBoardToLibrary);
  const removeBoard = useDesign((s) => s.removeBoardFromLibrary);

  const { boardErrors } = useEffectiveFeatures();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same filename
    if (!file) return;
    try {
      const { board, errors: parseErrors } = parseBoardFile(await file.text());
      if (!board) {
        alert(
          `Could not read ${file.name}:\n\n` +
            parseErrors
              .map((p) => (p.line > 0 ? `line ${p.line}: ${p.reason}` : p.reason))
              .join('\n')
        );
        return;
      }
      addBoard(board);
    } catch (err) {
      console.error('[BoxMaker] board import failed:', err);
      alert(`Could not read ${file.name} -- check the console.`);
    }
  };

  return (
    <Section
      title="Boards"
      titleColor={GROUP_COLORS.boards}
      tooltip="Place a PC board defined in a reusable .board.txt file. Its mounting holes become standoffs and its component cutouts are cut through whichever surface they face."
    >
      {/* ---- library ---------------------------------------------------- */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full px-2 py-1 mb-2 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors text-[var(--text-secondary)]"
        title="Import a .board.txt board definition. It is stored inside this design, so the design still renders on a machine that does not have the file."
      >
        + Import board file
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,text/plain"
        onChange={handleImport}
        className="hidden"
      />

      {library.length === 0 ? (
        <div className="text-[10px] text-[var(--text-secondary)] italic mb-2">
          No boards loaded. Import a .board.txt file, then place it below by name.
        </div>
      ) : (
        <ul className="mb-2 flex flex-col gap-1">
          {library.map((b) => (
            <li
              key={b.name}
              className="flex items-center gap-2 text-[10px] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1"
            >
              <span className="font-mono text-[var(--text-primary)] flex-1 truncate" title={b.name}>
                {b.name}
              </span>
              <span className="text-[var(--text-secondary)] shrink-0">
                {b.sizeX}×{b.sizeY} · {b.mounts.length} hole{b.mounts.length === 1 ? '' : 's'}
                {b.cutouts.length > 0 && ` · ${b.cutouts.length} cutout${b.cutouts.length === 1 ? '' : 's'}`}
                {b.edges.length > 0 && ` · ${b.edges.length} connector${b.edges.length === 1 ? '' : 's'}`}
              </span>
              <button
                onClick={() => removeBoard(b.name)}
                className="text-[var(--text-secondary)] hover:text-red-400 shrink-0"
                title={`Remove ${b.name} from this design`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ---- placements -------------------------------------------------- */}
      <div className="text-[10px] text-[var(--text-secondary)] italic mb-2 leading-snug">
        <div>
          Format: <code className="not-italic">Surface,​X,​Y,​Rotation,​Components,​StandoffHeight,​StandoffOD,​StandoffHoleDia,​HoleDepth,​BaseFilletRadius,​BoardName</code>
        </div>
        <div>
          Surface: <code className="not-italic">floor</code> or <code className="not-italic">lid</code>
        </div>
        <div>X,Y = where the board&apos;s 0,0 lands on that surface (mm)</div>
        <div>Rotation = CCW degrees, multiples of 90 only</div>
        <div>
          Components: <code className="not-italic">up</code> or <code className="not-italic">down</code> — which way the
          component side faces (world Z)
        </div>
        <div>StandoffHeight/OD/HoleDia/HoleDepth/BaseFilletRadius = the standoffs under it</div>
        <div>BoardName = name from an imported board file</div>
        <div>
          Use <code className="not-italic">{'//'}</code> for comments
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        spellCheck={false}
        placeholder="lid, 104.2, 35.5, 0, up, 2.6, 4, 2.2, 3.2, 2, OLED"
        title="One placed board per line -- // for comments"
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded p-2 text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-y"
      />
      <div className="text-[10px] text-[var(--text-secondary)] mt-1">
        {placements.length} board{placements.length === 1 ? '' : 's'} placed
        {errors.length > 0 && (
          <span className="text-red-400 ml-2">
            · {errors.length} error{errors.length === 1 ? '' : 's'} on line
            {errors.length === 1 ? '' : 's'} {errors.map((e) => e.line).join(', ')}
          </span>
        )}
        {boardErrors.length > 0 && (
          <span className="text-red-400 ml-2">
            · {boardErrors.length} unresolved
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
      {boardErrors.length > 0 && (
        <ul className="text-[10px] text-red-400 mt-1 pl-3 list-disc">
          {boardErrors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </Section>
  );
}
