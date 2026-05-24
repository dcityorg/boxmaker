'use client';

import { useEffect, useRef, useState } from 'react';
import * as opentype from 'opentype.js';
import { Section } from './ui';
import { GROUP_COLORS } from '@/config/colors';
import { useDesign } from '@/store/useDesign';
import {
  BUNDLED_FONT_NAMES,
  registerCustomFont,
  clearCustomFonts,
  subscribeToCustomFont,
  getActiveCustomFont,
} from '@/geometry/text';
import { idbSaveCustomFont, idbClearCustomFont } from '@/store/fontCache';

export function TextLabelsControls() {
  const text = useDesign((s) => s.textLabelsText);
  const setText = useDesign((s) => s.setTextLabelsText);
  const labels = useDesign((s) => s.textLabels);
  const errors = useDesign((s) => s.textLabelErrors);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customFontName, setCustomFontName] = useState<string | null>(null);
  const [customFontError, setCustomFontError] = useState<string | null>(null);

  // Sync UI label with the active custom font. Picks up whatever is already
  // active on mount (e.g., restored from IndexedDB by useAutoSave) and
  // re-syncs on any subsequent register / clear.
  useEffect(() => {
    const sync = () => setCustomFontName(getActiveCustomFont()?.name ?? null);
    sync();
    return subscribeToCustomFont(sync);
  }, []);

  const onPickFont = () => fileInputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so the same file can be re-selected
    if (!file) return;
    setCustomFontError(null);
    try {
      const buf = await file.arrayBuffer();
      const font = opentype.parse(buf);
      const family =
        font.names.fontFamily?.en ||
        font.names.fullName?.en ||
        file.name.replace(/\.(ttf|otf)$/i, '');
      registerCustomFont(family, font, buf);
      // Persist to IndexedDB so the font survives reloads / tab closures.
      // Fire-and-forget -- the cache module logs and swallows any error.
      void idbSaveCustomFont(family, buf);
      setCustomFontName(family);
      // Nudge the geometry pipeline by re-applying the current text (forces
      // a parse + rebuild even though the text content is unchanged).
      setText(text);
    } catch (err) {
      console.error('[BoxMaker] font load failed:', err);
      setCustomFontError(`Could not parse font: ${(err as Error).message ?? 'unknown error'}`);
    }
  };

  const onClearCustom = () => {
    clearCustomFonts();
    void idbClearCustomFont();
    setCustomFontName(null);
    setCustomFontError(null);
    setText(text); // re-parse + rebuild so labels using the removed font show an error
  };

  return (
    <Section
      title="Text Labels"
      titleColor={GROUP_COLORS.text}
      tooltip="Embossed (raised) or debossed (recessed) text on any surface. Separate-body labels become multi-material objects in the 3MF export."
    >
      <div className="text-[10px] text-[var(--text-secondary)] italic mb-2 leading-snug">
        <div>
          Format: <code className="not-italic">
            Surface,​X,​Y,​Type,​Depth,​Height,​Direction,​Font,​Bold,​SeparateBody,​Text
          </code>
        </div>
        <div>Surface: front, back, left, right, floor, or lid</div>
        <div>X,Y = center of text (mm) from 0,0 (see help)</div>
        <div>Type: emboss (raised) or deboss (recessed)</div>
        <div>Depth: amount of emboss or deboss (mm)</div>
        <div>Height: font size (mm)</div>
        <div>Direction: front, back, left, right, lid, floor</div>
        <div>(text top points TOWARD that surface)</div>
        <div>
          Font: <code className="not-italic">{BUNDLED_FONT_NAMES.join(', ')}</code> (or your custom)
        </div>
        <div>Bold: yes or no (if the font supports it)</div>
        <div>SeparateBody: yes or no (yes if you plan to print the text in a separate color via the 3MF export)</div>
        <div>Text: anything; commas inside the text are kept</div>
        <div>
          Use <code className="not-italic">{'//'}</code> for comments
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={onPickFont}
          title="Upload a .ttf or .otf file to use in your labels. The font is parsed in-browser and its family name becomes the Font column value. Embedded in Save Design; not included in Share Link."
          className="text-[10px] py-1 px-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-secondary)] hover:bg-[var(--border-color)] hover:text-[var(--text-primary)] transition-colors"
        >
          {customFontName ? `Custom: ${customFontName}` : '+ Load custom font'}
        </button>
        {customFontName && (
          <button
            onClick={onClearCustom}
            className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            title="Remove the custom font"
          >
            clear
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".ttf,.otf"
          onChange={onFileChange}
          className="hidden"
        />
      </div>
      {customFontError && (
        <div className="text-[10px] text-red-400 mb-2">{customFontError}</div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        spellCheck={false}
        placeholder={'lid,50,35,deboss,0.6,5,front,Open Sans,no,no,Hello'}
        title="One label per line: Surface,X,Y,Type,Depth,Height,Direction,Font,Bold,SeparateBody,Text -- // for comments. Commas inside Text are preserved."
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded p-2 text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-y"
      />
      <div className="text-[10px] text-[var(--text-secondary)] mt-1">
        {labels.length} label{labels.length === 1 ? '' : 's'}
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
