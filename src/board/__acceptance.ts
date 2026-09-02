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
import { compileBoard, convertFrame, isMirrored, targetSurface, boardToSurface, wallFacedBy, boardZToWorldZ } from './compile';
import type { BoardEdge, BoardPlacement, BoxObjectParams } from './types';
import { boardEnvelope, objectEnvelope, envelopesOverlap } from './envelopes';
import { parseObjectsText } from './parseObjects';

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
// Exact, not approximate: quarter turns are integer arithmetic on the
// coordinates, so there is no trigonometry to leak 1e-16 of error.
check('rotation 0 and 360 agree EXACTLY',
  at0.x === at360.x && at0.y === at360.y,
  `0 -> ${at0.x},${at0.y}  360 -> ${at360.x},${at360.y}`);
check('rotation 90 sends board +X to surface +Y, exactly',
  boardToSurface({ ...mk('floor', 'up'), rotation: 90 }, 10, 0).y === 10);

console.log('\n[9] rotation is restricted to quarter turns');
const badRot = parseBoardsText('floor, 0, 0, 45, up, 6, 6, 2.6, 8, 1, X');
check('placement parser rejects 45', badRot.errors.length === 1 && badRot.placements.length === 0,
  JSON.stringify(badRot.errors));
const skew = compileBoard({ ...placements[0], rotation: 45 }, board!, BOX, LID);
check('compiler rejects 45 outright, emitting nothing',
  skew.errors.length === 1 && skew.standoffs.length === 0 && skew.cutouts.length === 0);
const quarter = compileBoard({ ...placements[0], rotation: 90 }, board!, BOX, LID);
check('90 deg swaps the rect dimensions',
  quarter.errors.length === 0 && quarter.cutouts[0].kind === 'rect' &&
  near((quarter.cutouts[0] as { width: number }).width, 26.9) &&
  near((quarter.cutouts[0] as { height: number }).height, 79.6));

// -------------------------------------------------------------- connectors
const CONNECTOR_BOARD = `
[board]
Name, Connector rig
Size, 50, 30
Thickness, 1.6

[mounts]
2.5, 2.5, 2.2

[edges]      // Edge, Pos, Z, SizeAlong, SizeZ, CornerRadius, Clearance
y-, 25, 3.1, 9, 3.5, 0.5, 0.4
`;
const rig = parseBoardFile(CONNECTOR_BOARD);

console.log('\n[10] the [edges] section parses');
check('no errors', rig.errors.length === 0, JSON.stringify(rig.errors));
check('one edge cutout on y-', rig.board!.edges.length === 1 && rig.board!.edges[0].edge === 'y-');
const badEdge = parseBoardFile('[board]\nName, x\nSize, 1, 1\n[mounts]\n0,0,1\n[edges]\nz+, 1,1,1,1,0,0\n');
check('rejects an unknown edge name', badEdge.errors.some((e) => /Edge one of/.test(e.reason)));

console.log('\n[11] ACCEPTANCE: connector through a wall, hand-computed');
// floor, components up, rotation 0, board 0,0 at floor user (10,20), standoffs 6 high.
// y- edge faces the front wall. Edge point (25,0) -> floor user (35,20)
//   -> world (-25, -18.5) -> front-wall along = 62.5-2.5-(-25) = 85
// z: board sits at floorThickness+height = 8.5; components up so board Z runs
//   with world Z from the lower face: 8.5 + 3.1 = 11.6, less floorThickness = 9.1
const rigPlace: BoardPlacement = {
  surface: 'floor', x: 10, y: 20, rotation: 0, components: 'up',
  standoffHeight: 6, standoffOd: 6, standoffHoleDia: 2.6, standoffHoleDepth: 8,
  baseFillet: 1, boardName: 'Connector rig',
};
const rigOut = compileBoard(rigPlace, rig.board!, BOX, LID);
check('no compile errors', rigOut.errors.length === 0, JSON.stringify(rigOut.errors));
const conn = rigOut.cutouts[0];
check('cuts the FRONT wall', conn.surface === 'front', `got ${conn.surface}`);
check('along the wall at 85', near(conn.x, 85, 1e-9), `got ${conn.x}`);
check('9.1 above the interior floor', near(conn.y, 9.1, 1e-9), `got ${conn.y}`);
check('grown by clearance to 9.8 x 4.3',
  conn.kind === 'rect' && near((conn as { width: number }).width, 9.8, 1e-9) &&
  near((conn as { height: number }).height, 4.3, 1e-9));
// Clearance changes size only. A CornerRadius of 0.5 stays 0.5, and crucially
// a CornerRadius of 0 stays square no matter what the clearance is.
check('corner radius is NOT grown by clearance',
  near((conn as { cornerRadius: number }).cornerRadius, 0.5, 1e-9),
  `got ${(conn as { cornerRadius: number }).cornerRadius}`);
const sharp = parseBoardFile(CONNECTOR_BOARD.replace('9, 3.5, 0.5, 0.4', '9, 3.5, 0, 0.4'));
const sharpOut = compileBoard(rigPlace, sharp.board!, BOX, LID);
check('CornerRadius 0 with clearance 0.4 stays square',
  (sharpOut.cutouts[0] as { cornerRadius: number }).cornerRadius === 0,
  `got ${(sharpOut.cutouts[0] as { cornerRadius: number }).cornerRadius}`);

console.log('\n[12] ACCEPTANCE: same connector, board turned 90 deg');
// direction (0,-1) turned 90 CCW is (1,0) -> world +X -> the right wall.
// Edge point (25,0) -> rotated (0,25) -> floor user (10,45) -> world (-50, 6.5)
//   -> right-wall along = 41-2.5-6.5 = 32. Height is unchanged.
const turned = compileBoard({ ...rigPlace, rotation: 90 }, rig.board!, BOX, LID);
check('cuts the RIGHT wall', turned.cutouts[0].surface === 'right', `got ${turned.cutouts[0].surface}`);
check('along the wall at 32', near(turned.cutouts[0].x, 32, 1e-9), `got ${turned.cutouts[0].x}`);
check('height unchanged at 9.1', near(turned.cutouts[0].y, 9.1, 1e-9));

console.log('\n[13] ACCEPTANCE: connector on a lid-mounted board');
// lid + components up is the mirrored case. Board x- edge, mirrored, becomes
// user +X, which on the lid is world -X -> the left wall.
// Edge point (0,15) -> lid user (104.2, 50.5) -> world (-46.9, 14.7)
//   -> left-wall along = 14.7+41-2.5 = 53.2
// z: plate underside sits on the rim at 76; standoffs hang 2.6, so the board's
//   UPPER (component) face is at 73.4. Board Z 3.1 is 1.5 above that: 74.9,
//   less floorThickness = 72.4
const lidRig = parseBoardFile(CONNECTOR_BOARD.replace('y-, 25,', 'x-, 15,').replace('Size, 50, 30', 'Size, 96.6, 30.1'));
const lidOut = compileBoard(
  { ...placements[0], standoffHeight: 2.6 }, lidRig.board!, BOX, LID
);
const lidConn = lidOut.cutouts.find((c) => c.surface === 'left');
check('cuts the LEFT wall', !!lidConn);
check('along the wall at 53.2', !!lidConn && near(lidConn.x, 53.2, 1e-9), `got ${lidConn?.x}`);
check('72.4 above the interior floor', !!lidConn && near(lidConn.y, 72.4, 1e-9), `got ${lidConn?.y}`);

console.log('\n[14] which wall each edge faces');
const wallOf = (surface: 'floor' | 'lid', components: 'up' | 'down', rot: number, edge: BoardEdge) =>
  wallFacedBy({ ...mk(surface, components), rotation: rot }, edge, ((rot / 90) % 4 + 4) % 4);
check('floor+up, no rotation: x+ right, x- left, y+ back, y- front',
  wallOf('floor', 'up', 0, 'x+') === 'right' && wallOf('floor', 'up', 0, 'x-') === 'left' &&
  wallOf('floor', 'up', 0, 'y+') === 'back' && wallOf('floor', 'up', 0, 'y-') === 'front');
// At rotation 0 the lid's mirrored user frame and the mirrored board cancel
// exactly, so a lid board faces the SAME walls as a floor board -- which is
// right: "components up, rotation 0" fixes the board's orientation in the
// world regardless of what it is screwed to.
check('lid+up at rotation 0 faces the same walls as floor+up',
  wallOf('lid', 'up', 0, 'x+') === 'right' && wallOf('lid', 'up', 0, 'x-') === 'left' &&
  wallOf('lid', 'up', 0, 'y+') === 'back' && wallOf('lid', 'up', 0, 'y-') === 'front');
// They do NOT cancel once rotated. Rotation is CCW in the MOUNTING SURFACE's
// frame, and the lid frame is mirrored in world, so the same rotation number
// spins a lid board the opposite way round. Pinned here so it stays deliberate.
check('a quarter turn spins a lid board opposite to a floor board',
  wallOf('floor', 'up', 90, 'y-') === 'right' && wallOf('lid', 'up', 90, 'y-') === 'left');
check('quarter turns walk y- around all four walls',
  wallOf('floor', 'up', 0, 'y-') === 'front' && wallOf('floor', 'up', 90, 'y-') === 'right' &&
  wallOf('floor', 'up', 180, 'y-') === 'back' && wallOf('floor', 'up', 270, 'y-') === 'left');

console.log('\n[15] board Z -> world Z for all four mountings');
const zAt = (surface: 'floor' | 'lid', components: 'up' | 'down', boardZ: number) =>
  boardZToWorldZ({ ...mk(surface, components), standoffHeight: 6 }, rig.board!, boardZ, BOX);
check('floor+up: lower face on the standoff at 8.5', near(zAt('floor', 'up', 0), 8.5, 1e-9));
check('floor+up: component face 1.6 higher', near(zAt('floor', 'up', 1.6), 10.1, 1e-9));
check('floor+down: component face on the standoff at 8.5', near(zAt('floor', 'down', 1.6), 8.5, 1e-9));
check('floor+down: board Z grows downward', near(zAt('floor', 'down', 0), 10.1, 1e-9));
check('lid+up: component face on the standoff at 70', near(zAt('lid', 'up', 1.6), 70, 1e-9));
check('lid+down: non-component face on the standoff at 70', near(zAt('lid', 'down', 0), 70, 1e-9));


// ------------------------------------------------------- clearance envelopes
console.log('\n[16] object envelopes, hand-computed');
const obj = (line: string) => {
  const { objects, errors } = parseObjectsText(line);
  if (errors.length) throw new Error(JSON.stringify(errors));
  return objectEnvelope(objects[0], BOX, LID);
};
const near3 = (a: number[], b: number[]) => a.every((v, i) => near(v, b[i], 1e-9));

// floor: world XY = (-60 + x, -38.5 + y); Z starts at the floor's top face 2.5
const bat = obj('floor, 30, 20, 40, 25, 15, 0, LiPo battery');
check('floor object min', near3(bat.min, [-50, -31, 2.5]), JSON.stringify(bat.min));
check('floor object max', near3(bat.max, [-10, -6, 17.5]), JSON.stringify(bat.max));
check('floor object draws in the box frame', bat.frame === 'box');

// left wall: interior face at x = -60, grows +X; along-wall runs +Y;
// height is measured UP FROM THE INTERIOR FLOOR, so z = 2.5 + y
const buz = obj('left, 45, 22, 30, 18, 10, 2, Buzzer');
check('wall object honours Offset (2mm off the wall)', near(buz.min[0], -58, 1e-9), `${buz.min[0]}`);
check('wall object depth reaches 12mm in', near(buz.max[0], -48, 1e-9), `${buz.max[0]}`);
check('wall object spans the wall correctly', near3([buz.min[1], buz.max[1]], [-8.5, 21.5]));
check('wall object height is above the INTERIOR floor', near3([buz.min[2], buz.max[2]], [15.5, 33.5]),
  `${buz.min[2]}..${buz.max[2]}`);

console.log('\n[17] board envelopes use Height / HeightBelow');
const tall = parseBoardFile(`[board]
Name, Stack
Size, 50, 30
Thickness, 1.6
Height, 14
HeightBelow, 2
[mounts]
3, 3, 2.2
`);
check('Height and HeightBelow parse', tall.errors.length === 0 &&
  tall.board!.height === 14 && tall.board!.heightBelow === 2, JSON.stringify(tall.errors));
check('Height below Thickness is rejected',
  parseBoardFile('[board]\nName,x\nSize,10,10\nThickness,1.6\nHeight,1\n[mounts]\n1,1,1\n')
    .errors.some((e) => /Height/.test(e.reason)));

// floor, components up, 6mm standoffs: the board's underside sits at 2.5+6=8.5,
// HeightBelow hangs 2 under that, Height 14 rises from it.
const fe = boardEnvelope({ ...mk('floor', 'up'), x: 10, y: 20, standoffHeight: 6 }, tall.board!, BOX, LID);
check('floor board footprint', near3([...fe.min.slice(0, 2), ...fe.max.slice(0, 2)], [-50, -18.5, 0, 11.5]),
  JSON.stringify([fe.min, fe.max]));
check('floor board spans 6.5 .. 22.5 in Z', near3([fe.min[2], fe.max[2]], [6.5, 22.5]),
  `${fe.min[2]}..${fe.max[2]}`);

// lid, components up, 2.6mm standoffs: the plate underside rests on the rim at
// z=76, so the board's COMPONENT face is at 73.4 and Height rises toward the lid.
const shallow = parseBoardFile(`[board]
Name, OLEDish
Size, 50, 30
Thickness, 1.6
Height, 5
HeightBelow, 2
[mounts]
3, 3, 2.2
`);
const le = boardEnvelope({ ...mk('lid', 'up'), x: 60, y: 30, standoffHeight: 2.6 }, shallow.board!, BOX, LID);
check('lid board draws in the lid frame', le.frame === 'lid');
// world 69.8 .. 76.8, less the lid frame shift of (76 - 4) = 72
check('lid board Z is converted to lid-local', near3([le.min[2], le.max[2]], [-2.2, 4.8]),
  `${le.min[2]}..${le.max[2]}`);

console.log('\n[18] interference detection');
check('the battery clashes with a board sat on top of it',
  envelopesOverlap(bat, boardEnvelope({ ...mk('floor','up'), x: 40, y: 20, standoffHeight: 6 }, tall.board!, BOX, LID)));
check('the wall buzzer does not clash with that board',
  !envelopesOverlap(buz, boardEnvelope({ ...mk('floor','up'), x: 40, y: 20, standoffHeight: 6 }, tall.board!, BOX, LID)));
check('touching faces do not count as a clash',
  !envelopesOverlap(obj('floor, 10, 10, 20, 20, 10, 0, A'), obj('floor, 30, 10, 20, 20, 10, 0, B')));
check('a 1mm overlap does count',
  envelopesOverlap(obj('floor, 10, 10, 20, 20, 10, 0, A'), obj('floor, 29, 10, 20, 20, 10, 0, B')));

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
