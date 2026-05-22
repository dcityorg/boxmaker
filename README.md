# BoxMaker

A browser-based parametric 3D-printable enclosure generator. Drag sliders to
size a box and its lid, place standoffs and cutouts, add embossed or debossed
text labels, then export STL or 3MF directly from your browser. No CAD install
needed.

Companion web app to the
[BoxMaker Fusion 360 add-in](https://github.com/dcityorg/boxmaker-fusion).
Parameter names and geometry semantics match between the two -- a box you size
in one produces matching geometry in the other.

## Features

- Parametric box body and lid with snap-fit clips (per-wall toggles, tunable
  nub geometry, lid lead-in chamfer)
- Standoffs (PCB mounts) on the floor or hanging from the lid -- optional
  screw hole and base fillet per standoff
- Round and rectangular cutouts on any face, with optional corner fillet
- Embossed and debossed text labels with bundled fonts (Atkinson Hyperlegible,
  JetBrains Mono, Open Sans) or any uploaded `.ttf` / `.otf`
- Separate-body text labels become distinct objects in 3MF export for
  multi-material slicing
- Save / Load designs as portable JSON; share via URL hash
- Undo / redo with rapid-write coalescing
- Live 3D preview with orbit controls, six orthographic view shortcuts,
  ViewCube widget, and Blender-style numpad bindings (`1/3/7` etc.)

## Run locally

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

## Tech stack

- Next.js 14 (App Router) + React 18 + TypeScript
- Tailwind CSS 3.4
- Zustand for state
- `@react-three/fiber` + `@react-three/drei` for the 3D viewport
- `manifold-3d` (WebAssembly) for boolean geometry
- `opentype.js` for font parsing and glyph outline extraction

## Deploy

Static site; no backend. Manifold runs in the browser via WASM. Push to Vercel
for free-tier hosting -- no configuration needed beyond connecting the repo.

## User guide

See [USER-GUIDE.md](USER-GUIDE.md) for the end-user reference: textarea
syntax for standoffs / cutouts / text labels, coordinate frames per surface,
font handling, persistence formats, export details, and FAQ.
