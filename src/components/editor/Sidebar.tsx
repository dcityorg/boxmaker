'use client';

import { useRef, useState, useCallback } from 'react';
import { UI_MUTED, GROUP_COLORS } from '@/config/colors';
import { APP_VERSION } from '@/config/version';
import { useDesign } from '@/store/useDesign';
import { GroupHeader } from '@/components/parameters/ui';
import { SettingsControls } from '@/components/parameters/SettingsControls';
import { BoxControls } from '@/components/parameters/BoxControls';
import { LidControls } from '@/components/parameters/LidControls';
import { SnapFitControls } from '@/components/parameters/SnapFitControls';
import { StandoffsControls } from '@/components/parameters/StandoffsControls';
import { CutoutsControls } from '@/components/parameters/CutoutsControls';
import { TextLabelsControls } from '@/components/parameters/TextLabelsControls';
import { buildBox } from '@/geometry/box';
import { buildLid, lidPrintOrientation } from '@/geometry/lid';
import {
  buildBoxSeparateText,
  buildLidSeparateText,
  getActiveCustomFont,
  registerCustomFont,
  clearCustomFonts,
} from '@/geometry/text';
import {
  buildDesignFile,
  parseDesignFile,
  base64ToBuffer,
  designToUrlHash,
  DesignFileError,
} from '@/store/persistence';
import * as opentype from 'opentype.js';
import { idbSaveCustomFont, idbClearCustomFont } from '@/store/fontCache';
import { manifoldToBinarySTL, downloadBinary } from '@/geometry/exportSTL';
import { buildZip } from '@/geometry/zip';
import { build3MF } from '@/geometry/export3MF';

interface SidebarProps {
  helpOpen: boolean;
  onToggleHelp: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function Sidebar({ helpOpen, onToggleHelp, undo, redo, canUndo, canRedo }: SidebarProps) {
  const designName = useDesign((s) => s.designName);
  const setDesignName = useDesign((s) => s.setDesignName);
  const isDirty = useDesign((s) => s.isDirty);

  const scrollRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const designLoadInputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleToggleAll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const details = container.querySelectorAll('details');
    const allOpen = Array.from(details).every((d) => d.open);
    details.forEach((d) => (d.open = !allOpen));
  }, []);

  const handleSaveDesign = useCallback(() => {
    try {
      const s = useDesign.getState();
      const file = buildDesignFile({
        designName: s.designName,
        appearance: s.appearance,
        box: s.box,
        lid: s.lid,
        snap: s.snap,
        standoffsText: s.standoffsText,
        cutoutsText: s.cutoutsText,
        textLabelsText: s.textLabelsText,
        customFont: getActiveCustomFont(),
      });
      const json = JSON.stringify(file, null, 2);
      const enc = new TextEncoder();
      const baseName = (s.designName || 'boxmaker').replace(/[^a-z0-9-_]+/gi, '-');
      downloadBinary(enc.encode(json).buffer as ArrayBuffer, `${baseName}.boxmaker.json`);
      useDesign.getState().markClean();
    } catch (err) {
      console.error('[BoxMaker] save design failed:', err);
      alert(`Save Design failed: ${(err as Error).message}`);
    }
  }, []);

  const handleShareLink = useCallback(async () => {
    try {
      const s = useDesign.getState();
      const file = buildDesignFile({
        designName: s.designName,
        appearance: s.appearance,
        box: s.box,
        lid: s.lid,
        snap: s.snap,
        standoffsText: s.standoffsText,
        cutoutsText: s.cutoutsText,
        textLabelsText: s.textLabelsText,
        customFont: null, // URLs can't hold custom font bytes
      });
      const hash = designToUrlHash(file);
      const url = `${window.location.origin}${window.location.pathname}#design=${hash}`;
      const hasCustomFont = !!getActiveCustomFont();
      try {
        await navigator.clipboard.writeText(url);
        alert(
          hasCustomFont
            ? `Share URL copied. Note: your custom font is NOT included (URLs can't carry font files) -- the recipient will see an "Unknown font" error on any label that uses it. Use Save Design for the full portable file.`
            : 'Share URL copied to clipboard.'
        );
      } catch {
        // Fallback: pop the URL up so the user can copy it manually.
        prompt('Copy this URL to share your design:', url);
      }
    } catch (err) {
      console.error('[BoxMaker] share link failed:', err);
      alert(`Share Link failed: ${(err as Error).message}`);
    }
  }, []);

  const handleNewDesign = useCallback(() => {
    const s = useDesign.getState();
    if (s.isDirty) {
      const ok = window.confirm(
        'You have unsaved changes. Discard them and start a new design?'
      );
      if (!ok) return;
    }
    clearCustomFonts();
    void idbClearCustomFont();
    s.newDesign();
  }, []);

  const handleLoadDesignClick = () => designLoadInputRef.current?.click();

  const handleLoadDesignFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const design = parseDesignFile(text);
      if (design.customFont) {
        try {
          const buf = base64ToBuffer(design.customFont.base64);
          const font = opentype.parse(buf);
          registerCustomFont(design.customFont.name, font, buf);
          void idbSaveCustomFont(design.customFont.name, buf);
        } catch (err) {
          console.warn('[BoxMaker] embedded custom font failed to load:', err);
          // Continue loading the rest of the design; text labels referencing
          // the custom font will surface an "Unknown font" error in geometry.
          clearCustomFonts();
          void idbClearCustomFont();
        }
      } else {
        clearCustomFonts();
        void idbClearCustomFont();
      }
      useDesign.getState().loadDesign(design);
    } catch (err) {
      const msg = err instanceof DesignFileError ? err.message : (err as Error).message;
      console.error('[BoxMaker] load design failed:', err);
      alert(`Load Design failed: ${msg}`);
    }
  };

  const handleExport3MF = async () => {
    setExporting(true);
    try {
      const { box, lid, snap, standoffs, cutouts, textLabels } = useDesign.getState();
      const baseName = designName || 'boxmaker';

      const boxManifold = await buildBox(box, lid, snap, standoffs, cutouts, textLabels);
      const lidManifold = await buildLid(box, lid, snap, standoffs, cutouts, textLabels);
      const boxSep = await buildBoxSeparateText(box, lid, textLabels);
      const lidSep = await buildLidSeparateText(box, lid, textLabels);

      // Lid -> print orientation (flipped, deboss recesses on the build plate).
      // X-offset so the lid sits beside the box on the plate instead of inside
      // it. The lid's SeparateBody text gets the SAME transform so it stays
      // co-located with the lid's recesses (multi-material slicers need them
      // overlapping to assign filaments correctly).
      const lidXOffset = box.length + 10;
      const lidOriented = lidPrintOrientation(lidManifold, lid, lidXOffset);
      const lidSepOriented = lidSep ? lidPrintOrientation(lidSep, lid, lidXOffset) : null;

      const parts: Array<{ name: string; manifold: import('manifold-3d').Manifold }> = [
        { name: `${baseName}-box`, manifold: boxManifold },
        { name: `${baseName}-lid`, manifold: lidOriented },
      ];
      if (boxSep) parts.push({ name: `${baseName}-box-text`, manifold: boxSep });
      if (lidSepOriented) parts.push({ name: `${baseName}-lid-text`, manifold: lidSepOriented });

      const buf = build3MF(parts);
      for (const p of parts) p.manifold.delete();
      downloadBinary(buf, `${baseName}.3mf`);
    } catch (err) {
      console.error('[BoxMaker] 3MF export failed:', err);
      alert('3MF export failed -- check console.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportSTL = async () => {
    setExporting(true);
    try {
      const { box, lid, snap, standoffs, cutouts, textLabels } = useDesign.getState();
      const baseName = designName || 'boxmaker';

      const boxManifold = await buildBox(box, lid, snap, standoffs, cutouts, textLabels);
      const boxSTL = manifoldToBinarySTL(boxManifold);
      boxManifold.delete();

      // Lid is flipped to print orientation (plate-top on the build plate,
      // shoulder up). No X-offset for STL since each .stl is imported as a
      // standalone file -- the slicer auto-arranges them.
      const lidManifold = await buildLid(box, lid, snap, standoffs, cutouts, textLabels);
      const lidOriented = lidPrintOrientation(lidManifold, lid);
      const lidSTL = manifoldToBinarySTL(lidOriented);
      lidOriented.delete();

      const zipEntries: Array<{ name: string; data: ArrayBuffer }> = [
        { name: `${baseName}-box.stl`, data: boxSTL },
        { name: `${baseName}-lid.stl`, data: lidSTL },
      ];

      // Separate-body text labels become their own STL bodies so a
      // multi-material slicer can assign a different filament to them.
      const boxSep = await buildBoxSeparateText(box, lid, textLabels);
      if (boxSep) {
        zipEntries.push({ name: `${baseName}-box-text.stl`, data: manifoldToBinarySTL(boxSep) });
        boxSep.delete();
      }
      const lidSep = await buildLidSeparateText(box, lid, textLabels);
      if (lidSep) {
        const lidSepOriented = lidPrintOrientation(lidSep, lid);
        zipEntries.push({ name: `${baseName}-lid-text.stl`, data: manifoldToBinarySTL(lidSepOriented) });
        lidSepOriented.delete();
      }

      const zip = buildZip(zipEntries);
      downloadBinary(zip, `${baseName}.zip`);
    } catch (err) {
      console.error('[BoxMaker] STL export failed:', err);
      alert('STL export failed — check console.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="w-80 h-full bg-[var(--bg-panel)] border-r border-[var(--border-color)] flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)] flex-1">
            BoxMaker
          </h1>
          <button
            onClick={undo}
            disabled={!canUndo}
            className="text-lg leading-none px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-25 disabled:cursor-default"
            title="Undo (Cmd-Z / Ctrl-Z)"
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="text-lg leading-none px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-25 disabled:cursor-default"
            title="Redo (Cmd-Shift-Z / Ctrl-Y)"
          >
            ↷
          </button>
          <button
            onClick={handleToggleAll}
            className="text-xs leading-none px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-secondary)]"
            title="Expand/collapse all sections"
          >
            &#x2195;
          </button>
          <button
            onClick={onToggleHelp}
            className={`text-sm font-bold leading-none w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
              helpOpen
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
            }`}
            title="Toggle help panel"
          >
            ?
          </button>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          Parametric 3D Enclosure Designer — v{APP_VERSION}
        </p>
        {editingName ? (
          <input
            ref={nameInputRef}
            type="text"
            defaultValue={designName || ''}
            placeholder="Untitled"
            className="text-xs text-[var(--text-primary)] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-1 py-0.5 w-full outline-none focus:border-[var(--accent)]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = e.currentTarget.value.trim();
                setDesignName(val || null);
                setEditingName(false);
              } else if (e.key === 'Escape') {
                setEditingName(false);
              }
            }}
            onBlur={(e) => {
              const val = e.currentTarget.value.trim();
              setDesignName(val || null);
              setEditingName(false);
            }}
          />
        ) : (
          <p
            className="text-xs text-[var(--text-secondary)] truncate cursor-pointer hover:text-[var(--text-primary)] transition-colors"
            title="Click to rename design"
            onClick={() => {
              setEditingName(true);
              requestAnimationFrame(() => {
                nameInputRef.current?.focus();
                nameInputRef.current?.select();
              });
            }}
          >
            {isDirty && <span className="text-[var(--accent)]">* </span>}
            {designName || 'Untitled'}
          </p>
        )}
      </div>

      {/* Scrollable body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto sidebar-scroll">
        {/* Toolbar */}
        <div className="px-3 py-2 border-b border-[var(--border-color)] flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={handleNewDesign}
              className="flex-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors"
              style={{ color: UI_MUTED }}
              title="Reset all parameters to defaults (asks first if there are unsaved changes)"
            >
              New
            </button>
            <button
              onClick={handleLoadDesignClick}
              className="flex-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors"
              style={{ color: UI_MUTED }}
              title="Load a .boxmaker.json design file"
            >
              Load
            </button>
            <button
              onClick={handleSaveDesign}
              className="flex-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors"
              style={{ color: UI_MUTED }}
              title="Download current design as JSON (custom font, if loaded, is embedded)"
            >
              Save
            </button>
            <input
              ref={designLoadInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleLoadDesignFile}
              className="hidden"
            />
          </div>
          <button
            onClick={handleShareLink}
            className="w-full px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors"
            style={{ color: UI_MUTED }}
            title="Copy a share-link to the clipboard (state encoded in the URL; custom fonts not included)"
          >
            Share Link
          </button>

          <div className="border-t-[3px] border-[#555] pt-2 flex gap-2">
            <button
              onClick={handleExportSTL}
              disabled={exporting}
              className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors disabled:opacity-50"
              style={{ color: UI_MUTED }}
              title="Export box + lid + separate text bodies as STL files in a zip"
            >
              {exporting ? 'Exporting...' : 'Export STL'}
            </button>
            <button
              onClick={handleExport3MF}
              disabled={exporting}
              className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors disabled:opacity-50"
              style={{ color: UI_MUTED }}
              title="Export box + lid + separate text bodies as a single 3MF file (each as its own object for multi-material slicing)"
            >
              {exporting ? 'Exporting...' : 'Export 3MF'}
            </button>
          </div>
        </div>

        {/* Parameter groups — placeholders for now */}
        <div className="px-3 pb-6">
          <GroupHeader label="Box & Lid" color={GROUP_COLORS.box} />
          <BoxControls />
          <LidControls />
          <SnapFitControls />

          <GroupHeader label="Standoffs" color={GROUP_COLORS.standoffs} />
          <StandoffsControls />

          <GroupHeader label="Cutouts" color={GROUP_COLORS.cutouts} />
          <CutoutsControls />

          <GroupHeader label="Text Labels" color={GROUP_COLORS.text} />
          <TextLabelsControls />

          <GroupHeader label="Settings" color={GROUP_COLORS.settings} />
          <SettingsControls />
        </div>
      </div>
    </div>
  );
}
