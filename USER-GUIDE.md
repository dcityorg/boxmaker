# BoxMaker -- User Guide

End-user reference for the BoxMaker web app. Aimed at someone who already knows
3D printing and wants to design an enclosure, not at someone learning CAD.

This doc also serves as the source material for the in-app Help panel
(Increment 8).

---

## Quick start

1. Open the app. You get a default 100 x 70 x 40 mm box with snap-fit lid.
2. Tweak the sliders in the sidebar (Box, Lid, Snap-Fit Clips).
3. Add interior features by typing into the three textareas:
   - **Standoffs** -- PCB-mount cylinders.
   - **Cutouts** -- holes through walls, floor, or lid.
   - **Text Labels** -- embossed / debossed text on any surface.
4. Click **Export STL** (zip with separate body STLs) or **Export 3MF**
   (single file, multi-material-ready).
5. **Save Design** to keep a portable JSON copy. Drop it back via **Load
   Design** any time.

---

## Sidebar toolbar

| Button | What it does |
|---|---|
| **New** | Reset every parameter to factory defaults. Prompts before discarding unsaved changes. Also clears any uploaded custom font. |
| **Load** | Load a `.boxmaker.json` design file. Embedded custom font (if present) is automatically registered. |
| **Save** | Download the current design as `<name>.boxmaker.json`. Custom font (if loaded) is embedded as base64 -- the file is self-contained and portable. |
| **Share Link** | Copy a URL with the entire design encoded in the hash. The recipient opens the URL and sees your design. **Custom fonts are NOT included** -- use Save Design for full portability. |
| **Export STL** | Zip containing `<name>-box.stl`, `<name>-lid.stl`, plus `-box-text.stl` and `-lid-text.stl` for any SeparateBody text labels. |
| **Export 3MF** | Single `.3mf` file with every part as its own object. Open in Bambu Studio / PrusaSlicer / OrcaSlicer and assign different filaments per object. |
| ↶ / ↷ | Undo / Redo. Also bound to `Cmd-Z` / `Cmd-Shift-Z` (Ctrl on Windows). 100 steps of history. |

The asterisk (`*`) next to the design name shows there are unsaved changes.

---

## Persistence behavior

- **Auto-save**: every edit is debounce-written to `localStorage` (500 ms after
  you stop typing). A page reload picks back up where you left off.
- **URL hash takes precedence**: if you open a Share Link, that design loads
  instead of the localStorage copy. The hash is cleared after load so further
  edits don't appear to be "still shared".
- **Custom fonts are session-only** unless saved into the JSON via **Save
  Design**. localStorage and Share Link both omit them.

---

## Standoffs textarea

Format -- one standoff per line, comma-delimited:

```
Surface,X,Y,OD,Height,HoleDia,HoleDepth,BaseFillet
```

| Field | Notes |
|---|---|
| `Surface` | `floor` or `lid` |
| `X`, `Y` | Center position on the surface (see coordinate frames below) |
| `OD` | Outer diameter (mm) |
| `Height` | Standoff height above the surface (mm) |
| `HoleDia` | Concentric hole diameter (mm; 0 = no hole) |
| `HoleDepth` | Hole depth from the standoff's free end. If > Height, the hole continues into the host material. |
| `BaseFillet` | Fillet radius at the standoff base (mm; 0 = sharp corner) |

Comment lines start with `//`. Example:

```
// PCB mounts
floor,10,10,6,8,2.6,7,1
floor,86,10,6,8,2.6,7,1
floor,10,56,6,8,2.6,7,1
floor,86,56,6,8,2.6,7,1
```

---

## Cutouts textarea

Two formats. Round = 5 fields, Rect = 7 fields. Type field determines which:

```
Round: Surface,Round,X,Y,Diameter
Rect:  Surface,Rect,X,Y,HoleX,HoleY,CornerRadius
```

| Field | Notes |
|---|---|
| `Surface` | `front`, `back`, `left`, `right`, `floor`, or `lid` |
| `X`, `Y` | Center of cutout |
| `Diameter` | Round cutout's diameter (mm) |
| `HoleX`, `HoleY` | Rectangle's width and height (mm) |
| `CornerRadius` | Rectangle's corner fillet (mm; 0 = sharp) |

Example -- one cutout per surface:

```
// USB-C cutout on the back wall
back,Rect,40,15,20,8,1
// Round power button on the front
front,Round,48,20,10
// Display window on the lid
lid,Rect,44,28,40,20,2
// Vent hole through the floor
floor,Round,48,33,15
// Reset button on the left wall
left,Round,30,15,4
// Speaker grille (right wall, rounded rect)
right,Rect,33,15,20,10,1
```

---

## Text Labels textarea

11 fields, plus the Text field which can contain commas:

```
Surface,Type,X,Y,Depth,Height,Direction,Font,Bold,SeparateBody,Text
```

| Field | Notes |
|---|---|
| `Surface` | `front`, `back`, `left`, `right`, `floor`, `lid` |
| `Type` | `emboss` (raised) or `deboss` (recessed) |
| `X`, `Y` | Center of the text bounding box |
| `Depth` | Protrusion / recess depth (mm; 0.4-0.8 typical) |
| `Height` | Glyph cap-height (mm; 4-8 typical) |
| `Direction` | Names the box edge/face the **top of the glyphs** points toward |
| `Font` | Family name -- see "Fonts" below |
| `Bold` | `yes` or `no` |
| `SeparateBody` | `yes` keeps the text geometry as its own body (multi-material printing) |
| `Text` | The actual text. Commas inside the text are preserved verbatim. |

### Direction values per surface

Direction names a box edge or face the **top of the text** points at. Two of
the six directions are parallel to each surface (don't make geometric sense)
and are rejected at parse time:

| Surface | Valid directions |
|---|---|
| `lid`, `floor` | `front`, `back`, `left`, `right` |
| `front`, `back` | `lid`, `floor`, `left`, `right` |
| `left`, `right` | `lid`, `floor`, `front`, `back` |

The "normally readable" defaults:
- **Walls**: `direction=lid` -- text reads upright with its top toward the lid.
- **Lid**: `direction=back` -- text reads correctly for someone facing the
  box's front (top of letters toward the back of the box).
- **Floor**: `direction=back` -- floor is auto-mirrored at render time so
  the text reads correctly when the box is flipped upside-down.

### Example covering every surface

```
// Walls -- upright text
front,emboss,48,25,0.5,5,lid,Atkinson Hyperlegible,no,no,POWER
back,deboss,40,20,0.4,4,lid,Open Sans,no,no,SN-001
left,deboss,30,25,0.4,4,lid,JetBrains Mono,no,no,USB
right,emboss,30,20,0.4,4,lid,Atkinson Hyperlegible,no,no,DATA

// Lid -- reads from front
lid,deboss,44,28,0.6,5,back,Open Sans,no,no,Hello

// Lid -- separate body for multi-color (yellow in viewport)
lid,emboss,44,15,0.6,4,back,JetBrains Mono,no,yes,v1.0

// Floor -- maker's mark
floor,deboss,48,33,0.4,4,back,Open Sans,no,no,Made by Gary
```

---

## Coordinate frames

The same `(X, Y)` numbers mean different things on each surface -- they match
the user's natural perspective for that face. **All coordinates are
millimeters, with 0,0 at the corner described and (X, Y) measuring how far
the feature's center is from that 0,0.**

### Lid

0,0 at the **back-left inner corner of the shoulder pocket** -- the
"bottom-left" when you lie inside the box, head against the back wall,
looking up at the lid.

- `+X` grows toward the right of the box (world +X)
- `+Y` grows toward the front of the box (opposite of the floor's +Y)
- Ignores the inner corner radius -- 0,0 references the square corner.

### Floor

0,0 at the **interior back-right corner** -- the "lower-left" when looking
down at the box from above (matches Fusion BoxMaker's convention).

- `+X` grows toward the left of the box
- `+Y` grows toward the front of the box

### Walls (front, back, left, right)

0,0 at the **interior bottom-left when viewed from outside the box**, looking
at that wall.

- `+X` grows to the viewer's right
- `+Y` grows upward (world +Z)

That's standard CAD-sketch convention on each face. The Direction field
controls rotation within this 2D frame.

---

## Fonts

Three are bundled (live in `public/fonts/`):

| Font | License | Bold support |
|---|---|---|
| **Atkinson Hyperlegible** | SIL OFL | Yes (separate Bold TTF) |
| **JetBrains Mono** | SIL OFL | Yes (variable font, `wght` axis) |
| **Open Sans** | Apache 2.0 | Yes (variable font, `wght`/`wdth` axes) |

### Custom font upload

Click **+ Load custom font** in the Text Labels section. Pick a `.ttf` or
`.otf` from your machine. The file is parsed in-browser by `opentype.js` and
the font's family name becomes the value you can put in the Font column.

- **One slot per session.** Uploading a new font replaces the previous custom font.
- **Embedded in `Save Design`** as base64. A friend can open your `.boxmaker.json` and the font loads automatically -- they don't need to have the file.
- **NOT included in Share Link** URLs (file size). The recipient sees an
  "Unknown font" error on any label that references it.
- **Variable fonts**: only single-axis (`wght`) or two-axis without `opsz`
  reliably render. The opentype.js `opsz` handling is broken -- see
  TROUBLESHOOTING.md. Static fonts are always safe.
- **Bold and custom fonts**: only works automatically for variable fonts with
  a `wght` axis (most modern open-source fonts: Inter, Roboto Flex, Source
  Sans 3, etc.). For a static-only custom font (regular-weight TTF), `Bold:
  yes` is silently ignored. Workaround: upload the bold-weight TTF instead
  and reference its family name in the Font column (e.g., "Atkinson
  Hyperlegible Bold" rather than "Atkinson Hyperlegible"). There's only one
  custom-font slot, so you can't have both regular and bold of the same
  custom family active at the same time.
- **`.ttc` font collections are not supported** -- they need to be split into
  individual `.ttf` files first.

---

## Comments in textareas

Lines that start with `//` (after any leading whitespace) are ignored. Blank
lines are also ignored. Use them freely:

```
// PCB mounts -- M3 self-tap
floor,10,10,6,8,2.6,7,1
floor,86,10,6,8,2.6,7,1

// Sensor cutouts -- next revision
// back,Rect,40,15,32,8,0
```

---

## Exports compared

| | STL (zip) | 3MF |
|---|---|---|
| Box body | one STL | one object in the file |
| Lid body | one STL | one object |
| SeparateBody text on box | one STL named `<name>-box-text.stl` | one object |
| SeparateBody text on lid | one STL named `<name>-lid-text.stl` | one object |
| Per-object filament assignment in slicer | manual (import multiple STLs together) | automatic (slicer sees objects) |
| Best for | single-color prints | multi-color / multi-material prints |

For Bambu Studio's "Add object" + per-object filament assignment, 3MF is the
shortest path. STL still works -- just import the bodies as separate
objects.

---

## Snap-fit clip geometry

Snap-fit nubs use an isoceles right triangle cross-section: **apex angle 90
deg**, apex stick-out = `nubHeight / 2`. This matches the print-tested
geometry from Gary's reference Fusion design.

Tunable parameters (Snap-Fit Clips section):
- **Per-side toggles**: Front, Back, Left, Right -- skip sides where the
  snap would interfere with other features.
- **Nub height**: wall-side length of the cross-section (apex depth is
  half of this).
- **Lid lead-in**: 45-degree chamfer on the lower-outer edge of the lid
  cutout. Eases the nub past first contact. 1.0 mm is the print-tested
  sweet spot.
- **Width %**: nub width as a percent of interior wall length.
- **Min / Max width**: clamps on the percentage.
- **Box shrink**: how much narrower the box nub is than the lid cavity (for
  easier alignment during insertion).

---

## Common questions

**Why textareas instead of clickable form rows?** Textareas are denser (you
can see your entire feature list at a glance), faster to bulk-edit (paste
20 standoffs from a spreadsheet), and trivially copy-paste-shareable. The
project initially planned a list-of-cards UI; Gary switched it after seeing
the textarea version. The Fusion BoxMaker uses the same pattern.

**Can I bulk-edit by pasting from a spreadsheet?** Yes -- CSV from Excel /
Numbers pastes correctly. Use comma delimiters, no quotes around values.

**Why are some characters rendering oddly in the textareas?** Different
fonts handle some Unicode characters differently. For best results stick to
ASCII in the textareas themselves; the geometry pipeline only interprets the
field separators (`,`) and comment marker (`//`).

**Why does my floor text look mirrored when I look at the box from above?**
By design. The floor text is auto-flipped so it reads correctly when the
box is physically turned over to look at its underside. From above (looking
into the box), the floor text appears mirrored -- that's the correct
behavior.

**Why is my "POWER" label upside-down on the front wall?** Check the
`Direction` field. `Direction=floor` makes text top point toward the floor
edge (downward). For upright text on a wall, use `Direction=lid`.

**How do I share a design with someone?**
- **Same machine, same browser**: just keep working -- localStorage auto-saves.
- **Different person, simple design**: Share Link button. They paste the URL.
- **Different person, design uses custom font OR very complex**: Save Design,
  send them the JSON. They use Load Design.

**Can I see what my design will look like with another color box?** The
sidebar's Settings group has Box Color and Lid Color pickers. Both affect
the viewport only -- they don't change the exported geometry.

**Is the home view configurable?** Not currently. The Home button (top-right
of viewport) snaps back to a fixed 3/4 isometric view that auto-frames the
current box dimensions. ViewCube / numpad-shortcut alternatives are listed
in the project brief as post-v1 polish.
