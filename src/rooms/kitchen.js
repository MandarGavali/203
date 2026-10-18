// Piece: kitchen — Kitchen 10'x13' (x 22–32, y 0.5–13.5) + Wash 6'x7' (x 15.5–21.5, y 0.5–7.5) + utility ledge (x 15–21.5, y −2.5–0).
// All coordinates are plan feet (x east, y south, h up).
//
// What's where:
//   KITCHEN  L-counter (2'10" high, 2' deep, black-galaxy granite with 40 mm rounded front edge):
//              N run x 22–30 (front y 2.5) · E run x 30–32, y 0.5–7.8 (front x 30). Walnut shutters, matte-black bar handles,
//              recessed charcoal plinth. Sink (SS single bowl + ribbed drainboard on its W) x 22.5–24.8; glass 4-burner hob x 26.7–28.6.
//              Slim chimney hood over the hob; short duct up into a plasterboard bulkhead (x 23.45–29.55, 7.5–10 ft) with a louvred grille.
//              Utensil rail on the backsplash x 29.7-31.7; wire dish rack on the drainboard; sponge caddy at x 22.1-22.5.
//              Wall cabinets (white lacquer, 4.75–7.6 ft): N wall x 22–23.45 and x 29.55–32, E wall y 1.65–7.8. Subway-tile backsplash.
//              S counter x 24.9–32, y 11.8–13.5 (storage/breakfast) + microwave, fruit bowl, two floating shelves with jars, wall clock.
//   WASH     W wall: utility counter y 1.0–6.6 (washer under it at y 1.25–3.2, SS utility sink y 4.3–5.8, wall tap), shelf with cleaners.
//              Wall tiles to 7' on W and E walls. Laundry basket + bucket on E side.
//   LEDGE    aluminium clothes-drying rack with laundry + two potted plants.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { normalCanvasFromHeight } from '../lib/normalmap.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

const F = 0.3048;
const m = (ft) => ft * F;

export const views = {
  'kitchen-wash':  { pos: [20.9, 7.2], look: [16.6, 1.8], lookH: 3.0, fov: 72 },
  'kitchen-a':     { pos: [23.5, 12.6], look: [29, 2], lookH: 4.3 },
  'kitchen-c':     { pos: [25.0, 3.4], look: [31, 12.6], lookH: 3.6 },
  'kitchen-hob':   { pos: [25.6, 6.2], look: [27.8, 0.6], lookH: 3.6, fov: 58 },
  'kitchen-ledge': { pos: [18.5, 6.9], look: [18.5, -2.2], lookH: 3.0, fov: 70 },
};

// ---------------------------------------------------------------- procedural textures
let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}
// greyscale height canvas -> tangent-space normal map
function normalFrom(hc, strength = 2) {
  return toTex(normalCanvasFromHeight(hc, strength), false);
}

// black-galaxy granite: near-black grain with sparse bronze and quartz flecks
function graniteTex() {
  const S = 1024, c = canvas(S), g = c.getContext('2d');
  const id = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 16 + rnd() * 10; // #101010–#1a1a1a, very slightly warm
    id.data[i * 4] = v + 1; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v - 1; id.data[i * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  const dot = (x, y, r, col) => {
    g.fillStyle = col;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      if (x + ox < -r || x + ox > S + r || y + oy < -r || y + oy > S + r) continue;
      g.beginPath(); g.ellipse(x + ox, y + oy, r, r * (0.5 + rnd() * 0.6), rnd() * 3, 0, Math.PI * 2); g.fill();
    }
  };
  for (let i = 0; i < 6500; i++) { const v = 40 + rnd() * 30; dot(rnd() * S, rnd() * S, 0.6 + rnd() * 2.2, `rgba(${v},${v},${v + 2},${0.5 + rnd() * 0.5})`); }
  for (let i = 0; i < 800; i++) { const v = 140 + rnd() * 60; dot(rnd() * S, rnd() * S, 0.5 + rnd() * 1.4, `rgba(${v},${v},${v + 4},${0.6 + rnd() * 0.4})`); }
  for (let i = 0; i < 220; i++) dot(rnd() * S, rnd() * S, 0.4 + rnd() * 0.9, `rgba(215,215,212,${0.5 + rnd() * 0.5})`);
  return toTex(c);
}

// tile sheet: tw x th px tiles on an S x S canvas, optional half-bond; returns {map, normalMap, roughnessMap}
function tileTex({ S = 1024, tw, th, bond = false, base, vary = 6, grout, groutPx = 3, bevel = 5, mottle = 0, rough = [0.15, 0.85] }) {
  const c = canvas(S), g = c.getContext('2d');
  const hc = canvas(S), hg = hc.getContext('2d');
  const rc = canvas(S), rg = rc.getContext('2d');
  g.fillStyle = grout; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#000'; hg.fillRect(0, 0, S, S);
  const gr = Math.round(rough[1] * 255); rg.fillStyle = `rgb(0,${gr},0)`; rg.fillRect(0, 0, S, S);
  const tr = Math.round(rough[0] * 255);
  const rows = Math.round(S / th), cols = Math.round(S / tw);
  for (let r = 0; r < rows; r++) {
    const off = bond && r % 2 ? tw / 2 : 0;
    for (let k = -1; k <= cols; k++) {
      const x = k * tw + off + groutPx / 2, y = r * th + groutPx / 2, w = tw - groutPx, h = th - groutPx;
      const d = (rnd() - 0.5) * vary;
      g.fillStyle = `rgb(${base[0] + d},${base[1] + d},${base[2] + d})`;
      g.fillRect(x, y, w, h);
      if (mottle) for (let i = 0; i < (w * h) / 900; i++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '90,80,70'},${rnd() * mottle})`;
        g.beginPath(); g.arc(x + rnd() * w, y + rnd() * h, 4 + rnd() * 18, 0, Math.PI * 2); g.fill();
      }
      for (let b = 0; b < bevel; b++) {
        const v = Math.round(255 * Math.sin(((b + 1) / bevel) * Math.PI / 2));
        hg.fillStyle = `rgb(${v},${v},${v})`;
        hg.fillRect(x + b, y + b, w - 2 * b, h - 2 * b);
      }
      rg.fillStyle = `rgb(0,${tr},0)`; rg.fillRect(x, y, w, h);
    }
  }
  return { map: toTex(c), normalMap: normalFrom(hc, 1.6), roughnessMap: toTex(rc, false) };
}

// ---------------------------------------------------------------- geometry helpers (plan feet in, metres out)
function worldUVs(geom, size, worldUV) { return size ? worldUV(geom, size) : geom; }

export default async function build(ctx) {
  const { group, worldUV, pbr } = ctx;
  const meshes = [];
  const shade = (mesh) => { mesh.castShadow = mesh.receiveShadow = true; return mesh; };

  // axis-aligned (optionally rounded) box in a parent frame: u = local X (ft), d = local Z (ft), h = up (ft)
  function rbox(parent, mat, u1, u2, d1, d2, h1, h2, r = 0.003) {
    const w = m(u2 - u1), hh = m(h2 - h1), dd = m(d2 - d1);
    const rr = Math.min(r, w / 2 - 1e-4, hh / 2 - 1e-4, dd / 2 - 1e-4);
    let g = rr > 0.0008 ? new RoundedBoxGeometry(w, hh, dd, 2, rr) : new THREE.BoxGeometry(w, hh, dd);
    g.translate(m((u1 + u2) / 2), m((h1 + h2) / 2), m((d1 + d2) / 2));
    g = worldUVs(g, mat.userData.worldSize, worldUV);
    const mesh = shade(new THREE.Mesh(g, mat));
    parent.add(mesh);
    return mesh;
  }
  const box = (mat, x1, x2, y1, y2, h1, h2, r) => rbox(group, mat, x1, x2, y1, y2, h1, h2, r);
  // cylinder standing (axis = up) at plan (x,y)
  function cyl(parent, mat, x, y, h1, h2, r1, r2 = r1, seg = 32, open = false) {
    const g = new THREE.CylinderGeometry(m(r2), m(r1), m(h2 - h1), seg, 1, open);
    g.translate(m(x), m((h1 + h2) / 2), m(y));
    const mesh = shade(new THREE.Mesh(g, mat));
    parent.add(mesh);
    return mesh;
  }
  // local frame on a wall: origin at plan (x,y); face = direction cabinets face (local +Z = into the room)
  function frame(x, y, face) {
    const g = new THREE.Group();
    g.position.set(m(x), 0, m(y));
    g.rotation.y = { S: 0, W: -Math.PI / 2, N: Math.PI, E: Math.PI / 2 }[face];
    group.add(g);
    return g;
  }
  // horizontal slab from a plan polygon (ft) with rounded edges + optional rectangular holes (ft)
  function slab(mat, pts, h1, h2, holes = [], bevel = 0.004) {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(m(x), m(y))));
    for (const [x1, y1, x2, y2, r = 0.05] of holes) sh.holes.push(roundRect(new THREE.Path(), x1, y1, x2, y2, r));
    let g = new THREE.ExtrudeGeometry(sh, { depth: m(h2 - h1) - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 10 });
    g.rotateX(Math.PI / 2); // shape y -> world z, extrude -> down
    g.translate(0, m(h2) - bevel, 0);
    g = worldUVs(g, mat.userData.worldSize, worldUV);
    const mesh = shade(new THREE.Mesh(g, mat));
    group.add(mesh);
    return mesh;
  }
  function roundRect(p, x1, y1, x2, y2, r) {
    const [a, b, c, d, R] = [m(x1), m(y1), m(x2), m(y2), m(r)];
    p.moveTo(a + R, b); p.lineTo(c - R, b); p.quadraticCurveTo(c, b, c, b + R); p.lineTo(c, d - R); p.quadraticCurveTo(c, d, c - R, d);
    p.lineTo(a + R, d); p.quadraticCurveTo(a, d, a, d - R); p.lineTo(a, b + R); p.quadraticCurveTo(a, b, a + R, b);
    return p;
  }
  // open-top rounded basin (sink bowl): walls + floor, top rim at h2
  function basin(mat, x1, y1, x2, y2, h1, h2, r = 0.12, t = 0.012) {
    const outer = roundRect(new THREE.Shape(), x1, y1, x2, y2, r);
    outer.holes.push(roundRect(new THREE.Path(), x1 + t, y1 + t, x2 - t, y2 - t, r - t));
    const wg = new THREE.ExtrudeGeometry(outer, { depth: m(h2 - h1), bevelEnabled: false, curveSegments: 10 });
    wg.rotateX(Math.PI / 2); wg.translate(0, m(h2), 0);
    const fg = new THREE.ShapeGeometry(roundRect(new THREE.Shape(), x1, y1, x2, y2, r), 10);
    fg.rotateX(Math.PI / 2); fg.translate(0, m(h1) + 0.001, 0);
    const grp = new THREE.Group();
    grp.add(shade(new THREE.Mesh(wg, mat)), shade(new THREE.Mesh(fg, mat)));
    group.add(grp);
    return grp;
  }

  // ---------------------------------------------------------------- materials
  const gTex = graniteTex();
  // near-black polished granite; env reflections kept low so the blue sky HDR doesn't tint it
  // roughness variation (G channel): soft polish blotches + rougher crystal grains -> broken reflections
  const grc = canvas(512), grg = grc.getContext('2d');
  grg.fillStyle = 'rgb(0,46,0)'; grg.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 70; i++) { grg.fillStyle = `rgba(0,${20 + rnd() * 70},0,0.18)`; grg.beginPath(); grg.arc(rnd() * 512, rnd() * 512, 20 + rnd() * 70, 0, Math.PI * 2); grg.fill(); }
  for (let i = 0; i < 3000; i++) { grg.fillStyle = `rgba(0,${90 + rnd() * 90},0,0.7)`; grg.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
  const gRough = toTex(grc, false);
  const granite = new THREE.MeshStandardMaterial({ map: gTex, roughnessMap: gRough, color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: 0.14 });
  granite.userData.worldSize = 0.55;
  const walnut = pbr('american_walnut_veneer', { size: 1.3, color: 0xc6895a, roughness: 0.75, normalScale: 0.6 });
  const carcass = new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 0.8 });
  const carcassWhite = new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.6 });
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0xf1ede4, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2b, roughness: 0.55, metalness: 0.4 });
  const blackHandle = new THREE.MeshStandardMaterial({ color: 0x1c1c1d, roughness: 0.38, metalness: 0.7 });
  // brushed stainless: fine linear streaks as a normal map (UVs on the sink parts are in metres)
  const bc = canvas(512), bg = bc.getContext('2d');
  bg.fillStyle = '#808080'; bg.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const v = 100 + rnd() * 56, y = rnd() * 512;
    bg.fillStyle = `rgba(${v},${v},${v},${0.25 + rnd() * 0.5})`;
    bg.fillRect(rnd() * 512 - 256, y, 120 + rnd() * 400, 0.6 + rnd());
  }
  const brushN = normalFrom(bc, 1.2);
  brushN.repeat.set(3, 3);
  const steel = new THREE.MeshStandardMaterial({ color: 0xdedbd5, roughness: 0.3, metalness: 1, normalMap: brushN, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.0, side: THREE.DoubleSide });
  const brushed = new THREE.MeshStandardMaterial({ color: 0xd2d0cb, roughness: 0.34, metalness: 1, normalMap: brushN, normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: 0.9 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.08, metalness: 1 });
  const blackGlass = new THREE.MeshPhysicalMaterial({ color: 0x060607, roughness: 0.06, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.18 });
  const castIron = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.75, metalness: 0.3 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.35, metalness: 1 });
  const enamelBlack = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
  const whitePlastic = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.35 });
  const greyPlastic = new THREE.MeshStandardMaterial({ color: 0x8c9096, roughness: 0.45 });
  const darkTint = new THREE.MeshPhysicalMaterial({ color: 0x1e2226, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.82 });
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d8, emissiveIntensity: 2.2 });
  const glassJar = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, transmission: 0.9, thickness: 0.004, transparent: true, opacity: 0.35 });

  const sub = tileTex({ tw: 512, th: 128, bond: true, base: [238, 235, 228], vary: 7, grout: '#cdc8bd', groutPx: 4, bevel: 7, rough: [0.1, 0.8] });
  const subway = new THREE.MeshStandardMaterial({ ...sub, roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8) });
  subway.userData.worldSize = 0.6;
  const wt = tileTex({ tw: 1024, th: 512, base: [204, 196, 182], vary: 8, grout: '#bdb5a8', groutPx: 4, bevel: 4, mottle: 0.05, rough: [0.55, 0.9] });
  const washTile = new THREE.MeshStandardMaterial({ ...wt, roughness: 1, normalScale: new THREE.Vector2(0.6, 0.6) });
  washTile.userData.worldSize = 0.6;

  // ---------------------------------------------------------------- base cabinet run builder (local frame)
  const TOP = 2.833, SLAB_B = 2.70, PLINTH = 0.33, FACE = 1.94, SH_T = 0.06, GAP = 0.012;
  function handle(fr, uc, hc, len, vertical = false) {
    const d0 = FACE, half = len / 2;
    if (vertical) {
      rbox(fr, blackHandle, uc - 0.018, uc + 0.018, d0 + 0.07, d0 + 0.105, hc - half, hc + half, 0.004);
      for (const s of [-1, 1]) rbox(fr, blackHandle, uc - 0.012, uc + 0.012, d0, d0 + 0.08, hc + s * (half - 0.06) - 0.012, hc + s * (half - 0.06) + 0.012, 0.002);
    } else {
      rbox(fr, blackHandle, uc - half, uc + half, d0 + 0.07, d0 + 0.105, hc - 0.018, hc + 0.018, 0.004);
      for (const s of [-1, 1]) rbox(fr, blackHandle, uc + s * (half - 0.06) - 0.012, uc + s * (half - 0.06) + 0.012, d0, d0 + 0.08, hc - 0.012, hc + 0.012, 0.002);
    }
  }
  // cells: [{ w, type: 'doors2'|'door'|'drawers3'|'drawers2'|'filler'|'sink' }]
  function baseRun(fr, u0, cells, { endPanelAt } = {}) {
    let u = u0;
    const hTop = SLAB_B - 0.012, hBot = PLINTH + 0.01;
    for (const c of cells) {
      const a = u, b = u + c.w;
      // carcass (sink unit is open on top so the bowl shows)
      rbox(fr, carcass, a, b, 0, FACE - SH_T, PLINTH, c.type === 'sink' ? 2.05 : SLAB_B, 0);
      const front = (x1, x2, h1, h2) => rbox(fr, walnut, x1 + GAP / 2, x2 - GAP / 2, FACE - SH_T, FACE, h1 + GAP / 2, h2 - GAP / 2, 0.004);
      if (c.type === 'filler') front(a, b, hBot, hTop);
      else if (c.type === 'door') { front(a, b, hBot, hTop); handle(fr, (a + b) / 2, hTop - 0.18, Math.min(0.55, c.w - 0.3)); }
      else if (c.type === 'doors2' || c.type === 'sink') {
        const mid = (a + b) / 2;
        front(a, mid, hBot, hTop); front(mid, b, hBot, hTop);
        handle(fr, mid - 0.16, hTop - 0.45, 0.5, true); handle(fr, mid + 0.16, hTop - 0.45, 0.5, true);
      } else if (c.type === 'drawers3' || c.type === 'drawers2') {
        const splits = c.type === 'drawers3' ? [hTop - 0.55, hTop - 1.45] : [hTop - 0.75];
        const edges = [hTop, ...splits, hBot];
        for (let i = 0; i < edges.length - 1; i++) {
          front(a, b, edges[i + 1], edges[i]);
          handle(fr, (a + b) / 2, edges[i] - 0.16, Math.min(0.9, c.w - 0.35));
        }
      }
      u = b;
    }
    // plinth (recessed)
    rbox(fr, plinthMat, u0, u, 0, FACE - 0.25, 0, PLINTH, 0.002);
    if (endPanelAt !== undefined) rbox(fr, walnut, endPanelAt - 0.06, endPanelAt, 0, FACE, 0, SLAB_B - 0.005, 0.004);
  }
  // wall cabinet run (local frame): cells of door widths, from u0
  function wallRun(fr, u0, cells, { h1 = 4.75, h2 = 7.6, D = 1.15, led = true } = {}) {
    let u = u0;
    const L = cells.reduce((s, w) => s + w, 0);
    const car = rbox(fr, carcassWhite, u0, u0 + L, 0, D - SH_T, h1, h2, 0);
    car.userData.hideInTop = true;
    for (const w of cells) {
      const a = u, b = u + w;
      const s = rbox(fr, lacquer, a + GAP / 2, b - GAP / 2, D - SH_T, D, h1 + GAP / 2, h2 - GAP / 2, 0.004);
      s.userData.hideInTop = true;
      // slim black bar near the bottom edge
      const hc = h1 + 0.2, half = Math.min(0.32, w / 2 - 0.15);
      const bar = rbox(fr, blackHandle, (a + b) / 2 - half, (a + b) / 2 + half, D + 0.035, D + 0.07, hc - 0.016, hc + 0.016, 0.004);
      bar.userData.hideInTop = true;
      for (const sx of [-1, 1]) {
        const p = rbox(fr, blackHandle, (a + b) / 2 + sx * (half - 0.05) - 0.01, (a + b) / 2 + sx * (half - 0.05) + 0.01, D, D + 0.045, hc - 0.01, hc + 0.01, 0.002);
        p.userData.hideInTop = true;
      }
      u = b;
    }
    if (led) {
      const l = rbox(fr, ledMat, u0 + 0.05, u0 + L - 0.05, D - 0.25, D - 0.2, h1 - 0.012, h1, 0);
      l.castShadow = false; l.userData.hideInTop = true;
    }
  }

  // ================================================================ KITCHEN
  // --- N run: frame origin at (22, 0.5) facing S, u = x - 22
  const fN = frame(22, 0.5, 'S');
  baseRun(fN, 0, [
    { w: 0.06, type: 'filler' },
    { w: 2.84, type: 'sink' },      // x 22.06–24.9 under the sink
    { w: 1.7, type: 'drawers3' },   // x 24.9–26.6
    { w: 2.1, type: 'drawers2' },   // x 26.6–28.7 under the hob (pots & pans)
    { w: 1.2, type: 'door' },       // x 28.7–29.9
    { w: 0.1, type: 'filler' },     // corner filler to x 30
  ]);
  // --- E run: frame origin at (32, 0.5) facing W, u = y - 0.5
  const fE = frame(32, 0.5, 'W');
  rbox(fE, carcass, 0, 2.0, 0, FACE - SH_T, PLINTH, SLAB_B, 0); // blind corner box
  baseRun(fE, 2.0, [
    { w: 0.1, type: 'filler' },     // y 2.5–2.6
    { w: 1.9, type: 'doors2' },     // y 2.6–4.5 (corner carousel)
    { w: 1.7, type: 'drawers3' },   // y 4.5–6.2
    { w: 1.04, type: 'door' },      // y 6.2–7.24
    { w: 0.5, type: 'door' },       // y 7.24–7.74 (bottle pull-out)
  ], { endPanelAt: 7.3 });
  rbox(fE, plinthMat, 0, 2.0, 0, FACE - 0.25, 0, PLINTH, 0.002);

  // --- granite L-top with sink cut-out (40 mm edge, rounded)
  const SINK = { x1: 22.5, x2: 24.8, y1: 0.78, y2: 2.22 };
  const BOWL = { x1: 23.55, x2: 24.62, y1: 0.92, y2: 2.08 };
  slab(granite, [[22, 0.5], [32, 0.5], [32, 7.8], [30, 7.8], [30, 2.5], [22, 2.5]], SLAB_B, TOP, [[BOWL.x1, BOWL.y1, BOWL.x2, BOWL.y2, 0.12]]);

  // --- stainless sink: rim + ribbed drainboard plate (with bowl hole), bowl, waste, mixer tap
  {
    const sh = roundRect(new THREE.Shape(), SINK.x1, SINK.y1, SINK.x2, SINK.y2, 0.06);
    sh.holes.push(roundRect(new THREE.Path(), BOWL.x1, BOWL.y1, BOWL.x2, BOWL.y2, 0.12));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.002, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.002, bevelSegments: 2, curveSegments: 10 });
    g.rotateX(Math.PI / 2); g.translate(0, m(TOP) + 0.0035, 0);
    group.add(shade(new THREE.Mesh(g, steel)));
    basin(steel, BOWL.x1, BOWL.y1, BOWL.x2, BOWL.y2, TOP - 0.68, TOP + 0.005, 0.12);
    // drainboard ribs (W of the bowl)
    const pressed = new THREE.MeshStandardMaterial({ color: 0x9a9894, roughness: 0.45, metalness: 1, normalMap: brushN, normalScale: new THREE.Vector2(0.3, 0.3) });
    box(pressed, 22.62, 23.46, 0.9, 2.1, TOP + 0.004, TOP + 0.0065, 0.02);       // pressed drainboard recess
    for (let i = 0; i < 8; i++) {
      const x = 22.68 + i * 0.1;
      box(steel, x, x + 0.045, 0.96, 2.04, TOP + 0.005, TOP + 0.026, 0.008);     // N–S ribs as drawn on the plan
    }
    // waste + overflow
    cyl(group, chrome, (BOWL.x1 + BOWL.x2) / 2, 1.6, TOP - 0.68, TOP - 0.665, 0.16);
    cyl(group, enamelBlack, (BOWL.x1 + BOWL.x2) / 2, 1.6, TOP - 0.667, TOP - 0.66, 0.06);
    // gooseneck mixer behind the bowl
    const tx = (BOWL.x1 + BOWL.x2) / 2, ty = 0.74;
    cyl(group, chrome, tx, ty, TOP, TOP + 0.08, 0.1, 0.09);
    cyl(group, chrome, tx, ty, TOP + 0.08, TOP + 0.55, 0.075, 0.07);
    const curve = new THREE.CatmullRomCurve3([
      ctx.v3(tx, ty, TOP + 0.5), ctx.v3(tx, ty, TOP + 1.05), ctx.v3(tx, ty + 0.12, TOP + 1.3), ctx.v3(tx, ty + 0.38, TOP + 1.36),
      ctx.v3(tx, ty + 0.62, TOP + 1.2), ctx.v3(tx, ty + 0.68, TOP + 0.95),
    ]);
    group.add(shade(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, m(0.045), 16), chrome)));
    cyl(group, chrome, tx, ty + 0.68, TOP + 0.9, TOP + 0.96, 0.055);
    // lever
    rbox(group, chrome, tx + 0.07, tx + 0.36, ty - 0.02, ty + 0.02, TOP + 0.47, TOP + 0.5, 0.005); // lever
    // soap dispenser
    cyl(group, chrome, 22.75, 0.72, TOP, TOP + 0.05, 0.06);
    cyl(group, chrome, 22.75, 0.72, TOP + 0.05, TOP + 0.22, 0.025);
    const nz = rbox(group, chrome, 22.74, 22.76, 0.72, 0.86, TOP + 0.2, TOP + 0.23, 0.004);
    nz.castShadow = false;
  }

  // --- glass 4-burner hob x 26.7–28.6, y 0.65–2.35
  const HOB = { x1: 26.7, x2: 28.6, y1: 0.65, y2: 2.35 };
  {
    const hcx = (HOB.x1 + HOB.x2) / 2;
    box(blackGlass, HOB.x1, HOB.x2, HOB.y1, HOB.y2, TOP, TOP + 0.03, 0.006);
    box(brushed, HOB.x1 - 0.01, HOB.x2 + 0.01, HOB.y2 - 0.015, HOB.y2 + 0.005, TOP, TOP + 0.034, 0.003); // front trim
    const G = TOP + 0.03;
    const burners = [[hcx - 0.47, 1.05, 0.2], [hcx + 0.47, 1.05, 0.14], [hcx - 0.47, 1.78, 0.14], [hcx + 0.47, 1.78, 0.17]];
    for (const [bx, by, r] of burners) {
      cyl(group, brass, bx, by, G, G + 0.05, r + 0.03, r + 0.02, 40); // brass burner ring
      cyl(group, enamelBlack, bx, by, G + 0.05, G + 0.075, r - 0.01, r - 0.025, 40); // cap
      cyl(group, brass, bx, by, G + 0.05, G + 0.06, r * 0.45, r * 0.45, 24);
      // cast-iron square pan support
      const s = 0.33, t = 0.03, hh1 = G + 0.09, hh2 = G + 0.13;
      box(castIron, bx - s, bx + s, by - s, by - s + t, hh1, hh2, 0.005);
      box(castIron, bx - s, bx + s, by + s - t, by + s, hh1, hh2, 0.005);
      box(castIron, bx - s, bx - s + t, by - s, by + s, hh1, hh2, 0.005);
      box(castIron, bx + s - t, bx + s, by - s, by + s, hh1, hh2, 0.005);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ex = bx + dx * s, ey = by + dy * s, ix = bx + dx * (r + 0.07), iy = by + dy * (r + 0.07);
        box(castIron, Math.min(ex, ix) - (dx ? 0 : t / 2), Math.max(ex, ix) + (dx ? 0 : t / 2), Math.min(ey, iy) - (dy ? 0 : t / 2), Math.max(ey, iy) + (dy ? 0 : t / 2), hh1, hh2 + 0.01, 0.004);
        for (const sgn of [-1, 1]) {
          const fx = bx + (dx ? dx * s : sgn * s), fy = by + (dy ? dy * s : sgn * s);
          box(castIron, fx - 0.02, fx + 0.02, fy - 0.02, fy + 0.02, G, hh1, 0.004);
        }
      }
    }
    // knobs on the front strip
    for (let i = 0; i < 4; i++) {
      const kx = HOB.x1 + 0.38 + i * 0.38;
      cyl(group, brushed, kx, 2.2, TOP + 0.03, TOP + 0.1, 0.07, 0.065, 32);
      box(enamelBlack, kx - 0.008, kx + 0.008, 2.15, 2.25, TOP + 0.1, TOP + 0.104, 0);
    }
  }

  // --- chimney hood: slim stainless canopy (x 26.45–28.85, bottom 5.3 ft = 2'5" above the hob) on a narrow steel stem fixed
  //     to the window head (7.5 ft); a short boxed duct above the head carries the exhaust out through the wall.
  {
    const x1 = 26.45, x2 = 28.85, cx = (x1 + x2) / 2;
    const hood = new THREE.Group();
    hood.userData.hideInTop = true;
    group.add(hood);
    rbox(hood, brushed, x1, x2, 0.55, 2.2, 5.3, 5.5, 0.02);                        // slim canopy body
    // angled black-glass visor on top of the canopy
    const prof = new THREE.Shape([[0.95, 5.5], [2.2, 5.5], [2.2, 5.56], [1.45, 5.86], [0.95, 5.86]].map(([d, h]) => new THREE.Vector2(m(d), m(h))));
    const g = new THREE.ExtrudeGeometry(prof, { depth: m(x2 - x1) - 0.01, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2 });
    g.rotateY(-Math.PI / 2);
    g.translate(m(x2) - 0.005, 0, 0);
    hood.add(shade(new THREE.Mesh(g, blackGlass)));
    rbox(hood, greyPlastic, x1 + 0.1, x2 - 0.1, 0.65, 2.1, 5.29, 5.3, 0);           // baffle filter
    for (const lx of [x1 + 0.35, x2 - 0.35]) cyl(hood, ledMat, lx, 1.85, 5.282, 5.292, 0.07).castShadow = false;
    for (let i = 0; i < 4; i++) rbox(hood, ledMat, cx - 0.3 + i * 0.2, cx - 0.26 + i * 0.2, 2.2, 2.205, 5.38, 5.41, 0).castShadow = false;
    rbox(hood, brushed, cx - 0.3, cx + 0.3, 0.6, 1.05, 5.86, 7.5, 0.006);           // short duct from the hood into the bulkhead
    // painted plasterboard bulkhead across the N wall between the wall cabinets, window head -> ceiling, 1'2" deep
    const bh = rbox(hood, ctx.mat.wall, 23.45, 29.55, 0.5, 1.65, 7.5, 10, 0.004);
    bh.castShadow = true;
    // louvred exhaust grille on the bulkhead face, beside the duct
    rbox(hood, plinthMat, cx + 0.55, cx + 1.45, 1.65, 1.67, 8.0, 8.55, 0.004);
    for (let i = 0; i < 6; i++) rbox(hood, brushed, cx + 0.58, cx + 1.42, 1.66, 1.7, 8.05 + i * 0.085, 8.08 + i * 0.085, 0.003);
  }

  // --- wall cabinets (not over the window)
  wallRun(fN, 0, [1.45]);                          // x 22–23.45 above the drainboard
  wallRun(fN, 7.55, [1.3, 1.15]);                  // x 29.55–32 (last door is the blind corner block)
  wallRun(fE, 1.15, [1.55, 1.55, 1.55, 1.5]);      // E wall y 1.65–7.8
  // finished end panel at the S end of the E wall cabinets
  const ep = rbox(fE, lacquer, 7.3, 7.34, 0, 1.15, 4.75, 7.6, 0.003); ep.userData.hideInTop = true;

  // --- backsplash tiles (counter to under the wall cabinets; under the window only to the sill)
  const T = 0.035;
  box(subway, 22, 23.5, 0.5, 0.5 + T, TOP, 4.78, 0);
  box(subway, 23.5, 29.5, 0.5, 0.5 + T, TOP, 3.48, 0);
  box(subway, 29.5, 32, 0.5, 0.5 + T, TOP, 4.78, 0);
  box(subway, 32 - T, 32, 0.5 + T, 7.8, TOP, 4.78, 0);
  box(subway, 22, 22 + T, 0.5 + T, 2.6, TOP, 4.78, 0);
  box(brushed, 22, 22 + T + 0.015, 2.6, 2.63, TOP, 4.78, 0.003);   // tile edge trim on the W-wall return
  // framed print on the W wall between the runs (x 22, centred y 4.6, 1'8" x 2'4")
  {
    const W = 512, H = 720, c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#efe8dc'; g.fillRect(0, 0, W, H);
    const blob = (col, x, y, rx, ry) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
    g.fillStyle = '#c7764e'; g.beginPath(); g.moveTo(110, 560); g.lineTo(110, 300); g.arc(256, 300, 146, Math.PI, 0); g.lineTo(402, 560); g.fill(); // terracotta arch
    blob('#e2b45a', 330, 210, 70, 70);                                    // sun
    g.strokeStyle = '#5f7a55'; g.lineWidth = 7;
    for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(200, 600); g.quadraticCurveTo(170 + i * 22, 470, 140 + i * 30, 360 + (i % 3) * 30); g.stroke(); }
    for (let i = 0; i < 22; i++) blob('#5f7a55', 150 + (i * 53) % 220, 360 + (i * 37) % 200, 16, 7);
    g.fillStyle = '#3b3a36'; g.fillRect(90, 600, 332, 6);
    const art = toTex(c);
    const fr = new THREE.Group();
    fr.userData.noMerge = true;
    rbox(fr, blackHandle, 22, 22.06, 3.75, 5.45, 4.35, 6.65, 0.006);                         // thin black frame
    const mat = new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.8 });
    rbox(fr, mat, 22.06, 22.065, 3.8, 5.4, 4.4, 6.6, 0);                                      // white mount
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(m(1.2), m(1.7)), new THREE.MeshStandardMaterial({ map: art, roughness: 0.7 }));
    pic.rotation.y = Math.PI / 2; pic.position.copy(ctx.v3(22.068, 4.6, 5.5));
    fr.add(pic);
    group.add(fr);
  }

  // --- S counter: x 24.9–32, y 11.8–13.5 (frame at (32,13.5) facing N, u = 32 - x)
  const fS = frame(32, 13.5, 'N');
  const FACE_S = 1.64;
  {
    // shallower (1'8") storage counter: reuse builder by temporarily shifting depth
    const cells = [{ w: 1.8, type: 'doors2' }, { w: 1.6, type: 'drawers3' }, { w: 2.0, type: 'doors2' }, { w: 1.6, type: 'drawers3' }];
    const inner = new THREE.Group();
    inner.position.z = m(FACE_S - FACE);
    fS.add(inner);
    baseRun(inner, 0.04, cells);
    rbox(fS, walnut, 7.04, 7.1, 0, FACE_S, 0, SLAB_B, 0.004); // exposed W end panel at x 24.9
    slab(granite, [[24.9, 11.8], [32, 11.8], [32, 13.5], [24.9, 13.5]], SLAB_B, TOP);
    box(subway, 24.9, 32, 13.5 - T, 13.5, TOP, 4.45, 0);
    // two walnut floating shelves with jars
    for (const sh of [4.85, 5.95]) {
      const s = box(walnut, 26.0, 29.4, 12.75, 13.5 - T, sh, sh + 0.12, 0.006);
      s.userData.hideInTop = true;
    }
  }

  // --- microwave on the S counter, x 29.9–31.65, faces N
  {
    const y1 = 12.1, y2 = 13.4, h1 = TOP + 0.02, h2 = TOP + 0.98;
    box(new THREE.MeshStandardMaterial({ color: 0x232426, roughness: 0.4, metalness: 0.5 }), 29.9, 31.65, y1 + 0.03, y2, h1, h2, 0.02);
    box(blackGlass, 29.95, 31.08, y1, y1 + 0.04, h1 + 0.08, h2 - 0.08, 0.01);
    box(brushed, 30.98, 31.02, y1 - 0.08, y1 - 0.04, h1 + 0.2, h2 - 0.2, 0.008);
    box(enamelBlack, 31.15, 31.6, y1, y1 + 0.04, h1 + 0.08, h2 - 0.08, 0.008);
    box(ledMat, 31.25, 31.5, y1 - 0.005, y1 + 0.01, h2 - 0.25, h2 - 0.17, 0).castShadow = false;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(m(0.07), m(0.07), m(0.06), 24), brushed);
    knob.rotation.x = Math.PI / 2; knob.position.copy(ctx.v3(31.37, y1 - 0.02, h1 + 0.35)); group.add(knob);
    for (const [fx, fy] of [[30.0, 12.2], [31.55, 12.2], [30.0, 13.3], [31.55, 13.3]]) cyl(group, enamelBlack, fx, fy, TOP, h1, 0.04);
  }

  // --- jars on the floating shelves (glass, dal/rice/spice colours, wooden lids)
  {
    const fills = [0xb8954e, 0x8a4b38, 0x6f7a4c, 0xd9d2c2, 0x9c7650, 0x5a3e2c, 0xb39a6e]; // turmeric, masoor, moong, rice, rajma...
    const wood = new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.6 });
    let k = 0;
    for (const sh of [4.97, 6.07]) {
      for (let x = 26.35; x < 29.2; x += 0.5) {
        const r = 0.15 + ((k * 37) % 5) * 0.01, hh = 0.42 + ((k * 13) % 3) * 0.12;
        const y = 13.12;
        const parts = [
          cyl(group, glassJar, x, y, sh, sh + hh, r, r, 28),
          cyl(group, new THREE.MeshStandardMaterial({ color: fills[k % fills.length], roughness: 0.9 }), x, y, sh + 0.01, sh + hh * (0.55 + ((k * 7) % 4) * 0.1), r - 0.012, r - 0.012, 24),
          cyl(group, wood, x, y, sh + hh, sh + hh + 0.06, r + 0.005, r + 0.005, 28),
        ];
        for (const p of parts) p.userData.hideInTop = true;
        k++;
      }
    }
  }

  // --- under-cabinet lighting + ceiling downlights
  RectAreaLightUniformsLib.init();
  const strip = (x, y, h, w, d, I) => {
    const l = new THREE.RectAreaLight(0xffe6c4, I, m(w), m(d));
    l.position.copy(ctx.v3(x, y, h));
    l.lookAt(ctx.v3(x, y, 0));
    group.add(l);
  };
  strip(31.15, 4.7, 4.72, 0.3, 6.0, 40);   // under E wall cabinets (real light #1)
  strip(30.7, 1.25, 4.72, 2.4, 0.3, 40);   // NE corner (real light #2); the other LED strips are emissive only
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.4 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0dc, emissiveIntensity: 4 });
  const down = (x, y) => {
    const dl = new THREE.Group();
    dl.userData.hideInTop = true;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(m(0.3), m(0.3), 0.012, 40), trimMat);
    ring.position.copy(ctx.v3(x, y, 9.99));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(m(0.22), 40), lensMat);
    lens.rotation.x = Math.PI / 2; lens.position.copy(ctx.v3(x, y, 9.965));
    dl.add(ring, lens);
    group.add(dl);
  };
  for (const [x, y] of [[24.6, 3.2], [29.2, 3.2], [24.6, 8.2], [29.2, 8.2], [27.0, 11.6], [18.5, 4]]) down(x, y);
  { // one wide ceiling spot over the L-counter stands in for the downlights (real light #3)
    const sp = new THREE.SpotLight(0xffe9cc, 9, 0, 1.0, 0.9, 2);
    sp.position.copy(ctx.v3(27.0, 5.0, 9.9));
    sp.target.position.copy(ctx.v3(27.5, 2.5, 0));
    group.add(sp, sp.target);
  }

  // --- pressure cooker on the back-left burner (code), handle pointing west
  {
    const alu = new THREE.MeshStandardMaterial({ color: 0xc9c9c6, roughness: 0.32, metalness: 1 });
    const bake = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5 });
    const cx = HOB.x1 + 0.48, cy = 1.05, b = TOP + 0.03 + 0.13;
    cyl(group, alu, cx, cy, b, b + 0.5, 0.36, 0.37, 48);
    cyl(group, alu, cx, cy, b + 0.5, b + 0.54, 0.385, 0.385, 48);           // rim
    const dome = new THREE.Mesh(new THREE.SphereGeometry(m(0.37), 40, 12, 0, Math.PI * 2, 0, 0.42), alu);
    dome.scale.y = 0.6; dome.position.copy(ctx.v3(cx, cy, b + 0.47)); group.add(shade(dome));
    cyl(group, bake, cx, cy, b + 0.62, b + 0.66, 0.06);                     // vent pipe
    cyl(group, bake, cx, cy, b + 0.66, b + 0.78, 0.055, 0.035, 20);          // whistle weight
    // single short bakelite handle, angled to the front-left
    const hg = new THREE.Group();
    hg.position.copy(ctx.v3(cx, cy, b + 0.47));
    hg.rotation.y = Math.PI * 0.82;
    rbox(hg, bake, 0.33, 0.8, -0.045, 0.045, -0.04, 0.05, 0.012);
    group.add(hg);
  }

  // --- steel utensil rail on the backsplash right of the hob (N wall, x 29.7–31.7, under the corner wall cabinet)
  {
    const rx1 = 29.7, rx2 = 31.7, rh = 4.3, wy = 0.5 + T, ry = wy + 0.14;
    const rc = new THREE.LineCurve3(ctx.v3(rx1, ry, rh), ctx.v3(rx2, ry, rh));
    group.add(shade(new THREE.Mesh(new THREE.TubeGeometry(rc, 1, m(0.022), 12), brushed)));
    for (const x of [rx1 + 0.05, rx2 - 0.05]) box(brushed, x - 0.03, x + 0.03, wy, ry + 0.02, rh - 0.04, rh + 0.04, 0.004);
    const tools = [['ladle', 0.75], ['skimmer', 0.72], ['spatula', 0.65], ['ladle', 0.62], ['tongs', 0.6]];
    tools.forEach(([kind, len], i) => {
      const x = rx1 + 0.3 + i * 0.36, top = rh - 0.04;
      box(brushed, x - 0.02, x + 0.02, ry - 0.012, ry + 0.012, top - len, top - 0.06, 0.004); // stem
      const t = new THREE.Mesh(new THREE.TorusGeometry(m(0.04), m(0.009), 6, 16), brushed);
      t.position.copy(ctx.v3(x, ry, rh - 0.01));
      group.add(t);
      const end = top - len;
      if (kind === 'ladle') {
        const bowl = new THREE.Mesh(new THREE.SphereGeometry(m(0.14), 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), steel);
        bowl.position.copy(ctx.v3(x, ry + 0.1, end));
        group.add(shade(bowl));
      } else if (kind === 'skimmer') {
        const d = new THREE.Mesh(new THREE.CylinderGeometry(m(0.13), m(0.13), m(0.02), 24), steel);
        d.rotation.x = Math.PI / 2;
        d.position.copy(ctx.v3(x, ry + 0.02, end - 0.06));
        group.add(shade(d));
      } else if (kind === 'spatula') {
        box(steel, x - 0.08, x + 0.08, ry - 0.012, ry + 0.012, end - 0.22, end, 0.01);
      } else {
        box(brushed, x - 0.06, x - 0.035, ry - 0.012, ry + 0.012, end - 0.05, end + 0.15, 0.004);
        box(brushed, x + 0.035, x + 0.06, ry - 0.012, ry + 0.012, end - 0.05, end + 0.15, 0.004);
      }
    });
  }

  // --- wire dish rack on the E-run counter (keeps the ribbed drainboard clear) (plates, tumbler) + sponge/brush caddy in the NW corner
  {
    const wire = new THREE.MeshStandardMaterial({ color: 0xd6d8da, roughness: 0.25, metalness: 1 });
    const rx1 = 30.62, rx2 = 31.42, ry1 = 6.25, ry2 = 7.15, rb = TOP + 0.02, rt = TOP + 0.38;
    for (const x of [rx1, rx2]) for (const y of [ry1, ry2]) box(wire, x - 0.012, x + 0.012, y - 0.012, y + 0.012, rb - 0.02, rt, 0.004);
    for (const h of [rb, rt]) {
      box(wire, rx1, rx2, ry1 - 0.01, ry1 + 0.01, h - 0.01, h + 0.01, 0.003);
      box(wire, rx1, rx2, ry2 - 0.01, ry2 + 0.01, h - 0.01, h + 0.01, 0.003);
      box(wire, rx1 - 0.01, rx1 + 0.01, ry1, ry2, h - 0.01, h + 0.01, 0.003);
      box(wire, rx2 - 0.01, rx2 + 0.01, ry1, ry2, h - 0.01, h + 0.01, 0.003);
    }
    for (let i = 0; i < 6; i++) box(wire, rx1, rx2, ry1 + 0.12 + i * 0.13 - 0.006, ry1 + 0.12 + i * 0.13 + 0.006, rb, rb + 0.18, 0.002);
    const plate = new THREE.MeshPhysicalMaterial({ color: 0xf6f4ef, roughness: 0.15, clearcoat: 0.6 });
    for (const [y, r] of [[6.5, 0.4], [6.63, 0.4], [6.76, 0.33]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(m(r), m(r * 0.8), m(0.04), 40), plate);
      p.rotation.x = Math.PI / 2 - 0.12;
      p.position.copy(ctx.v3(31.02, y, rb + r + 0.02));
      group.add(shade(p));
    }
    cyl(group, steel, 31.2, 7.0, rb, rb + 0.42, 0.11, 0.13, 32, true); // steel tumbler
    cyl(group, steel, 31.2, 7.0, rb, rb + 0.005, 0.11);
    // caddy with sponge + dish brush
    const cx1 = 22.08, cx2 = 22.48, cy1 = 0.58, cy2 = 0.98, ch = TOP + 0.3;
    box(wire, cx1, cx2, cy1, cy2, TOP + 0.005, TOP + 0.02, 0.003);
    for (const [x1, x2, y1, y2] of [[cx1, cx2, cy1, cy1 + 0.02], [cx1, cx2, cy2 - 0.02, cy2], [cx1, cx1 + 0.02, cy1, cy2], [cx2 - 0.02, cx2, cy1, cy2]]) box(wire, x1, x2, y1, y2, TOP, ch, 0.003);
    box(new THREE.MeshStandardMaterial({ color: 0xe8c43a, roughness: 0.95 }), cx1 + 0.04, cx1 + 0.2, cy1 + 0.05, cy2 - 0.05, TOP + 0.02, TOP + 0.14, 0.02);
    box(new THREE.MeshStandardMaterial({ color: 0x3d8a4a, roughness: 0.9 }), cx1 + 0.04, cx1 + 0.2, cy1 + 0.05, cy2 - 0.05, TOP + 0.14, TOP + 0.18, 0.01);
    const brush = new THREE.Group();
    brush.position.copy(ctx.v3(cx2 - 0.1, (cy1 + cy2) / 2, TOP + 0.02));
    brush.rotation.x = 0.25;
    rbox(brush, new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.6 }), -0.035, 0.035, -0.035, 0.035, 0, 0.55, 0.01);
    rbox(brush, new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.9 }), -0.06, 0.06, -0.06, 0.06, 0, 0.12, 0.02);
    group.add(brush);
  }

  // --- collisions
  ctx.collide({ x1: 22, y1: 0.5, x2: 30, y2: 2.55 });
  ctx.collide({ x1: 29.95, y1: 0.5, x2: 32, y2: 7.85 });
  ctx.collide({ x1: 24.85, y1: 11.75, x2: 32, y2: 13.5 });

  // ================================================================ WASH (x 15.5–21.5, y 0.5–7.5)
  // wall tiles to 7 ft on the W and E walls + aluminium capping
  box(washTile, 15.5, 15.5 + T, 0.5, 7.5, 0, 7, 0);
  box(washTile, 21.5 - T, 21.5, 0.5, 7.5, 0, 7, 0);
  box(brushed, 15.5, 15.5 + T + 0.02, 0.5, 7.5, 7, 7.04, 0.003);
  box(brushed, 21.5 - T - 0.02, 21.5, 0.5, 7.5, 7, 7.04, 0.003);
  {
    const W1 = 15.5 + T, CT = 3.0, CB = 2.9, CD = 17.65; // counter front at x 17.65
    const WS = { x1: 15.95, x2: 17.2, y1: 4.35, y2: 5.85 };
    slab(granite, [[W1, 1.0], [CD, 1.0], [CD, 6.6], [W1, 6.6]], CB, CT, [[WS.x1, WS.y1, WS.x2, WS.y2, 0.1]]);
    // supports: end panels + cabinet under the sink
    box(carcassWhite, W1, CD - 0.04, 1.0, 1.06, 0, CB, 0.003);
    box(carcassWhite, W1, CD - 0.04, 3.22, 3.41, 0, CB, 0.003);   // filler between washer side and cabinet
    box(carcassWhite, W1, CD - 0.04, 6.54, 6.6, 0, CB, 0.003);    // S end panel, flush with the counter end
    box(carcassWhite, W1, CD - 0.1, 3.41, 6.54, 0.3, 2.2, 0);
    box(plinthMat, W1, CD - 0.3, 3.41, 6.54, 0, 0.3, 0.002);
    for (const [a, b] of [[3.42, 4.97], [4.99, 6.53]]) {
      box(lacquer, CD - 0.1, CD - 0.04, a, b, 0.31, CB - 0.02, 0.004);
      box(blackHandle, CD - 0.04, CD + 0.0, (a < 5 ? b - 0.12 : a + 0.08), (a < 5 ? b - 0.08 : a + 0.12), 1.9, 2.6, 0.004);
    }
    // utility sink bowl + rim
    basin(steel, WS.x1, WS.y1, WS.x2, WS.y2, CT - 0.7, CT + 0.004, 0.1);
    const rim = roundRect(new THREE.Shape(), WS.x1 - 0.08, WS.y1 - 0.08, WS.x2 + 0.08, WS.y2 + 0.08, 0.12);
    rim.holes.push(roundRect(new THREE.Path(), WS.x1, WS.y1, WS.x2, WS.y2, 0.1));
    const rg = new THREE.ExtrudeGeometry(rim, { depth: 0.002, bevelEnabled: false, curveSegments: 10 });
    rg.rotateX(Math.PI / 2); rg.translate(0, m(CT) + 0.003, 0);
    group.add(shade(new THREE.Mesh(rg, steel)));
    cyl(group, chrome, (WS.x1 + WS.x2) / 2, (WS.y1 + WS.y2) / 2, CT - 0.7, CT - 0.69, 0.12);
    // wall-mounted bib tap above the sink
    {
      const ty = (WS.y1 + WS.y2) / 2, th = 3.85;
      const fl = new THREE.Mesh(new THREE.CylinderGeometry(m(0.1), m(0.1), m(0.03), 32), chrome);
      fl.rotation.z = Math.PI / 2; fl.position.copy(ctx.v3(W1 + 0.015, ty, th)); group.add(shade(fl));
      const c = new THREE.CatmullRomCurve3([ctx.v3(W1, ty, th), ctx.v3(W1 + 0.22, ty, th), ctx.v3(W1 + 0.4, ty, th + 0.22), ctx.v3(W1 + 0.7, ty, th + 0.32), ctx.v3(W1 + 0.95, ty, th + 0.12), ctx.v3((WS.x1 + WS.x2) / 2, ty, th - 0.12)]);
      group.add(shade(new THREE.Mesh(new THREE.TubeGeometry(c, 24, m(0.04), 12), chrome)));
      cyl(group, chrome, W1 + 0.25, ty, th, th + 0.18, 0.05);
      box(chrome, W1 + 0.2, W1 + 0.3, ty - 0.2, ty + 0.2, th + 0.18, th + 0.21, 0.004);
    }
    // front-load washing machine under the counter: x 15.6–17.55, y 1.25–3.2, faces E
    {
      const x1 = 15.62, x2 = 17.55, y1 = 1.2, y2 = 3.2, h2 = 2.8, cy = (y1 + y2) / 2;
      box(whitePlastic, x1, x2, y1, y2, 0.06, h2, 0.03);
      for (const [fy] of [[y1 + 0.15], [y2 - 0.15]]) cyl(group, greyPlastic, x2 - 0.2, fy, 0, 0.06, 0.06);
      box(greyPlastic, x2 - 0.01, x2 + 0.005, y1 + 0.08, y2 - 0.08, h2 - 0.42, h2 - 0.06, 0.008); // control panel
      box(whitePlastic, x2 - 0.01, x2 + 0.01, y1 + 0.1, y1 + 0.6, h2 - 0.38, h2 - 0.1, 0.008);   // detergent drawer
      box(darkTint, x2, x2 + 0.01, cy - 0.15, cy + 0.2, h2 - 0.32, h2 - 0.18, 0.005);              // display
      const kn = new THREE.Mesh(new THREE.CylinderGeometry(m(0.1), m(0.1), m(0.06), 32), chrome);
      kn.rotation.z = Math.PI / 2; kn.position.copy(ctx.v3(x2 + 0.03, y2 - 0.35, h2 - 0.24)); group.add(shade(kn));
      // porthole door
      const dc = ctx.v3(x2 + 0.04, cy, 1.25);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(m(0.6), m(0.07), 16, 48), chrome);
      ring.rotation.y = Math.PI / 2; ring.position.copy(dc); group.add(shade(ring));
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(m(0.48), m(0.05), 12, 48), greyPlastic);
      ring2.rotation.y = Math.PI / 2; ring2.position.copy(dc); group.add(shade(ring2));
      const glass = new THREE.Mesh(new THREE.SphereGeometry(m(0.5), 32, 16, 0, Math.PI * 2, 0, 0.6), darkTint);
      glass.rotation.z = -Math.PI / 2; glass.position.copy(dc).add(new THREE.Vector3(-m(0.36), 0, 0)); group.add(glass);
      const drum = new THREE.Mesh(new THREE.CircleGeometry(m(0.46), 32), new THREE.MeshStandardMaterial({ color: 0x8d9095, metalness: 0.9, roughness: 0.35 }));
      drum.rotation.y = Math.PI / 2; drum.position.copy(dc).add(new THREE.Vector3(-m(0.1), 0, 0)); group.add(drum);
      box(greyPlastic, x2, x2 + 0.03, y1 + 0.08, y2 - 0.08, 0.06, 0.32, 0.004); // service flap
    }
    // wall shelf above the counter with cleaning bottles
    const shelf = box(brushed, W1, 16.35, 1.3, 3.9, 5.2, 5.25, 0.004);
    for (const yy of [1.45, 3.75]) box(brushed, W1, 16.3, yy - 0.02, yy + 0.02, 4.95, 5.2, 0.003);
    ctx.collide({ x1: 15.5, y1: 0.95, x2: CD + 0.05, y2: 6.65 });
  }

  // ================================================================ props (scanned CC0 models)
  const prop = async (id, opts, at) => {
    try {
      const o = ctx.fit(await ctx.model(`assets/ph/${id}/${id}_1k.gltf`), opts);
      o.userData.noMerge = true;
      ctx.place(o, at);
      return o;
    } catch (e) { console.warn('prop failed', id, e); return null; }
  };
  const G = TOP + 0.03;
  await Promise.all([
    // kitchen
    prop('wooden_cutting_board', { w: 1.25 }, { x: 25.75, y: 1.45, h: TOP, face: 'S' }),
    prop('yellow_onion', { h: 0.24 }, { x: 25.55, y: 1.3, h: TOP + 0.06, face: 'S' }),
    prop('yellow_onion', { h: 0.22 }, { x: 25.85, y: 1.6, h: TOP + 0.06, face: 'E' }),
    prop('potted_plant_04', { h: 0.65 }, { x: 25.2, y: 0.78, h: TOP, face: 'S' }),
    prop('brass_pot_02', { w: 0.7 }, { x: 31.15, y: 3.4, h: TOP, face: 'W' }),
    prop('jug_01', { h: 0.65 }, { x: 31.25, y: 5.3, h: TOP, face: 'W' }),
    prop('wooden_bowl_01', { w: 0.95 }, { x: 27.4, y: 12.6, h: TOP, face: 'N' }).then(async (b) => {
      const top = TOP + 0.12;
      await prop('food_apple_01', { h: 0.24 }, { x: 27.25, y: 12.55, h: top, face: 'S' });
      await prop('food_apple_01', { h: 0.24 }, { x: 27.55, y: 12.7, h: top, face: 'E' });
      await prop('bananas', { w: 0.65 }, { x: 27.45, y: 12.45, h: top + 0.08, face: 'W' });
    }),
    prop('wall_clock', { w: 1.05 }, { x: 27.7, y: 13.5 - 0.02, h: 7.0, face: 'N' }).then((o) => o && (o.userData.hideInTop = true)),
    // wash
    prop('multi_cleaner_bottle', { h: 0.85 }, { x: 15.95, y: 2.0, h: 5.25, face: 'E' }),
    prop('multi_cleaner_bottle', { h: 0.8 }, { x: 15.95, y: 2.6, h: 5.25, face: 'E' }),
    prop('wicker_basket_02', { h: 1.45 }, { x: 20.7, y: 2.0, h: 0, face: 'W' }).then(() => ctx.collide({ x1: 20.0, y1: 1.3, x2: 21.5, y2: 2.7 })),
    // ledge
    prop('potted_plant_01', { h: 2.2 }, { x: 20.75, y: -1.65, h: -0.04, face: 'S' }),
    prop('potted_plant_02', { h: 1.9 }, { x: 15.75, y: -1.7, h: -0.04, face: 'S' }),
  ]);

  // wash: blue bucket + mug near the counter end
  {
    const blue = new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.45 });
    cyl(group, blue, 20.85, 5.9, 0, 1.0, 0.42, 0.5, 40, true).material.side = THREE.DoubleSide;
    cyl(group, blue, 20.85, 5.9, 0, 0.02, 0.42);
    const hd = new THREE.Mesh(new THREE.TorusGeometry(m(0.5), m(0.012), 6, 32, Math.PI), greyPlastic);
    hd.position.copy(ctx.v3(20.85, 5.9, 1.0)); hd.rotation.y = Math.PI / 2; group.add(hd);
    ctx.collide({ x1: 20.3, y1: 5.35, x2: 21.5, y2: 6.45 });
  }

  // ================================================================ UTILITY LEDGE: folding clothes-drying rack
  {
    const alu = new THREE.MeshStandardMaterial({ color: 0xd8dadc, roughness: 0.3, metalness: 0.9 });
    const x1 = 16.6, x2 = 19.6, yc = -1.25, top = 3.2, base = -0.04;
    const tube = (a, b, r = 0.03, mat = alu) => {
      const c = new THREE.LineCurve3(ctx.v3(...a), ctx.v3(...b));
      group.add(shade(new THREE.Mesh(new THREE.TubeGeometry(c, 1, m(r), 8), mat)));
    };
    // A-frame legs at both ends
    for (const x of [x1, x2]) {
      tube([x, yc - 0.65, base], [x, yc, top]);
      tube([x, yc + 0.65, base], [x, yc, top]);
      tube([x, yc - 0.33, 1.6], [x, yc + 0.33, 1.6], 0.02);
    }
    // rails: top + two wings
    const rails = [[yc, top], [yc - 0.42, 2.25], [yc + 0.42, 2.25], [yc - 0.25, 2.75], [yc + 0.25, 2.75]];
    for (const [y, h] of rails) tube([x1, y, h], [x2, y, h], 0.018);
    // laundry: draped cloths (thin slabs both sides of a rail)
    const cloth = (col, xa, xb, y, h, drop) => {
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.95, side: THREE.DoubleSide });
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(m(xb - xa), m(drop)), mat);
        p.position.copy(ctx.v3((xa + xb) / 2, y + s * 0.035, h - drop / 2));
        p.rotation.x = s * 0.06;
        group.add(shade(p));
      }
    };
    cloth(0xe9e2d2, 16.75, 17.85, yc - 0.42, 2.25, 0.95);  // cream towel
    cloth(0x3d5f8a, 18.0, 18.7, yc - 0.42, 2.25, 0.7);     // blue shirt-ish
    cloth(0xb5523b, 18.85, 19.45, yc + 0.42, 2.25, 0.85);  // rust towel
    cloth(0xd9c26a, 17.0, 17.6, yc + 0.25, 2.75, 0.55);    // mustard dupatta
    ctx.collide({ x1: x1 - 0.1, y1: yc - 0.75, x2: x2 + 0.1, y2: yc + 0.75 });
  }

  // merge static code-built meshes by material (far fewer draw calls); loaded props, lights and transparent bits stay separate
  {
    const buckets = new Map(), victims = [];
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material) || o.material.transparent || o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return;
      let hide = false;
      for (let a = o; a && a !== group; a = a.parent) { if (a.userData.noMerge) return; if (a.userData.hideInTop) hide = true; }
      const g0 = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g0.attributes)) if (!['position', 'normal', 'uv', 'uv1'].includes(k)) g0.deleteAttribute(k);
      if (!g0.attributes.normal) g0.computeVertexNormals();
      g0.clearGroups();
      g0.applyMatrix4(o.matrixWorld);
      const key = [o.material.uuid, hide, o.castShadow, Object.keys(g0.attributes).sort().join()].join('|');
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, hide, cast: o.castShadow, geoms: [] });
      buckets.get(key).geoms.push(g0);
      victims.push(o);
    });
    for (const o of victims) o.parent.remove(o);
    for (const b of buckets.values()) {
      const mg = mergeGeometries(b.geoms, false);
      if (!mg) { console.warn('kitchen merge failed', b.mat.type); continue; }
      const mesh = new THREE.Mesh(mg, b.mat);
      mesh.castShadow = b.cast; mesh.receiveShadow = true;
      mesh.userData.hideInTop = b.hide;
      group.add(mesh);
    }
  }

  // three.js ignores material.envMapIntensity when the env comes from scene.environment, so give the dark glossy
  // materials (granite, black glass) their own envMap reference: then their low intensity applies and the blue sky
  // HDR no longer tints them.
  const tame = [granite, blackGlass, steel, brushed];
  const hook = () => {
    const env = ctx.scene.environment;
    if (!env) return;
    for (const mt of tame) if (mt.envMap !== env) { mt.envMap = env; mt.needsUpdate = true; }
  };
  hook();
  group.traverse((o) => { if (o.isMesh && tame.includes(o.material)) o.onBeforeRender = hook; });
}
