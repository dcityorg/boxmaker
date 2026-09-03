'use client';

import { useCallback, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Section } from './ui';
import { GROUP_COLORS } from '@/config/colors';
import { useDesign } from '@/store/useDesign';
import { parseObjectFile } from '@/board/parseObject';
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

const MAX_ERRORS_SHOWN = 10;
/** Handles are keyed by name; namespace them so an object and a board can share one. */
const K = (name: string) => `object:${name}`;

export function ObjectsControls() {
  const text = useDesign((s) => s.objectsText);
  const setText = useDesign((s) => s.setObjectsText);
  const placements = useDesign((s) => s.objects);
  const errors = useDesign((s) => s.objectErrors);
  const library = useDesign((s) => s.objectLibrary);
  const addObject = useDesign((s) => s.addObjectToLibrary);
  const removeObject = useDesign((s) => s.removeObjectFromLibrary);

  const { objectErrors } = useEffectiveFeatures();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, bump] = useState(0);

  const ingest = useCallback(
    async (file: File, handle: BoardFileHandle | null, replacing?: string) => {
      const { object, errors: parseErrors } = parseObjectFile(await file.text());
      if (!object) {
        const shown = parseErrors
          .slice(0, MAX_ERRORS_SHOWN)
          .map((p) => (p.line > 0 ? `line ${p.line}: ${p.reason}` : p.reason));
        const extra = parseErrors.length - shown.length;
        if (extra > 0) shown.push(`... and ${extra} more`);
        alert(`Could not read ${file.name}:\n\n${shown.join('\n')}`);
        return;
      }
      const renamed =
        replacing !== undefined &&
        replacing.trim().toLowerCase() !== object.name.trim().toLowerCase();
      if (renamed) {
        useDesign.getState().removeObjectFromLibrary(replacing);
        forgetHandle(K(replacing));
      }
      addObject(object);
      rememberHandle(K(object.name), handle);
      bump((n) => n + 1);
      if (renamed) {
        alert(
          `That file now names the object "${object.name}", not "${replacing}".\n\n` +
            `The old entry was removed. Any placement line still saying "${replacing}" needs updating.`
        );
      }
    },
    [addObject]
  );

  const handleImportClick = async () => {
    if (!supportsFilePicker()) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const picked = await pickBoardFile();
      if (picked && picked !== 'unsupported') await ingest(picked.file, picked.handle);
    } catch (err) {
      console.error('[BoxMaker] object import failed:', err);
      alert('Could not read that file -- check the console.');
    }
  };

  const handleImportFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await ingest(file, null);
    } catch (err) {
      console.error('[BoxMaker] object import failed:', err);
      alert(`Could not read ${file.name} -- check the console.`);
    }
  };

  const handleRefresh = async (name: string) => {
    if (!supportsFilePicker() && !hasHandle(K(name))) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const file = await rereadBoardFile(K(name));
      if (file) {
        await ingest(file, getHandle(K(name)), name);
        return;
      }
      const picked = await pickBoardFile();
      if (picked && picked !== 'unsupported') await ingest(picked.file, picked.handle, name);
    } catch (err) {
      console.error('[BoxMaker] object refresh failed:', err);
      alert(`Could not re-read the file for "${name}" -- check the console.`);
    }
  };

  return (
    <Section
      title="Objects"
      titleColor={GROUP_COLORS.boards}
      tooltip="Non-printed parts that live in the box -- a potentiometer, a battery, a speaker. Defined in their own reusable file like a board. The body is only drawn for clearance; its cutouts DO cut real holes."
    >
      <details className="mb-2">
        <summary className="text-[10px] text-[var(--text-secondary)] cursor-pointer select-none hover:text-[var(--text-primary)]">
          Object file format
        </summary>
        <div className="text-[10px] text-[var(--text-secondary)] italic mt-1 leading-snug">
          <div className="mb-1">
            A plain text file, same shape as a board file. 0,0,0 is a corner of the face that sits
            AGAINST the mounting surface; X and Y run across that face, +Z runs away from the surface into
            the box. Use <code className="not-italic">{'//'}</code> for comments.
          </div>
          <div className="mb-1">
            <code className="not-italic">[object]</code>
            <div>Name, MyPart &nbsp;— matched to ObjectName below</div>
            <div>Size, X, Y, Z &nbsp;— X,Y across the mounting face; Z away from it (mm)</div>
          </div>
          <div className="mb-1">
            <code className="not-italic">[cutouts]</code> — holes this part needs through the enclosure
            <div><code className="not-italic">Face,​Round,​X,​Y,​Z,​Diameter,​Clearance</code></div>
            <div><code className="not-italic">Face,​Rect,​X,​Y,​Z,​Width,​Height,​CornerRadius,​Clearance</code></div>
            <div>
              Face: <code className="not-italic">base</code> (against the mounting surface),{' '}
              <code className="not-italic">top</code> (opposite it), or{' '}
              <code className="not-italic">x+ x- y+ y-</code>
            </div>
            <div>X,Y,Z = centre of the hole in object coords. The axis perpendicular to the named face is
              ignored — write 0 or the face&apos;s own value, whichever reads better.</div>
            <div>Width/Height run along the face&apos;s two free axes in X,Y,Z order — so base/top are
              (X,Y), x± are (Y,Z), y± are (X,Z)</div>
          </div>
          <div>
            You never name a box wall. Which surface a hole exits through is worked out from where the
            object is placed, so one file works on the floor, the lid or any wall.
          </div>
        </div>
      </details>

      <button
        onClick={handleImportClick}
        className="w-full px-2 py-1 mb-2 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors text-[var(--text-secondary)]"
        title="Import an object definition file. Re-importing one with the same name replaces it. Stored inside this design, so it still renders on a machine without the file."
      >
        + Import object file
      </button>
      <input ref={fileInputRef} type="file" onChange={handleImportFallback} className="hidden" />

      {library.length === 0 ? (
        <div className="text-[10px] text-[var(--text-secondary)] italic mb-2">
          No objects loaded. Import an object file, then place it below by name.
        </div>
      ) : (
        <ul className="mb-2 flex flex-col gap-1">
          {library.map((o) => (
            <li
              key={o.name}
              className="flex items-center gap-2 text-[10px] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1"
            >
              <span className="font-mono text-[var(--text-primary)] flex-1 truncate" title={o.name}>
                {o.name}
              </span>
              <span className="text-[var(--text-secondary)] shrink-0">
                {o.sizeX}×{o.sizeY}×{o.sizeZ}
                {o.cutouts.length > 0 && ` · ${o.cutouts.length} cutout${o.cutouts.length === 1 ? '' : 's'}`}
              </span>
              <button
                onClick={() => handleRefresh(o.name)}
                className="text-[var(--text-secondary)] hover:text-[var(--accent)] shrink-0"
                title={
                  hasHandle(K(o.name))
                    ? `Re-read ${o.name} from the file it was imported from`
                    : `Re-import ${o.name} -- the file has to be picked again`
                }
              >
                <RefreshCw size={11} />
              </button>
              <button
                onClick={() => {
                  removeObject(o.name);
                  forgetHandle(K(o.name));
                }}
                className="text-[var(--text-secondary)] hover:text-red-400 shrink-0"
                title={`Remove ${o.name} from this design`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <details className="mb-2">
        <summary className="text-[10px] text-[var(--text-secondary)] cursor-pointer select-none hover:text-[var(--text-primary)]">
          Object placement format
        </summary>
        <div className="text-[10px] text-[var(--text-secondary)] italic mt-1 leading-snug">
          <div>
            Format: <code className="not-italic">Surface,​X,​Y,​Rotation,​Offset,​ObjectName</code>
          </div>
          <div>
            Surface: <code className="not-italic">floor</code>, <code className="not-italic">lid</code>,{' '}
            <code className="not-italic">front</code>, <code className="not-italic">back</code>,{' '}
            <code className="not-italic">left</code> or <code className="not-italic">right</code> — what it
            is stuck to
          </div>
          <div>X,Y = where the object&apos;s 0,0 corner lands on that surface (mm)</div>
          <div>Rotation = CCW degrees, multiples of 90 only</div>
          <div>Offset = gap between the surface and the object (mm); 0 = touching</div>
          <div>ObjectName = name from an imported object file</div>
          <div className="mt-1">
            The body is drawn for clearance only and is never exported. Its cutouts DO cut real holes.
          </div>
        </div>
      </details>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        spellCheck={false}
        placeholder="left, 30, 20, 0, 0, Pot 10k"
        title="One placed object per line: Surface,X,Y,Rotation,Offset,ObjectName -- // for comments"
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded p-2 text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-y"
      />
      <div className="text-[10px] text-[var(--text-secondary)] mt-1">
        {placements.length} object{placements.length === 1 ? '' : 's'} placed
        {errors.length > 0 && (
          <span className="text-red-400 ml-2">
            · {errors.length} error{errors.length === 1 ? '' : 's'} on line
            {errors.length === 1 ? '' : 's'} {errors.map((e) => e.line).join(', ')}
          </span>
        )}
        {objectErrors.length > 0 && (
          <span className="text-red-400 ml-2">· {objectErrors.length} unresolved</span>
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
      {objectErrors.length > 0 && (
        <ul className="text-[10px] text-red-400 mt-1 pl-3 list-disc">
          {objectErrors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </Section>
  );
}
