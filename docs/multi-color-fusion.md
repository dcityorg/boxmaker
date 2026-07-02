# Multi-color text labels — Fusion 360 → Bambu Studio → Bambu X2D

This application note covers the workflow for printing text labels in a different filament color from the rest of the box, using BoxMaker's `SeparateBody` option and a Bambu Lab printer with multi-material capability (AMS, dual nozzle, or both).

![Finished lid with white "Air Quality Monitor" text on a matte black lid](images/multi-color-result.jpg)

> **Tested configuration**
> - **Printer:** Bambu Lab X2D (firmware 1.01.00.00) with AMS Pro
> - **Slicer:** Bambu Studio Beta 2.6.1.55
>
> This guide is written for the X2D Printer. The general workflow should translate to other dual-nozzle Bambu printers (e.g. H2D) and to single-nozzle AMS printers (where the AMS handles all filament swaps on one nozzle). Other slicers and non-Bambu printers are not covered here — the Fusion side (BoxMaker's `SeparateBody` option) applies to any multi-material slicer, but the slicer-side steps will differ.

> **Pick your path before you start.** Two ways to print multi-color on the X2D:
>
> 1. **AMS-only on Main nozzle.** Both the body and the text filament live in AMS slots. Filament swaps happen on the Main nozzle with a small purge per swap. Simpler workflow, slightly more filament waste. Recommended for one-off prints and casual use.
> 2. **External holder + Aux nozzle.** Body filament in the AMS; text filament in the External filament holder feeding the Auxiliary nozzle. No purge waste at color changes — they're nozzle switches, not filament swaps. Requires loading the External holder (~8 min) and a slightly more difficult Bambu Studio setup. Worth it for repeat prints with the same color combo, or for material pairs that don't purge cleanly through one nozzle (TPU, soluble supports).
>
> The Fusion side and most of the Bambu Studio workflow is identical for both paths. They diverge only at the **Slicing** step, which is clearly forked below. See the [FAQ](faq.md) for a deeper comparison if you're undecided.

## Contents

- [Tested configuration](#tested-configuration) (see above)
- [When to use SeparateBody](#when-to-use-separatebody)
- [Setting up the text label in Fusion](#setting-up-the-text-label-in-fusion)
- [What the bodies look like in Fusion](#what-the-bodies-look-like-in-fusion)
- [Exporting from Fusion as 3MF](#exporting-from-fusion-as-3mf)
- [Setting up the X2D and Bambu Studio](#setting-up-the-x2d-and-bambu-studio)
- [Importing the 3MF into Bambu Studio](#importing-the-3mf-into-bambu-studio)
- [Assigning filaments and merging](#assigning-filaments-and-merging)
- [Slicing the part](#slicing-the-part)
  - [Path A: AMS-only on Main nozzle](#path-a-ams-only-on-main-nozzle)
  - [Path B: External holder + Aux nozzle](#path-b-external-holder--aux-nozzle)
- [Troubleshooting](#troubleshooting)

## When to use SeparateBody

Standard `emboss` and `deboss` text labels print in a single color — even on a multi-material printer. They look fine for tactile or visual labeling but the contrast is only what the surface relief provides.

`SeparateBody=yes` (in the Text Labels section of the BoxMaker panel) emits the text as individual character bodies in Fusion, separate from the lid or wall it sits on. In a multi-material slicer, you assign a different filament to those text bodies and the printer prints the text region in a different color.

Use this when you want:

- **Crisp colored text** on a box (e.g. white `Air Quality Monitor` lettering on a matte-black lid)
- **Iconography or branding** in a brand color
- **High-visibility labels** like `WARNING` or `100V` that need to stand out

### A note on nozzle size for small text

A 0.4 mm nozzle (the default on most printers) prints text down to about 8 mm character height with acceptable quality. For anything smaller, or for fine-detail fonts with thin strokes, swap to a **0.2 mm nozzle** before printing — letter strokes and counters come out crisp instead of muddy.

## Setting up the text label in Fusion

In the BoxMaker panel, scroll to the **Text Labels** section and add a row with `SeparateBody=yes` (the 10th comma-separated field):

```
// Format: Surface,X,Y,Type,Depth,TextHeight,Direction,Font,Bold,SeparateBody,Text
lid,30,40,deboss,1,6,back,Arial,yes,yes,Air Quality Monitor
```

Field-by-field:

| Field | Value | Notes |
|---|---|---|
| Surface | `lid` | Where the label goes |
| X, Y | `30, 40` | Center of the label, mm from the surface's 0,0 origin |
| Type | `deboss` | `deboss` = body extrudes INTO the lid (flush surface, color difference visible). `emboss` = body sits ON the lid (raised, plus a 0.4 mm anchor into the wall) |
| Depth | `1` | mm — how far the body extends into (or out of) the surface |
| TextHeight | `6` | mm — character height |
| Direction | `back` | Which adjacent surface the top of the text points toward |
| Font | `Arial` | Any installed system font |
| Bold | `yes` | |
| SeparateBody | `yes` | **The new field** — opt in to separate-body / multi-color behavior |
| Text | `Air Quality Monitor` | The actual text |

![BoxMaker Text Labels input with SeparateBody=yes highlighted](images/multi-color-csv.png)

Click OK to run the add-in. BoxMaker generates the box and lid, then creates the text bodies separately.

## What the bodies look like in Fusion

After the run, expand the component that has the text (e.g. `Lid:1 → Bodies`) in the Fusion browser. You'll see:

- `Lid` — the main lid body, gray (default appearance)
- `Text-Lid-1(1/20)` through `Text-Lid-1(20/20)` — one body per glyph, tinted **bright yellow** in the viewport so they visually stand out from the gray lid

![Fusion browser showing Lid:1 → Bodies with Text-Lid-1 entries and yellow letters in the viewport](images/fusion-bodies-tree.png)

Why one body per letter? Each disjoint glyph profile (and disjoint pieces like the dot of an `i`) becomes its own body. Fusion's API can't reliably merge disjoint bodies — they remain separate. That's fine: in the slicer they all get the same filament.

The naming convention is `Text-{Surface}-{N}({i}/{total})`:

- `Surface` is `Lid`, `Front`, `Back`, `Left`, `Right`, or `Floor`
- `N` is the row number from the Text Labels list (1, 2, 3…). A second text group on the same surface gets `Text-Lid-2(...)` and never collides with the first.
- `(i/total)` is the part index, only present when there's more than one body. A single-body label is just `Text-Lid-1`.

The yellow color is purely cosmetic in Fusion. The slicer ignores it — you assign the actual print color in Bambu Studio.

## Exporting from Fusion as 3MF

**Don't use `File → Export → 3MF`.** That dialog writes the whole design (Box + Lid + Custom Modifications) at the design's active unit (centimeters), with no unit metadata, which makes Bambu Studio's importer guess the units wrong.

Instead, use **Save As Mesh**:

1. In the Fusion browser, right click on your component (e.g. `Lid:1`). Click **Save as Mesh**.
2. In the dialog: **Preparation Type = Export**, **Format = 3MF**, **Units = Millimeters**, **Structure = One File**.
3. Click OK, check "Save to my computer", choose a destination, and click Save.

![Save As Mesh dialog with Format=3MF, Unit Type=Millimeter, Structure=One File](images/fusion-save-as-mesh.png)

This produces a single 3MF file containing only the component (lid + text bodies), with proper millimeter unit metadata, in their correct world positions.

## Setting up the X2D and Bambu Studio

Do this once, before you import your part:

1. On the printer, install the build plate you plan to use (e.g. textured PEI).
2. Load the filaments you plan to use. For each one, edit its type on the printer screen so the type and color are reported correctly.
   - **Path A (AMS-only):** load both the body filament and the text filament in AMS slots. Leave the External holder empty.
   - **Path B (External holder + Aux nozzle):** load the body filament in the AMS, and the text filament in the External filament holder.
3. Launch Bambu Studio. On the **Prepare** tab, in the top-left panel:
   - Select your printer (Bambu Lab X2D).
   - Select your plate type to match the printer.
   - Click **Sync info**. When the small "Continue to sync filaments" prompt appears, click it. This pulls the printer's nozzle config and current AMS/External filaments into the project.
4. Check the **Project Filaments** section in the left panel. The filaments installed on your printer should now be listed. If anything is missing or wrong:
   - Click the small **printer icon** (to the left of the gear icon) at the top-right of the filament list to re-read the filaments from the printer.
   - Delete any extra filaments by clicking the **`…`** (three dots) menu next to the slot and choosing Delete.
   - You can also click the dropdown arrow next to each slot number to manually pick a color from the printer list.
5. Leave Bambu Studio open. You'll load the part in the next section.

![Bambu Studio Project Filaments populated from the printer via Sync info](images/bs-filament-setup.png)

## Importing the 3MF into Bambu Studio

Drag the Fusion created 3MF file onto the build plate, or use **File → Import → Import 3MF/STL/STEP/…**.

Three prompts may fire — read this section carefully, because **one of them has a trap that silently breaks the setup process**.

### Prompt 1: "The 3mf is not from Bambu Lab, load geometry data and color data only."

Click **OK**.

### Prompt 2: "Standard 3mf Import color." — ⚠️ Critical step

This dialog appears because the Fusion 3MF carries its own object colors (gray lid + yellow text). Bambu Studio is asking how to map those onto your Project Filaments.

> **Important:** Do **NOT** change the colors in the **Matching** column. **Do not try to match the imported colors to your existing filaments here.** Just click **OK** and accept the dialog's default behavior.

What this does: Studio will **append** two new filament slots (e.g. slot 6 and slot 7) to your Project Filaments to hold the imported colors. You'll delete those new slots in the next section.

![Standard 3mf Import color dialog — click OK without changing the Matching column](images/bs-import-color.png)

**Why it matters:** if you use the dialog's color-matching feature to bind the imported colors onto your existing filaments (1–5), Bambu Studio appears to leave an internal filament-tagging flag in an incomplete state. The slicer will later refuse to honor your dual-nozzle filament assignments and silently consolidate everything onto the Main nozzle — even if everything looks correct in the UI. Accepting the default Append behavior and deleting the new slots afterward avoids this entirely.

### Prompt 3: "Object too small, may be in meters or inches. Scale to millimeters?"

![Bambu Studio "Object too small" prompt — click No](images/bs-object-too-small.png)

Click **No**. The file is already in millimeters; Bambu Studio's "too small" heuristic is overly cautious for boxes around 100 mm. Clicking Yes would scale by 1000 (assuming meters) or 25.4 (assuming inches) and your box would import absurdly large.

## Assigning filaments and merging

Your part is now on the plate. In **Project Filaments** you'll see two extra slots (e.g. 6 and 7) holding the imported Fusion colors — typically orange and gray.

### 1. Delete the imported filament slots — do this first

> **Important:** Delete the appended Fusion-color slots **immediately after import**, before you assign filaments to objects, before you merge, before you do anything else. Leaving them in place — or assigning objects to them and only deleting afterward — leads to inconsistent internal filament state.

For each newly-appended slot (everything past your normal printer-synced filaments):

1. Click the **`…`** (three dots) menu next to the slot.
2. Choose **Delete**.

Your Project Filaments should now match your printer-synced state (e.g. slots 1–5 only). The yellow arrows in the image below mark the two slots to delete.

![Project Filaments with the two appended slots (6 and 7) marked for deletion](images/bs-delete-appended-slots.png)

### 2. Assign filaments to the lid and text via the Objects panel

On the **Prepare** tab, in the **Process** section, click **Objects**. You'll see your main body (e.g. `Lid`) and all the text characters (`Text-Lid-1(1/20)` … `(20/20)`) listed.

1. Select all the **Text** parts (click the first one, shift-click the last one).
2. Right-click on any of the selected text parts → **Set filament colors for selected items** → pick the filament slot for your text (e.g. slot **5**, External holder, white).
3. Click the **Lid** entry. Click its filament-color box and assign your body filament (e.g. slot **2**, AMS, black).

In our example: lid uses filament **2** (black, from AMS), text uses filament **5** (white, from External holder).

### 3. Merge the lid and all text into one assembly

1. Click the **Lid** in the Objects list.
2. Press **Cmd+A** (or Ctrl+A) to select all objects on the plate, including all 20 text parts.
3. Right-click on any selected object → **Merge**.

![Objects panel after merge — Lid on filament 2, Text-Lid-1 parts on filament 5](images/bs-objects-filaments.png)

**Why the merge is required:** the text bodies physically sit inside the lid's volume (that's how a deboss works). As independent objects on the plate, the slicer treats the overlap as a collision and throws a "Conflicts of gcode paths at layer 1" warning. Once they're merged into a single Assembly, the slicer knows they belong together and the overlap is intentional. The merge also enables **per-part filament assignment** — each part of an assembly can carry its own filament index, which is what makes the lid print in one color and the glyphs in another.

## Slicing the part

Switch to the **Preview** tab and slice.

If the text is facing down and you can't see it from the default view, **left-click and drag** anywhere in the viewport to rotate the plate and flip the lid over.

![Slice preview showing the lid with text in a contrasting color](images/bs-slice-preview.png)

This is where the two paths diverge. Bambu Studio's automatic filament grouping may not reliably do the right thing, so you'll always confirm the grouping manually before the final slice. Follow the path that matches your setup.

### Path A: AMS-only on Main nozzle

Both filaments are in the AMS; you're not using the External holder. Bambu Studio's auto-grouper will routinely assign one of the AMS filaments to the Auxiliary nozzle anyway — because the X2D *has* an Aux nozzle, Studio assumes you want to use it. If nothing is loaded on the Aux side, the print will fail or silently come out single-color.

Force both filaments onto Main:

1. Click the green dropdown arrow next to **Slice plate** (top right) → **Regroup filament** → **Custom**.
2. Drag **both filaments to the Main Extruder column**, leaving the Auxiliary Extruder column empty.
3. Click **OK** and re-slice.

You'll see a wipe tower next to your part — that's where the printer purges between AMS color swaps.

### Path B: External holder + Aux nozzle

Body filament is in the AMS; text filament is in the External holder. Bambu Studio's default grouping mode (Filament-Saving) may still consolidate both filaments onto the Main nozzle to "save" a tool change — leaving the Aux nozzle empty and silently printing your text in the body color. If this happens you will need to do the next step.

Force the dual-nozzle mapping:

1. Click the green dropdown arrow next to **Slice plate** (top right) → **Regroup filament** → **Custom**.
2. Drag filaments between **Main Extruder** and **Auxiliary Extruder** columns so the **text filament sits on Auxiliary** and the **body filament sits on Main**.
3. Click **OK** and re-slice.

![Filament grouping dialog with Custom selected — body filament on Main, text filament on Auxiliary](images/bs-filament-grouping.png)

### How to tell the slice actually went multi-color (both paths)

The simplest check is visual: in the Preview, the text should appear in a clearly different color from the body. That's what you're looking for.

Two additional signals confirm it:

- A **wipe tower** appears next to your part on the plate.
- The Slicing Result panel shows the right filaments on the right nozzles in the Filament Grouping section — both on Main for Path A, one on each for Path B.

If the text shows in the body color, the wipe tower is missing, or the nozzle assignments are wrong, see [Troubleshooting](#text-only-prints-in-one-color-or-nozzles-empty) below.

### Save the project

Once the slice looks right, press **Cmd+S** (or Ctrl+S) and save the project as a `.3mf`. Filament-grouping settings are stored at the plate level inside the file, so saving immediately preserves your Custom mapping. Reopening the saved `.3mf` keeps everything ready to print — without this, certain plate edits can flip the grouping back to Auto and you'll be redoing the Custom regroup.

## Troubleshooting

### Text only prints in one color, or nozzles empty

If the slice preview shows the text in the body color, no wipe tower appears, or the Slicing Result's Filament Grouping panel is wrong for your path, work through these in order:

**1. Re-check the import.** Re-import the Fusion 3MF and on the "Standard 3mf Import color" dialog, click **OK** without changing the Matching column. Then delete the appended filament slots from Project Filaments. Using the dialog's color-matching feature is the single most common cause of silent failure on this workflow. (See the Importing section above.)

**2. Confirm Custom filament grouping for your path.** Slice plate dropdown → Regroup filament → Custom, then:

- **Path A (AMS-only):** both filaments belong on the **Main Extruder** column. The Auxiliary column should be empty.
- **Path B (External holder + Aux):** the text filament belongs on **Auxiliary Extruder**, the body filament on **Main Extruder**.

Click OK and re-slice.

**3. Save the project.** Cmd+S the `.3mf` after the Custom regroup succeeds. The Custom mapping is stored at the plate level inside the file, and saving locks it in so re-opening doesn't revert to Auto.

### "Conflicts of gcode paths have been found at layer 1."

A warning toast pops up from the slicer with this message when the lid and text are still separate top-level objects. Select everything on the plate (Cmd+A) → right-click → **Merge**. They become one multi-part Assembly and the warning clears.

### Letters look muddy or have missing strokes in the slice preview

Your text height is too small for the current nozzle. Try, in order of effort:

- Set `Bold=yes` in the Text Labels input — thicker strokes survive a 0.4 mm nozzle much better.
- Increase `TextHeight` in the Text Labels input (8 mm or larger usually works at 0.4 mm nozzle).
- Swap to a **0.2 mm nozzle** before printing — best for fine-stroke fonts or text smaller than ~8 mm.

### Text body sticks out of the lid in the preview

You're using `emboss` instead of `deboss` with `SeparateBody=yes`. With emboss, the body sits **on top of** the lid and protrudes by Depth mm. That's a valid mode (raised lettering in a different color) but if you wanted flush text, change Type to `deboss` in the Text Labels input.

### Want to verify the 3MF is correct before importing?

The file is a ZIP archive. From a terminal:

```sh
unzip -p "your-file.3mf" 3D/3dmodel.model | head -50
```

The first line should be `<?xml version="1.0" encoding="utf-8"?>`. Look for `unit="millimeter"` in the `<model>` tag — that confirms Fusion exported it correctly. The `<object>` entries should be named `Lid` and `Text-{Surface}-{N}({i}/{total})`.

For more advanced questions — including what's going on internally when this workflow fails, and tips for other Bambu printers — see the [FAQ](faq.md).
