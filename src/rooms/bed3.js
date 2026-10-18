// Piece: bed3 — Bedroom 3 (12'x13'), interior x 12–24, y 24.5–37.5. Door N wall x 12–15, window S wall x 15.5–21.
//
// What's where (plan feet):
//   wardrobe   built-in sliding wardrobe, matte plum veneer, x 16.6–24.0, y 24.5–26.45, h 0–7.5 (3 sliding panels, recessed pulls)
//              + loft with 4 hinged shutters 7.55'–ceiling
//   bed        queen (60"x75" mattress) headboard on E wall, frame x 17.25–24.0, y 28.45–33.65 (centre y 31.05), facing W;
//              draped rust/cream diagonal-stripe duvet to h 0.62 (unfolded UVs, welded + folds), cream turned-down corner
//              x 20.55–21.65, y 32.25–33.4; plump white pillows + upright cream Euro pillows
//   nightstands walnut, 1.4' wide, tight to the headboard: y 26.98–28.38 and 33.72–35.12 (x 22.45–24.0), round drum-shade lamps
//   rug        caramel jute flat-weave, dark-brown border, x 15.8–21.5, y 27.0–35.2 (the plan's outlined rectangle), corner knots
//   art        two framed prints above the headboard (E wall); full-length mirror on the W wall at y 34.6
//   curtains   linen drapes stacked either side of the S window, rod at 8.35'
//   plant      money tree (pachira) in a stone planter in the SE corner (PLANT, x 23.1, y 36.75)
//   AC         split AC high on the W wall; ceiling fan at room centre (hidden in top view)
//   shadows    soft contact-shadow decals under bed, nightstands, wardrobe plinth, planter
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

export const views = {
  'bed3-a': { pos: [13.2, 25.6], look: [22, 32.5] },
  'bed3-b': { pos: [13.0, 36.6], look: [22, 27.5] },
  'bed3-c': { pos: [12.6, 31.2], look: [24, 31.2], lookH: 3.2 },
  'bed3-d': { pos: [22.6, 36.9], look: [14, 26], lookH: 4 },
};

const FTM = 0.3048;
const m = (ft) => ft * FTM;

// ---------------------------------------------------------------- geometry helpers
// Subdivided box rounded by projection onto an inner box (proper rounded edges, analytic normals),
// with an optional `deform(v, n, info)` hook for drapes/wrinkles. Sizes in metres, centred at origin.
// UVs: world-planar per original face (u,v in metres / size), applied after `offset` (metres) is added.
function softBox(w, h, d, r, { seg = [8, 4, 8], deform, offset = new THREE.Vector3(), uvSize = 1, uvFn } = {}) {
  const g = new THREE.BoxGeometry(w, h, d, seg[0], seg[1], seg[2]);
  const p = g.attributes.position, fn = g.attributes.normal;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), f = new THREE.Vector3();
  const uv = new Float32Array(p.count * 2), nor = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    f.fromBufferAttribute(fn, i);
    c.set(THREE.MathUtils.clamp(v.x, -hw, hw), THREE.MathUtils.clamp(v.y, -hh, hh), THREE.MathUtils.clamp(v.z, -hd, hd));
    n.subVectors(v, c);
    if (n.lengthSq() < 1e-12) n.copy(f); else n.normalize();
    v.copy(c).addScaledVector(n, r);
    if (deform) deform(v, n, { w, h, d, face: f });
    v.add(offset);
    p.setXYZ(i, v.x, v.y, v.z);
    nor[i * 3] = n.x; nor[i * 3 + 1] = n.y; nor[i * 3 + 2] = n.z;
    let U, V;
    if (uvFn) [U, V] = uvFn(v, f, c.clone().add(offset), n);
    else if (Math.abs(f.y) > 0.5) { U = v.x; V = -v.z; } else if (Math.abs(f.x) > 0.5) { U = v.z; V = v.y; } else { U = v.x; V = v.y; }
    uv[i * 2] = U / uvSize; uv[i * 2 + 1] = V / uvSize;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('uv1', new THREE.BufferAttribute(uv.slice(), 2));
  return g;
}

// Rounded box in plan feet (RoundedBoxGeometry: flat faces stay flat, only the edges curve).
// World-planar UVs picked per vertex from the dominant normal axis. Returns mesh added to `parent`.
function rbox(parent, mat, { x1, y1, x2, y2, h1, h2, r = 0.01, uvSize, seg = 3, vgrain = false }) {
  const w = m(x2 - x1), hh = m(h2 - h1), d = m(y2 - y1);
  const rr = Math.max(1e-4, Math.min(r, w / 2 - 1e-4, hh / 2 - 1e-4, d / 2 - 1e-4));
  const g = new RoundedBoxGeometry(w, hh, d, Array.isArray(seg) ? 3 : seg, rr);
  g.translate(m((x1 + x2) / 2), m((h1 + h2) / 2), m((y1 + y2) / 2));
  const size = uvSize ?? mat.userData?.worldSize ?? 1;
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ay >= ax && ay >= az) uv.setXY(i, x / size, -z / size);
    else if (ax >= az) vgrain ? uv.setXY(i, y / size, z / size) : uv.setXY(i, z / size, y / size);
    else vgrain ? uv.setXY(i, y / size, x / size) : uv.setXY(i, x / size, y / size);
  }
  g.setAttribute('uv1', uv.clone());
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Pillow: subdivided box whose thickness tapers to the seams; weld + smooth normals.
function pillowGeom(w, t, d, uvSize = 0.3) {
  let g = new THREE.BoxGeometry(w, t, d, 24, 4, 16);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(2 * x / w), az = Math.abs(2 * z / d);
    const k = Math.pow(Math.max(0, 1 - Math.pow(ax, 2.6)), 0.6) * Math.pow(Math.max(0, 1 - Math.pow(az, 2.6)), 0.6);
    const bulge = (1 + 0.04 * Math.sin(x * 23) * Math.sin(z * 17)) * (1 - 0.16 * Math.exp(-(ax * ax + az * az) / 0.18) * (y > 0 ? 1 : 0)); // head dent
    p.setXYZ(i, x * (1 - 0.03 * (1 - k)), y * Math.max(0.12, k) * bulge, z * (1 - 0.03 * (1 - k)));
  }
  g.computeVertexNormals();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / uvSize; uv[i * 2 + 1] = p.getZ(i) / uvSize; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Pleated curtain panel: width w (gathered), height h, pleats n. Local: X across, Y up, Z depth (pleat).
function curtainGeom(w, h, n, depth) {
  const g = new THREE.PlaneGeometry(w, h, n * 8, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const t = (x / w + 0.5) * n * Math.PI * 2;
    const flare = 1 + 0.35 * (0.5 - y / h); // pleats open up a little toward the hem
    p.setZ(i, Math.sin(t) * depth * 0.5 * flare + Math.sin(t * 0.5 + 1.3) * depth * 0.12);
    p.setX(i, x * (1 + 0.03 * (0.5 - y / h)));
  }
  g.computeVertexNormals();
  g.translate(0, h / 2, 0);
  return g;
}

// ---------------------------------------------------------------- textures
function stripeTexture(THREE_) {
  // Rust-brown / cream diagonal stripes ("/" as seen from above, north up), woven-cotton feel.
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const P = S / 4; // 4 stripe periods per tile (tile = 0.6 m) -> ~6" period
  const img = g.createImageData(S, S), D = img.data;
  const rust = [112, 52, 26], rustDk = [88, 38, 16], cream = [240, 214, 182];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const t = ((x + y) % P + P) % P / P; // 0..1 across one period
      // rust band 0..0.58, cream 0.58..1, soft edges, thin darker pinstripes just inside the rust band
      const edge = (a, b, s) => Math.min(1, Math.max(0, (s - a) / (b - a)));
      const inCream = edge(0.575, 0.6, t) * (1 - edge(0.985, 1.0, t));
      const pin = (t > 0.035 && t < 0.05) || (t > 0.53 && t < 0.545) ? 1 : 0;
      const base = rust.map((v, i) => v * (1 - pin) + rustDk[i] * pin);
      const col = base.map((v, i) => v * (1 - inCream) + cream[i] * inCream);
      // weave: alternating warp/weft micro-pattern + noise
      const wv = ((x >> 1) + (y >> 1)) & 1 ? 1.03 : 0.97;
      const nz = 0.94 + rnd() * 0.08;
      const k = (y * S + x) * 4;
      D[k] = Math.min(255, col[0] * wv * nz); D[k + 1] = Math.min(255, col[1] * wv * nz); D[k + 2] = Math.min(255, col[2] * wv * nz); D[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE_.CanvasTexture(c);
  t.colorSpace = THREE_.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE_.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function rugTexture(THREE_) {
  // Caramel jute flat-weave field (fine herringbone), dark-brown border band with a sand pinline, as the plan's
  // brown-outlined rectangle. Maps the whole rug top (UV 0..1); 1024 px = 5.7 ft.
  const W = 1024, H = 1440, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H), D = img.data;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const field = [184, 140, 92], border = [94, 58, 32], pin = [214, 184, 140], bind = [150, 110, 72];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y); // distance to the edge (px)
      let col = field;
      if (e < 14) col = bind; // whipped edge binding
      else if (e < 78) col = border;
      else if (e >= 92 && e < 100) col = pin;
      // herringbone twill: diagonal ribs flipping every 24 px band
      const band = Math.floor(y / 24) & 1;
      const rib = ((band ? x + y : x - y + 4096) >> 2) & 1 ? 1.05 : 0.94;
      const n = (0.92 + rnd() * 0.12) * rib;
      const k = (y * W + x) * 4;
      D[k] = Math.min(255, col[0] * n); D[k + 1] = Math.min(255, col[1] * n); D[k + 2] = Math.min(255, col[2] * n); D[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE_.CanvasTexture(c);
  t.colorSpace = THREE_.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Soft contact-shadow decal texture (shared): blurred black rectangle on transparent.
let _blobTex;
function blobTexture(THREE_) {
  if (_blobTex) return _blobTex;
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.filter = 'blur(22px)';
  g.fillStyle = '#000';
  g.fillRect(52, 52, S - 104, S - 104);
  _blobTex = new THREE_.CanvasTexture(c);
  return _blobTex;
}

function artTexture(THREE_, variant) {
  // Abstract print: warm earthy arches/sun on paper (rust, ochre, plum, sage), with a white mat.
  const W = 600, H = 840, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#f4efe6'; g.fillRect(0, 0, W, H);
  const ix = 70, iy = 90, iw = W - 140, ih = H - 180;
  g.fillStyle = '#ece2d2'; g.fillRect(ix, iy, iw, ih);
  g.save();
  g.beginPath(); g.rect(ix, iy, iw, ih); g.clip();
  if (variant === 0) {
    g.fillStyle = '#c8865a'; g.beginPath(); g.arc(ix + iw * 0.5, iy + ih * 0.95, iw * 0.42, Math.PI, 0); g.fill();
    g.fillStyle = '#8f3f22'; g.beginPath(); g.arc(ix + iw * 0.5, iy + ih * 0.95, iw * 0.26, Math.PI, 0); g.fill();
    g.fillStyle = '#d9a441'; g.beginPath(); g.arc(ix + iw * 0.7, iy + ih * 0.28, iw * 0.11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6b2a4c'; g.fillRect(ix, iy + ih * 0.95, iw, ih * 0.05);
  } else {
    g.fillStyle = '#9aa68a'; g.beginPath(); g.ellipse(ix + iw * 0.38, iy + ih * 0.62, iw * 0.34, ih * 0.3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8f3f22'; g.fillRect(ix + iw * 0.55, iy + ih * 0.18, iw * 0.3, ih * 0.62);
    g.fillStyle = '#d9a441'; g.beginPath(); g.arc(ix + iw * 0.3, iy + ih * 0.25, iw * 0.09, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3d2a22'; g.lineWidth = 5; g.beginPath(); g.moveTo(ix + iw * 0.1, iy + ih * 0.85); g.bezierCurveTo(ix + iw * 0.4, iy + ih * 0.7, ix + iw * 0.6, iy + ih * 0.95, ix + iw * 0.92, iy + ih * 0.78); g.stroke();
  }
  g.restore();
  const t = new THREE_.CanvasTexture(c);
  t.colorSpace = THREE_.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- build
export default async function build(ctx) {
  const { group: G } = ctx;
  const R = ctx.rooms.bed3;

  // ---------- materials ----------
  const walnut = ctx.pbr('european_walnut_veneer_05', { size: 1.2, roughness: 0.7, color: 0xf0d8c0 });
  const walnutDark = ctx.pbr('european_walnut_veneer_05', { size: 1.2, roughness: 0.7, color: 0x9b8170 });
  // matte plum veneer laminate: ash grain (diffuse) multiplied by plum, faint relief, no clearcoat
  const plum = ctx.pbr('ash_veneer', { size: 2.4, color: 0x66306f, roughness: 0.82, normalScale: 0.08, envMapIntensity: 0.28 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8c7356, roughness: 0.4, metalness: 1 });
  const plumMatte = new THREE.MeshStandardMaterial({ color: 0x1e0f19, roughness: 0.85 }); // recessed kick, reads as a shadow line
  const champagne = new THREE.MeshStandardMaterial({ color: 0xc9b089, roughness: 0.32, metalness: 1 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8a165, roughness: 0.28, metalness: 1 });
  const shadowGap = new THREE.MeshStandardMaterial({ color: 0x1d1419, roughness: 0.9 });

  const stripe = stripeTexture(THREE);
  const linenN = ctx.tex('assets/ph/rough_linen/nor.jpg', { repeat: 6 });
  const jerseyN = ctx.tex('assets/ph/cotton_jersey/nor.jpg', { repeat: 3 });
  const spreadMat = new THREE.MeshStandardMaterial({ map: stripe, normalMap: linenN, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92 });
  const sheetMat = new THREE.MeshStandardMaterial({ color: 0xf3eee4, normalMap: jerseyN, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.95 });
  const euroMat = new THREE.MeshStandardMaterial({ color: 0xe2d2b8, normalMap: linenN, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.95 });
  const pillowMat = new THREE.MeshStandardMaterial({ color: 0xfbf8f2, normalMap: jerseyN, normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.93 });
  const headMat = ctx.pbr('velour_velvet', { size: 0.5, noMap: true, color: 0x94683f, roughness: 0.9, normalScale: 0.6, ao: false });
  const curtainMat = new THREE.MeshStandardMaterial({ color: 0xe6dccb, normalMap: ctx.tex('assets/ph/rough_linen/nor.jpg', { repeat: 4 }), normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.95, side: THREE.DoubleSide });

  const PLANT = { x: 23.1, y: 36.75 }; // SE corner, beside the window

  // ===================================================================== WARDROBE
  // Built-in sliding wardrobe along N wall: carcass x 16.6–24.0, y 24.5–26.2; sliding panels on two tracks to y 26.45;
  // loft with hinged shutters above (7.55'–ceiling) so it reads as a built-in. Matte plum veneer laminate.
  const W = { x1: 16.6, x2: 24.0, y1: R.y1, y2: 26.45, top: 7.5 };
  const CEIL = ctx.CEILING;
  const wt = 0.06; // 18 mm board
  // west end panel (exposed side), floor to ceiling, full depth to the front of the panels
  rbox(G, plum, { vgrain: true, x1: W.x1, x2: W.x1 + wt, y1: W.y1, y2: W.y2, h1: 0, h2: CEIL, r: 0.003 });
  // track box between wardrobe and loft, and recessed plinth
  rbox(G, plum, { vgrain: true, x1: W.x1 + wt, x2: W.x2, y1: W.y1, y2: W.y2, h1: W.top - 0.22, h2: W.top + 0.05, r: 0.003 });
  rbox(G, plumMatte, { x1: W.x1 + wt, x2: W.x2, y1: W.y1, y2: W.y2 - 0.2, h1: 0, h2: 0.3, r: 0.002 });
  // dark interior visible in the shadow line between panels and carcass
  ctx.box(shadowGap, { x1: W.x1 + wt, x2: W.x2, y1: 26.1, y2: 26.14, h1: 0.28, h2: W.top - 0.22 });
  // slim tracks
  rbox(G, bronze, { x1: W.x1 + wt, x2: W.x2, y1: 26.16, y2: W.y2, h1: W.top - 0.25, h2: W.top - 0.22, r: 0.002 });
  rbox(G, bronze, { x1: W.x1 + wt, x2: W.x2, y1: 26.16, y2: W.y2, h1: 0.28, h2: 0.3, r: 0.002 });
  // three sliding panels: outer two on the front track, middle one on the back track (overlapping 0.1')
  const span = W.x2 - (W.x1 + wt), pw = (span + 0.2) / 3;
  for (let i = 0; i < 3; i++) {
    const front = i !== 1;
    const x1 = W.x1 + wt + i * (span - pw) / 2, x2 = x1 + pw;
    const y1 = front ? 26.35 : 26.2, y2 = y1 + 0.08;
    const h1 = 0.31, h2 = W.top - 0.26;
    // slab split into three by fine V-grooves
    const cuts = [h1, 2.55, 5.0, h2];
    for (let k = 0; k < 3; k++) rbox(G, plum, { vgrain: true, x1: x1 + 0.025, x2: x2 - 0.025, y1, y2, h1: cuts[k] + (k ? 0.012 : 0), h2: cuts[k + 1] - (k < 2 ? 0.012 : 0), r: 0.003 });
    for (const hc of [2.55, 5.0]) ctx.box(shadowGap, { x1: x1 + 0.03, x2: x2 - 0.03, y1: y1 + 0.01, y2: y2 - 0.02, h1: hc - 0.012, h2: hc + 0.012 });
    // hairline edge profiles
    rbox(G, bronze, { x1, x2: x1 + 0.025, y1, y2: y2 + 0.005, h1, h2, r: 0.002 });
    rbox(G, bronze, { x1: x2 - 0.025, x2, y1, y2: y2 + 0.005, h1, h2, r: 0.002 });
    // recessed vertical pull: dark slot with a bronze lip, near the panel's meeting edge
    const px = i === 0 ? x2 - 0.2 : i === 2 ? x1 + 0.2 : x1 + 0.2;
    ctx.box(shadowGap, { x1: px - 0.035, x2: px + 0.035, y1: y2 - 0.035, y2: y2 + 0.001, h1: 3.0, h2: 4.6 });
    rbox(G, bronze, { x1: px - 0.04, x2: px + 0.04, y1: y2 - 0.002, y2: y2 + 0.006, h1: 4.58, h2: 4.62, r: 0.001 });
    rbox(G, bronze, { x1: px - 0.04, x2: px + 0.04, y1: y2 - 0.002, y2: y2 + 0.006, h1: 2.98, h2: 3.02, r: 0.001 });
  }
  // loft: 4 hinged shutters, flush with the front sliding panels, up to the ceiling
  {
    const lx1 = W.x1 + wt, n = 4, sw = (W.x2 - lx1) / n;
    ctx.box(shadowGap, { x1: lx1, x2: W.x2, y1: 26.3, y2: 26.34, h1: W.top + 0.05, h2: CEIL });
    for (let k = 0; k < n; k++) {
      const x1 = lx1 + k * sw + 0.008, x2 = lx1 + (k + 1) * sw - 0.008;
      rbox(G, plum, { vgrain: true, x1, x2, y1: 26.34, y2: 26.43, h1: W.top + 0.07, h2: CEIL - 0.02, r: 0.003 });
      const hx = k % 2 ? x1 + 0.12 : x2 - 0.12; // pulls at the meeting edges
      rbox(G, bronze, { x1: hx - 0.02, x2: hx + 0.02, y1: 26.43, y2: 26.47, h1: W.top + 0.12, h2: W.top + 0.5, r: 0.004 });
    }
  }
  ctx.collide({ x1: W.x1, y1: W.y1, x2: W.x2, y2: W.y2 });

  // ===================================================================== BED
  // Headboard on the E wall; frame x 17.25–23.72, y 28.45–33.65; mattress 60"x75".
  const B = { x1: 17.25, x2: 23.72, y1: 28.45, y2: 33.65 }; // centred on the plan's bed axis y≈31.05
  const by1 = B.y1, by2 = B.y2, bcy = (by1 + by2) / 2;
  // headboard: walnut back panel + 6 vertical upholstered channels
  rbox(G, walnut, { x1: 23.72, x2: 24.0, y1: by1 - 0.05, y2: by2 + 0.05, h1: 0.35, h2: 4.25, r: 0.01 });
  const nCh = 6, chW = (by2 - by1 - 0.1) / nCh;
  for (let i = 0; i < nCh; i++) {
    const y1 = by1 + 0.05 + i * chW;
    rbox(G, headMat, { x1: 23.5, x2: 23.74, y1: y1 + 0.006, y2: y1 + chW - 0.006, h1: 1.2, h2: 4.1, r: 0.03, seg: [3, 6, 3], uvSize: 0.5 });
  }
  // base: walnut box frame on recessed dark plinth, slim walnut legs at the foot corners (the plan's corner posts)
  rbox(G, walnut, { x1: B.x1, x2: B.x2, y1: by1, y2: by2, h1: 0.42, h2: 1.08, r: 0.012 });
  rbox(G, shadowGap, { x1: B.x1 + 0.4, x2: B.x2 - 0.2, y1: by1 + 0.4, y2: by2 - 0.4, h1: 0, h2: 0.45, r: 0.005 });
  for (const [lx, ly] of [[B.x1 + 0.06, by1 + 0.06], [B.x1 + 0.06, by2 - 0.06], [B.x2 - 0.3, by1 + 0.06], [B.x2 - 0.3, by2 - 0.06]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(m(0.09), m(0.065), m(0.44), 20), walnutDark);
    leg.position.copy(ctx.v3(lx + (lx < 20 ? 0.04 : -0.04), ly + (ly < bcy ? 0.04 : -0.04), 0.22));
    leg.castShadow = leg.receiveShadow = true;
    G.add(leg);
  }
  // mattress (fitted cream sheet)
  const M = { x1: 17.33, x2: 23.58, y1: bcy - 2.5, y2: bcy + 2.5, h1: 1.08, h2: 1.78 };
  rbox(G, sheetMat, { ...M, r: m(0.22), seg: [12, 4, 10], uvSize: 0.6 });
  // bedspread: a draped duvet over the foot and both long sides, from the foot to x 22.05. It encloses the frame top
  // (frame y 28.45–33.65, foot x 17.25) and hangs to h 0.62, so only ~2" of walnut frame and the legs show below.
  // Rounded roll-over at the top edge, flared hem with soft vertical folds, longer corners, slight loft on top.
  {
    const sx1 = 17.1, sx2 = 22.05, sy1 = by1 - 0.13, sy2 = by2 + 0.13, sh1 = 0.62, sh2 = M.h2 + 0.07;
    const w = m(sx2 - sx1), h = m(sh2 - sh1), d = m(sy2 - sy1), r = m(0.3);
    const topY = h / 2;
    let geom = softBox(w, h, d, r, {
      seg: [120, 28, 100],
      uvSize: 0.6,
      // "unfold" the cloth: arc length over the rounded edge + straight drop below it, per axis, so the
      // stripes run continuously from the top onto the foot and side drops (c = inner-box point, n = rounding normal)
      uvFn(v, f, c, n) {
        const cTop = m(sh2) - r;
        const run = (k) => (Math.abs(k) < 1e-6 ? 0 : Math.sign(k) * (r * Math.atan2(Math.abs(k), Math.max(n.y, 0)) + Math.max(0, cTop - c.y)));
        return [c.x + run(n.x), -(c.z + run(n.z))];
      },
      offset: ctx.v3((sx1 + sx2) / 2, (sy1 + sy2) / 2, (sh1 + sh2) / 2),
      // face-independent so shared seam vertices move identically (lets us weld + recompute normals)
      deform(v, n) {
        const drop = THREE.MathUtils.clamp((topY - r - v.y) / (h - 2 * r), 0, 1);
        const s1 = v.x - v.z;
        // loft / slight unevenness on the top
        v.y += 0.004 * n.y * n.y * Math.sin(v.x * 6.1 + 1.0) * Math.sin(v.z * 5.3);
        if (drop <= 0) return;
        const fold = Math.sin(s1 * 17 + 0.7) * 0.55 + Math.sin(s1 * 37 + 2.1) * 0.3 + Math.sin(s1 * 7.3) * 0.15;
        const a = 0.016 * drop * drop * fold + 0.022 * drop * drop; // folds + outward flare toward the hem
        const hn = Math.hypot(n.x, n.z) || 1;
        v.x += (n.x / hn) * a * Math.min(1, hn * 1.5); v.z += (n.z / hn) * a * Math.min(1, hn * 1.5);
        const corner = Math.min(Math.abs(n.x), Math.abs(n.z)) * 2; // vertical corners hang lower
        v.y += -0.05 * drop * corner + Math.sin(s1 * 11) * 0.006 * drop;
      },
    });
    geom.deleteAttribute('normal');
    geom = mergeVertices(geom);
    geom.computeVertexNormals();
    const mesh = new THREE.Mesh(geom, spreadMat);
    mesh.castShadow = mesh.receiveShadow = true;
    G.add(mesh);
    // turned-down band at the head end (cream reverse), rolled
    rbox(G, sheetMat, { x1: 21.6, x2: 22.14, y1: sy1 + 0.12, y2: sy2 - 0.12, h1: sh2 - 0.08, h2: sh2 + 0.05, r: m(0.05), uvSize: 0.6 });
    // the plan's triangular turned-down corner beside the south pillow (x 20.55–21.65, y 32.25–33.4): cream flap with a rolled fold edge
    const tri = new THREE.Shape();
    // shape X = plan east, shape Y = plan north (after rotation.x = -90deg); right angle at the SE
    tri.moveTo(0, 0); tri.lineTo(-m(1.1), 0); tri.lineTo(0, m(1.15)); tri.closePath();
    const tg = new THREE.ExtrudeGeometry(tri, { depth: m(0.03), bevelEnabled: true, bevelThickness: m(0.025), bevelSize: m(0.03), bevelSegments: 4 });
    const reverseMat = new THREE.MeshStandardMaterial({ color: 0xf0d9bc, normalMap: linenN, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.93 }); // duvet's cream reverse
    const tm = new THREE.Mesh(tg, reverseMat);
    tm.rotation.x = -Math.PI / 2;
    tm.position.copy(ctx.v3(21.64, 33.4, sh2 - 0.02));
    tm.castShadow = tm.receiveShadow = true;
    G.add(tm);
    // the fold line itself: a soft roll along the hypotenuse
    const p0 = ctx.v3(20.56, 33.38, sh2 + 0.03), p1 = ctx.v3(21.62, 32.27, sh2 + 0.03);
    const roll = new THREE.Mesh(new THREE.CapsuleGeometry(m(0.045), p0.distanceTo(p1), 4, 12), spreadMat);
    roll.position.copy(p0).add(p1).multiplyScalar(0.5);
    roll.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
    roll.castShadow = true;
    G.add(roll);
  }
  // pillows: two plump white sleeping pillows lying against two upright cream Euro pillows at the headboard
  for (const py of [bcy - 1.18, bcy + 1.18]) {
    const pm = new THREE.Mesh(pillowGeom(m(1.5), m(0.62), m(2.25)), pillowMat);
    pm.position.copy(ctx.v3(22.4, py, M.h2 + 0.27));
    pm.rotation.z = THREE.MathUtils.degToRad(12); // lift the headboard edge
    pm.castShadow = pm.receiveShadow = true;
    G.add(pm);
    const eu = new THREE.Mesh(pillowGeom(m(1.8), m(0.75), m(2.25)), euroMat);
    eu.rotation.z = THREE.MathUtils.degToRad(68); // stands up, leaning back on the headboard
    eu.position.copy(ctx.v3(22.95, py, M.h2 + 0.85));
    eu.castShadow = eu.receiveShadow = true;
    G.add(eu);
  }
  // accent cushions (scanned) leaning on the pillows
  try {
    const cush = ctx.fit(await ctx.model('assets/ph/throw_pillows_01/throw_pillows_01_1k.gltf'), { w: 1.9 });
    ctx.place(cush, { x: 21.85, y: bcy, h: M.h2 + 0.09, face: 'W' });
  } catch (e) { console.warn('bed3 cushions', e); }
  ctx.collide({ x1: B.x1, y1: by1, x2: 24.0, y2: by2 });

  // ===================================================================== NIGHTSTANDS + LAMPS
  const nsDefs = [{ y1: 26.98, y2: 28.38 }, { y1: 33.72, y2: 35.12 }]; // 1.4' wide, tight to the headboard
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xf2e8d6, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffd9a0, emissiveIntensity: 0.25, normalMap: ctx.tex('assets/ph/rough_linen/nor.jpg', { repeat: 2 }), normalScale: new THREE.Vector2(0.4, 0.4) });
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xb4532c, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const nsTop = 1.95;
  for (const [i, ns] of nsDefs.entries()) {
    const x1 = 22.45, x2 = 23.98, { y1, y2 } = ns, cy = (y1 + y2) / 2;
    // carcass: top, sides, back, drawer front, open niche below, tapered legs
    rbox(G, walnut, { x1, x2, y1, y2, h1: nsTop - 0.1, h2: nsTop, r: 0.006 });
    rbox(G, walnut, { x1: x1 + 0.02, x2, y1, y2: y1 + 0.06, h1: 0.5, h2: nsTop - 0.1, r: 0.004 });
    rbox(G, walnut, { x1: x1 + 0.02, x2, y1: y2 - 0.06, y2, h1: 0.5, h2: nsTop - 0.1, r: 0.004 });
    rbox(G, walnut, { x1: x1 + 0.02, x2, y1, y2, h1: 0.45, h2: 0.53, r: 0.004 });
    rbox(G, walnutDark, { x1: x2 - 0.05, x2, y1: y1 + 0.06, y2: y2 - 0.06, h1: 0.53, h2: nsTop - 0.1, r: 0.002 });
    rbox(G, walnut, { x1: x1 + 0.04, x2: x2 - 0.05, y1: y1 + 0.06, y2: y2 - 0.06, h1: 1.12, h2: 1.16, r: 0.002 }); // shelf under drawer
    rbox(G, walnut, { x1: x1 + 0.01, x2: x1 + 0.08, y1: y1 + 0.07, y2: y2 - 0.07, h1: 1.19, h2: nsTop - 0.13, r: 0.006 }); // drawer front
    rbox(G, brass, { x1: x1 - 0.03, x2: x1 + 0.01, y1: cy - 0.25, y2: cy + 0.25, h1: 1.5, h2: 1.55, r: 0.004 }); // bar pull
    for (const [lx, ly] of [[x1 + 0.12, y1 + 0.1], [x1 + 0.12, y2 - 0.1], [x2 - 0.12, y1 + 0.1], [x2 - 0.12, y2 - 0.1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(m(0.05), m(0.03), m(0.45), 14), brass);
      leg.position.copy(ctx.v3(lx, ly, 0.225));
      leg.castShadow = true;
      G.add(leg);
    }
    ctx.collide({ x1, y1, x2: 24, y2 });

    // lamp: glazed rust ceramic gourd base + linen drum shade (round, as drawn on the plan)
    const lx = 23.15, ly = cy;
    const prof = [[0, 0], [0.13, 0], [0.16, 0.03], [0.24, 0.18], [0.27, 0.34], [0.24, 0.5], [0.15, 0.62], [0.09, 0.7], [0.09, 0.76], [0.05, 0.78], [0, 0.78]]
      .map(([r, y]) => new THREE.Vector2(m(r), m(y)));
    const base = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), ceramic);
    base.position.copy(ctx.v3(lx, ly, nsTop));
    base.castShadow = base.receiveShadow = true;
    G.add(base);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(m(0.018), m(0.018), m(0.45), 10), brass);
    stem.position.copy(ctx.v3(lx, ly, nsTop + 0.78 + 0.22));
    G.add(stem);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(m(0.5), m(0.55), m(0.72), 64, 1, true), shadeMat);
    shade.position.copy(ctx.v3(lx, ly, nsTop + 1.05 + 0.36));
    shade.castShadow = true;
    G.add(shade);
    for (const hh of [1.06, 1.76]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(m(hh < 1.5 ? 0.55 : 0.5), m(0.008), 6, 64), brass);
      rim.rotation.x = Math.PI / 2;
      rim.position.copy(ctx.v3(lx, ly, nsTop + hh));
      G.add(rim);
    }
    const bulb = new THREE.PointLight(0xffc98a, 1.8, 0, 2);
    bulb.position.copy(ctx.v3(lx, ly, nsTop + 1.35));
    ctx.light(bulb);

    // small lived-in props
    // matching props on both: a small book stack on the outer side, away from the bed
    try {
      const books = ctx.fit(await ctx.model('assets/ph/book_encyclopedia_set_01/book_encyclopedia_set_01_1k.gltf'), { h: 0.55 });
      books.rotation.z = Math.PI / 2; // lay the set flat as a short stack
      const holder = new THREE.Group(); holder.add(books);
      holder.scale.setScalar(0.6);
      ctx.place(holder, { x: 22.85, y: i === 0 ? y1 + 0.35 : y2 - 0.35, h: nsTop + 0.33, face: 'W' });
    } catch (e) { console.warn('bed3 books', e); }
  }

  // ===================================================================== RUG
  // Plan: brown-outlined rectangle under the foot half of the bed. Caramel jute flat-weave, peeking ~0.6' past the
  // foot and both sides, tucked under the bed to x 21.2; small knotted tassels at the corners (the plan's corner dots).
  const RUG = { x1: 15.8, x2: 21.5, y1: 27.0, y2: 35.2, t: 0.045 }; // ~0.55" thick
  {
    const { x1, x2, y1, y2, t } = RUG;
    const g = new RoundedBoxGeometry(m(x2 - x1), m(t), m(y2 - y1), 4, m(0.02));
    const mat = new THREE.MeshStandardMaterial({ map: rugTexture(THREE), normalMap: ctx.tex('assets/ph/hessian_380/nor.jpg', { repeat: 4 }), normalScale: new THREE.Vector2(1.4, 1.4), roughnessMap: ctx.tex('assets/ph/hessian_380/rough.jpg', { repeat: 4 }), roughness: 1 });
    const rug = new THREE.Mesh(g, mat);
    rug.position.copy(ctx.v3((x1 + x2) / 2, (y1 + y2) / 2, t / 2));
    rug.receiveShadow = true;
    G.add(rug);
    const knotMat = new THREE.MeshStandardMaterial({ color: 0x5e3a20, roughness: 1, normalMap: ctx.tex('assets/ph/hessian_380/nor.jpg', { repeat: 1 }) });
    for (const [kx, ky] of [[x1, y1], [x1, y2], [x2, y1], [x2, y2]]) {
      const knot = new THREE.Mesh(new THREE.SphereGeometry(m(0.07), 14, 10), knotMat);
      knot.scale.y = 0.55;
      knot.position.copy(ctx.v3(kx + (kx < 19 ? -0.03 : 0.03), ky + (ky < 31 ? -0.03 : 0.03), 0.04));
      knot.castShadow = knot.receiveShadow = true;
      G.add(knot);
    }
  }

  // ===================================================================== CONTACT SHADOWS (soft decals under furniture)
  {
    const blob = (x1, y1, x2, y2, h, opacity, pad = 0.35) => {
      const mat = new THREE.MeshBasicMaterial({ map: blobTexture(THREE), color: 0x000000, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      // the texture's dark core spans ~0.2..0.8 of the plane, so grow the plane to keep the core on the footprint
      const w = (x2 - x1) / 0.6 + pad, d = (y2 - y1) / 0.6 + pad;
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(m(w), m(d)), mat);
      pl.rotation.x = -Math.PI / 2;
      pl.position.copy(ctx.v3((x1 + x2) / 2, (y1 + y2) / 2, h));
      pl.renderOrder = 1;
      G.add(pl);
    };
    const onRug = RUG.t + 0.004, onFloor = 0.006;
    blob(RUG.x1, RUG.y1, RUG.x2, RUG.y2, 0.004, 0.3, 0.25);             // rug edge on the oak
    blob(B.x1 + 0.1, B.y1 + 0.1, 21.2, B.y2 - 0.1, onRug, 0.55, 0.1);   // bed over the rug
    blob(21.2, B.y1 + 0.1, 23.9, B.y2 - 0.1, onFloor, 0.55, 0.1);       // bed head end on the oak
    for (const ns of nsDefs) blob(22.5, ns.y1 + 0.05, 23.95, ns.y2 - 0.05, onFloor, 0.35, 0.1);
    blob(W.x1, 26.0, W.x2, 26.45, onFloor, 0.45, 0.15);                 // wardrobe plinth
    blob(PLANT.x - 0.5, PLANT.y - 0.5, PLANT.x + 0.5, PLANT.y + 0.5, onFloor, 0.4, 0.2);
  }

  // ===================================================================== ART above the headboard
  {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a201b, roughness: 0.5 });
    for (const [k, py] of [[0, bcy - 1.25], [1, bcy + 1.25]]) {
      const fw = 1.9, fh = 2.65, depth = 0.1, h0 = 4.75;
      const art = new THREE.Group();
      const mk = (geo, mat, x, y, z) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); me.castShadow = true; art.add(me); return me; };
      const bw = m(0.09);
      mk(new THREE.BoxGeometry(m(fw), bw, m(depth)), frameMat, 0, m(fh) - bw / 2, m(depth / 2));
      mk(new THREE.BoxGeometry(m(fw), bw, m(depth)), frameMat, 0, bw / 2, m(depth / 2));
      mk(new THREE.BoxGeometry(bw, m(fh), m(depth)), frameMat, -m(fw) / 2 + bw / 2, m(fh) / 2, m(depth / 2));
      mk(new THREE.BoxGeometry(bw, m(fh), m(depth)), frameMat, m(fw) / 2 - bw / 2, m(fh) / 2, m(depth / 2));
      const print = new THREE.Mesh(new THREE.PlaneGeometry(m(fw) - 2 * bw, m(fh) - 2 * bw), new THREE.MeshStandardMaterial({ map: artTexture(THREE, k), roughness: 0.85 }));
      print.position.set(0, m(fh / 2), m(depth * 0.6));
      art.add(print);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(m(fw) - 2 * bw, m(fh) - 2 * bw), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.08, depthWrite: false }));
      glass.position.set(0, m(fh / 2), m(depth * 0.9));
      art.add(glass);
      ctx.place(art, { x: 24.0, y: py, h: h0, face: 'W' });
    }
  }

  // ===================================================================== FULL-LENGTH MIRROR (W wall, south of the AC)
  {
    const mw = 1.7, mh = 5.6, h0 = 0.9, my = 34.6, fd = 0.1, fb = 0.1;
    const mirror = new THREE.Group();
    const add = (geo, mat, x, y, z) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); me.castShadow = me.receiveShadow = true; mirror.add(me); };
    add(new RoundedBoxGeometry(m(mw), m(fb), m(fd), 2, m(0.01)), walnutDark, 0, m(mh - fb / 2), m(fd / 2));
    add(new RoundedBoxGeometry(m(mw), m(fb), m(fd), 2, m(0.01)), walnutDark, 0, m(fb / 2), m(fd / 2));
    add(new RoundedBoxGeometry(m(fb), m(mh), m(fd), 2, m(0.01)), walnutDark, -m(mw / 2 - fb / 2), m(mh / 2), m(fd / 2));
    add(new RoundedBoxGeometry(m(fb), m(mh), m(fd), 2, m(0.01)), walnutDark, m(mw / 2 - fb / 2), m(mh / 2), m(fd / 2));
    // real planar reflection of the room
    const glass = new Reflector(new THREE.PlaneGeometry(m(mw - 2 * fb), m(mh - 2 * fb)), { textureWidth: 512, textureHeight: 1640, color: 0xc9cdce, clipBias: 0.003 });
    glass.position.set(0, m(mh / 2), m(fd * 0.55));
    mirror.add(glass);
    ctx.place(mirror, { x: 12.0, y: my, h: h0, face: 'E' });
  }

  // ===================================================================== CURTAINS (S window x 15.5–21.0)
  {
    const rodY = 37.18, rodH = 8.35;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(m(0.04), m(0.04), m(7.2), 16), brass);
    rod.rotation.z = Math.PI / 2;
    rod.position.copy(ctx.v3(18.25, rodY, rodH));
    G.add(rod);
    for (const ex of [14.65, 21.85]) {
      const fin = new THREE.Mesh(new THREE.SphereGeometry(m(0.08), 16, 12), brass);
      fin.position.copy(ctx.v3(ex, rodY, rodH));
      G.add(fin);
      const br = new THREE.Mesh(new THREE.CylinderGeometry(m(0.02), m(0.02), m(0.32), 8), brass);
      br.rotation.x = Math.PI / 2;
      br.position.copy(ctx.v3(ex + (ex < 18 ? 0.25 : -0.25), rodY + 0.16, rodH));
      G.add(br);
    }
    for (const cx of [15.45, 21.05]) {
      const cg = curtainGeom(m(1.35), m(rodH - 0.1 - 0.04), 6, m(0.22));
      const cm = new THREE.Mesh(cg, curtainMat);
      cm.position.copy(ctx.v3(cx, rodY, 0.04));
      cm.castShadow = cm.receiveShadow = true;
      G.add(cm);
      for (let k = 0; k < 8; k++) { // rings
        const ring = new THREE.Mesh(new THREE.TorusGeometry(m(0.06), m(0.01), 6, 16), brass);
        ring.position.copy(ctx.v3(cx - 0.62 + k * 0.177, rodY, rodH - 0.02));
        G.add(ring);
      }
    }
  }

  // ===================================================================== PLANT (SE corner, beside the window)
  try {
    // money tree: the scan holds four variants side by side; keep the tallest ("_d") and pot it in a planter
    const src = await ctx.model('assets/ph/pachira_aquatica_01/pachira_aquatica_01_1k.gltf');
    for (const ch of [...src.children]) if (!/_d$/.test(ch.name)) src.remove(ch);
    const plant = ctx.fit(src, { h: 4.1 });
    const px = PLANT.x, py = PLANT.y, potH = 1.45;
    const potMat = ctx.pbr('white_plaster_02', { size: 0.6, noMap: true, color: 0x8b7d70, roughness: 0.85, normalScale: 0.8, ao: false });
    const potProf = [[0, 0], [0.42, 0], [0.47, 0.06], [0.58, potH - 0.08], [0.6, potH], [0.54, potH], [0.52, potH - 0.1], [0, potH - 0.1]]
      .map(([r, y]) => new THREE.Vector2(m(r), m(y)));
    const pot = new THREE.Mesh(new THREE.LatheGeometry(potProf, 48), potMat);
    pot.position.copy(ctx.v3(px, py, 0));
    pot.castShadow = pot.receiveShadow = true;
    G.add(pot);
    const soil = new THREE.Mesh(new THREE.CircleGeometry(m(0.53), 32), new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1 }));
    soil.rotation.x = -Math.PI / 2;
    soil.position.copy(ctx.v3(px, py, potH - 0.12));
    G.add(soil);
    ctx.place(plant, { x: px, y: py, h: potH - 0.14, face: 'E' });
    ctx.collide({ x1: px - 0.65, y1: py - 0.65, x2: px + 0.65, y2: 37.5 });
  } catch (e) { console.warn('bed3 plant', e); }

  // ===================================================================== SPLIT AC (W wall, high) + CEILING FAN
  {
    const acMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f1, roughness: 0.35, clearcoat: 0.4 });
    const ac = rbox(G, acMat, { x1: 12.0, x2: 12.72, y1: 29.6, y2: 32.4, h1: 7.85, h2: 8.8, r: m(0.08), seg: [4, 4, 4] });
    ac.userData.hideInTop = true;
    const vent = ctx.box(new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.6 }), { x1: 12.6, x2: 12.73, y1: 29.8, y2: 32.2, h1: 7.9, h2: 7.97 });
    vent.userData.hideInTop = true;
    const led = ctx.box(new THREE.MeshStandardMaterial({ color: 0x9fd4ff, emissive: 0x6fbaff, emissiveIntensity: 1.5 }), { x1: 12.72, x2: 12.735, y1: 32.0, y2: 32.1, h1: 8.15, h2: 8.18 });
    led.userData.hideInTop = true;
  }
  {
    const fan = new THREE.Group();
    const fanMat = new THREE.MeshStandardMaterial({ color: 0x3a332e, roughness: 0.4, metalness: 0.6 });
    const bladeMat = ctx.pbr('european_walnut_veneer_05', { size: 0.8, roughness: 0.6, color: 0xc7ab92 });
    const cx = (R.x1 + R.x2) / 2 - 0.5, cy = 31.0;
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(m(0.22), m(0.28), m(0.18), 32), fanMat);
    canopy.position.set(0, m(10 - 0.09), 0); fan.add(canopy);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(m(0.04), m(0.04), m(0.9), 12), fanMat);
    rod.position.set(0, m(10 - 0.55), 0); fan.add(rod);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(m(0.42), m(0.38), m(0.38), 40), fanMat);
    motor.position.set(0, m(8.85), 0); fan.add(motor);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(m(0.38), 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf5efe2, roughness: 0.6, emissive: 0xfff1d6, emissiveIntensity: 0.2 }));
    cap.position.set(0, m(8.66), 0); fan.add(cap);
    for (let k = 0; k < 3; k++) {
      const arm = new THREE.Group();
      const b = new THREE.Mesh(new RoundedBoxGeometry(m(2.0), m(0.03), m(0.42), 2, m(0.012)), bladeMat);
      b.position.set(m(1.45), 0, 0); arm.add(b);
      const iron = new THREE.Mesh(new THREE.BoxGeometry(m(0.5), m(0.03), m(0.12)), fanMat);
      iron.position.set(m(0.5), 0, 0); arm.add(iron);
      arm.rotation.y = (k * Math.PI * 2) / 3 + 0.4;
      arm.rotation.x = 0; // blades level; slight pitch below
      b.rotation.x = 0.12;
      arm.position.set(0, m(8.9), 0);
      fan.add(arm);
    }
    fan.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.hideInTop = true; } });
    fan.userData.hideInTop = true;
    fan.position.copy(ctx.v3(cx, cy, 0));
    G.add(fan);
  }

  // keep the room fill but soften it a touch now that lamps are in
  const fill = ctx.scene.getObjectByName('fill-bed3');
  if (fill) { fill.intensity *= 0.8; fill.position.x = m(17.0); fill.position.z = m(31.0); } // keep the shared fill height
}
