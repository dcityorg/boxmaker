# Board Mounting -- design document

> Status: **proposal / under discussion.** Nothing implemented yet.
> Companion to `PROJECT-BRIEF.md`. Written 2026-09-01 against v0.9.3.

---

## 1. Why

Most BoxMaker enclosures house electronics on PC boards. Today, mounting a board means
hand-entering one standoff line per mounting hole, with coordinates measured off the box
floor rather than off the board.

`docs/examples/air-quality-monitor.boxmaker.json` is the evidence: 16 hand-entered
standoffs in four `//`-commented groups, one group per board --

```
// micro board
floor,10.1,47.6,5,8,2.6,7,2.5      (x4)
// air qual sensor
floor,86.1,50.8,5,8,2.6,7,2        (x4)
// sensor
lid,9.3,27.5,5,3.9,2.2,4.2,2.5     (x4)
// oled
lid, 10.1, 63.1, 4, 2.6, 2.2, 3.2, 2   (x4)
```

Three problems:

1. **No reuse.** Mount the same board in a second box and every number is re-derived.
2. **No relocation.** Move the board 5 mm and every standoff line is re-typed by hand.
3. **No link between a board and the holes its components need.** A display window or a
   light-sensor aperture is positioned relative to the *board*, but must be entered in
   *box* coordinates -- so the two silently drift apart.

**Goal:** define a board once in its own reusable file (outline, mounting holes, the
cutouts its components need), then place it in a box with a position, a rotation, a
component-side direction and a surface -- and have BoxMaker emit the standoffs and cutouts.

---

## 2. The central decision: boards are a compiler, not a new geometry path

A placed board **compiles to ordinary `StandoffParams[]` and `CutoutParams[]`**, which are
concatenated onto the user's hand-entered ones before geometry, validation and ghost
rendering consume them.

This works because the existing primitives are already sufficient. Standoffs are
`Surface,X,Y,OD,Height,HoleDia,HoleDepth,BaseFillet` on `floor` or `lid`; cutouts are
`Surface,Round|Rect,...` and already support the floor, the lid, **and all four walls**.

Consequences, all good:

- **No new manifold code.** `geometry/standoffs.ts` and `geometry/cutouts.ts` untouched.
- All of `validation/checks.ts` -- `standoffWarnings`, `cutoutWarnings`, bounds checks,
  the pocket-aware standoff-hits-lid check -- applies to board features for free.
- The red viewport ghosts in `viewport/WarningMarkers.tsx` work unchanged.
- **Free escape hatch:** an "Explode to raw lines" button writes the compiled lines into
  the Standoffs and Cutouts textareas and drops the board. This partly restores the
  hand-tweak ability lost by dropping the Fusion add-in's Custom Modifications.

So this is a coordinate-transform and code-generation feature, not a CAD feature. That is
much smaller than it first looks.

---

## 3. Coordinate conventions

The part that must be got right. Everything else is bookkeeping.

### 3.1 Board-local frame

Purely a property of the board. No reference to standoffs, boxes or mounting.

- Origin `(0,0)` at a corner the user picks, **viewed from the component side**.
- `+X` right, `+Y` up -- as you would read a mechanical drawing, so transcription from a
  datasheet is mechanical.
- `Z = 0` at the board's **non-component face**; `+Z` toward the component side.

### 3.2 Which way do the components face? `up` / `down`, in world Z

**Decision (2026-09-01): the placement line carries `Components, up|down`, not a
`Flip yes/no` boolean.**

A boolean forces the user to reason about mirroring, and the answer is counter-intuitive
in exactly the common case. Worked through in section 3.4: an OLED mounted under the lid
with its display facing up toward the lid window *is* the mirrored case, so a naive
`Flip = no` is wrong. Nobody should have to derive that.

`up` / `down` is world Z and matches how the case gets described out loud -- "component
side facing up." The compiler derives everything else:

**Mirror rule.** Board X mirrors when the component side faces the mounting surface:

| Mounted on | Components | Board +X vs surface user +X |
|---|---|---|
| floor | up   | same |
| floor | down | **mirrored** |
| lid   | up   | **mirrored** |
| lid   | down | same |

Board +Y always maps to surface user +Y.

**Cutout side resolution, in one line:** a `top` board feature cuts whatever surface is
above it; a `bottom` feature cuts whatever is below. When components face `up`, board top
is world up. That is the whole rule -- it does not depend on which surface the board is
mounted to.

- OLED on the lid, display is a `top` feature, components `up` -> cuts the **lid**.
- Floor board, light sensor is a `bottom` feature, components `up` -> cuts the **floor**.
- Floor board, status LED is a `top` feature, components `up` -> cuts the **lid**.

### 3.3 Placement transform

Board point `(bx, by)` maps to surface user coordinates in this order:

1. **Mirror** `bx -> -bx` if the table in 3.2 says so.
2. **Rotate** by `rot` degrees CCW about the board origin.
3. **Translate** by the placement `(X, Y)`.

The result lands in the target surface's existing user frame, so it is passed straight to
`floorAnchorXY` / `lidAnchorXY` in `geometry/standoffs.ts:68-97`. No new world-space math
is written, and the lid's mirrored `+X` is already handled there. See section 9.

**Rotation is restricted to multiples of 90.** Decided 2026-09-01: boards mount square to
the box in practice, and the restriction pays for itself three times over.

- **Rectangular cutouts become possible at all.** `CutoutParams` rects are axis-aligned in
  the surface frame with no rotation of their own (`cutoutCrossSection`, `cutouts.ts:19-42`),
  so an arbitrarily-angled board could not express one. A quarter turn just swaps the two
  dimensions.
- **Connector cutouts become possible at all** (section 4.3). A board edge only faces a
  wall squarely at a quarter turn.
- **The transform becomes exact.** No trigonometry: `(x, y) -> (-y, x)` per turn is integer
  arithmetic on the coordinates, so a turned board lands on precise numbers instead of ones
  carrying 1e-16 of float noise. Rotation 0 and 360 now agree bit for bit.

A non-orthogonal rotation is rejected by the placement parser, and again by the compiler,
which emits nothing for that board rather than emitting a partial one.

**Rotation is CCW in the MOUNTING SURFACE's frame**, and the lid frame is mirrored in
world. So the same rotation number spins a lid-mounted board the opposite way round from a
floor-mounted one. That is the consistent choice -- the user works in the frame they can
see -- but it means a board moved from floor to lid keeps its number and changes its
physical spin. At rotation 0 there is nothing to notice: the mirrored frame and the
mirrored board cancel, and a lid board faces exactly the same walls as a floor board.

### 3.4 Worked example: the Air Quality Monitor's OLED

The case that is always confusing, done end to end. From
`docs/examples/air-quality-monitor.boxmaker.json`:

```
lid, 10.1, 63.1  |  lid, 101.7, 63.1  |  lid, 101.7, 38  |  lid, 10.1, 38
   -> mounting pattern 91.6 x 25.1, standoff height 2.6, OD 4, hole 2.2
lid, Rect, 58.1, 49, 79.6, 26.9, 0
   -> display window spans user X 18.3 .. 97.9, Y 35.55 .. 62.45
```

The board is mounted under the lid with the **component side facing up**, so the display
protrudes into the window. Say the board is ~96.6 x 30.1 with holes 2.5 mm in from each
corner, i.e. board coordinates (2.5, 2.5), (94.1, 2.5), (94.1, 27.6), (2.5, 27.6).

Mounted on `lid` with components `up` -> **mirrored** (section 3.2). So:

```
userX = X0 - bx        userY = Y0 + by

X0 - 2.5  = 101.7  ->  X0 = 104.2
X0 - 94.1 =  10.1  ->  X0 = 104.2     agree
Y0 + 2.5  =  38.0  ->  Y0 =  35.5
Y0 + 27.6 =  63.1  ->  Y0 =  35.5     agree
```

Both pairs solving independently to the same value is the check that the mapping is right.

```
lid, 104.2, 35.5, 0, up, 2.6, 4, 2.2, 3.2, 2, OLED
```

Note `X0 = 104.2` sits near the far end of lid `+X`. That is the mirror at work: the
board's lower-left corner, seen from the component side, lands at **high** user X because
lid `+X` runs the opposite way. Viewed from outside the box it still appears at the lower
left, which is why the sketch looks right even though the number is large.

## 4. File formats

### 4.1 Board definition -- `*.board.txt`, sectioned plain text

Recommended over JSON: it matches the app's existing comma-delimited editing model, it
hand-edits and git-diffs cleanly, and its body lines reuse the existing per-line parsing.

```
// BoxMaker board definition

[board]
Name, Adafruit Feather ESP32-S3
Size, 50.80, 22.86            // X, Y
Thickness, 1.60
CornerRadius, 1.5
Height, 12.0                   // total above the NON-component face, stack included
HeightBelow, 2.0               // OPTIONAL: anything protruding below, e.g. leads

[mounts]                       // X, Y, BoardHoleDia
2.54, 2.54, 2.5
48.26, 2.54, 2.5
2.54, 20.32, 2.5
48.26, 20.32, 2.5

[cutouts]                      // Side, Shape, X, Y, <shape args>, Clearance
top,    Rect,  25.4, 11.4, 30, 15, 1, 0.4
bottom, Round, 10.0,  5.0, 3.5, 0.3

[edges]                        // Edge, Pos, Z, SizeAlong, SizeZ, CornerRadius, Clearance
x-, 15.0, 3.1, 9.0, 3.5, 0.5, 0.4

[keepouts]                     // OPTIONAL: X, Y, SizeX, SizeY, Height, Side
25.4, 11.43, 50.8, 22.86, 8, top   // X,Y is the CENTRE, as in [cutouts]
```

Shape args mirror the existing cutout syntax exactly: `Round` takes `Diameter`, `Rect`
takes `SizeX, SizeY, CornerRadius`.

**`Clearance` grows the opening on every side, and changes SIZE ONLY.** A 10 mm opening
with `Clearance 0.4` cuts as 10.8. `CornerRadius` comes through exactly as written, so `0`
stays square. A true outward offset would round a sharp corner by the offset distance --
but someone who typed `0` means square, and a display window wants square. Anyone who
wants radius plus clearance can type the sum.

**`[edges]` are connector cutouts through a side wall** -- USB, barrel jack, headers. See
section 4.3 for the fields, which are the one place the board file does not use plain
board X/Y.

**`[keepouts]` are "nothing else here" volumes** -- a box marking a tall component: an
electrolytic cap, a USB connector, a pin header, the OLED module itself. Entirely
optional, and they buy three things:

- the ghost preview draws them, so you can see whether the board actually fits;
- validation checks the tallest one against the lid, instead of assuming a bare PCB;
- validation can catch a standoff or a wall landing where a component already is.

Skip the section if measuring components is not worth the trouble; everything else still
works.

### 4.2 Placement -- a new `boardsText` textarea in the box design

One line per placed board. Follows the `TextLabels` precedent of a free-text trailing
field: the parser finds the Nth comma and takes the rest as the name
(`useDesign.ts:223-241`).

```
// Surface, X, Y, Rotation, Components, StandoffHeight, StandoffOD, StandoffHoleDia, HoleDepth, BaseFillet, BoardName
floor, 10,    12,   0, up, 6,   6, 2.6, 8,   1, Feather ESP32-S3
lid,  104.2, 35.5,  0, up, 2.6, 4, 2.2, 3.2, 2, OLED
```

`Components` is `up` or `down` in world Z -- see section 3.2. Rotation is CCW degrees
about the board origin.

**Standoff dimensions live on the placement line, not in the board file.** How high you
lift a board, and whether you use M2 or M3, is a property of *this box* -- not of the
board. The board file carries only the board's own hole diameter, which validation uses to
sanity-check the standoff OD.

---

### 4.3 Connector cutouts -- the `[edges]` section

```
Edge, Pos, Z, SizeAlong, SizeZ, CornerRadius, Clearance
```

- **`Edge`** -- `x+`, `x-`, `y+`, `y-`: which board edge the connector sits on, named in
  board-local terms. `x+` is the edge at maximum board X. Which box wall that ends up
  facing is resolved at placement time from the surface, the components direction and the
  rotation.
- **`Pos`** -- position along that edge, in board coordinates. Board **Y** for an `x+`/`x-`
  edge, board **X** for a `y+`/`y-` edge.
- **`Z`** -- the opening's centre height above the board's **non-component face**, i.e.
  above board `Z = 0` (section 3.1). For a connector on the component side that is the
  board thickness plus the datasheet's height above the board surface: a USB-C jack whose
  centre sits 1.5 mm above a 1.6 mm board is `Z = 3.1`. Measuring from `Z = 0` keeps the
  number board-intrinsic, so it survives the board being mounted upside down.
- **`SizeAlong` / `SizeZ`** -- the opening, along the edge and vertically.
- **`CornerRadius` / `Clearance`** -- as in `[cutouts]`: clearance grows the opening on
  every side and leaves the corner radius alone.

The compiler resolves the wall, projects the edge point to world coordinates and inverts
the per-wall frames in `cutouts.ts:123-175` to get the along-wall coordinate. Height comes
from `boardZToWorldZ`, which accounts for the board resting on the standoffs' free ends --
which rise from the floor, or hang below the lid plate where it sits on the box rim at
`box.height`.

### 4.4 Clearance: `Height`, `HeightBelow` and `[objects]`

Added 2026-09-02 (phase 1.5), ahead of the rest of phase 2, because knowing what fits is
what a real build needs first.

**`Height`** in `[board]` is the total height of the assembly above board `Z = 0`, i.e.
above the **non-component face**. It includes the board itself and everything standing on
it, so a carrier with two more boards stacked on it reports the whole stack as one number.
`0` means "not measured", and the board is treated as a bare PCB of `Thickness`. A `Height`
below `Thickness` is rejected, since that almost always means it was measured from the
wrong face.

**`HeightBelow`** is how far anything protrudes below `Z = 0` -- through-hole leads, a
connector on the solder side. Default 0. It matters because it is what hits the mounting
surface when the standoffs are too short.

**Objects** are the non-printed occupants: a battery, a speaker, a relay. They live in
their own design-level textarea, not in a board file, because they belong to this box.

```
// Surface, X, Y, SizeX, SizeY, Depth, Offset, Name
floor, 30, 20, 60, 35, 18, 0, LiPo battery
left,  40, 25, 55, 30, 12, 0, Battery velcroed to the wall
```

The design decision worth recording: **an object anchors to one of the six surfaces and
uses THAT SURFACE'S existing user frame** -- the same one its cutouts use -- rather than a
new box-wide XYZ. `Depth` runs inward from the surface, `Offset` holds it clear of the
surface. A battery on the floor is `floor`; the same battery stuck to a wall is `left`,
whose frame already measures height up from the interior floor, so there is no new
coordinate system to learn and no second set of frames to keep correct.

`X,Y` is the **centre**, matching `[cutouts]` and `[keepouts]`.

**Objects are advisory only.** They never add or subtract material and never appear in an
export, which makes them safe to add to a finished design. Their only jobs are to be drawn
and to be checked for interference.

## 5. Board library

Same shape as the existing `src/data/presets.ts`:

- `src/data/boards.ts` -- built-in boards imported at build time and run through the same
  parser as a user file, so there is one validation path.
- User boards imported through a hidden file input, following `Sidebar.tsx:179-215`.
- **Boards are embedded by value in the saved design.** A `.boxmaker.json` must render
  standalone; a by-reference library link would break the moment a file moved. Record the
  source name so an "update from library" action stays possible later.

Trade-off to accept: embedded board definitions enlarge the base64 share-link hash.

---

## 6. Persistence

Add `boardsText` and `boards` to `DesignFile` as **optional** fields, and **do not bump
`DESIGN_FILE_VERSION`.**

`parseDesignFile` hard-rejects a version mismatch (`persistence.ts:121-125`), so bumping
invalidates every saved file and share link in the wild -- as the v0.9.0 coordinate-frame
change already did once. Optional fields plus the existing `{...DEFAULT_X, ...design.x}`
merge in `loadDesign` give clean backward compatibility for free.

---

## 7. Validation

New `boardWarnings()` in `validation/checks.ts`, reusing `interiorSpan`, `pocketSpan` and
`boundsFit`. Its ghosts register in `collectGhosts()` (`checks.ts:588-602`), so the red
viewport highlights come for free.

Checks:

- Board footprint, post-rotation, fits the interior (floor) or the pocket (lid).
  Partial = advisory, fully outside = hard.
- Board plus tallest keepout fits under the lid. The pocket-aware headroom math at
  `checks.ts:297-322` is directly reusable.
- Standoff OD vs the board's hole diameter.
- Standoff too close to a board edge -- the standoff overhangs the board.
- A compiled cutout falls outside its target surface.
- Two placed boards overlap.

Board-generated warnings need a **provenance tag** rather than a `line` number, so a
message reads `board "Feather" mount 3` instead of pointing at a textarea row that does
not contain it.

---

## 8. Clearance ghosts

`src/components/viewport/ClearanceGhosts.tsx` draws a translucent box for every placed
board (sized by `Height` / `HeightBelow`) and every object. Toggled by
Settings -> Show Clearance, default on.

- **Teal** for a board, matching the sidebar group; **slate** for an object; **red** for
  anything overlapping something else. Deliberately cool-toned so they never read as the
  red warning ghosts, which mean something is wrong -- these are furniture.
- `depthTest={false}`, which `WarningMarkers` does NOT do. These live inside a solid box
  and would otherwise be hidden by its own walls, which defeats the point entirely.
  Drawing them over the top gives an x-ray view of the box's contents without having to
  explode it.
- Plain three `boxGeometry`, never a manifold build, so dragging a slider costs nothing.
- A lid-mounted item is drawn in the lid frame and follows the lid when the viewport
  explodes it, the same way `WarningMarkers.tsx:36-39` handles lid ghosts. Interference is
  still compared in **assembled** coordinates, because a lid-mounted board and a floor
  object certainly can collide.

The maths lives in `src/board/envelopes.ts`, which is deliberately pure with type-only
imports so `npm run check:board` can run it under node. The React hook that feeds the
viewport is separate, in `useEnvelopes.ts` -- putting it beside the maths dragged Zustand
into a plain node process and broke the check.

## 9. Coordinate math: reuse, do not refactor

**Decision (2026-09-01): no refactor.** The per-surface frame math took a long time to get
right across two rounds (v0.7.0 wrong, v0.9.0 correct) and is not worth re-testing for
this feature's convenience.

`geometry/standoffs.ts` already exports `floorAnchorXY` (`:68-73`) and `lidAnchorXY`
(`:86-97`). Board compiling **imports and calls those directly.** No existing file is
modified, and boards inherit frames that are already proven.

The known duplication stays as-is: `geometry/cutouts.ts:99-121`, `geometry/text.ts:473-496`,
`validation/checks.ts:68-82` (whose comment says "Mirrors lidAnchorXY in
geometry/standoffs.ts") and `viewport/OriginMarkers.tsx:40-149` each carry their own copy.
It works. Consolidating it is a separate piece of work with its own justification.

**If it is ever consolidated,** the safety net must be mechanical, not careful reading:
export STL for both example designs before the change, export again after, and `cmp` the
files. Byte-identical is proof. Note the project currently has **no test infrastructure at
all** (`package.json` has only dev/build/start/lint, no test dir), so that harness is
itself new work.

## 10. Two hazards found in the existing code

1. **Coplanar standoff hole -- TESTED, not a bug. Hardened anyway.** The standoff screw
   hole is drilled from the free end, so the cutter's end face is *always* coplanar with
   the standoff's free end face -- for every standoff with a hole, not only when
   `holeDepth == height` as first written here. That is the condition `snap.ts:219-256`
   warns about.

   Measured rather than assumed: two standoffs, one with `HoleDepth == Height` and one
   with `HoleDepth < Height`, viewed from directly above with the epsilon at `0` and then
   at `0.01`, full page reload between. **Both bores render open either way.** Manifold
   copes; there was no bug.

   The 0.01 mm break was kept regardless -- `snap.ts` leaves a standing instruction to
   break coplanarity on any subtracted feature, it costs nothing, and boards are about to
   generate standoffs in bulk. It is applied past the **free end only**, where there is no
   material, so the resulting solid is unchanged and the drilled depth is still exactly
   `HoleDepth`.

2. **No debounce, no worker.** `BoxMesh.tsx:35-75` and `LidMesh.tsx:36-75` each do a full
   CSG rebuild of *both* bodies on every keystroke, because the parsers hand back fresh
   array identities per character (`useDesign.ts:600-611`). Boards do not make this
   qualitatively worse -- standoffs are cheap -- but a board library that makes
   16-standoff designs routine will make it more noticeable. Not this feature's job to
   fix; worth knowing before blaming boards for it.

---

## 11. Per-standoff base fillet -- auto-clamp REJECTED, warning added instead

The Air Quality example hand-tunes this: its "air qual sensor" group is `2, 1, 1, 2`, the
fillet reduced on the two standoffs nearest a wall. A board emits one fillet for the whole
group, so on 2026-09-01 the decision here was to auto-clamp each emitted fillet to the wall
clearance.

**Reversed on 2026-09-02, on evidence.** Gary produced two cases where an oversized fillet
is harmless, and testing found a third where it is not -- and the third is not what the
clamp was aimed at.

What actually happens when a fillet is too big:

| Case | Result |
|---|---|
| Fillet overlaps a **cutout** | Fine. Cutouts are subtracted after standoffs (`box.ts:136-146`), so the cutout simply trims it. |
| Fillet **reaches the wall** | Fine. It unions into the wall as a small gusset. |
| Fillet overlaps another standoff | Fine. They merge. |
| Fillet drives **clean through** the wall | **Defect** -- a lens-shaped bump on the OUTSIDE of the box. |

So the premise was wrong. The clamp would have silently reduced fillets in cases that print
perfectly well, and would have changed geometry the user was happy with. It is not built.

The real gap is narrower and was entirely unguarded: `boundsFit` in `standoffWarnings`
tests `s.x +/- od/2` and **ignores the fillet completely**, so a standoff whose body sits
comfortably inside the interior can still push its fillet out through the exterior face
with no warning at all. Confirmed in the app: `floor,113,41,12,10,0,0,5` in a
125 x 82 box with 2.5 mm walls raises a visible exterior bump and produced zero warnings.

**Shipped instead:** an advisory in `standoffWarnings` for floor standoffs, firing only
when `od/2 + fillet` exceeds the distance to the interior wall face by more than
`wallThickness`. It reports the overshoot in mm and ghosts the fillet skirt in red. The
example above now reads "breaks through the outside of the wall by 1.5 mm", which matches
the arithmetic by hand.

Consequence for boards: a board still emits one fillet for its whole group, so the Air
Quality OLED group compiles to four fillets of 2 rather than `2, 1.5, 1.5, 2`. That is now
understood to be a cosmetic difference and not a defect -- none of those four breaks
through, and the real design raises no warnings.

## 12. Files to touch

| File | Change |
|---|---|
| `src/board/parseBoard.ts` | **new** -- `.board.txt` section parser |
| `src/board/compile.ts` | **new** -- placement + board -> standoffs / cutouts; imports `floorAnchorXY` / `lidAnchorXY` from `geometry/standoffs.ts` |
| `src/data/boards.ts` | **new** -- built-in board library |
| `src/components/parameters/BoardsControls.tsx` | **new** -- copy the `StandoffsControls.tsx` template |
| `src/components/viewport/BoardGhost.tsx` | **new** -- semi-transparent preview |
| `src/store/useDesign.ts` | `boardsText`, `parseBoardsText()`, `BoardPlacement`, setter |
| `src/store/persistence.ts` | optional `boardsText` / `boards` in `DesignFile` |
| `src/store/useUndoRedo.ts` | add fields to `Snapshot`, `snapshotEquals`, `apply` (`:11-46`, `:90-119`) -- **all four places, or undo silently drops them** |
| `src/store/useAutoSave.ts` | include the new fields (`:86-92`) |
| `src/components/editor/Sidebar.tsx` | new group, import button, save/load wiring |
| `src/config/colors.ts` | 6th entry in `GROUP_COLORS` |
| `src/validation/checks.ts` | `boardWarnings()` + register ghosts |
| `src/components/editor/HelpPanel.tsx` | new `HELP_SECTIONS` entry -- the single source of truth for user-facing semantics |
| `VALIDATION-TESTS.md` | recipes for each new warning |

The compiled features should be consumed through a single derived `effectiveStandoffs` /
`effectiveCutouts` in the store, rather than each of geometry, `collectGhosts` and the
per-section `useMemo`s concatenating separately.

---

## 13. Phases

### Phase 0 -- small fixes, no refactor

Deliberately minimal. The frame-math consolidation was considered and **rejected** --
see section 9.

- [x] Apply the 0.01 mm coplanar break to the standoff free end (section 10.1).
      Verified by A/B with the epsilon at 0 and 0.01: no visible difference, because the
      bug it guards against does not currently occur. Kept as hardening.
- [x] Fix the stale v0.7.0 doc comments at `useDesign.ts:62-70` and `:99-107`, which still
      described the pre-v0.9 corners *and* the walls as viewed from outside. Comments only.

Phase 0 complete -- commit `126be43`.

### Phase 1 -- boards on the floor and lid

- [x] `.board.txt` parser (`src/board/parseBoard.ts`), `[edges]` reserved and rejected.
- [x] Placement parser (`src/board/parsePlacements.ts`), `Components up|down`.
- [x] Compile to standoffs and to top/bottom cutouts (`src/board/compile.ts`), including
      the floor/lid frame conversion for a feature that cuts the far surface.
- [x] Acceptance check (`src/board/__acceptance.ts`, `npm run check:board`) -- 33 checks,
      headed by reproducing the Air Quality OLED standoffs exactly. All passing.
- [x] Rotation restricted to quarter turns, enforced in both the parser and the compiler.
- [x] Connector cutouts through side walls (`[edges]`), pulled forward from phase 2 at
      Gary's request -- he has a box needing them now.
- [x] Board library: file import, embedded by value in the design. Built-in boards are
      **deferred** by Gary's call; the library ships empty.
- [x] `boardsText` wired into the store, undo, autosave and the design file, plus a new
      sidebar group in teal.
- [x] Merge compiled output into the geometry inputs -- `effectiveFeatures()` in
      `src/board/compileAll.ts` is the single place the user's own standoffs and cutouts
      are combined with the board-generated ones. The viewport uses the memoised hook;
      the STL and 3MF exporters call the pure function on `getState()`.

Phase 1 complete. Verified end to end in the app: the Air Quality Monitor's four
hand-entered OLED standoffs and its display window were deleted and replaced by one
imported board file plus one placement line, and the lid came out visually unchanged.

One known difference, and it is the section 11 issue rather than a bug: the example's
OLED group carries per-standoff base fillets of `2, 1.5, 1.5, 2`, hand-reduced on the two
near a wall. A board emits one fillet for the whole group, so those two are currently 2.
The auto-clamp is phase 2.
- [ ] Ghost board preview, plus keepout slabs.
- [ ] `boardWarnings()` and its viewport ghosts.
- [ ] "Explode to raw lines" escape hatch.
- [ ] Help panel section; persistence, undo and autosave wiring.

### Phase 1.5 -- clearance (done 2026-09-02)

Pulled ahead of phase 2 at Gary's request: he has a box being built now, with a stacked
board and a battery that must not collide.

- [x] `Height` and `HeightBelow` in the board file (section 4.4).
- [x] `[objects]` textarea, surface-anchored, with its own sidebar section under a renamed
      "Boards & Objects" group.
- [x] `envelopes.ts` -- world-space AABBs for both, exact rather than approximate because
      rotation is restricted to quarter turns and objects are rectangular.
- [x] Translucent x-ray ghosts, red on overlap, Settings -> Show Clearance.
- [x] 18 acceptance checks against hand-computed envelopes and overlap cases.
- [ ] Interference reported as text warnings, not only as colour.

### Phase 2 -- validation and preview

Connector cutouts moved into phase 1. What is left is everything that tells the user their
board does not fit.

- [ ] `boardWarnings()` in `validation/checks.ts`, plus its viewport ghosts (section 7).
- [ ] Keepout slabs in the ghost view (section 8 covers the board envelope already).
- [ ] Warning when a projected connector cutout misses its wall or crosses a corner.
- [ ] Warning when a compiled cutout falls outside its target surface.
- [x] Fillet handling settled -- auto-clamp rejected, exterior-breakthrough advisory
      shipped instead (section 11).
- [ ] "Explode to raw lines" escape hatch.
- [ ] Help panel section -- the single source of truth for user-facing semantics.

## 14. Future add-ons (not scheduled)

- **Non-rectangular board outlines.** Pi HATs have notches. Phase 1 is rectangle plus
  corner radius; a polygon outline section can be added without breaking the format.
- **"Fit box to boards."** Once footprints and heights are known, BoxMaker can size the
  interior to the placed boards plus a margin. Strong feature; entirely separate change.
- **Drill-template export.** A thin plate carrying just the standoff pattern, to test-fit
  a real board before committing to a full box print. The 3MF plumbing is already n-body
  (`Sidebar.tsx:256-261`), so this is mostly UI.
- **Board name engraving** near each standoff group, reusing the text-label machinery.
- **Per-mount standoff overrides** -- skip a hole, or vary one standoff's height.
- **Card-edge slots** -- board slides into slots moulded into two opposite walls, no
  standoffs at all.
- **Standoff top variants** -- integral peg through the board hole instead of a screw, or
  a snap post.
- **Board thumbnails** in the library picker, matching VaseMaker's preset thumbnails.
- **Multi-board stacking** -- a board mounted on standoffs rising from another board.

---

## 15. Verification

0. `npm run check:board` -- the compiler acceptance check. Covers items 2, 3, 5 and part
   of 8 below without a browser. Runs `tsc -p tsconfig.check.json` then the emitted JS;
   nothing imports `__acceptance.ts`, so it stays out of the app bundle.
1. `npx tsc --noEmit`. Never `npm run build` while `npm run dev` is running -- they share
   `.next`. See `CLAUDE.md`.
2. **Round trip:** define a board, place it at rotation 0 / `Components up` on the floor, click
   "Explode to raw lines", and confirm the emitted standoff lines match hand-derived
   values.
3. **Transform matrix:** repeat at 90 / 180 / 270 and with `Components down`, checking exploded
   lines against hand-computed coordinates each time. This is where the transform-order
   bugs will be.
4. **Lid mirror:** place the same board on the lid, confirm the mirrored `+X` lands
   correctly, export the lid STL and measure.
5. **Side resolution:** a board with a `top` cutout on the floor with `Components up` must
   cut the **lid**; the same board with `Components down` must cut the **floor**.
   The section 3.4 OLED must reproduce the example's four standoffs exactly.
6. **Backward compatibility:** load a pre-board `.boxmaker.json` and an old share link --
   both must still work.
7. **Undo/redo** across a board edit, a placement edit and a board import.
8. Reproduce the Air Quality Monitor's four board groups as four placed boards, and diff
   the exploded standoff lines against the hand-entered originals. That example is the
   real acceptance test.
