// Piece: bed1 — Bedroom 1 (x 0.5–10.5, y 0.5–11.5) + attached Toilet A (x 11–15, y 0.5–7.5).
// All positions in plan feet (x east, y south, h up). Layout notes:
//   BEDROOM
//   - Bed (dark walnut platform): frame x 2.85–7.75, y 0.5–7.3; mattress x 2.9–7.7. Area rug x 2.0–8.6, y 3.8–7.7
//     (= plan's brown outline under the lower half of the bed), plant in NE corner (9.9, 1.2);
//     channel-tufted linen headboard against N wall under the window (top 2.9' < sill 3').
//     Duvet = draped mesh with procedural rust-brown diagonal-stripe print on cream, white sheet cuff,
//     turned-down corner at top-left (as drawn). Two white pillows + one rust chevron cushion (PH throw_pillows_01).
//   - Nightstands x 1.38–2.78 and 7.82–9.22 (tight to the headboard), y 0.55–1.95, each with a round drum-shade table lamp (+ warm point light).
//   - Built-in wardrobe on S wall x 0.5–7.85, y 9.5–11.5, h 0–7.5 (+ loft 7.6'–ceiling, hidden in top view):
//     5 plum/aubergine satin shutters with 3 mm gaps, brass bar handles.
//     (ends at 7.85 so the room door leaf, swung 80° into the room, clears it)
//   - Linen roman blind over the N window, split AC on E wall above the right nightstand, framed art on W wall,
//     ceiling fan (PH ceiling_fan) at room centre (hidden in top view).
//   TOILET A
//   - Shower at N end (y 0.5–2.8) under the ventilator: fixed glass screen along y 2.8 (x 11–12.9), rain shower
//     + mixer on W wall, corner shelf with bottles, linear drain.
//   - Wall-hung WC on W wall centred y 3.9 (faces E) with concealed-cistern flush plate, health faucet, roll holder.
//   - Wall-hung rectangular basin (+ bottle trap) on E wall centred y 6.4 with mirror (planar reflector) + LED glow, towel rail on S wall.
//   - Wall tiles to 7' on all walls (procedural 600x300 greige tiles; darker taupe on the shower walls).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

export const views = {
  'bed1-toilet':   { pos: [14.45, 7.25], look: [11.2, 1.8], fov: 74, h: 5.3, lookH: 3.2 },
  'bed1-toilet-b': { pos: [14.3, 1.1],  look: [12.6, 7.4], fov: 78, h: 5.3, lookH: 3.4 },
  'bed1-c':        { pos: [9.6, 2.4],   look: [3.0, 10.8], lookH: 3.8 },
  'bed1-d':        { pos: [9.6, 9.6],   look: [4.0, 2.0], fov: 76, h: 5.0, lookH: 5.6 },
};

// ---------------------------------------------------------------- helpers
const FT = 0.3048;
const F = (ft) => ft * FT;
const rng = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// normal map canvas from a height canvas (r channel = height), strength in px
function normalFromHeight(src, strength = 2) {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const octx = out.getContext('2d');
  const od = octx.createImageData(w, h);
  const H = (x, y) => sd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * w + x) * 4;
    od.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
    od.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
    od.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
    od.data[i + 3] = 255;
  }
  octx.putImageData(od, 0, 0);
  return out;
}

function canvasTex(c, { srgb = true, repeat = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  return t;
}

// soft cushion/pillow: box whose thickness tapers to the seams
function pillowGeom(w, d, t, pinch = 0.85) {
  let g = new THREE.BoxGeometry(w, t, d, 28, 8, 22);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const nx = (2 * p.getX(i)) / w, ny = (2 * p.getY(i)) / t, nz = (2 * p.getZ(i)) / d;
    const f = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(nx), 4)), 0.45) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(nz), 4)), 0.45);
    const k = 0.12 + 0.88 * f;
    p.setY(i, ny * (t / 2) * k);
    // pull corners in a touch (pillow "ears")
    p.setX(i, p.getX(i) * (1 - 0.05 * (1 - Math.abs(nz)) * pinch));
    p.setZ(i, p.getZ(i) * (1 - 0.05 * (1 - Math.abs(nx)) * pinch));
  }
  g.deleteAttribute('normal');
  const uv = g.attributes.uv;
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  // simple planar uv from x/z
  const pp = g.attributes.position, uvs = new Float32Array(pp.count * 2);
  for (let i = 0; i < pp.count; i++) { uvs[2 * i] = pp.getX(i) / 0.35; uvs[2 * i + 1] = pp.getZ(i) / 0.35 + pp.getY(i) / 0.35; }
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  void uv;
  return g;
}

export default async function build(ctx) {
  const G = ctx.group;
  const S = (o) => { o.traverse?.((c) => { if (c.isMesh) c.castShadow = c.receiveShadow = true; }); return o; };

  // rounded box in plan feet, world UVs if the material has a worldSize
  function rbox(mat, { x1, y1, x2, y2, h1, h2 }, r = 0.03, parent = G, seg = 3) {
    const w = F(x2 - x1), h = F(h2 - h1), d = F(y2 - y1);
    const rad = Math.max(0.0005, Math.min(F(r), w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
    let g = new RoundedBoxGeometry(w, h, d, seg, rad);
    g.translate(F((x1 + x2) / 2), F((h1 + h2) / 2), F((y1 + y2) / 2));
    const size = mat.userData?.worldSize;
    if (size) g = ctx.worldUV(g, size);
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const cyl = (mat, r1, r2, h, seg = 32, parent) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
    m.castShadow = m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  };

  // ---------------------------------------------------------------- materials
  const walnut = ctx.pbr('dark_wood', { size: 1.1, color: 0xa6f2ff, roughness: 0.75 });
  const walnutDark = ctx.pbr('dark_wood', { size: 1.1, color: 0x6d9fa8, roughness: 0.9 });
  const linenHead = ctx.pbr('rough_linen', { size: 0.35, color: 0xb9a68f, noMap: true, roughness: 1, normalScale: 0.9, ao: false });
  const blindLinen = ctx.pbr('rough_linen', { size: 0.3, color: 0xe9dfcf, noMap: true, roughness: 1, normalScale: 0.6, ao: false, side: THREE.DoubleSide });
  const jerseyN = ctx.tex('assets/ph/cotton_jersey/nor.jpg', { repeat: 3 });
  const cottonWhite = new THREE.MeshStandardMaterial({ color: 0xf3f0ea, roughness: 0.92, normalMap: jerseyN, normalScale: new THREE.Vector2(0.5, 0.5) });
  const mattressMat = new THREE.MeshStandardMaterial({ color: 0xece8df, roughness: 0.95, normalMap: jerseyN, normalScale: new THREE.Vector2(0.8, 0.8) });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.32, metalness: 1 });
  const blackMetal = new THREE.MeshStandardMaterial({ color: 0x1d1c1b, roughness: 0.45, metalness: 0.7 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.08, metalness: 1 });
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xf7f6f2, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 });
  const plum = new THREE.MeshStandardMaterial({ color: 0x4d1e42, roughness: 0.75, envMapIntensity: 0.7, normalMap: ctx.tex('assets/ph/white_maple_veneer/nor.jpg'), normalScale: new THREE.Vector2(0.05, 0.05) });
  plum.userData.worldSize = 1.2;   // matte wood-grain laminate
  const plumInner = new THREE.MeshStandardMaterial({ color: 0x3a1631, roughness: 0.6 });
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x241a1e, roughness: 0.7 });
  const whitePlastic = new THREE.MeshPhysicalMaterial({ color: 0xf4f3ef, roughness: 0.35, clearcoat: 0.3 });

  // =================================================================== BEDROOM
  // ---------------- bed frame (platform with ledge, dark walnut)
  const BX1 = 2.85, BX2 = 7.75, BY1 = 0.5, BY2 = 7.3;    // frame footprint (true queen)
  const MX1 = 2.9, MX2 = 7.7, MY1 = 0.82, MY2 = 7.2;     // mattress
  const MT = 1.75;                                        // mattress top
  rbox(plinthMat, { x1: BX1 + 0.25, y1: 0.95, x2: BX2 - 0.25, y2: BY2 - 0.25, h1: 0, h2: 0.6 }, 0.02);
  rbox(walnut, { x1: BX1, y1: 0.78, x2: BX2, y2: BY2, h1: 0.58, h2: 1.02 }, 0.05);
  rbox(mattressMat, { x1: MX1, y1: MY1, x2: MX2, y2: MY2, h1: 1.0, h2: MT }, 0.12, G, 4);
  // headboard: walnut surround + 7 channel-tufted linen bolsters
  rbox(walnut, { x1: BX1 - 0.05, y1: 0.5, x2: BX2 + 0.05, y2: 0.66, h1: 0.4, h2: 2.92 }, 0.04);
  {
    const n = 7, x0 = BX1 + 0.08, x1 = BX2 - 0.08, w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) rbox(linenHead, { x1: x0 + i * w + 0.01, y1: 0.62, x2: x0 + (i + 1) * w - 0.01, y2: 0.86, h1: 1.05, h2: 2.82 }, 0.11, G, 5);
  }
  ctx.collide({ x1: BX1, y1: 0.5, x2: BX2, y2: BY2 });

  // ---------------- duvet: draped cloth with stripe print
  // Arc-length (u,v) grid: u across the bed, v from the top edge (y 2.3) to the foot. The top is puffy, edges roll over a
  // ~3.4" radius and drop ~10" (hem flares); foot corners drape radially so they round off and hang a little lower.
  // Turned-down corner (top-left, as drawn): the corner triangle A shows the white top sheet; a separate flap mesh
  // (cream underside) lies on triangle B with a 1.5" rolled fold along the diagonal.
  {
    const W = (MX2 - MX1) + 0.1, cx = (MX1 + MX2) / 2;
    const R = 0.28, Ld = 1.0;
    const Y0 = 2.0, Lb = MY2 + 0.05 - Y0;
    const top = MT + 0.06;
    const Su = W + 2 * Ld, Sv = Lb + Ld;
    const FA = 1.6;                                    // corner fold line lu+v=FA: ~(2.5,3.9)-(4.3,2.2)
    const BAND = 0.8;                                  // spread turned back across the full width (y 2.0-2.8)
    const ax = Ld;                                     // canvas u of the mattress-west edge

    // ---- print texture (non-repeating, covers the whole duvet)
    const N = 2048, c = canvas(N), g2 = c.getContext('2d');
    g2.save();
    g2.scale(N / Su, N / Sv);                          // draw in feet; (0,0) = west/top corner of the cloth
    g2.fillStyle = '#f1e6d3';
    g2.fillRect(0, 0, Su, Sv);
    g2.save();
    g2.beginPath(); g2.rect(0, 0, Su, Sv); g2.clip();
    g2.translate(Su / 2, Sv / 2);
    g2.rotate(Math.PI / 4);                            // "/" stripes in plan view
    const period = 0.5, bw = 0.29;
    for (let k = -30; k <= 30; k++) {
      g2.fillStyle = '#5e2a12';
      g2.fillRect(k * period, -10, bw, 20);
      g2.fillStyle = 'rgba(70,24,8,0.6)';
      g2.fillRect(k * period - 0.012, -10, 0.008, 20);
      g2.fillRect(k * period + bw + 0.004, -10, 0.008, 20);
    }
    g2.restore();
    g2.fillStyle = '#5e2f14';                          // hem band
    const hem = 0.1;
    g2.fillRect(0, 0, hem, Sv); g2.fillRect(Su - hem, 0, hem, Sv); g2.fillRect(0, Sv - hem, Su, hem);
    g2.fillStyle = '#e8dbc5';                          // turned-back band shows the plain cream reverse
    g2.fillRect(0, 0, Su, BAND);
    g2.fillStyle = 'rgba(150,130,110,0.35)';
    g2.fillRect(0, BAND - 0.03, Su, 0.012);            // hem stitch
    g2.fillStyle = 'rgba(90,60,40,0.35)';
    g2.fillRect(0, BAND, Su, 0.035);                   // shadow under the band's free edge
    // exposed top sheet where the corner was turned back (triangle A + the west drop beside it)
    g2.fillStyle = '#f6f3ed';
    g2.beginPath(); g2.moveTo(ax - 0.01, 0); g2.lineTo(ax + FA + 0.03, 0); g2.lineTo(ax - 0.01, FA + 0.03); g2.closePath(); g2.fill();
    g2.fillStyle = 'rgba(120,105,90,0.25)';            // soft shadow cast by the fold onto the sheet
    g2.beginPath(); g2.moveTo(ax + FA + 0.03, 0); g2.lineTo(ax + FA - 0.12, 0); g2.lineTo(ax, FA - 0.12); g2.lineTo(ax, FA + 0.03); g2.closePath(); g2.fill();
    g2.fillStyle = 'rgba(70,40,20,0.28)';              // shadow along the flap's free edges
    g2.fillRect(ax + FA, 0, 0.07, FA + 0.07); g2.fillRect(ax, FA, FA + 0.07, 0.07);
    g2.restore();
    const id = g2.getImageData(0, 0, N, N), d = id.data;     // woven noise
    for (let i = 0; i < d.length; i += 4) {
      const p = i / 4, x = p % N, y = (p / N) | 0;
      const n = (rng() - 0.5) * 10 + ((x + y) % 3 === 0 ? -4 : 0) + ((x % 4 === 0) ? -3 : 0);
      d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    g2.putImageData(id, 0, 0);
    const printTex = canvasTex(c, { aniso: 16 });
    printTex.wrapS = printTex.wrapT = THREE.ClampToEdgeWrapping;
    printTex.repeat.set(1, 1);

    // ---- shape functions
    const arc = (Math.PI / 2) * R;
    const prof = (s) => {                              // [outward offset, drop] for arc length s past the edge
      if (s <= 0) return [s, 0];
      if (s < arc) { const t = s / R; return [R * Math.sin(t), R * (1 - Math.cos(t))]; }
      const k = Math.min(1, (s - arc) / 0.75);
      return [R + 0.11 * k * k, R + (s - arc)];
    };
    const noise = (x, y) => Math.sin(x * 3.1 + Math.sin(y * 1.7) * 1.3) * Math.sin(y * 2.3 + 0.7) + 0.5 * Math.sin(x * 7.3 + y * 5.1);
    const surf = (u, v) => {                           // top-surface height (sx<=0, sy<=0)
      const sx = Math.abs(u) - W / 2, sy = v - Lb;
      const e = Math.min(1, -sx / 0.5) * Math.min(1, -sy / 0.5);
      let h = top + 0.06 * Math.sqrt(Math.max(0, e)) + 0.014 * noise(u, v) * e;
      if (v < BAND) h += 0.035 + 0.02 * Math.exp(-Math.pow(v / 0.08, 2));   // double layer of the turned-back band
      return h;
    };
    const inA = (u, v) => (u + W / 2) + v < FA;         // turned-back corner (incl. the west drop beside it)

    // ---- main drape
    const NU = 190, NV = 180;
    const pos = new Float32Array((NU + 1) * (NV + 1) * 3), uv = new Float32Array((NU + 1) * (NV + 1) * 2);
    const idx = [];
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const u = -Su / 2 + (Su * i) / NU, v = (Sv * j) / NV;
      const sx = Math.abs(u) - W / 2, sy = v - Lb, sg = Math.sign(u) || 1;
      let x, y, h;
      if (sx > 0 && sy > 0) {                          // foot corner: radial drape, hangs lower
        const dd = Math.hypot(sx, sy), cs = sx / dd, sn = sy / dd;
        const [o, dn] = prof(dd);
        const fold = 0.05 * Math.sin(Math.atan2(sy, sx) * 5) * Math.min(1, Math.max(0, dn - R) / 0.4);
        x = cx + sg * (W / 2 + (o + fold) * cs);
        y = Y0 + Lb + (o + fold) * sn;
        h = top - Math.min(dn, R + Ld - arc + 0.3);
      } else if (sx > 0) {                             // side drop
        const [o, dn] = prof(sx);
        x = cx + sg * (W / 2 + o + (0.035 * Math.sin(v * 6 + 1.3 + (u > 0 ? 2 : 0)) + 0.015 * Math.sin(v * 17)) * Math.min(1, Math.max(0, dn - R) / 0.45));
        y = Y0 + v;
        h = top - dn;
      } else if (sy > 0) {                             // foot drop
        const [o, dn] = prof(sy);
        x = cx + u;
        y = Y0 + Lb + o + (0.035 * Math.sin(u * 6 + 0.4) + 0.015 * Math.sin(u * 15)) * Math.min(1, Math.max(0, dn - R) / 0.45);
        h = top - dn;
      } else {                                         // top
        x = cx + u; y = Y0 + v;
        h = inA(u, v) ? MT + 0.025 + 0.02 * Math.min(1, -sx / 0.3) : surf(u, v);
      }
      const k = j * (NU + 1) + i;
      pos[3 * k] = F(x); pos[3 * k + 1] = F(h); pos[3 * k + 2] = F(y);
      uv[2 * k] = (u + Su / 2) / Su; uv[2 * k + 1] = 1 - v / Sv;
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a0 = j * (NU + 1) + i, b0 = a0 + 1, c0 = a0 + NU + 1, d0 = c0 + 1;
      idx.push(a0, c0, b0, b0, c0, d0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const duvetN = ctx.tex('assets/ph/cotton_jersey/nor.jpg', { repeat: 7 });
    const duvetMat = new THREE.MeshPhysicalMaterial({
      map: printTex, normalMap: duvetN, normalScale: new THREE.Vector2(0.85, 0.85), roughness: 0.9,
      sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xb59a80), side: THREE.DoubleSide,
    });
    const duvet = new THREE.Mesh(geo, duvetMat);
    duvet.castShadow = duvet.receiveShadow = true;
    duvet.name = 'bed1-duvet';
    G.add(duvet);

    // ---- turned-down flap (triangle B, cream underside) + rolled fold
    const underMat = new THREE.MeshPhysicalMaterial({
      color: 0xe2d2b8, roughness: 0.95, normalMap: ctx.tex('assets/ph/cotton_jersey/nor.jpg', { repeat: 2 }),
      normalScale: new THREE.Vector2(0.8, 0.8), sheen: 0.3, sheenColor: new THREE.Color(0xd8c8b0), side: THREE.DoubleSide,
    });
    const T = 0.035, rr = 0.05, n = 40;               // flap thickness above the duvet, fold radius (1.5" dia)
    const fp = [], fu = [], fi = [], row = [];
    for (let ia = 0; ia <= n; ia++) {
      row[ia] = [];
      for (let ib = 0; ib <= n - ia; ib++) {
        const aa = ia / n, bb = ib / n;
        const lu = FA - bb * FA, v = FA - aa * FA, u = lu - W / 2;
        const edge = Math.min(aa, bb) * FA;            // distance to a free edge
        const lift = T * Math.min(1, edge / 0.06 + 0.25) + 0.012 * Math.sin(lu * 5 + v * 3);
        fp.push(F(cx + u), F(surf(u, v) + lift), F(Y0 + v));
        fu.push(lu / 0.6, v / 0.6);
        row[ia][ib] = fp.length / 3 - 1;
      }
    }
    for (let ia = 0; ia < n; ia++) for (let ib = 0; ib < n - ia; ib++) {
      fi.push(row[ia][ib], row[ia + 1][ib], row[ia][ib + 1]);
      if (ib + 1 <= n - ia - 1) fi.push(row[ia][ib + 1], row[ia + 1][ib], row[ia + 1][ib + 1]);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
    fg.setIndex(fi);
    fg.computeVertexNormals();
    const flap = new THREE.Mesh(fg, underMat);
    flap.castShadow = flap.receiveShadow = true;
    G.add(flap);
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 1 / 24) {
      const lu = FA * (1 - t), v = FA * t, u = lu - W / 2;
      const hb = Math.max(surf(u, v) + T - rr * 0.9, MT + 0.025 + rr);
      pts.push(new THREE.Vector3(F(cx + u - rr * 0.35), F(hb), F(Y0 + v - rr * 0.35)));
    }
    const roll = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, F(rr), 16), underMat);
    roll.castShadow = roll.receiveShadow = true;
    G.add(roll);
    // soft rolled top edge of the turned-back band (from the corner fold to the east edge, over the side)
    const bp = [];
    for (let lu = FA - 0.05; lu <= W + 0.25; lu += 0.1) {
      const u = lu - W / 2, sx = u - W / 2;
      const hh = sx <= 0 ? surf(u, 0.04) : top + 0.03 - prof(sx)[1];
      bp.push(new THREE.Vector3(F(cx + Math.min(u, W / 2 + prof(Math.max(0, sx))[0])), F(hh - 0.01), F(Y0 + 0.03)));
    }
    const band = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bp), 64, F(0.05), 12), underMat);
    band.castShadow = band.receiveShadow = true;
    G.add(band);
  }

  // ---------------- pillows (two white) + rust chevron cushion
  for (const px of [4.05, 6.55]) {
    const p = new THREE.Mesh(pillowGeom(F(2.25), F(1.45), F(0.5)), cottonWhite);
    p.castShadow = p.receiveShadow = true;
    p.position.set(F(px), F(MT + 0.2), F(1.6));
    p.rotation.x = -0.32;           // leaning back on the headboard
    G.add(p);
  }
  {
    const tp = await ctx.model('assets/ph/throw_pillows_01/throw_pillows_01_1k.gltf');
    const keep = tp.getObjectByName('throw_pillows_01_pillow01');
    tp.getObjectByName('throw_pillows_01_pillow02')?.removeFromParent();
    keep.position.set(0, 0, 0);
    keep.quaternion.set(Math.SQRT1_2, 0, 0, Math.SQRT1_2);   // upright, no twist
    const cushion = ctx.fit(tp, { w: 1.45, h: 1.45 });
    ctx.place(cushion, { x: 5.3, y: 2.15, h: MT + 0.01, face: 'S' });
    cushion.rotation.x = -0.28;
  }

  // ---------------- area rug under the lower half of the bed (plan's brown outline): x 2.0-8.6, y 3.8-8.1
  {
    const x1 = 2.0, x2 = 8.6, y1 = 3.8, y2 = 7.7, t = 0.05;
    const N = 1024, c = canvas(N, Math.round(N * (y2 - y1) / (x2 - x1))), g2 = c.getContext('2d');
    const sx = c.width / (x2 - x1);
    g2.fillStyle = '#b5a286'; g2.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 2500; i++) {             // wool mottling
      g2.fillStyle = 'rgba(' + (rng() < 0.5 ? '255,250,240' : '110,90,70') + ',' + (0.03 + rng() * 0.04) + ')';
      g2.beginPath(); g2.ellipse(rng() * c.width, rng() * c.height, 3 + rng() * 14, 2 + rng() * 6, rng() * 3, 0, Math.PI * 2); g2.fill();
    }
    const band = (inset, wft, col) => { g2.strokeStyle = col; g2.lineWidth = wft * sx; const i = inset * sx + g2.lineWidth / 2; g2.strokeRect(i, i, c.width - 2 * i, c.height - 2 * i); };
    band(0, 0.1, '#6a4329');          // brown binding = plan outline
    band(0.32, 0.05, '#7d5236');      // inner keyline
    const map = canvasTex(c); map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    const rugMat = new THREE.MeshStandardMaterial({ map, roughness: 1, normalMap: ctx.tex('assets/ph/wool_boucle/nor.jpg', { repeat: 7 }), normalScale: new THREE.Vector2(0.9, 0.9) });
    const geo = new RoundedBoxGeometry(F(x2 - x1), F(t), F(y2 - y1), 2, F(0.012));
    // planar top-down uv so the border lands on the edges
    const p = geo.attributes.position, uvA = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uvA.setXY(i, p.getX(i) / F(x2 - x1) + 0.5, 0.5 - p.getZ(i) / F(y2 - y1));
    const rug = new THREE.Mesh(geo, rugMat);
    rug.position.set(F((x1 + x2) / 2), F(t / 2 + 0.002), F((y1 + y2) / 2));
    rug.receiveShadow = true;
    G.add(rug);
  }
  // potted plant in the NE corner beside the right nightstand
  {
    const plant = ctx.fit(await ctx.model('assets/ph/potted_plant_02/potted_plant_02_1k.gltf'), { w: 1.05, d: 1.05, h: 2.4 });
    ctx.place(plant, { x: 9.88, y: 1.18, face: 'W' });
    ctx.collide({ x1: 9.5, y1: 0.7, x2: 10.3, y2: 1.65 });
  }

  // ---------------- nightstands + lamps
  async function nightstand(x1, x2) {
    const y1 = 0.55, y2 = 2.05, top = 1.9;
    // slim black legs
    for (const [lx, ly] of [[x1 + 0.12, y1 + 0.12], [x2 - 0.12, y1 + 0.12], [x1 + 0.12, y2 - 0.12], [x2 - 0.12, y2 - 0.12]]) {
      const leg = cyl(blackMetal, F(0.04), F(0.03), F(0.36), 16, G);
      leg.position.set(F(lx), F(0.18), F(ly));
    }
    rbox(walnut, { x1, y1, x2, y2: y2 - 0.04, h1: 0.36, h2: top }, 0.05);
    // two drawers with shadow gap
    for (const [h1, h2] of [[0.42, 1.1], [1.15, 1.84]]) {
      rbox(walnut, { x1: x1 + 0.04, y1: y2 - 0.06, x2: x2 - 0.04, y2, h1, h2 }, 0.015);
      rbox(brass, { x1: (x1 + x2) / 2 - 0.22, y1: y2, x2: (x1 + x2) / 2 + 0.22, y2: y2 + 0.04, h1: (h1 + h2) / 2 + 0.12, h2: (h1 + h2) / 2 + 0.16 }, 0.012);
    }
    ctx.collide({ x1, y1, x2, y2 });
    // lamp
    const lx = (x1 + x2) / 2, ly = 1.3;
    const lamp = new THREE.Group();
    const prof = [];
    const pr = [[0, 0], [0.16, 0], [0.2, 0.03], [0.26, 0.15], [0.29, 0.32], [0.27, 0.5], [0.2, 0.66], [0.11, 0.78], [0.07, 0.86], [0.07, 0.9], [0, 0.9]];
    for (const [r, h] of pr) prof.push(new THREE.Vector2(F(r), F(h)));
    const glaze = new THREE.MeshPhysicalMaterial({ color: 0x7a3a20, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.15 });
    const base = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), glaze);
    base.scale.setScalar(0.85);
    base.castShadow = base.receiveShadow = true;
    lamp.add(base);
    const neck = cyl(brass, F(0.03), F(0.045), F(0.38), 16, lamp); neck.position.y = F(0.765 + 0.19);
    const shadeMat = ctx.pbr('rough_linen', { size: 1, color: 0xf2e8d6, noMap: true, roughness: 1, normalScale: 0.5, ao: false, side: THREE.DoubleSide, emissive: 0xffc98a, emissiveIntensity: 0.55 });
    shadeMat.normalMap = ctx.tex('assets/ph/rough_linen/nor.jpg', { repeat: 2 });
    shadeMat.roughnessMap = null;
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(F(0.42), F(0.46), F(0.62), 64, 1, true), shadeMat);
    shade.position.y = F(1.15 + 0.31);
    shade.castShadow = true;
    lamp.add(shade);
    for (const hh of [1.15, 1.77]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(F(hh < 1.5 ? 0.46 : 0.42), F(0.008), 6, 64), brass);
      rim.rotation.x = Math.PI / 2; rim.position.y = F(hh); lamp.add(rim);
    }
    const bulbGlow = new THREE.Mesh(new THREE.SphereGeometry(F(0.12), 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd6a0, emissiveIntensity: 2 }));
    bulbGlow.position.y = F(1.42); lamp.add(bulbGlow);
    const pl = new THREE.PointLight(0xffc98f, 1.6, F(9), 2);
    pl.position.y = F(1.4);
    lamp.add(pl);
    ctx.place(lamp, { x: lx, y: ly, h: top, face: 'S' });
    return { x1, x2, y1, y2, top };
  }
  const nsW = await nightstand(1.38, 2.78);
  const nsE = await nightstand(7.82, 9.22);
  // little lived-in bits: books on the left nightstand, a vase on the right one
  {
    const cols = [0x2f4858, 0xb8a27a, 0x7b2e22];
    let h = nsW.top;
    for (let i = 0; i < 3; i++) {
      const t = 0.07 + i * 0.01;
      const bk = rbox(new THREE.MeshStandardMaterial({ color: cols[i], roughness: 0.75 }), { x1: 1.5 + i * 0.02, y1: 1.5 - i * 0.03, x2: 2.25 - i * 0.03, y2: 2.0 - i * 0.02, h1: h, h2: h + t }, 0.01);
      bk.rotation.y = 0; h += t;
    }
    const vase = ctx.fit(await ctx.model('assets/ph/ceramic_vase_01/ceramic_vase_01_1k.gltf'), { h: 0.55 });
    ctx.place(vase, { x: 8.95, y: 1.8, h: nsE.top });
  }

  // ---------------- wardrobe (S wall), plum shutters
  {
    const x1 = 0.5, x2 = 7.85, y1 = 9.5, y2 = 11.5, top = 7.5, plH = 0.3;
    rbox(plinthMat, { x1, y1: y1 + 0.12, x2: x2 - 0.03, y2, h1: 0, h2: plH }, 0.005);
    const CE = ctx.CEILING, LB = top + 0.1;                                                  // loft from 7.6' to the ceiling
    const loft = new THREE.Group(); loft.userData.hideInTop = true; G.add(loft);             // (top view shows the 7.5' top)
    rbox(plumInner, { x1, y1: y1 + 0.07, x2: x2 - 0.06, y2, h1: plH, h2: top }, 0.005);   // carcass (dark, reads in the gaps)
    rbox(plum, { x1: x2 - 0.06, y1: y1 + 0.02, x2, y2, h1: plH, h2: top }, 0.01);           // exposed end panel / scribe
    rbox(plumInner, { x1, y1: y1 + 0.07, x2: x2 - 0.06, y2, h1: top, h2: CE }, 0.005, loft);
    rbox(plum, { x1: x2 - 0.06, y1: y1 + 0.02, x2, y2, h1: top, h2: CE }, 0.005, loft);
    rbox(plinthMat, { x1, y1: y1 + 0.02, x2: x2 - 0.06, y2: y1 + 0.075, h1: top - 0.03, h2: LB }, 0.003, loft);   // shadow reveal at 7.5'
    const n = 5, gap = 0.009, w = (x2 - x1 - 0.08) / n;
    for (let i = 0; i < n; i++) {
      const sx1 = x1 + 0.02 + i * w + gap / 2, sx2 = x1 + 0.02 + (i + 1) * w - gap / 2;
      rbox(plum, { x1: sx1, y1, x2: sx2, y2: y1 + 0.065, h1: plH + 0.01, h2: top - 0.03 }, 0.006);
      rbox(plum, { x1: sx1, y1, x2: sx2, y2: y1 + 0.065, h1: LB, h2: CE - 0.02 }, 0.006, loft);
      const lx = (sx1 + sx2) / 2;                                                              // loft finger pull, centred
      rbox(brass, { x1: lx - 0.2, y1: y1 - 0.05, x2: lx + 0.2, y2: y1 + 0.01, h1: LB + 0.12, h2: LB + 0.16 }, 0.01, loft);
      // handle: pairs (0,1),(2,3) meet in the middle; #4 single with handle on its west edge
      const hx = i === 0 || i === 2 ? sx2 - 0.12 : i === 1 || i === 3 ? sx1 + 0.12 : sx1 + 0.12;
      rbox(brass, { x1: hx - 0.025, y1: y1 - 0.09, x2: hx + 0.025, y2: y1 - 0.06, h1: 3.0, h2: 5.2 }, 0.012);
      for (const hh of [3.15, 5.05]) rbox(brass, { x1: hx - 0.015, y1: y1 - 0.07, x2: hx + 0.015, y2: y1 + 0.01, h1: hh - 0.015, h2: hh + 0.015 }, 0.005);
    }
    // hanging-rail interior hint is hidden; top shadow line under ceiling-free top
    ctx.collide({ x1, y1, x2, y2 });
  }

  // ---------------- roman blind over the window (mounted on the wall face above the opening)
  {
    const x1 = 2.3, x2 = 8.7;
    rbox(blackMetal, { x1, y1: 0.5, x2, y2: 0.66, h1: 7.62, h2: 7.82 }, 0.03);   // headrail
    rbox(blindLinen, { x1: x1 + 0.03, y1: 0.66, x2: x2 - 0.03, y2: 0.69, h1: 6.55, h2: 7.75 }, 0.01);
    const foldMat = blindLinen;
    for (const [hh, r] of [[6.62, 0.11], [6.95, 0.1], [7.28, 0.09]]) {
      const geo = new THREE.CapsuleGeometry(F(r), F(x2 - x1 - 0.06 - 2 * r), 6, 24);
      geo.rotateZ(Math.PI / 2);
      geo.scale(1, 0.6, 0.7);
      const m = new THREE.Mesh(geo, foldMat);
      m.position.set(F((x1 + x2) / 2), F(hh), F(0.69 + r * 0.6));
      m.castShadow = m.receiveShadow = true;
      G.add(m);
    }
    rbox(brass, { x1: x1 + 0.03, y1: 0.7, x2: x2 - 0.03, y2: 0.78, h1: 6.5, h2: 6.54 }, 0.01);   // bottom bar
  }

  // ---------------- split AC on the E wall, above the right nightstand
  {
    const g = new THREE.Group();
    g.userData.hideInTop = true;
    const body = new THREE.Mesh(new RoundedBoxGeometry(F(2.75), F(0.95), F(0.72), 4, F(0.12)), whitePlastic);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const louver = new THREE.Mesh(new RoundedBoxGeometry(F(2.3), F(0.12), F(0.2), 2, F(0.03)), new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.5 }));
    louver.position.set(0, F(-0.38), F(0.28));
    g.add(louver);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(F(0.18), F(0.05)), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x66c8ff, emissiveIntensity: 0.8 }));
    disp.position.set(F(0.9), F(-0.2), F(0.365));
    g.add(disp);
    g.rotation.y = -Math.PI / 2;    // front (+Z) -> W
    g.position.set(F(10.5 - 0.36), F(8.55), F(2.55));
    G.add(g);
  }

  // ---------------- framed art on the W wall
  {
    const c = canvas(768, 1024), g2 = c.getContext('2d');
    g2.fillStyle = '#efe7da'; g2.fillRect(0, 0, 768, 1024);
    const shapes = [
      ['#c46a3b', (g) => { g.beginPath(); g.arc(300, 420, 210, Math.PI, 0); g.lineTo(510, 760); g.lineTo(90, 760); g.closePath(); g.fill(); }],
      ['#e2b35f', (g) => { g.beginPath(); g.arc(520, 300, 120, 0, Math.PI * 2); g.fill(); }],
      ['#5e6b55', (g) => { g.beginPath(); g.ellipse(460, 760, 220, 120, 0, Math.PI, 0); g.fill(); }],
      ['#7b2e22', (g) => { g.fillRect(140, 560, 60, 330); }],
      ['#2f4858', (g) => { g.beginPath(); g.arc(560, 610, 70, Math.PI / 2, Math.PI * 1.5); g.fill(); }],
    ];
    for (const [col, fn] of shapes) { g2.fillStyle = col; fn(g2); }
    g2.strokeStyle = '#3a2b22'; g2.lineWidth = 4;
    g2.beginPath(); g2.moveTo(80, 900); g2.bezierCurveTo(260, 820, 420, 960, 690, 860); g2.stroke();
    const id = g2.getImageData(0, 0, 768, 1024);
    for (let i = 0; i < id.data.length; i += 4) { const n = (rng() - 0.5) * 14; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; }
    g2.putImageData(id, 0, 0);
    const art = canvasTex(c);
    const yc = 4.9, hc = 5.3, aw = 2.1, ah = 2.8;
    rbox(walnut, { x1: 0.5, y1: yc - aw / 2 - 0.1, x2: 0.62, y2: yc + aw / 2 + 0.1, h1: hc - ah / 2 - 0.1, h2: hc + ah / 2 + 0.1 }, 0.01);
    rbox(new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.9 }), { x1: 0.6, y1: yc - aw / 2, x2: 0.63, y2: yc + aw / 2, h1: hc - ah / 2, h2: hc + ah / 2 }, 0.005);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(F(aw - 0.5), F(ah - 0.5)), new THREE.MeshStandardMaterial({ map: art, roughness: 0.85 }));
    pic.rotation.y = Math.PI / 2;
    pic.position.set(F(0.635), F(hc), F(yc));
    G.add(pic);
  }

  // ---------------- ceiling fan
  {
    const fan = ctx.fit(await ctx.model('assets/ph/ceiling_fan/ceiling_fan_1k.gltf'), { w: 4.0, d: 4.0 });
    const bb = new THREE.Box3().setFromObject(fan);
    const hFt = (bb.max.y - bb.min.y) / FT;
    ctx.place(fan, { x: 5.5, y: 6.0, h: ctx.CEILING - hFt });
    fan.userData.hideInTop = true;
  }

  // =================================================================== TOILET A
  const TX1 = 11, TX2 = 15, TY1 = 0.5, TY2 = 7.5, TILE_H = 7;
  const tileTex = (base, vary, groutCol) => {
    // 1.2 m square = 2 x 4 tiles of 600 x 300 mm, stack bond
    const N = 1024, c = canvas(N), g2 = c.getContext('2d'), hc = canvas(N), h2 = hc.getContext('2d');
    g2.fillStyle = groutCol; g2.fillRect(0, 0, N, N);
    h2.fillStyle = '#000'; h2.fillRect(0, 0, N, N);
    const gw = 3, tw = N / 2, th = N / 4;
    for (let r = 0; r < 4; r++) for (let q = 0; q < 2; q++) {
      const k = 1 + (rng() - 0.5) * vary;
      const col = new THREE.Color(base).multiplyScalar(k);
      g2.fillStyle = '#' + col.getHexString();
      g2.fillRect(q * tw + gw, r * th + gw, tw - 2 * gw, th - 2 * gw);
      h2.fillStyle = '#fff'; h2.fillRect(q * tw + gw, r * th + gw, tw - 2 * gw, th - 2 * gw);
    }
    // faint stone mottling
    for (let i = 0; i < 1400; i++) {
      g2.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '90,80,70'},${0.025 + rng() * 0.03})`;
      const x = rng() * N, y = rng() * N, r = 4 + rng() * 26;
      g2.beginPath(); g2.ellipse(x, y, r * 1.8, r, rng() * 3, 0, Math.PI * 2); g2.fill();
    }
    const nor = canvasTex(normalFromHeight(hc, 3), { srgb: false });
    const m = new THREE.MeshPhysicalMaterial({ map: canvasTex(c), normalMap: nor, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.35 });
    m.userData.worldSize = 1.2;
    return m;
  };
  const wallTile = tileTex(0xcfc6b8, 0.05, '#b5ab9c');
  const showerTile = tileTex(0x8c8174, 0.08, '#766c60');
  const tileT = 0.04;
  // N wall (shower back wall), with the ventilator opening (x 12–13.8, h 6–7.5)
  rbox(showerTile, { x1: TX1, y1: TY1, x2: 12, y2: TY1 + tileT, h1: 0, h2: TILE_H }, 0.002);
  rbox(showerTile, { x1: 13.8, y1: TY1, x2: TX2, y2: TY1 + tileT, h1: 0, h2: TILE_H }, 0.002);
  rbox(showerTile, { x1: 12, y1: TY1, x2: 13.8, y2: TY1 + tileT, h1: 0, h2: 6 }, 0.002);
  // W wall: shower part (taupe) / WC part (greige), door opening y 5–7.5
  rbox(showerTile, { x1: TX1, y1: TY1 + tileT, x2: TX1 + tileT, y2: 2.8, h1: 0, h2: TILE_H }, 0.002);
  rbox(wallTile, { x1: TX1, y1: 2.8, x2: TX1 + tileT, y2: 5.0, h1: 0, h2: TILE_H }, 0.002);
  // E wall
  rbox(showerTile, { x1: TX2 - tileT, y1: TY1 + tileT, x2: TX2, y2: 2.8, h1: 0, h2: TILE_H }, 0.002);
  rbox(wallTile, { x1: TX2 - tileT, y1: 2.8, x2: TX2, y2: TY2 - tileT, h1: 0, h2: TILE_H }, 0.002);
  // S wall
  rbox(wallTile, { x1: TX1, y1: TY2 - tileT, x2: TX2 - tileT, y2: TY2, h1: 0, h2: TILE_H }, 0.002);
  // brushed steel tile-edge trim at 7'
  const brushed = new THREE.MeshStandardMaterial({ color: 0xbfc2c4, roughness: 0.35, metalness: 1 });
  for (const r of [
    { x1: TX1, y1: TY1, x2: 12, y2: TY1 + tileT + 0.02 }, { x1: 13.8, y1: TY1, x2: TX2, y2: TY1 + tileT + 0.02 },
    { x1: TX1, y1: TY1, x2: TX1 + tileT + 0.02, y2: 5.0 }, { x1: TX2 - tileT - 0.02, y1: TY1, x2: TX2, y2: TY2 },
    { x1: TX1, y1: TY2 - tileT - 0.02, x2: TX2, y2: TY2 },
  ]) rbox(brushed, { ...r, h1: TILE_H - 0.02, h2: TILE_H + 0.02 }, 0.005);
  // vertical trim where taupe meets greige
  for (const x of [TX1 + tileT, TX2 - tileT]) rbox(brushed, { x1: x - 0.015, y1: 2.79, x2: x + 0.015, y2: 2.81, h1: 0, h2: TILE_H }, 0.004);

  // ---------------- shower: glass screen, fittings, drain, corner shelf
  {
    const gy = 2.8;
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xeef6f4, roughness: 0.04, transmission: 0.92, thickness: 0.01, ior: 1.5, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(F(1.85), F(6.3), F(0.03)), glass);
    panel.position.set(F(TX1 + tileT + 0.95), F(0.12 + 3.15), F(gy));
    panel.renderOrder = 3;
    G.add(panel);
    rbox(brushed, { x1: TX1 + tileT, y1: gy - 0.04, x2: TX1 + tileT + 0.06, y2: gy + 0.04, h1: 0.05, h2: 6.45 }, 0.01);   // wall channel
    rbox(brushed, { x1: TX1 + tileT, y1: gy - 0.03, x2: 12.9, y2: gy + 0.03, h1: 0, h2: 0.12 }, 0.01);                     // floor channel
    // stabiliser bar to the N wall at the free edge
    const bar = cyl(brushed, F(0.03), F(0.03), F(gy - TY1 - tileT), 12, G);
    bar.rotation.x = Math.PI / 2; bar.position.set(F(12.85), F(6.35), F((TY1 + tileT + gy) / 2));
    ctx.collide({ x1: TX1, y1: gy - 0.05, x2: 12.9, y2: gy + 0.05 });
    // linear drain
    rbox(brushed, { x1: 11.25, y1: 2.45, x2: 12.8, y2: 2.62, h1: 0, h2: 0.035 }, 0.005);
    for (let i = 0; i < 13; i++) rbox(blackMetal, { x1: 11.32 + i * 0.115, y1: 2.5, x2: 11.35 + i * 0.115, y2: 2.57, h1: 0.035, h2: 0.038 }, 0.002);
    // mixer + rain shower on the W wall at y 1.6
    const wx = TX1 + tileT;
    const mix = cyl(chrome, F(0.22), F(0.22), F(0.04), 40, G); mix.rotation.z = Math.PI / 2; mix.position.set(F(wx + 0.02), F(3.6), F(1.6));
    const lever = rbox(chrome, { x1: wx + 0.02, y1: 1.56, x2: wx + 0.35, y2: 1.64, h1: 3.57, h2: 3.63 }, 0.02); void lever;
    const riser = cyl(chrome, F(0.04), F(0.04), F(3.2), 16, G); riser.position.set(F(wx + 0.12), F(3.6 + 1.6), F(1.6));
    const arm = cyl(chrome, F(0.035), F(0.035), F(0.95), 16, G); arm.rotation.z = Math.PI / 2; arm.position.set(F(wx + 0.12 + 0.47), F(6.8), F(1.6));
    const head = cyl(chrome, F(0.4), F(0.4), F(0.04), 48, G); head.position.set(F(wx + 1.0), F(6.76), F(1.6));
    const nozzles = cyl(new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 }), F(0.36), F(0.36), F(0.005), 48, G); nozzles.position.set(F(wx + 1.0), F(6.738), F(1.6));
    // hand shower on its bracket
    rbox(chrome, { x1: wx, y1: 1.05, x2: wx + 0.1, y2: 1.15, h1: 4.4, h2: 4.5 }, 0.02);
    const hand = cyl(chrome, F(0.05), F(0.035), F(0.7), 16, G); hand.position.set(F(wx + 0.12), F(4.6), F(1.1)); hand.rotation.z = -0.12;
    const hh = cyl(chrome, F(0.11), F(0.07), F(0.06), 24, G); hh.position.set(F(wx + 0.16), F(4.97), F(1.1));
    // corner shelf (NE corner) with bottles
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(F(0.85), 0); sh.absarc(0, 0, F(0.85), 0, Math.PI / 2, false); sh.lineTo(0, 0);
    const shelfG = new THREE.ExtrudeGeometry(sh, { depth: F(0.04), bevelEnabled: false, curveSegments: 24 });
    shelfG.rotateX(Math.PI / 2);
    for (const hS of [3.9, 4.9]) {
      const s = new THREE.Mesh(shelfG, chrome);
      s.rotation.y = Math.PI / 2;           // arc into the room from the NE corner (towards -x, +y)
      s.position.set(F(TX2 - tileT), F(hS), F(TY1 + tileT));
      s.castShadow = s.receiveShadow = true;
      G.add(s);
    }
    const bottle = (x, y, hS, h, r, col) => {
      const b = cyl(new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.3, clearcoat: 0.6 }), F(r), F(r), F(h), 24, G);
      b.position.set(F(x), F(hS + h / 2), F(y));
      const cap = cyl(blackMetal, F(r * 0.55), F(r * 0.6), F(0.08), 16, G); cap.position.set(F(x), F(hS + h + 0.04), F(y));
    };
    bottle(14.75, 0.75, 3.9, 0.62, 0.11, 0xe9e4da);
    bottle(14.5, 0.72, 3.9, 0.5, 0.1, 0x3f5a52);
    bottle(14.75, 1.0, 3.9, 0.45, 0.09, 0xb98a5a);
  }

  // ---------------- wall-hung WC on the W wall (faces E), centred y 3.9
  {
    const g = new THREE.Group();
    // body: elongated lathe bowl, flat back block to the wall
    const pr = [[0, 0], [0.3, 0], [0.38, 0.05], [0.47, 0.25], [0.55, 0.52], [0.58, 0.64], [0.56, 0.68], [0, 0.68]];
    const lat = new THREE.LatheGeometry(pr.map(([r, h]) => new THREE.Vector2(F(r), F(h))), 64);
    lat.scale(1, 1, 1.45);
    const bowl = new THREE.Mesh(lat, ceramic); bowl.position.set(0, 0, F(1.0)); g.add(bowl);
    const back = new THREE.Mesh(new RoundedBoxGeometry(F(0.95), F(0.66), F(0.7), 4, F(0.12)), ceramic);
    back.position.set(0, F(0.34), F(0.35)); g.add(back);
    // seat + lid (soft white, closed)
    const seatG = new THREE.CylinderGeometry(F(0.57), F(0.57), F(0.05), 64); seatG.scale(1, 1, 1.42);
    const seat = new THREE.Mesh(seatG, ceramic); seat.position.set(0, F(0.705), F(1.02)); g.add(seat);
    const lidG = new THREE.CylinderGeometry(F(0.54), F(0.56), F(0.06), 64); lidG.scale(1, 1, 1.4);
    const lid = new THREE.Mesh(lidG, ceramic); lid.position.set(0, F(0.76), F(1.0)); g.add(lid);
    const hinge = new THREE.Mesh(new RoundedBoxGeometry(F(0.5), F(0.08), F(0.12), 2, F(0.03)), chrome); hinge.position.set(0, F(0.74), F(0.27)); g.add(hinge);
    S(g);
    ctx.place(g, { x: TX1 + tileT, y: 3.9, h: 0.62, face: 'E' });
    // concealed cistern flush plate
    rbox(chrome, { x1: TX1 + tileT, y1: 3.6, x2: TX1 + tileT + 0.03, y2: 4.2, h1: 3.35, h2: 3.75 }, 0.02);
    rbox(new THREE.MeshStandardMaterial({ color: 0xd8dadc, roughness: 0.2, metalness: 1 }), { x1: TX1 + tileT + 0.02, y1: 3.65, x2: TX1 + tileT + 0.045, y2: 3.88, h1: 3.4, h2: 3.7 }, 0.015);
    rbox(new THREE.MeshStandardMaterial({ color: 0xd8dadc, roughness: 0.2, metalness: 1 }), { x1: TX1 + tileT + 0.02, y1: 3.92, x2: TX1 + tileT + 0.045, y2: 4.15, h1: 3.4, h2: 3.7 }, 0.015);
    ctx.collide({ x1: TX1, y1: 3.3, x2: TX1 + 1.95, y2: 4.5 });
    // health faucet (left of WC) + roll holder (right)
    const wx = TX1 + tileT;
    rbox(chrome, { x1: wx, y1: 3.0, x2: wx + 0.12, y2: 3.12, h1: 1.55, h2: 1.67 }, 0.03);
    const hf = cyl(chrome, F(0.04), F(0.05), F(0.42), 16, G); hf.position.set(F(wx + 0.16), F(1.5), F(3.06)); hf.rotation.z = 0.25;
    const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(F(wx + 0.08), F(1.6), F(3.06)), new THREE.Vector3(F(wx + 0.1), F(1.0), F(3.1)),
      new THREE.Vector3(F(wx + 0.12), F(0.75), F(3.02)), new THREE.Vector3(F(wx + 0.18), F(1.25), F(3.06))]), 32, F(0.018), 8), chrome);
    hose.castShadow = true; G.add(hose);
    rbox(chrome, { x1: wx, y1: 4.72, x2: wx + 0.06, y2: 4.82, h1: 2.3, h2: 2.4 }, 0.02);
    const roll = cyl(new THREE.MeshStandardMaterial({ color: 0xf8f8f6, roughness: 0.95 }), F(0.2), F(0.2), F(0.36), 24, G);
    roll.rotation.z = Math.PI / 2; roll.position.set(F(wx + 0.28), F(2.25), F(4.77));
    const rod = cyl(chrome, F(0.02), F(0.02), F(0.45), 8, G); rod.rotation.z = Math.PI / 2; rod.position.set(F(wx + 0.26), F(2.35), F(4.77));
  }

  // ---------------- wall-hung basin on the E wall (faces W), centred y 6.4
  {
    const BW = 1.7, BD = 1.25, top = 2.8, bodyH = 0.5;
    const rr = (path, x1, z1, x2, z2, r) => {
      path.moveTo(x1 + r, z1); path.lineTo(x2 - r, z1); path.quadraticCurveTo(x2, z1, x2, z1 + r);
      path.lineTo(x2, z2 - r); path.quadraticCurveTo(x2, z2, x2 - r, z2); path.lineTo(x1 + r, z2);
      path.quadraticCurveTo(x1, z2, x1, z2 - r); path.lineTo(x1, z1 + r); path.quadraticCurveTo(x1, z1, x1 + r, z1);
    };
    const sh = new THREE.Shape();
    rr(sh, F(-BW / 2), 0, F(BW / 2), F(BD), F(0.05));
    const hx = 0.62, hz1 = 0.3, hz2 = 1.1;
    const hole = new THREE.Path();
    rr(hole, F(-hx), F(hz1), F(hx), F(hz2), F(0.12));
    sh.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: F(bodyH), bevelEnabled: true, bevelThickness: F(0.012), bevelSize: F(0.012), bevelSegments: 3, curveSegments: 12 });
    geo.rotateX(Math.PI / 2);       // shape y -> +Z (out of wall), extrude -> down
    const g = new THREE.Group();
    const body = new THREE.Mesh(geo, ceramic); g.add(body);
    // bowl cavity: rounded box seen from inside
    const bowl = new THREE.Mesh(new RoundedBoxGeometry(F(2 * hx), F(0.4), F(hz2 - hz1), 4, F(0.1)),
      new THREE.MeshPhysicalMaterial({ color: 0xf2f1ec, roughness: 0.14, clearcoat: 1, side: THREE.BackSide }));
    bowl.position.set(0, F(-0.2), F((hz1 + hz2) / 2)); g.add(bowl);
    const bowlCZ = F((hz1 + hz2) / 2);
    const drain = cyl(chrome, F(0.07), F(0.07), F(0.01), 24, g); drain.position.set(0, F(-0.395), bowlCZ);
    // chrome bottle trap under the basin
    const tail = cyl(chrome, F(0.05), F(0.05), F(0.6), 16, g); tail.position.set(0, F(-bodyH - 0.3), bowlCZ);
    const bottleT = cyl(chrome, F(0.11), F(0.11), F(0.38), 24, g); bottleT.position.set(0, F(-bodyH - 0.75), bowlCZ);
    const outP = cyl(chrome, F(0.045), F(0.045), F(hz1 + 0.4), 16, g); outP.rotation.x = Math.PI / 2; outP.position.set(0, F(-bodyH - 0.68), bowlCZ / 2);
    const rose = cyl(chrome, F(0.09), F(0.09), F(0.03), 24, g); rose.rotation.x = Math.PI / 2; rose.position.set(0, F(-bodyH - 0.68), F(0.015));
    // single-lever mixer on the back deck
    const tap = new THREE.Group();
    const tb = cyl(chrome, F(0.08), F(0.09), F(0.55), 24, tap); tb.position.y = F(0.275);
    const sp = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, F(0.5), 0), new THREE.Vector3(0, F(0.62), F(0.12)), new THREE.Vector3(0, F(0.6), F(0.38)), new THREE.Vector3(0, F(0.52), F(0.45))]), 24, F(0.035), 12), chrome);
    tap.add(sp);
    const lv = cyl(chrome, F(0.025), F(0.025), F(0.28), 12, tap); lv.position.set(0, F(0.62), F(-0.08)); lv.rotation.x = -1.1;
    tap.position.set(0, 0, F(0.17)); g.add(tap);
    // tumbler with toothbrushes
    const tum = new THREE.Mesh(new THREE.CylinderGeometry(F(0.1), F(0.085), F(0.32), 24, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x9fb3aa, roughness: 0.2, clearcoat: 1, side: THREE.DoubleSide }));
    tum.position.set(F(-0.55), F(0.16), F(0.17)); g.add(tum);
    for (const [dx, col] of [[-0.03, 0x2f6f8f], [0.03, 0xe8e2d8]]) {
      const tb2 = cyl(new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 }), F(0.02), F(0.02), F(0.62), 8, g);
      tb2.position.set(F(-0.55 + dx), F(0.38), F(0.17)); tb2.rotation.z = dx * 4;
    }
    // soap dispenser + small tray
    const soap = cyl(new THREE.MeshPhysicalMaterial({ color: 0x5a6b5f, roughness: 0.25, clearcoat: 1 }), F(0.1), F(0.1), F(0.4), 24, g);
    soap.position.set(F(0.55), F(0.2), F(0.2));
    const pump = cyl(chrome, F(0.03), F(0.04), F(0.12), 12, g); pump.position.set(F(0.55), F(0.46), F(0.2));
    S(g);
    ctx.place(g, { x: TX2 - tileT, y: 6.4, h: top, face: 'W' });
    ctx.collide({ x1: TX2 - BD - 0.05, y1: 6.4 - BW / 2, x2: TX2, y2: 6.4 + BW / 2 });

    // mirror (planar reflection) on a brushed back plate + slim LED bar above
    const my1 = 5.65, my2 = 7.15, mh1 = 3.75, mh2 = 5.75, mx = TX2 - tileT;
    rbox(brushed, { x1: mx - 0.075, y1: my1 - 0.03, x2: mx - 0.01, y2: my2 + 0.03, h1: mh1 - 0.03, h2: mh2 + 0.03 }, 0.015);
    const mirror = new Reflector(new THREE.PlaneGeometry(F(my2 - my1), F(mh2 - mh1)), {
      textureWidth: 768, textureHeight: 1024, color: 0xc9cccd, clipBias: 0.003,
    });
    mirror.rotation.y = -Math.PI / 2;
    mirror.position.set(F(mx - 0.08), F((mh1 + mh2) / 2), F((my1 + my2) / 2));
    G.add(mirror);
    rbox(brushed, { x1: mx - 0.2, y1: my1 + 0.15, x2: mx, y2: my2 - 0.15, h1: mh2 + 0.12, h2: mh2 + 0.2 }, 0.02);
    rbox(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe2b8, emissiveIntensity: 2.2 }),
      { x1: mx - 0.19, y1: my1 + 0.17, x2: mx - 0.02, y2: my2 - 0.17, h1: mh2 + 0.11, h2: mh2 + 0.125 }, 0.003);
  }
  // ---------------- towel rail with towel on the S wall, bath mat
  {
    const y = TY2 - tileT;
    for (const x of [11.55, 13.15]) rbox(chrome, { x1: x - 0.04, y1: y - 0.25, x2: x + 0.04, y2: y, h1: 4.36, h2: 4.44 }, 0.02);
    const rail = cyl(chrome, F(0.025), F(0.025), F(1.7), 12, G); rail.rotation.z = Math.PI / 2; rail.position.set(F(12.35), F(4.4), F(y - 0.22));
    const terry = ctx.tex('assets/ph/cotton_jersey/nor.jpg', { repeat: 5 });
    const towelMat = new THREE.MeshStandardMaterial({ color: 0x6f7f74, roughness: 1, normalMap: terry, normalScale: new THREE.Vector2(1.2, 1.2) });
    rbox(towelMat, { x1: 11.75, y1: y - 0.3, x2: 12.95, y2: y - 0.24, h1: 2.9, h2: 4.43 }, 0.025);
    rbox(towelMat, { x1: 11.75, y1: y - 0.2, x2: 12.95, y2: y - 0.14, h1: 3.3, h2: 4.43 }, 0.025);
    const fold = cyl(towelMat, F(0.06), F(0.06), F(1.2), 16, G); fold.rotation.z = Math.PI / 2; fold.position.set(F(12.35), F(4.45), F(y - 0.22));
    // bath mat at the shower entry
    const matN = ctx.tex('assets/ph/wool_boucle/nor.jpg', { repeat: 3 });
    rbox(new THREE.MeshStandardMaterial({ color: 0x55665a, roughness: 1, normalMap: matN, normalScale: new THREE.Vector2(1.4, 1.4) }), { x1: 13.2, y1: 3.05, x2: 14.7, y2: 4.05, h1: 0, h2: 0.05 }, 0.025);
    rbox(new THREE.MeshStandardMaterial({ color: 0x7d8f80, roughness: 1, normalMap: matN, normalScale: new THREE.Vector2(1.8, 1.8) }), { x1: 13.3, y1: 3.15, x2: 14.6, y2: 3.95, h1: 0.02, h2: 0.065 }, 0.03);
  }

  // ---------------- toilet ceiling downlight
  {
    const dl = cyl(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0dc, emissiveIntensity: 2 }), F(0.28), F(0.28), F(0.02), 32, G);
    dl.position.set(F(13), F(ctx.CEILING - 0.01), F(4.0));
    dl.userData.hideInTop = true;
    const tl = new THREE.PointLight(0xfff0dc, 2.2, F(11), 2);
    tl.position.set(F(13), F(ctx.CEILING - 0.5), F(4.0));
    ctx.light(tl);
  }
}
