import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FT, CEILING, WALL, rooms, floorPatches, walls, windows, doors, railings } from './plan.js';
import { lib, worldUV } from './lib/materials.js';

// Builds the architectural shell from plan.js: floors, walls, windows, doors, sliders, railings, ceiling, skirting.
// Returns { group, ceiling, colliders } — colliders are plan-feet rects the walker can't enter.

const m = (ft) => ft * FT;
const H = m(CEILING);

function boxGeom(x1, y1, x2, y2, z1, z2) {
  // plan-ft rect + height range in metres -> world-space box geometry
  const g = new THREE.BoxGeometry(m(x2 - x1), z2 - z1, m(y2 - y1));
  g.translate(m((x1 + x2) / 2), (z1 + z2) / 2, m((y1 + y2) / 2));
  return g;
}

function meshFrom(geoms, mat, size, { shadow = true } = {}) {
  const prepared = geoms.map((g) => worldUV(g, size));
  const mesh = new THREE.Mesh(mergeGeometries(prepared, false), mat);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

function box(mat, x1, y1, x2, y2, z1, z2) {
  const mesh = new THREE.Mesh(boxGeom(x1, y1, x2, y2, z1, z2), mat);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

const isVertical = (r) => (r.x2 - r.x1) < (r.y2 - r.y1); // runs N-S in plan

function roomSideOf(r) {
  // which side of a thin wall rect the room interior is on (for windows): returns unit normal in plan
  const room = rooms[r.room];
  if (isVertical(r)) return { x: room.x1 >= r.x2 - 0.01 ? 1 : -1, y: 0 };
  return { x: 0, y: room.y1 >= r.y2 - 0.01 ? 1 : -1 };
}

export function buildShell() {
  const L = lib();
  const group = new THREE.Group();
  group.name = 'shell';
  const colliders = [];

  // ---------- floors ----------
  const byMat = {};
  const floorRects = [...Object.values(rooms), ...floorPatches];
  for (const r of floorRects) {
    const z = r.outdoor ? -0.04 : 0;
    const g = new THREE.PlaneGeometry(m(r.x2 - r.x1), m(r.y2 - r.y1));
    g.rotateX(-Math.PI / 2);
    g.translate(m((r.x1 + r.x2) / 2), z, m((r.y1 + r.y2) / 2));
    (byMat[r.floor] ||= []).push(g);
  }
  for (const [k, gs] of Object.entries(byMat)) {
    const mesh = meshFrom(gs, L[k], L[k].userData.worldSize, { shadow: false });
    mesh.name = 'floor-' + k;
    group.add(mesh);
  }
  // structural slab below everything (seen from balconies)
  const slabGeoms = floorRects.map((r) => boxGeom(r.x1, r.y1, r.x2, r.y2, -0.3, r.outdoor ? -0.045 : -0.005));
  const slab = meshFrom(slabGeoms, L.slabEdge, 1, { shadow: true });
  group.add(slab);

  // ---------- walls ----------
  const wallGeoms = walls.map((w) => boxGeom(w.x1, w.y1, w.x2, w.y2, 0, H));
  for (const w of walls) colliders.push(w);

  // windows: wall below sill + above head, frame, glass, stone sill
  for (const w of windows) {
    wallGeoms.push(boxGeom(w.x1, w.y1, w.x2, w.y2, 0, m(w.sill)));
    wallGeoms.push(boxGeom(w.x1, w.y1, w.x2, w.y2, m(w.head), H));
    colliders.push(w);
    group.add(windowFrame(w, L));
  }

  // doors: header above opening + frame/leaf
  for (const d of doors) {
    wallGeoms.push(boxGeom(d.x1, d.y1, d.x2, d.y2, m(d.head), H));
    const { obj, blocks } = d.leaf.type === 'slider' ? slider(d, L) : hinged(d, L);
    group.add(obj);
    colliders.push(...blocks);
  }

  const wallMesh = meshFrom(wallGeoms, L.wall, L.wall.userData.worldSize);
  wallMesh.name = 'walls';
  group.add(wallMesh);

  // ---------- railings ----------
  for (const r of railings) {
    group.add(railing(r, L));
    const t = 0.15;
    colliders.push({ x1: Math.min(r.x1, r.x2) - t, y1: Math.min(r.y1, r.y2) - t, x2: Math.max(r.x1, r.x2) + t, y2: Math.max(r.y1, r.y2) + t });
  }

  // ---------- skirting (only where a wall actually backs the room edge) ----------
  group.add(skirting(L));

  // ---------- ceiling ----------
  const ceilGeoms = floorRects.map((r) => {
    const g = new THREE.PlaneGeometry(m(r.x2 - r.x1), m(r.y2 - r.y1));
    g.rotateX(Math.PI / 2);
    g.translate(m((r.x1 + r.x2) / 2), H, m((r.y1 + r.y2) / 2));
    return g;
  });
  const ceiling = meshFrom(ceilGeoms, L.ceiling, L.ceiling.userData.worldSize, { shadow: true });
  ceiling.name = 'ceiling';
  group.add(ceiling);
  // roof slab above ceiling so sunlight doesn't leak through thin planes
  const roof = meshFrom(floorRects.map((r) => boxGeom(r.x1 - 0.3, r.y1 - 0.3, r.x2 + 0.3, r.y2 + 0.3, H + 0.005, H + 0.3)), L.slabEdge, 1);
  roof.name = 'roof';
  roof.material = L.slabEdge;
  group.add(roof);

  return { group, ceiling, roof, colliders };
}

// ---------------------------------------------------------------------------
function windowFrame(w, L) {
  const g = new THREE.Group();
  const vert = isVertical(w);
  const len = vert ? w.y2 - w.y1 : w.x2 - w.x1;
  const cx = (w.x1 + w.x2) / 2, cy = (w.y1 + w.y2) / 2;
  const z1 = m(w.sill), z2 = m(w.head), hh = z2 - z1;
  const prof = 0.055, depth = 0.07;
  // build along local X, then rotate for N-S walls
  const add = (mesh) => { g.add(mesh); return mesh; };
  const bar = (lx, lz, wx, wz) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(wx, wz, depth), L.frame);
    b.position.set(lx, lz, 0);
    b.castShadow = true;
    return add(b);
  };
  const W = m(len);
  bar(0, z1 + prof / 2, W, prof);
  bar(0, z2 - prof / 2, W, prof);
  bar(-W / 2 + prof / 2, z1 + hh / 2, prof, hh);
  bar(W / 2 - prof / 2, z1 + hh / 2, prof, hh);
  const panes = W > 1.2 ? 3 : (W > 0.8 ? 2 : 1);
  for (let i = 1; i < panes; i++) bar(-W / 2 + (W * i) / panes, z1 + hh / 2, prof * 0.8, hh);
  // high toilet ventilators get obscure (frosted) glass, everything else clear
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - prof, hh - prof), w.sill >= 5 ? L.frosted : L.glass);
  glass.position.set(0, z1 + hh / 2, 0);
  glass.renderOrder = 2;
  add(glass);
  // stone sill on the room side (skip for high ventilators)
  if (w.sill < 5) {
    const n = roomSideOf(w);
    const s = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, 0.025, m(WALL) / 2 + 0.05), new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.35 }));
    const off = (m(WALL) / 4 + 0.025) * (vert ? n.x : n.y);
    s.position.set(0, z1 + 0.012, off);
    s.receiveShadow = s.castShadow = true;
    add(s);
  }
  g.position.set(m(cx), 0, m(cy));
  if (vert) g.rotation.y = Math.PI / 2;
  return g;
}

function hinged(d, L) {
  const g = new THREE.Group();
  const vert = isVertical(d);
  const blocks = [];
  const t = m(WALL);
  const frameW = 0.045;
  const len = m(vert ? d.y2 - d.y1 : d.x2 - d.x1);
  const head = m(d.head);
  // jamb lining + architraves (built along local X; local Z = wall thickness)
  const lin = (lx, ly, wx, wy, wz, mat = L.doorTrim) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(wx, wy, wz), mat);
    b.position.set(lx, ly, 0);
    b.castShadow = b.receiveShadow = true;
    g.add(b);
    return b;
  };
  lin(-len / 2 + frameW / 2, head / 2, frameW, head, t + 0.01);
  lin(len / 2 - frameW / 2, head / 2, frameW, head, t + 0.01);
  lin(0, head - frameW / 2, len, frameW, t + 0.01);
  for (const side of [-1, 1]) {
    const a = 0.07, th = 0.018, zz = side * (t / 2 + th / 2);
    lin(-len / 2 - a / 2 + frameW, (head + a) / 2, a, head + a, th).position.z = zz;
    lin(len / 2 + a / 2 - frameW, (head + a) / 2, a, head + a, th).position.z = zz;
    lin(0, head + a / 2, len + 2 * a - 2 * frameW, a, th).position.z = zz;
  }

  // leaf
  const lw = len - 2 * frameW - 0.006, lh = head - frameW - 0.012, lt = 0.04;
  const leaf = new THREE.Group();
  const panelMat = d.leaf.main ? L.doorTrim : L.doorWood;
  // veneer at real scale with the grain running vertically (the texture's grain runs along u, so swap u/v)
  const slabGeom = worldUV(new THREE.BoxGeometry(lw, lh, lt), 0.9);
  for (const name of ['uv', 'uv1']) {
    const a = slabGeom.attributes[name];
    for (let i = 0; i < a.count; i++) { const u = a.getX(i); a.setXY(i, a.getY(i), u); }
  }
  const slabMesh = new THREE.Mesh(slabGeom, panelMat);
  slabMesh.position.set(lw / 2, lh / 2 + 0.008, 0);
  slabMesh.castShadow = slabMesh.receiveShadow = true;
  leaf.add(slabMesh);
  // grooves / panel detailing
  const grooveMat = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.7 });
  const grooves = d.leaf.main ? 5 : 3;
  for (let i = 1; i < grooves; i++) {
    for (const s of [-1, 1]) {
      const gr = new THREE.Mesh(new THREE.BoxGeometry(lw * 0.82, 0.006, 0.004), grooveMat);
      gr.position.set(lw / 2, 0.008 + (lh * i) / grooves, s * (lt / 2 + 0.001));
      leaf.add(gr);
    }
  }
  // lever handles both sides
  for (const s of [-1, 1]) {
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.01, 24), L.steel);
    rose.rotation.x = Math.PI / 2;
    rose.position.set(lw - 0.07, 1.0, s * (lt / 2 + 0.005));
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.018, 0.018), L.steel);
    lever.position.set(lw - 0.11, 1.0, s * (lt / 2 + 0.03));
    leaf.add(rose, lever);
  }

  // hinge position & swing in plan coordinates
  const c = { x: (d.x1 + d.x2) / 2, y: (d.y1 + d.y2) / 2 };
  const hingeEnd = d.leaf.hinge; // 'x1'|'x2'|'y1'|'y2'
  const pivot = { x: c.x, y: c.y };
  const freeDir = { x: 0, y: 0 };
  const fw = frameW / FT;
  if (vert) { pivot.y = hingeEnd === 'y1' ? d.y1 + fw : d.y2 - fw; freeDir.y = hingeEnd === 'y1' ? 1 : -1; }
  else { pivot.x = hingeEnd === 'x1' ? d.x1 + fw : d.x2 - fw; freeDir.x = hingeEnd === 'x1' ? 1 : -1; }
  const n = { N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 } }[d.leaf.into];
  const faceOff = (WALL / 2 - lt / FT / 2);
  pivot.x += n.x * faceOff; pivot.y += n.y * faceOff;
  const a = THREE.MathUtils.degToRad(d.leaf.open);
  const dir = { x: freeDir.x * Math.cos(a) + n.x * Math.sin(a), y: freeDir.y * Math.cos(a) + n.y * Math.sin(a) };
  leaf.position.set(m(pivot.x), 0, m(pivot.y));
  leaf.rotation.y = Math.atan2(-dir.y, dir.x);
  // leaf outlives the rotated frame group, so add it in world space via a wrapper
  const wrap = new THREE.Group();
  g.position.set(m(c.x), 0, m(c.y));
  if (vert) g.rotation.y = Math.PI / 2;
  wrap.add(g, leaf);
  if (d.leaf.open < 5) blocks.push({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 });
  else {
    // leaf footprint as a thin collider
    const ex = pivot.x + dir.x * (lw / FT), ey = pivot.y + dir.y * (lw / FT);
    blocks.push({ x1: Math.min(pivot.x, ex) - 0.1, y1: Math.min(pivot.y, ey) - 0.1, x2: Math.max(pivot.x, ex) + 0.1, y2: Math.max(pivot.y, ey) + 0.1 });
  }
  return { obj: wrap, blocks };
}

function slider(d, L) {
  const g = new THREE.Group();
  const vert = isVertical(d);
  const len = m(vert ? d.y2 - d.y1 : d.x2 - d.x1);
  const head = m(d.head);
  const prof = 0.05, depth = 0.06;
  const bar = (parent, lx, ly, lz, wx, wy) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(wx, wy, depth), L.frame);
    b.position.set(lx, ly, lz);
    b.castShadow = true;
    parent.add(b);
  };
  // outer frame
  bar(g, 0, prof / 2, 0, len, prof);
  bar(g, 0, head - prof / 2, 0, len, prof);
  bar(g, -len / 2 + prof / 2, head / 2, 0, prof, head);
  bar(g, len / 2 - prof / 2, head / 2, 0, prof, head);
  // two sashes: one fixed at -x half, one slid over it (open). Wide openings get 4 panels (2 stacked each side).
  const panels = len > 2 ? 4 : 2;
  const pw = (len - 2 * prof) / panels + 0.04;
  const ph = head - 2 * prof;
  const sash = (x, z) => {
    const s = new THREE.Group();
    bar(s, 0, ph / 2, 0, pw, prof);
    bar(s, 0, -ph / 2, 0, pw, prof);
    bar(s, -pw / 2 + prof / 2, 0, 0, prof, ph);
    bar(s, pw / 2 - prof / 2, 0, 0, prof, ph);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(pw - prof, ph - prof), L.glass);
    gl.renderOrder = 2;
    s.add(gl);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.25, 0.03), L.steel);
    handle.position.set(pw / 2 - 0.05, 0, 0.04);
    s.add(handle);
    s.position.set(x, prof + ph / 2, z);
    g.add(s);
  };
  const x0 = -len / 2 + prof;
  if (panels === 2) {
    sash(x0 + pw / 2, -0.035);
    sash(x0 + pw / 2 + 0.05, 0.035); // slid open over the fixed one
  } else {
    sash(x0 + pw / 2, -0.035);
    sash(x0 + pw / 2 + 0.05, 0.035);
    sash(len / 2 - prof - pw / 2, -0.035);
    sash(len / 2 - prof - pw / 2 - 0.05, 0.035);
  }
  g.position.set(m((d.x1 + d.x2) / 2), 0, m((d.y1 + d.y2) / 2));
  if (vert) g.rotation.y = Math.PI / 2;
  // stacked panels block their ends only
  const frac = (pw + 0.05) / len;
  const blocks = [];
  const span = vert ? d.y2 - d.y1 : d.x2 - d.x1;
  const b = (s, e) => vert ? { x1: d.x1, x2: d.x2, y1: d.y1 + s * span, y2: d.y1 + e * span } : { y1: d.y1, y2: d.y2, x1: d.x1 + s * span, x2: d.x1 + e * span };
  blocks.push(b(0, frac));
  if (panels === 4) blocks.push(b(1 - frac, 1));
  return { obj: g, blocks };
}

function railing(r, L) {
  const g = new THREE.Group();
  const len = m(Math.hypot(r.x2 - r.x1, r.y2 - r.y1));
  const h = m(3.5);
  const glassMat = L.glass.clone();
  glassMat.opacity = 0.1;
  glassMat.color = new THREE.Color(0xf2f6f5);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(len, h - 0.12, 0.012), glassMat);
  glass.position.y = (h - 0.12) / 2 + 0.06;
  glass.renderOrder = 2;
  g.add(glass);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len + 0.04, 16), L.steel);
  rail.rotation.z = Math.PI / 2;
  rail.position.y = h;
  rail.castShadow = true;
  g.add(rail);
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.06), L.frame);
  shoe.position.y = 0.0;
  g.add(shoe);
  for (let i = 0; i <= Math.max(1, Math.round(len / 1.2)); i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, 0.04), L.steel);
    p.position.set(-len / 2 + (len * i) / Math.max(1, Math.round(len / 1.2)), h / 2, 0.03);
    p.castShadow = true;
    g.add(p);
  }
  g.position.set(m((r.x1 + r.x2) / 2), -0.04, m((r.y1 + r.y2) / 2));
  g.rotation.y = -Math.atan2(r.y2 - r.y1, r.x2 - r.x1);
  return g;
}

function skirting(L) {
  const solid = [...walls, ...windows.filter((w) => w.sill > 0)];
  const inWall = (x, y) => solid.some((w) => x > w.x1 && x < w.x2 && y > w.y1 && y < w.y2);
  const geoms = [];
  const hgt = 0.09, th = 0.012, step = 0.1, eps = 0.06;
  for (const r of Object.values(rooms)) {
    if (r.outdoor || r.floor === 'bathtile') continue;
    const edges = [
      { a: [r.x1, r.y1], b: [r.x2, r.y1], out: [0, -1] },
      { a: [r.x1, r.y2], b: [r.x2, r.y2], out: [0, 1] },
      { a: [r.x1, r.y1], b: [r.x1, r.y2], out: [-1, 0] },
      { a: [r.x2, r.y1], b: [r.x2, r.y2], out: [1, 0] },
    ];
    for (const e of edges) {
      const horiz = e.a[1] === e.b[1];
      const L0 = horiz ? e.a[0] : e.a[1], L1 = horiz ? e.b[0] : e.b[1];
      let run = null;
      const flush = (end) => {
        if (run !== null && end - run > 0.15) {
          const ox = e.out[0] * (th / 2) / FT, oy = e.out[1] * (th / 2) / FT;
          const g = horiz
            ? boxGeom(run, e.a[1] - oy - th / FT / 2, end, e.a[1] - oy + th / FT / 2, 0, hgt)
            : boxGeom(e.a[0] - ox - th / FT / 2, run, e.a[0] - ox + th / FT / 2, end, 0, hgt);
          geoms.push(g);
        }
        run = null;
      };
      for (let s = L0; s <= L1 + 1e-6; s += step) {
        const px = horiz ? s : e.a[0] + e.out[0] * eps;
        const py = horiz ? e.a[1] + e.out[1] * eps : s;
        const solidHere = inWall(px, py);
        if (solidHere && run === null) run = s;
        if (!solidHere && run !== null) flush(s);
      }
      flush(L1);
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(geoms), L.skirting);
  mesh.receiveShadow = true;
  mesh.name = 'skirting';
  return mesh;
}
