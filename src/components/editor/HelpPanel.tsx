'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

const MIN_WIDTH = 240;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 320;

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'tip'; text: string }
  | { type: 'code'; text: string }
  | { type: 'table'; headers?: string[]; rows: string[][] };

interface HelpSection {
  id: string;
  title: string;
  blocks: Block[];
}

const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'quick-start',
    title: 'Quick Start',
    blocks: [
      {
        type: 'paragraph',
        text:
          'BoxMaker is a parametric 3D-printable enclosure generator. Adjust sliders or type values in the sidebar and the 3D preview updates instantly. When you are happy, export an STL zip or a single 3MF for multi-material printing.',
      },
      { type: 'heading', text: 'Basic workflow' },
      {
        type: 'list',
        items: [
          'Set Length, Width, Height in the Box & Lid group (toggle interior vs exterior with the Showing radio)',
          'Adjust wall / floor thickness and corner radii',
          'Tune the lid plate and shoulder (the part that fits inside the box)',
          'Toggle snap-fit clips per side -- skip walls where another feature would interfere',
          'Add standoffs, cutouts, and text labels via the three comma-delimited textareas',
          'Click `Export STL` (zip) or `Export 3MF` (single multi-material file)',
        ],
      },
      {
        type: 'tip',
        text:
          'Use the View radio in Settings to switch between `box`, `lid`, and `assembled` views to check fit before exporting.',
      },
    ],
  },
  {
    id: 'sidebar-shortcuts',
    title: 'Sidebar & Shortcuts',
    blocks: [
      { type: 'heading', text: 'Toolbar buttons' },
      {
        type: 'table',
        headers: ['Button', 'Effect'],
        rows: [
          ['`New`', 'Reset every parameter to factory defaults; prompts before discarding unsaved changes; clears any uploaded custom font.'],
          ['`Load`', 'Open a `.boxmaker.json` file (custom font embedded inside is auto-registered).'],
          ['`Save`', 'Download the current design as `<name>.boxmaker.json` -- custom font, if loaded, is embedded as base64 so the file is self-contained.'],
          ['`Share Link`', 'Copy a URL with the entire design encoded in the hash. Custom fonts are NOT included (size limit).'],
          ['`Export STL`', 'Zip containing the box, lid, and any separate-body text bodies.'],
          ['`Export 3MF`', 'Single 3MF with each part as its own object, ready for per-object filament assignment.'],
          ['Undo / Redo (`Cmd-Z` / `Cmd-Shift-Z`)', '100 steps of history.'],
        ],
      },
      { type: 'heading', text: 'Viewport navigation' },
      {
        type: 'list',
        items: [
          'Left drag -- rotate around the box',
          'Right drag -- pan the view',
          'Scroll wheel -- zoom in / out',
          'Home button (top-right) -- re-frame the current box size in a 3/4 isometric view',
        ],
      },
      { type: 'heading', text: 'Keyboard shortcuts' },
      {
        type: 'table',
        headers: ['Key', 'Action'],
        rows: [
          ['`1` / `Ctrl+1`', 'Front / Back view'],
          ['`3` / `Ctrl+3`', 'Right / Left view'],
          ['`7` / `Ctrl+7`', 'Top / Bottom view'],
          ['`.`', 'Frame the box (same as Home button)'],
          ['`Cmd+Z` / `Ctrl+Z`', 'Undo'],
          ['`Cmd+Shift+Z`', 'Redo'],
        ],
      },
      {
        type: 'paragraph',
        text:
          'Viewport shortcuts are ignored when an input or textarea has focus, so the `1` / `3` / `7` characters still work normally in the standoff / cutout / text label textareas.',
      },
      { type: 'heading', text: 'Dimension fields' },
      {
        type: 'list',
        items: [
          'Type a value and press Enter',
          'Arrow up / down -- step by the field\'s step (typically 0.1 mm)',
          'Shift + arrow -- step by 10 x the field\'s step',
          'Drag the slider for coarse exploration',
        ],
      },
    ],
  },
  {
    id: 'box-lid',
    title: 'Box & Lid',
    blocks: [
      { type: 'heading', text: 'Dimensions: interior vs exterior' },
      {
        type: 'paragraph',
        text:
          'The Showing radio toggles which set of numbers the Length / Width / Height fields display. Internally BoxMaker always stores exterior dimensions; switching to `interior` mode converts your edits back when writing. The other set is shown beneath the fields so you can see both at a glance.',
      },
      { type: 'heading', text: 'Walls & floor' },
      {
        type: 'paragraph',
        text:
          'Wall thickness applies to all four side walls; floor thickness to the bottom. Defaults are 2 mm each -- enough strength for typical PETG / PLA at 0.4 mm nozzle without burning extra filament.',
      },
      { type: 'heading', text: 'Corner radii' },
      {
        type: 'paragraph',
        text:
          'Outer rounds the four vertical exterior edges of the box. Inner rounds the cavity\'s four interior edges (also used by the lid shoulder so the lid matches the cavity). The two are independent; outer = 2 mm and inner = 2 mm is a good starting point.',
      },
      { type: 'heading', text: 'Lid plate' },
      {
        type: 'paragraph',
        text:
          '`Edge thick` controls the rim around the lid; `Center thick` is independent so you can pocket the middle for weight or cost without thinning the rim. The pocket cuts upward from the underside; if `Center thick` equals `Edge thick` the pocket disappears.',
      },
      { type: 'heading', text: 'Lid shoulder' },
      {
        type: 'paragraph',
        text:
          'The shoulder is the block that fits inside the box opening with `Box gap` clearance. `Wall` is the shoulder\'s wall thickness; `Depth` is how far it hangs below the lid plate (and also the snap-fit engagement depth).',
      },
      {
        type: 'tip',
        text:
          'Default `Box gap` of 0.2 mm is a tight slip-fit on a well-tuned printer. Increase to 0.3-0.4 mm if your printer\'s tolerances are loose, or the lid feels stuck.',
      },
    ],
  },
  {
    id: 'snap-fit',
    title: 'Snap-Fit Clips',
    blocks: [
      {
        type: 'paragraph',
        text:
          'Triangular nubs on the box interior engage matching cavities cut into the lid shoulder. The cross-section is a right-isoceles triangle (apex angle 90 degrees); apex depth equals `nubHeight / 2`. This is the print-tested geometry from the Fusion BoxMaker -- it clicks satisfyingly and survives many engagement cycles.',
      },
      { type: 'heading', text: 'Per-side toggles' },
      {
        type: 'paragraph',
        text:
          'Each of Front / Back / Left / Right has its own toggle. Skip any side where a cutout or standoff would interfere. Two snaps on opposite walls is usually enough; four is the strongest grip.',
      },
      { type: 'heading', text: 'Tuning parameters' },
      {
        type: 'table',
        headers: ['Parameter', 'Effect'],
        rows: [
          ['`Nub height`', 'Wall-side length of the triangle. Apex depth = half of this. Default 3 mm. Don\'t exceed `Shoulder wall` thickness or the cavity will visibly break through.'],
          ['`Lid lead-in`', '45-degree chamfer on the lower-outer edge of the lid cutout -- eases the nub past first contact. 1.0 mm default works for typical PETG/PLA.'],
          ['`Width %`', 'Nub width as a percent of interior wall length (default 20%).'],
          ['`Min width` / `Max width`', 'Clamps on the percentage so very small / very long boxes still get sensible nubs.'],
          ['`Box shrink`', 'How much narrower the box nub is than the lid cavity (default 2 mm), for easier alignment during insertion.'],
        ],
      },
      {
        type: 'tip',
        text:
          'Lid pops off too easily -> increase `Lid lead-in` (try 1.2 or 1.5). Lid won\'t close -> decrease `Lid lead-in` (try 0.6 or 0.8). For prints with significant elephant-foot, also bump `Box gap` up by 0.1 mm.',
      },
    ],
  },
  {
    id: 'standoffs',
    title: 'Standoffs',
    blocks: [
      {
        type: 'paragraph',
        text:
          'PCB-mount cylinders rising from the floor (or hanging from the lid). Optional concentric screw hole and base fillet. One standoff per line, comma-delimited; `//` starts a comment.',
      },
      { type: 'heading', text: 'Format' },
      { type: 'code', text: 'Surface,X,Y,OD,Height,HoleDia,HoleDepth,BaseFillet' },
      { type: 'heading', text: 'Fields' },
      {
        type: 'table',
        headers: ['Field', 'Meaning'],
        rows: [
          ['`Surface`', '`floor` or `lid`'],
          ['`X`, `Y`', 'Center position on the surface (see Coordinate Frames)'],
          ['`OD`', 'Outer diameter (mm)'],
          ['`Height`', 'Standoff height above the surface (mm)'],
          ['`HoleDia`', 'Concentric hole diameter (0 = no hole)'],
          ['`HoleDepth`', 'Hole depth measured from the standoff\'s free end. If `HoleDepth > Height`, the hole continues into the host material.'],
          ['`BaseFillet`', 'Fillet radius at the standoff base (0 = sharp corner)'],
        ],
      },
      { type: 'heading', text: 'Example' },
      {
        type: 'code',
        text:
`// PCB mounts -- M3 self-tap
floor,10,10,6,8,2.6,7,1
floor,86,10,6,8,2.6,7,1
floor,10,56,6,8,2.6,7,1
floor,86,56,6,8,2.6,7,1`,
      },
    ],
  },
  {
    id: 'cutouts',
    title: 'Cutouts',
    blocks: [
      {
        type: 'paragraph',
        text:
          'Holes through any wall, the floor, or the lid. Round (5 fields) or rectangular with optional corner fillet (7 fields). The second field (`Round` or `Rect`) tells the parser which format to expect.',
      },
      { type: 'heading', text: 'Formats' },
      {
        type: 'code',
        text:
`Round: Surface,Round,X,Y,Diameter
Rect:  Surface,Rect,X,Y,HoleX,HoleY,CornerRadius`,
      },
      { type: 'heading', text: 'Fields' },
      {
        type: 'table',
        headers: ['Field', 'Meaning'],
        rows: [
          ['`Surface`', '`front`, `back`, `left`, `right`, `floor`, `lid`'],
          ['`X`, `Y`', 'Center of the cutout (see Coordinate Frames)'],
          ['`Diameter`', 'Round cutout\'s diameter (mm)'],
          ['`HoleX`, `HoleY`', 'Rectangle width and height (mm)'],
          ['`CornerRadius`', 'Rectangle corner fillet (0 = sharp corner)'],
        ],
      },
      { type: 'heading', text: 'Example' },
      {
        type: 'code',
        text:
`// USB-C cutout on the back wall
back,Rect,40,15,20,8,1
// Round power button on the front
front,Round,48,20,10
// Display window on the lid
lid,Rect,44,28,40,20,2
// Reset button on the left wall
left,Round,30,15,4`,
      },
    ],
  },
  {
    id: 'text-labels',
    title: 'Text Labels',
    blocks: [
      {
        type: 'paragraph',
        text:
          'Embossed (raised) or debossed (recessed) text on any surface. 11 comma-separated fields per line; commas inside the `Text` field are preserved verbatim. `//` starts a comment line.',
      },
      { type: 'heading', text: 'Format' },
      { type: 'code', text: 'Surface,Type,X,Y,Depth,Height,Direction,Font,Bold,SeparateBody,Text' },
      { type: 'heading', text: 'Fields' },
      {
        type: 'table',
        headers: ['Field', 'Meaning'],
        rows: [
          ['`Surface`', '`front`, `back`, `left`, `right`, `floor`, `lid`'],
          ['`Type`', '`emboss` (raised) or `deboss` (recessed)'],
          ['`X`, `Y`', 'Center of the text bounding box'],
          ['`Depth`', 'Protrusion / recess depth (0.4-0.8 mm typical)'],
          ['`Height`', 'Glyph cap-height (4-8 mm typical)'],
          ['`Direction`', 'Names the box edge the TOP of the glyphs points toward (see below)'],
          ['`Font`', 'Family name -- see Fonts section'],
          ['`Bold`', '`yes` or `no`'],
          ['`SeparateBody`', '`yes` keeps the text geometry as its own body (for multi-material printing)'],
          ['`Text`', 'The actual text string'],
        ],
      },
      { type: 'heading', text: 'Direction values per surface' },
      {
        type: 'paragraph',
        text:
          'Two of the six directions are parallel to each surface\'s normal and rejected at parse time. The remaining four are valid.',
      },
      {
        type: 'table',
        headers: ['Surface', 'Valid directions'],
        rows: [
          ['`lid`, `floor`', '`front`, `back`, `left`, `right`'],
          ['`front`, `back`', '`lid`, `floor`, `left`, `right`'],
          ['`left`, `right`', '`lid`, `floor`, `front`, `back`'],
        ],
      },
      { type: 'heading', text: '"Reads upright" defaults' },
      {
        type: 'list',
        items: [
          'Walls: `direction=lid` -- text top points toward the lid (= up when assembled).',
          'Lid: `direction=back` -- text reads correctly for someone facing the box\'s front.',
          'Floor: `direction=back` -- text is auto-mirrored at render time so it reads correctly when the box is flipped upside-down.',
        ],
      },
      { type: 'heading', text: 'Bold' },
      {
        type: 'paragraph',
        text:
          'Variable fonts with a `wght` axis (JetBrains Mono, Open Sans) honor `Bold: yes` at render time. Atkinson Hyperlegible ships a paired Bold TTF and switches automatically. Other static fonts silently ignore Bold; see the Fonts section for the workaround.',
      },
      { type: 'heading', text: 'SeparateBody' },
      {
        type: 'paragraph',
        text:
          'When `yes`, the text geometry is emitted as its own body in STL / 3MF exports -- ready for multi-material filament assignment. For deboss, the host body gets the matching recess cut so the separate body fits flush.',
      },
      { type: 'heading', text: 'Example' },
      {
        type: 'code',
        text:
`// Walls -- upright text
front,emboss,48,25,0.5,5,lid,Atkinson Hyperlegible,no,no,POWER
back,deboss,40,20,0.4,4,lid,Open Sans,no,no,SN-001

// Lid -- separate body for multi-color
lid,emboss,44,15,0.6,4,back,JetBrains Mono,no,yes,v1.0

// Floor -- maker's mark (auto-mirrored)
floor,deboss,48,33,0.4,4,back,Open Sans,no,no,Made by Gary`,
      },
    ],
  },
  {
    id: 'coordinate-frames',
    title: 'Coordinate Frames',
    blocks: [
      {
        type: 'paragraph',
        text:
          'Each surface has its own 2D frame. (X, Y) measures how far the feature\'s center is from that surface\'s origin, in mm. The origin for each surface is chosen to match the user\'s natural perspective for that face.',
      },
      { type: 'heading', text: 'Lid' },
      {
        type: 'paragraph',
        text:
          '`(0, 0)` at the back-left inner corner of the shoulder pocket -- the "bottom-left" when you lie inside the box, head against the back wall, looking up at the lid. `+X` grows toward the right of the box (world `+X`); `+Y` grows toward the front of the box. The inner corner radius is ignored -- `(0, 0)` references the square corner.',
      },
      { type: 'heading', text: 'Floor' },
      {
        type: 'paragraph',
        text:
          '`(0, 0)` at the interior back-right corner -- the "lower-left" when looking down at the box from above. Matches Fusion BoxMaker. `+X` grows toward the left of the box; `+Y` grows toward the front.',
      },
      { type: 'heading', text: 'Walls (front, back, left, right)' },
      {
        type: 'paragraph',
        text:
          '`(0, 0)` at the interior bottom-left when viewed from OUTSIDE the box, looking at that wall. `+X` grows to the viewer\'s right; `+Y` grows upward (world `+Z`). Standard CAD-sketch convention on each face.',
      },
      {
        type: 'tip',
        text:
          'Toggle Show Rulers in Settings to see tick-marked world X / Y / Z axes overlaid on the viewport. Useful when you\'re lining up a feature against another and want to see absolute world coordinates.',
      },
    ],
  },
  {
    id: 'fonts',
    title: 'Fonts',
    blocks: [
      { type: 'heading', text: 'Bundled fonts' },
      {
        type: 'table',
        headers: ['Font', 'License', 'Bold support'],
        rows: [
          ['Atkinson Hyperlegible', 'SIL OFL', 'Yes (separate Bold TTF)'],
          ['JetBrains Mono', 'SIL OFL', 'Yes (variable, `wght` axis)'],
          ['Open Sans', 'Apache 2.0', 'Yes (variable, `wght`+`wdth`)'],
        ],
      },
      { type: 'heading', text: 'Custom font upload' },
      {
        type: 'paragraph',
        text:
          'Click `+ Load custom font` in the Text Labels section. Pick a `.ttf` or `.otf` from your machine. The font is parsed in-browser by `opentype.js` and its family name becomes the value you put in the `Font` column.',
      },
      {
        type: 'list',
        items: [
          'One slot per session -- uploading a new font replaces the previous custom font',
          'Embedded in `Save Design` as base64 -- a friend can open your `.boxmaker.json` and the font loads automatically',
          '`Share Link` URLs do NOT include the custom font (size limit). The recipient sees "Unknown font" on any label that references it.',
          '`.ttc` font collections are not supported -- split into individual `.ttf` files first',
          'Variable fonts with an `opsz` axis silently fail to render (opentype.js bug) -- use a single-`wght` or `wght`+`wdth` variable, or a static TTF',
        ],
      },
      { type: 'heading', text: 'Bold for custom fonts' },
      {
        type: 'paragraph',
        text:
          'Only works automatically for variable fonts with a `wght` axis (most modern open-source fonts -- Inter, Roboto Flex, Source Sans 3). For a static-only custom font, `Bold: yes` is silently ignored. Workaround: upload the bold-weight TTF as the custom font and use its family name (e.g. "Foo Bold" rather than "Foo") in the Font column. Only one custom font is active at a time.',
      },
      {
        type: 'tip',
        text:
          'Print a test before committing to large embossed / debossed text. Thin font strokes (< 0.4 mm at scale) don\'t survive a 0.4 mm nozzle and look ragged or just disappear.',
      },
    ],
  },
  {
    id: 'exports',
    title: 'Exports & Sharing',
    blocks: [
      {
        type: 'table',
        headers: ['', 'STL (zip)', '3MF'],
        rows: [
          ['Box body', 'one STL', 'one object'],
          ['Lid body', 'one STL', 'one object'],
          ['SeparateBody text', '`-box-text.stl` / `-lid-text.stl`', 'distinct object'],
          ['Per-object filament', 'manual (multi-import)', 'automatic in slicer'],
          ['Best for', 'single-color prints', 'multi-color / multi-material'],
        ],
      },
      { type: 'heading', text: 'Lid is exported flipped' },
      {
        type: 'paragraph',
        text:
          'Both STL and 3MF emit the lid in print orientation: plate-top resting on the build plate, shoulder pointing up. Deboss recesses are on the build plate, so any colored `SeparateBody` text prints as the bottom layers (= the visible colored layer when you peel the print off). After printing, flip the lid to assemble onto the box. The 3MF additionally offsets the lid in +X so it sits beside the box on the build plate.',
      },
      { type: 'heading', text: 'Save Design' },
      {
        type: 'paragraph',
        text:
          'Downloads a `.boxmaker.json` with every parameter plus any uploaded custom font embedded as base64. Self-contained for sharing.',
      },
      { type: 'heading', text: 'Share Link' },
      {
        type: 'paragraph',
        text:
          'Encodes the design state in the URL hash and copies the URL to your clipboard. Works on any deploy (the hash is client-side only, never sent to the server). Custom fonts are NOT included -- use Save Design for those.',
      },
      { type: 'heading', text: 'Auto-save & URL precedence' },
      {
        type: 'paragraph',
        text:
          'Every edit debounce-writes to `localStorage` 500 ms after you stop typing -- a page reload picks back up where you left off. If you open a Share Link URL, that design loads instead of the `localStorage` copy; the hash is cleared after load.',
      },
    ],
  },
  {
    id: 'printing-tips',
    title: '3D Printing Tips',
    blocks: [
      { type: 'heading', text: 'Print orientation' },
      {
        type: 'paragraph',
        text:
          'The box is exported floor-down on the build plate, opening up -- no supports needed for the walls or interior. The lid is exported plate-top down, shoulder up -- the shoulder pocket prints into open air with the opening facing up, also no supports needed.',
      },
      { type: 'heading', text: 'Snap-fit tuning' },
      {
        type: 'list',
        items: [
          'Default `Lid lead-in` of 1.0 mm works for typical PETG/PLA on a well-tuned printer',
          'Lid won\'t close: decrease `Lid lead-in` (try 0.6 or 0.8)',
          'Lid pops off too easily: increase `Lid lead-in` (try 1.2 or 1.5)',
          'Walls too thin to engage cleanly: increase `Shoulder wall` (lid) or `Wall` (box) thickness',
          'Significant elephant-foot on the first layer: increase `Box gap` by 0.1 mm so the lid still seats',
        ],
      },
      { type: 'heading', text: 'Multi-material setup (Bambu Studio)' },
      {
        type: 'list',
        items: [
          'Export 3MF and drag it into Bambu Studio',
          'The box and lid appear in the Objects panel as separate items',
          'For a lid with `SeparateBody` text, the text body shows up as `<name>-lid-text`',
          'Assign filament 1 to the lid body and filament 2 to the text body',
          'The colored filament prints in the deboss recesses as the bottom layers; the body fills above',
        ],
      },
      {
        type: 'tip',
        text:
          'First-layer adhesion matters more for multi-material prints because the colored portion IS the first layer. Use a textured PEI plate or a glue stick if you see lifting at the corners.',
      },
    ],
  },
];

/**
 * Inline backtick spans (`like this`) render as small monospace pills. Lets
 * help authors mix code-ish identifiers into prose without escaping JSX.
 */
function renderInline(text: string): React.ReactNode[] {
  return text.split(/(`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="text-[var(--text-primary)] bg-[var(--bg-secondary)] rounded px-1 py-px text-[11px] font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function renderBlock(block: Block, index: number) {
  switch (block.type) {
    case 'paragraph':
      return (
        <p
          key={index}
          className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed"
        >
          {renderInline(block.text)}
        </p>
      );
    case 'heading':
      return (
        <h3
          key={index}
          className="text-sm font-semibold text-[var(--text-primary)] mt-4 mb-2"
        >
          {block.text}
        </h3>
      );
    case 'list':
      return (
        <ul
          key={index}
          className="text-sm text-[var(--text-secondary)] mb-3 pl-4 space-y-1"
        >
          {block.items.map((item, i) => (
            <li key={i} className="list-disc leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
    case 'tip':
      return (
        <div
          key={index}
          className="text-sm mb-3 px-3 py-2 rounded bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--text-secondary)] leading-relaxed"
        >
          <span className="font-medium text-[var(--accent)]">Tip: </span>
          {renderInline(block.text)}
        </div>
      );
    case 'code':
      return (
        <pre
          key={index}
          className="text-[11px] font-mono bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded p-2 mb-3 overflow-x-auto text-[var(--text-primary)] leading-relaxed whitespace-pre"
        >
          {block.text}
        </pre>
      );
    case 'table':
      return (
        <table key={index} className="text-xs w-full mb-3 border-collapse">
          {block.headers && (
            <thead>
              <tr>
                {block.headers.map((h, i) => (
                  <th
                    key={i}
                    className="py-1 pr-2 text-left text-[var(--text-primary)] font-medium border-b border-[var(--border-color)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="py-1 pr-2 align-top text-[var(--text-secondary)] border-b border-[var(--border-color)]/60 leading-relaxed"
                  >
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [width]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX;
      const newWidth = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidth.current + delta)
      );
      setWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div
      className="h-full bg-[var(--bg-panel)] border-l border-[var(--border-color)] flex flex-col help-panel-enter shrink-0 relative"
      style={{ width }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[var(--accent)]/30 active:bg-[var(--accent)]/50 transition-colors z-10"
        onMouseDown={handleMouseDown}
        title="Drag to resize"
      />
      <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] flex-1">
          Help
        </h2>
        <button
          onClick={onClose}
          className="text-lg leading-none px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Close help"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto sidebar-scroll px-3 py-3">
        {HELP_SECTIONS.map((section, si) => (
          <details key={section.id} open={si === 0} className="mb-4">
            <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] py-2 px-3 bg-[var(--bg-secondary)] rounded select-none hover:bg-[var(--border-color)] transition-colors">
              {section.title}
            </summary>
            <div className="pt-3 px-3 ml-2 border-l-2 border-[var(--border-color)]">
              {section.blocks.map((block, bi) => renderBlock(block, bi))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
