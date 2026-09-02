'use client';

import { useCallback, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Section } from './ui';
import { GROUP_COLORS } from '@/config/colors';
import { useDesign } from '@/store/useDesign';
import { parseBoardFile } from '@/board/parseBoard';
import { useEffectiveFeatures } from '@/board/compileAll';
import {
  forgetHandle,
  getHandle,
  hasHandle,
  pickBoardFile,
  rememberHandle,
  rereadBoardFile,
  supportsFilePicker,
  type BoardFileHandle,
} from '@/board/fileHandles';

/** An alert longer than this is unreadable; the rest is almost always noise. */
const MAX_ERRORS_SHOWN = 10;

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
  // Bumps on every refresh so the row's icon can flash; also forces a re-render
  // so hasHandle() is re-read after an import.
  const [, bump] = useState(0);

  /**
   * Parse a file and put it in the library. `replacing` is the board this came
   * from when refreshing, so a renamed board file does not silently leave the
   * old entry behind.
   */
  const ingest = useCallback(
    async (file: File, handle: BoardFileHandle | null, replacing?: string) => {
      const { board, errors: parseErrors } = parseBoardFile(await file.text());
      if (!board) {
        const shown = parseErrors
          .slice(0, MAX_ERRORS_SHOWN)
          .map((p) => (p.line > 0 ? `line ${p.line}: ${p.reason}` : p.reason));
        const extra = parseErrors.length - shown.length;
        if (extra > 0) shown.push(`... and ${extra} more`);
        alert(
          `Could not read ${file.name}:\n\n${shown.join('\n')}` +
            (parseErrors.length > MAX_ERRORS_SHOWN
              ? '\n\nThat many errors usually means this is not a board file, or ' +
                'was saved as rich text rather than plain text.'
              : '')
        );
        return;
      }
      const renamed =
        replacing !== undefined &&
        replacing.trim().toLowerCase() !== board.name.trim().toLowerCase();
      if (renamed) {
        useDesign.getState().removeBoardFromLibrary(replacing);
        forgetHandle(replacing);
      }
      addBoard(board);
      rememberHandle(board.name, handle);
      bump((n) => n + 1);
      if (renamed) {
        alert(
          `That file now names the board "${board.name}", not "${replacing}".\n\n` +
            `The old entry was removed. Any placement line still saying ` +
            `"${replacing}" needs updating.`
        );
      }
    },
    [addBoard]
  );

  const handleImportClick = async () => {
    // Checked synchronously, before any await, so the click's user activation
    // is still live when the fallback input is clicked.
    if (!supportsFilePicker()) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const picked = await pickBoardFile();
      if (picked && picked !== 'unsupported') await ingest(picked.file, picked.handle);
    } catch (err) {
      console.error('[BoxMaker] board import failed:', err);
      alert('Could not read that file -- check the console.');
    }
  };

  const handleImportFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same filename
    if (!file) return;
    try {
      await ingest(file, null);
    } catch (err) {
      console.error('[BoxMaker] board import failed:', err);
      alert(`Could not read ${file.name} -- check the console.`);
    }
  };

  /** Re-read a board's file. Silent when we still hold its handle. */
  const handleRefresh = async (name: string) => {
    if (!supportsFilePicker() && !hasHandle(name)) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const file = await rereadBoardFile(name);
      if (file) {
        // Pass the handle back in so it survives the board being renamed in
        // its own file -- ingest drops the old entry and its handle with it.
        await ingest(file, getHandle(name), name);
        return;
      }
      // No handle (page was reloaded), or the file moved: ask for it again.
      const picked = await pickBoardFile();
      if (picked && picked !== 'unsupported') await ingest(picked.file, picked.handle, name);
    } catch (err) {
      console.error('[BoxMaker] board refresh failed:', err);
      alert(`Could not re-read the file for "${name}" -- check the console.`);
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
        onClick={handleImportClick}
        className="w-full px-2 py-1 mb-2 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors text-[var(--text-secondary)]"
        title="Import a board definition file. Re-importing a board with the same name replaces it, so you can edit the file and import again without deleting it first. The definition is stored inside this design, so the design still renders on a machine that does not have the file."
      >
        + Import board file
      </button>
      {/*
        No `accept` filter, deliberately. macOS greys out anything the filter
        does not match, with no explanation -- so a board file saved as
        `.board`, or as `.rtf` by TextEdit, simply cannot be picked and the user
        is left guessing. A board file is just text; the parser validates the
        contents and says exactly what is wrong, which is a far better failure
        than an unclickable filename.
      */}
      <input ref={fileInputRef} type="file" onChange={handleImportFallback} className="hidden" />

      {/* ---- board file format ------------------------------------------ */}
      <details className="mb-2">
        <summary className="text-[10px] text-[var(--text-secondary)] cursor-pointer select-none hover:text-[var(--text-primary)]">
          Board file format
        </summary>
        <div className="text-[10px] text-[var(--text-secondary)] italic mt-1 leading-snug">
          <div className="mb-1">
            A board is a plain text file. 0,0 is a corner you pick, viewed from the COMPONENT side;
            +X right, +Y up. Board Z = 0 is the non-component face, +Z toward the components.
            Use <code className="not-italic">{'//'}</code> for comments, anywhere on a line.
          </div>
          <div className="mb-1">
            <code className="not-italic">[board]</code> — key,value lines. Name and Size required.
            <div>Name, MyBoard &nbsp;— matched to BoardName below</div>
            <div>Size, X, Y &nbsp;— board outline (mm)</div>
            <div>Thickness, T &nbsp;— default 1.6</div>
            <div>CornerRadius, R &nbsp;— default 0</div>
          </div>
          <div className="mb-1">
            <code className="not-italic">[mounts]</code> — <code className="not-italic">X,​Y,​BoardHoleDia</code>
            <div>One mounting hole per line; each becomes a standoff.</div>
            <div>BoardHoleDia is the hole in the BOARD — the standoff&apos;s own size comes from the placement line below.</div>
          </div>
          <div className="mb-1">
            <code className="not-italic">[cutouts]</code> — holes through the floor or lid
            <div><code className="not-italic">Side,​Round,​X,​Y,​Diameter,​Clearance</code></div>
            <div><code className="not-italic">Side,​Rect,​X,​Y,​SizeX,​SizeY,​CornerRadius,​Clearance</code></div>
            <div>
              Side: <code className="not-italic">top</code> or <code className="not-italic">bottom</code> — which face of the
              BOARD, never the box. Which box surface gets cut is worked out from the placement.
            </div>
            <div>X,Y = center of the opening (mm)</div>
          </div>
          <div className="mb-1">
            <code className="not-italic">[edges]</code> — connector holes through a side wall
            <div><code className="not-italic">Edge,​Pos,​Z,​SizeAlong,​SizeZ,​CornerRadius,​Clearance</code></div>
            <div>
              Edge: <code className="not-italic">x+ x- y+ y-</code> — which board edge, x+ being the one at maximum board X
            </div>
            <div>Pos = along that edge: board Y for x+/x-, board X for y+/y-</div>
            <div>Z = center height above the NON-component face, so add the board thickness (a jack 1.5 above a 1.6 board is 3.1)</div>
          </div>
          <div className="mb-1">
            <code className="not-italic">[keepouts]</code> — optional, for tall parts
            <div><code className="not-italic">X,​Y,​SizeX,​SizeY,​Height,​Side</code> — X,Y = center</div>
          </div>
          <div>
            Clearance is added on EVERY side, so the opening grows by twice it: 10 wide with
            Clearance 0.4 cuts as 10.8. It changes SIZE only — CornerRadius stays exactly what
            you asked for, so 0 stays square.
          </div>
        </div>
      </details>

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
                onClick={() => handleRefresh(b.name)}
                className="text-[var(--text-secondary)] hover:text-[var(--accent)] shrink-0"
                title={
                  hasHandle(b.name)
                    ? `Re-read ${b.name} from the file it was imported from`
                    : supportsFilePicker()
                      ? `Re-import ${b.name} -- the file has to be picked again, because the page was reloaded since it was imported`
                      : `Re-import ${b.name} -- this browser cannot re-read a file directly, so it will always ask for the file`
                }
              >
                <RefreshCw size={11} />
              </button>
              <button
                onClick={() => {
                  removeBoard(b.name);
                  forgetHandle(b.name);
                }}
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
