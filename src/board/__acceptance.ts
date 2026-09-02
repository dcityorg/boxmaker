/**
 * Acceptance check for the board compiler. Run with: npm run check:board
 *
 * Nothing imports this, so it is not part of the app bundle. It exists because
 * the board transform (mirror, rotate, translate, and the floor/lid frame
 * conversion) is the highest-risk part of the feature and is otherwise only
 * verifiable by exporting an STL and measuring it.
 *
 * The headline case is section 3.4 of BOARD-MOUNTING.md: a board file plus one
 * placement line must reproduce, exactly, the four OLED standoffs already in
 * docs/examples/air-quality-monitor.boxmaker.json.
 */
import type { BoxParams, LidParams } from '@/store/useDesign';
import { parseBoardFile } from './parseBoard';
import { parseBoardsText } from './parsePlacements';
import { compileBoard, convertFrame, isMirrored, targetSurface, boardToSurface } from './compile';
import type { BoardPlacement } from './types';

const BOX: BoxParams = {
  mode: 'exterior', length: 125, width: 82, height: 76,
  wallThickness: 2.5, floorThickness: 2.5, outerCornerRadius: 2, innerCornerRadius: 2,
};
const LID: LidParams = {
  coverThicknessAtEdge: 2, coverThicknessAtCenter: 2.8,
  coverShoulderWallThickness: 2.5, coverShoulderDepth: 4, boxGap: 0.2,
};

let failures = 0;
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' -- ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

// ---------------------------------------------------------------- board file
const BOARD_FILE = `
// OLED carrier for the Air Quality Monitor
[board]
Name, OLED
Size, 96.6, 30.1        // X, Y
Thickness, 1.6
CornerRadius, 1.5

[mounts]                 // X, Y, BoardHoleDia
2.5,  2.5,  2.2
94.1, 2.5,  2.2
94.1, 27.6, 2.2
2.5,  27.6, 2.2

[cutouts]                // Side, Shape, X, Y, <args>, Clearance
top, Rect, 46.1, 13.5, 79.6, 26.9, 0, 0
`;

console.log('\n[1] parse the board file');
const { board, errors: bErrs } = parseBoardFile(BOARD_FILE);
check('parses with no errors', bErrs.length === 0, JSON.stringify(bErrs));
check('name / size / 4 mounts / 1 cutout',
  !!board && board.name === 'OLED' && board.sizeX === 96.6 && board.mounts.length === 4 && board.cutouts.length === 1);

console.log('\n[2] parse the placement line');
const { placements, errors: pErrs } = parseBoardsText(
  '// Surface, X, Y, Rotation, Components, Height, OD, HoleDia, HoleDepth, Fillet, Name\n' +
  'lid, 104.2, 35.5, 0, up, 2.6, 4, 2.2, 3.2, 2, OLED\n'
);
check('parses with no errors', pErrs.length === 0, JSON.stringify(pErrs));
check('one placement, name "OLED", components up',
  placements.length === 1 && placements[0].boardName === 'OLED' && placements[0].components === 'up');

console.log('\n[3] ACCEPTANCE: reproduce the Air Quality OLED standoffs');
const out = compileBoard(placements[0], board!, BOX, LID);
check('no compile errors', out.errors.length === 0, JSON.stringify(out.errors));
const EXPECTED = [[10.1, 63.1], [101.7, 63.1], [101.7, 38], [10.1, 38]];
// board mounts are listed lower-left, lower-right, upper-right, upper-left;
// mirrored, that lands on the example's order reversed in X.
const EXPECT_ORDER = [[101.7, 38], [10.1, 38], [10.1, 63.1], [101.7, 63.1]];
out.standoffs.forEach((s, i) => {
  check(`standoff ${i} at ${EXPECT_ORDER[i]}`,
    near(s.x, EXPECT_ORDER[i][0], 1e-9) && near(s.y, EXPECT_ORDER[i][1], 1e-9),
    `got ${s.x.toFixed(4)}, ${s.y.toFixed(4)}`);
});
const emitted = out.standoffs.map(s => [+s.x.toFixed(4), +s.y.toFixed(4)]).sort();
check('emitted set equals the example set',
  JSON.stringify(emitted) === JSON.stringify(EXPECTED.map(p => [+p[0].toFixed(4), +p[1].toFixed(4)]).sort()),
  JSON.stringify(emitted));
check('standoff params carried from the placement',
  out.standoffs.every(s => s.surface === 'lid' && s.od === 4 && s.height === 2.6 && s.holeDia === 2.2 && s.holeDepth === 3.2 && s.baseFillet === 2));

console.log('\n[4] ACCEPTANCE: the display window');
const win = out.cutouts[0];
check('cuts the lid', win.surface === 'lid');
check('at 58.1, 49', near(win.x, 58.1, 1e-9) && near(win.y, 49, 1e-9), `got ${win.x}, ${win.y}`);
check('79.6 x 26.9', win.kind === 'rect' && near(win.width, 79.6) && near(win.height, 26.9));

console.log('\n[5] mirror table (section 3.2)');
const mk = (surface: 'floor'|'lid', components: 'up'|'down'): BoardPlacement => ({
  surface, components, x: 0, y: 0, rotation: 0, standoffHeight: 1, standoffOd: 1,
  standoffHoleDia: 0, standoffHoleDepth: 0, baseFillet: 0, boardName: 'x',
});
check('floor + up   -> same',     isMirrored(mk('floor','up'))   === false);
check('floor + down -> mirrored', isMirrored(mk('floor','down')) === true);
check('lid   + up   -> mirrored', isMirrored(mk('lid','up'))     === true);
check('lid   + down -> same',     isMirrored(mk('lid','down'))   === false);

console.log('\n[6] cutout side resolution');
check('top + up    -> lid',   targetSurface('top','up')      === 'lid');
check('bottom + up -> floor', targetSurface('bottom','up')   === 'floor');
check('top + down  -> floor', targetSurface('top','down')    === 'floor');
check('bottom+down -> lid',   targetSurface('bottom','down') === 'lid');

console.log('\n[7] frame conversion is its own inverse');
const fwd = convertFrame('floor', 'lid', 17, 23, BOX, LID);
const rt = convertFrame('lid', 'floor', fwd.x, fwd.y, BOX, LID);
check('floor -> lid gives 100.3, 20.3', near(fwd.x, 100.3, 1e-9) && near(fwd.y, 20.3, 1e-9), `got ${fwd.x}, ${fwd.y}`);
check('floor -> lid -> floor returns 17, 23', near(rt.x, 17, 1e-9) && near(rt.y, 23, 1e-9), `got ${rt.x}, ${rt.y}`);

console.log('\n[8] rotation preserves the mounting pattern');
const dist = (p: BoardPlacement) => {
  const a = boardToSurface(p, 2.5, 2.5), b = boardToSurface(p, 94.1, 27.6);
  return Math.hypot(a.x - b.x, a.y - b.y);
};
const base = dist(mk('floor','up'));
for (const rot of [0, 37, 90, 180, 270, 360]) {
  check(`rotation ${rot} keeps the diagonal`, near(dist({ ...mk('floor','up'), rotation: rot }), base, 1e-9));
}
check('mirroring keeps the diagonal', near(dist(mk('floor','down')), base, 1e-9));
const at0 = boardToSurface({ ...mk('floor', 'up'), rotation: 0 }, 5, 7);
const at360 = boardToSurface({ ...mk('floor', 'up'), rotation: 360 }, 5, 7);
// Not exact: Math.sin(2*PI) is -2.4e-16, not 0. Tolerance, not equality.
check('rotation 0 and 360 agree to 1e-12',
  near(at0.x, at360.x, 1e-12) && near(at0.y, at360.y, 1e-12),
  `0 -> ${at0.x},${at0.y}  360 -> ${at360.x},${at360.y}`);
check('rotation 90 sends board +X to surface +Y',
  near(boardToSurface({ ...mk('floor', 'up'), rotation: 90 }, 10, 0).x, 0, 1e-12) &&
  near(boardToSurface({ ...mk('floor', 'up'), rotation: 90 }, 10, 0).y, 10, 1e-12));

console.log('\n[9] rect cutouts reject non-orthogonal rotations');
const skew = compileBoard({ ...placements[0], rotation: 45 }, board!, BOX, LID);
check('45 deg produces an error', skew.errors.length === 1, JSON.stringify(skew.errors));
check('standoffs still emitted at 45 deg', skew.standoffs.length === 4);
const quarter = compileBoard({ ...placements[0], rotation: 90 }, board!, BOX, LID);
check('90 deg swaps the rect dimensions',
  quarter.errors.length === 0 && quarter.cutouts[0].kind === 'rect' &&
  near((quarter.cutouts[0] as {width:number}).width, 26.9) &&
  near((quarter.cutouts[0] as {height:number}).height, 79.6));

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
