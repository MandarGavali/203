// Piece: dining — Dining (x 11–24.5, y 8–20.5) + wash-basin nook (x 8–11, y 12–16)
//        + common toilet B (x 0.5–7.5, y 12–16) + lobby (x 12–24.5, y 20.5–24).
//
// What's where (plan feet):
//   TABLE    centre (16.1, 15.4), 3' x 5'6" long N–S, golden-amber marble top (procedural canvas), black metal base.
//   CHAIRS   6 royal-blue velvet chairs (modelled): N end (16.1, 12.0) face S, S end (16.1, 18.8) face N,
//            W side x 13.95 @ y 14.45/16.35 face E, E side x 18.25 @ y 14.45/16.35 face W.
//   PENDANTS 2 opal globes over the table at y 14.5 / 16.3 (hideInTop).
//   ART      framed print on toilet-C east wall (x 11, y≈18.4); abstract canvas above the lobby daybed.
//   PLANT    potted plant at (12.5, 18.6) west of the S-end chair; botanical print on the N wall at x 13.1.
//   NOOK     floating walnut vanity x 8–10.95, y 12–13.2 + white vessel basin (x 9.3) + arched mirror + brass wall light,
//            tiled back wall.
//   TOILET B wall tiles to 7', concealed-cistern ledge on N wall x 2.5–4.9 with wall-hung WC at x 3.7 facing S,
//            glass screen at x 2.44, shower (rain head + mixer on S wall at x 1.45), drain, towel rail, caddy, mat.
//   LOBBY    daybed x 18.8–23.9, y 21.5–24 facing N: navy base/back/arm, fuchsia mattress, red cushions at E end.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

const FACE = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };

// ---------------------------------------------------------------- geometry helpers (all in FEET)
// box-projected UVs that keep the geometry indexed and its smooth normals
function boxUV(g, size = 1) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = -z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / size; uv[i * 2 + 1] = v / size;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('uv1', new THREE.BufferAttribute(uv.slice(), 2));
  return g;
}
// top-down planar UVs over a rectangle (for the marble top: one texture per table)
function planarUV(g, x0, x1, z0, z1) {
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - x0) / (x1 - x0);
    uv[i * 2 + 1] = 1 - (pos.getZ(i) - z0) / (z1 - z0);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const rbox = (w, h, d, r = 0.05, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));

// piping welt: closed rounded-rectangle tube in the XZ plane, centred on 0
function roundRectTube(w, d, r, rad = 0.02) {
  const sh = new THREE.Shape(); const hw = w / 2, hd = d / 2;
  sh.moveTo(-hw + r, -hd); sh.lineTo(hw - r, -hd); sh.quadraticCurveTo(hw, -hd, hw, -hd + r); sh.lineTo(hw, hd - r); sh.quadraticCurveTo(hw, hd, hw - r, hd);
  sh.lineTo(-hw + r, hd); sh.quadraticCurveTo(-hw, hd, -hw, hd - r); sh.lineTo(-hw, -hd + r); sh.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  const pts = sh.getSpacedPoints(120).slice(0, -1).map((p) => new THREE.Vector3(p.x, 0, p.y));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 240, rad, 8, true);
}
// upholstered cushion: rounded box with a soft crown on top (and a slight one underneath)
function cushionGeo(w, h, d, r = 0.12, crown = 0.05, soft = 0) {
  const g = new RoundedBoxGeometry(w, h, d, soft ? 9 : 5, Math.min(r, h / 2 - 1e-3));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2), z = p.getZ(i) / (d / 2), y = p.getY(i);
    const k = Math.max(0, 1 - x * x) * Math.max(0, 1 - z * z);
    let dy = (y > 0 ? crown : -crown * 0.3) * k;
    // lived-in softness: a shallow sit-dip and fine wrinkles on the top face
    if (soft && y > 0) dy += -soft * Math.exp(-(x * x * 2.2 + (z - 0.1) * (z - 0.1) * 2.5)) + soft * 0.18 * k * Math.sin(x * 7.3 + z * 3.1) * Math.sin(z * 5.7 - x * 2.2);
    p.setY(i, y + dy);
  }
  g.computeVertexNormals();
  return g;
}
// soft contact-shadow sprite (blurred rounded rect / disc), black with alpha
const _shadowTex = {};
function shadowTex(round) {
  if (_shadowTex[round]) return _shadowTex[round];
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.filter = 'blur(22px)'; g.fillStyle = '#000';
  if (round === 'chair') {
    // plane covers 1.6 ft: faint seat shadow + darker spots under the four feet (canvas down = chair front)
    g.globalAlpha = 0.45; g.filter = 'blur(16px)'; g.fillRect(S * 0.18, S * 0.16, S * 0.64, S * 0.7);
    g.globalAlpha = 1; g.filter = 'blur(5px)';
    const k = S / 1.6;
    for (const [x, z] of [[-0.58, 0.52], [0.58, 0.52], [-0.6, -0.64], [0.6, -0.64]]) { g.beginPath(); g.arc(S / 2 + x * k, S / 2 + z * k, 7, 0, Math.PI * 2); g.fill(); }
  } else {
    g.beginPath();
    if (round) g.arc(S / 2, S / 2, S * 0.3, 0, Math.PI * 2); else g.roundRect(S * 0.16, S * 0.16, S * 0.68, S * 0.68, S * 0.06);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (_shadowTex[round] = t);
}

// towel draped over a bar along X (origin = bar centre): `front` ft hangs on +Z, `back` ft on -Z, wraps radius r.
// Soft vertical folds grow toward the hem; slight thickness via two offset sheets is faked with DoubleSide.
function drapeGeo(w, front, back, r, folds = 5) {
  const nx = 40, nl = 80, L = front + Math.PI * r + back;
  const g = new THREE.PlaneGeometry(1, 1, nx, nl);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, t = 0.5 - p.getY(i); // u across, t along (0 = front hem)
    const s = t * L;
    let y, z, depth;
    if (s < front) { y = -(front - s); z = r; depth = (front - s) / front; }
    else if (s < front + Math.PI * r) { const a = (s - front) / r; y = r * Math.sin(a); z = r * Math.cos(a); depth = 0; }
    else { const q = s - front - Math.PI * r; y = -q; z = -r; depth = q / back; }
    const x = (u - 0.5) * w * (1 - 0.04 * depth);
    const fold = Math.sin(u * Math.PI * 2 * folds + (z > 0 ? 0 : 1.3)) * 0.03 * Math.pow(depth, 0.8) + Math.sin(u * Math.PI * 2 * folds * 2.3) * 0.008 * depth;
    p.setXYZ(i, x, y - 0.02 * depth * Math.sin(u * Math.PI), z + Math.sign(z || 1) * fold);
    uv.setXY(i, x / 0.8, -s / 0.8);
  }
  g.computeVertexNormals();
  return g;
}

// puffy cushion: box whose thickness pinches to a seam at the edges
function pillowGeo(w, h, t) {
  const g = new THREE.BoxGeometry(w, h, t, 28, 28, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const fx = 1 - Math.pow(Math.abs((2 * x) / w), 2.6), fy = 1 - Math.pow(Math.abs((2 * y) / h), 2.6);
    const f = Math.max(0, fx * fy);
    p.setZ(i, z * (0.12 + 0.88 * Math.sqrt(f)));
    // edges pull in slightly at mid-sides (classic pillow "waist")
    p.setX(i, x * (1 - 0.06 * (1 - Math.pow(Math.abs((2 * y) / h), 2))));
    p.setY(i, y * (1 - 0.06 * (1 - Math.pow(Math.abs((2 * x) / w), 2))));
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- procedural textures
function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function valueNoise(seed) {
  const r = rng(seed);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const p = new Uint8Array(512); for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const val = new Float32Array(256).map(() => r());
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const X = xi & 255, Y = yi & 255;
    const a = val[p[p[X] + Y]], b = val[p[p[X + 1] + Y]], c = val[p[p[X] + Y + 1]], d = val[p[p[X + 1] + Y + 1]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y, oct = 5) => { let s = 0, a = 0.5, f = 1, norm = 0; for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); norm += a; f *= 2.03; a *= 0.5; } return s / norm; };
}
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// golden-amber marble (W x H px covers wFt x hFt) — amber ground, cream veins and fine white cracks like the plan drawing
function goldMarble(wFt, hFt, ppf = 260) {
  const W = Math.round(wFt * ppf), H = Math.round(hFt * ppf);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const f1 = valueNoise(11), f2 = valueNoise(23), f3 = valueNoise(37);
  // honey/golden-amber ground (#C8922E) with only gentle clouding, cream-white crackle veins
  const lo = [180, 118, 22], hi = [210, 152, 50], cream = [242, 222, 178], white = [255, 249, 232];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const fx = (x / ppf) * 1.15, fy = (y / ppf) * 1.15;
      const warp = f1(fx * 0.9, fy * 0.9, 5);
      const k = sstep(0.3, 0.7, f2(fx * 0.6 + 3.1 + warp * 0.6, fy * 0.6 + 7.7, 5));
      let r = mix(lo[0], hi[0], k), gg = mix(lo[1], hi[1], k), b = mix(lo[2], hi[2], k);
      // translucent onyx-like lighter bands
      const band = Math.pow(Math.abs(Math.sin((fx * 0.5 + fy * 0.9 + warp * 3.5) * 1.7)), 6) * 0.18;
      r = mix(r, cream[0], band); gg = mix(gg, cream[1], band); b = mix(b, cream[2], band);
      // crackle network: two warped ridge fields, thin bright lines with a soft halo
      const c1 = 1 - Math.abs(f3(fx * 1.4 + 9 + warp, fy * 1.4 + 1, 6) * 2 - 1);
      const c2 = 1 - Math.abs(f1(fx * 2.3 + 4, fy * 2.3 + 6 + warp, 5) * 2 - 1);
      const crack = Math.min(1, Math.pow(c1, 60) * 0.95 + Math.pow(c1, 12) * 0.12 + Math.pow(c2, 90) * 0.7);
      r = mix(r, white[0], crack); gg = mix(gg, white[1], crack); b = mix(b, white[2], crack);
      const i = (y * W + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// 300x600 mm satin wall tiles, stack bond; the texture covers 4 ft x 4 ft (2 tiles across, 4 rows)
function wallTiles() {
  const S = 2048, rows = 4, cols = 2;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const b = document.createElement('canvas'); b.width = b.height = S;
  const gb = b.getContext('2d');
  const r = rng(7);
  const f = valueNoise(5);
  g.fillStyle = '#a89e90'; g.fillRect(0, 0, S, S);
  gb.fillStyle = '#000'; gb.fillRect(0, 0, S, S);
  const th = S / rows, tw = S / cols, gr = 5;
  for (let ri = 0; ri < rows; ri++) {
    for (let ci = 0; ci < cols; ci++) {
      const x0 = ci * tw + gr / 2, y0 = ri * th + gr / 2, w = tw - gr, h = th - gr;
      const j = (r() - 0.5) * 8;
      const grad = g.createLinearGradient(x0, y0, x0 + w, y0 + h);
      grad.addColorStop(0, `rgb(${216 + j},${208 + j},${195 + j})`);
      grad.addColorStop(1, `rgb(${208 + j},${199 + j},${185 + j})`);
      g.fillStyle = grad; g.fillRect(x0, y0, w, h);
      // soft stone clouding
      for (let k = 0; k < 40; k++) {
        const cx = x0 + r() * w, cy = y0 + r() * h, rad = 30 + r() * 140;
        const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
        const tone = r() > 0.5 ? '255,252,245' : '196,186,170';
        rg.addColorStop(0, `rgba(${tone},0.07)`); rg.addColorStop(1, `rgba(${tone},0)`);
        g.fillStyle = rg; g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip(); g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); g.restore();
      }
      // faint veins
      g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
      for (let k = 0; k < 3; k++) {
        g.strokeStyle = `rgba(170,158,140,${0.08 + r() * 0.08})`; g.lineWidth = 1 + r() * 2;
        g.beginPath(); let px = x0 + r() * w, py = y0; g.moveTo(px, py);
        for (let s = 0; s < 12; s++) { px += (r() - 0.4) * w * 0.15; py += h / 10; g.lineTo(px, py); }
        g.stroke();
      }
      g.restore();
      // bump: tile face raised, slightly eased edge
      gb.fillStyle = '#d0d0d0'; gb.fillRect(x0, y0, w, h);
      gb.fillStyle = '#fff'; gb.fillRect(x0 + 3, y0 + 3, w - 6, h - 6);
    }
  }
  // fine speckle
  const id = g.getImageData(0, 0, S, S);
  for (let i = 0; i < id.data.length; i += 4) {
    const p = i / 4, x = p % S, y = (p / S) | 0;
    const n = (f(x / 9, y / 9, 3) - 0.5) * 10;
    id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n;
  }
  g.putImageData(id, 0, 0);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(b); bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.2, roughness: 0.32, color: 0xffffff });
}

// abstract canvas for the lobby, in the house palette (navy, royal blue, fuchsia, gold, terracotta on cream)
function abstractArt() {
  const W = 1500, H = 1000;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rng(91);
  g.fillStyle = '#efe6d6'; g.fillRect(0, 0, W, H);
  // paper/canvas grain
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(120,100,80,${r() * 0.05})`; g.fillRect(r() * W, r() * H, 2, 2); }
  const blob = (cx, cy, rx, ry, col, a = 0.9, rot = 0) => {
    g.save(); g.translate(cx, cy); g.rotate(rot); g.globalAlpha = a; g.fillStyle = col; g.beginPath();
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2, k = 1 + (r() - 0.5) * 0.08;
      const x = Math.cos(t) * rx * k, y = Math.sin(t) * ry * k;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.fill(); g.restore(); g.globalAlpha = 1;
  };
  blob(470, 560, 330, 300, '#1d2f6b', 0.95);
  blob(980, 430, 260, 250, '#c9a043', 0.9);
  blob(760, 690, 190, 170, '#b8336a', 0.88);
  blob(1240, 700, 150, 140, '#2f56b0', 0.85);
  blob(300, 250, 120, 110, '#c4683e', 0.85);
  // brush arcs
  g.lineCap = 'round';
  for (const [x, y, rad, a0, a1, col, lw] of [[700, 520, 420, 3.6, 5.6, '#2a2a2a', 10], [980, 430, 330, 0.3, 2.2, '#efe6d6', 14], [470, 560, 260, 4.4, 6.0, '#c9a043', 8]]) {
    g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.arc(x, y, rad, a0, a1); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// portrait print for the dining wall: gold sun over layered navy/indigo hills, cream line work
function sunArt() {
  const W = 1000, H = 1300;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rng(4242);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#efe5d3'); bg.addColorStop(1, '#e6d8c0');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // gold sun with leaf texture
  g.fillStyle = '#c99a3a'; g.beginPath(); g.arc(560, 470, 250, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 2600; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 248;
    g.fillStyle = r() > 0.5 ? 'rgba(240,200,110,0.25)' : 'rgba(150,100,30,0.2)';
    g.fillRect(560 + Math.cos(a) * d, 470 + Math.sin(a) * d, 3 + r() * 6, 2);
  }
  // hills
  const hills = [['#2f4d8f', 760, 0.9], ['#1d2f6b', 860, 1.2], ['#14204a', 980, 0.7]];
  for (const [col, base, k] of hills) {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) g.lineTo(x, base - Math.sin(x / 210 * k + base) * 90 - Math.sin(x / 90 + k) * 18);
    g.lineTo(W, H); g.fill();
  }
  // cream line work
  g.strokeStyle = 'rgba(246,236,214,0.9)'; g.lineWidth = 4;
  for (let j = 0; j < 5; j++) {
    g.beginPath();
    for (let x = 0; x <= W; x += 10) { const y = 1040 + j * 42 - Math.sin(x / 160 + j) * 26; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  g.fillStyle = '#b8336a'; g.beginPath(); g.arc(250, 300, 46, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 12000; i++) { g.fillStyle = `rgba(80,60,40,${r() * 0.05})`; g.fillRect(r() * W, r() * H, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// botanical line print: sage leaves on a fine stem, cream paper
function leafArt() {
  const W = 800, H = 1060;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rng(303);
  g.fillStyle = '#f1eadc'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#4f5b3c'; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(400, 980); g.bezierCurveTo(380, 700, 450, 400, 420, 110); g.stroke();
  for (let i = 0; i < 9; i++) {
    const t = 0.12 + i * 0.095, y = 980 - t * 870, x = 400 + Math.sin(t * 3) * 25, side = i % 2 ? 1 : -1;
    const len = 210 - i * 12, ang = side * (0.75 - t * 0.3);
    g.save(); g.translate(x, y); g.rotate(ang - Math.PI / 2 * side);
    g.fillStyle = ['#7f9a74', '#93a985', '#6d8963'][i % 3];
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -len * 0.28, len, 0); g.quadraticCurveTo(len * 0.5, len * 0.28, 0, 0); g.fill();
    g.strokeStyle = 'rgba(60,70,45,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.9, 0); g.stroke();
    g.restore();
  }
  g.fillStyle = '#c99a3a'; g.beginPath(); g.arc(560, 210, 38, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(90,70,50,${r() * 0.05})`; g.fillRect(r() * W, r() * H, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ================================================================== build
export default async function build(ctx) {
  const { m, tex, pbr } = ctx;
  const F = new THREE.Group(); // everything below is authored in plan FEET: position (x, h, y)
  F.name = 'dining-ft';
  F.scale.setScalar(ctx.FT);
  ctx.group.add(F);
  const add = (geo, mat, parent = F, x = 0, h = 0, y = 0) => {
    const me = new THREE.Mesh(geo, mat);
    me.castShadow = me.receiveShadow = true;
    me.position.set(x, h, y);
    parent.add(me);
    return me;
  };
  // axis-aligned box in plan feet, UVs box-projected at `size` ft per repeat
  // soft contact shadow on the floor, centred (cx, cy), footprint w (x) x d (y) ft
  const contactShadow = (cx, cy, w, d, opacity = 0.4, round = 0, rot = 0) => {
    const mt = new THREE.MeshBasicMaterial({ map: shadowTex(round), transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
    const sc = round === 'chair' ? 1 : 1 / 0.68;
    const me = new THREE.Mesh(new THREE.PlaneGeometry(w * sc, d * sc), mt);
    me.rotation.set(-Math.PI / 2, 0, rot);
    me.position.set(cx, 0.008, cy);
    me.renderOrder = 1;
    F.add(me);
    return me;
  };
  const fbox = (mat, x1, y1, x2, y2, h1, h2, size = 4, r = 0) => {
    const g = r ? rbox(x2 - x1, h2 - h1, y2 - y1, r, 2) : new THREE.BoxGeometry(x2 - x1, h2 - h1, y2 - y1);
    g.translate((x1 + x2) / 2, (h1 + h2) / 2, (y1 + y2) / 2);
    return add(boxUV(g, size), mat);
  };

  // ------------------------------------------------------------ materials
  const velvetNor = tex('assets/ph/velour_velvet/nor.jpg');
  const velvetRough = tex('assets/ph/velour_velvet/rough.jpg');
  const velvet = (color, sheen, sheenAmt = 0.55) => {
    const mt = new THREE.MeshPhysicalMaterial({
      color, roughness: 0.92, roughnessMap: velvetRough, normalMap: velvetNor, normalScale: new THREE.Vector2(1.0, 1.0),
      sheen: sheenAmt, sheenRoughness: 0.5, sheenColor: new THREE.Color(sheen),
    });
    return mt;
  };
  // woven upholstery (Poly Haven rough_linen normal + roughness, recoloured)
  const linenNor = tex('assets/ph/rough_linen/nor.jpg'), linenRough = tex('assets/ph/rough_linen/rough.jpg');
  const woven = (color, n = 1.4) => new THREE.MeshPhysicalMaterial({
    color, roughness: 1, roughnessMap: linenRough, normalMap: linenNor, normalScale: new THREE.Vector2(n, n),
    sheen: 0.2, sheenRoughness: 0.85, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3),
  });
  // chairs: royal-blue velvet pile (velour_velvet normal + roughness), matt, no sheen lift
  const blueVelvet = new THREE.MeshStandardMaterial({ color: 0x0d2470, roughness: 0.85, roughnessMap: velvetRough, normalMap: velvetNor, normalScale: new THREE.Vector2(0.5, 0.5) });
  const navyVelvet = woven(0x131f62);   // daybed frame/back/arm: deep royal-navy
  const fuchsia = woven(0x8c1c58);      // daybed cushions: magenta/fuchsia
  const piping = new THREE.MeshStandardMaterial({ color: 0x0a1640, roughness: 0.7 });
  const walnut = pbr('black_walnut_veneer_02', { roughness: 0.75, color: 0x6e4c38 });
  const blackMetal = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.42, metalness: 0.75 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8a15c, roughness: 0.3, metalness: 1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xf0f2f4, roughness: 0.07, metalness: 1 });
  const brushed = new THREE.MeshStandardMaterial({ color: 0xd5d8da, roughness: 0.32, metalness: 1 });
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xfbfbf8, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06 });
  const quartz = new THREE.MeshPhysicalMaterial({ color: 0xf3f0ea, roughness: 0.28, clearcoat: 0.4, clearcoatRoughness: 0.2 });
  const tiles = wallTiles();
  const glassClear = new THREE.MeshPhysicalMaterial({ color: 0xeaf4f2, roughness: 0.03, transmission: 1, thickness: 0.3, ior: 1.5, transparent: true, opacity: 0.22, depthWrite: false });
  const opal = new THREE.MeshStandardMaterial({ color: 0xfff6e8, emissive: 0xffd7a0, emissiveIntensity: 1.6, roughness: 0.35 });
  // framed artwork: thin black-walnut frame, off-white mat, print. Origin = centre of the back, front = +Z.
  const framedArt = (map, w, h, mat = 0.22) => {
    const g = new THREE.Group(); F.add(g);
    const d = 0.12, fw = 0.09;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1f1813, roughness: 0.5 });
    for (const [x, y, ww, hh] of [[0, h / 2 - fw / 2, w, fw], [0, -h / 2 + fw / 2, w, fw], [-w / 2 + fw / 2, 0, fw, h - 2 * fw], [w / 2 - fw / 2, 0, fw, h - 2 * fw]])
      add(rbox(ww, hh, d, 0.015, 2), frameMat, g, x, y, d / 2);
    add(new THREE.PlaneGeometry(w - 2 * fw, h - 2 * fw), new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.95 }), g, 0, 0, d - 0.03);
    add(new THREE.PlaneGeometry(w - 2 * fw - 2 * mat, h - 2 * fw - 2 * mat), new THREE.MeshStandardMaterial({ map, roughness: 0.8 }), g, 0, 0, d - 0.028);
    return g;
  };
  // terry towel material (Poly Haven terry_cloth normal/roughness, recoloured); uv: 1 repeat per `rep` ft
  const terryMat = (color, rep = 1) => {
    const o = { repeat: 1 };
    return new THREE.MeshStandardMaterial({ color, roughness: 1, roughnessMap: tex('assets/ph/terry_cloth/rough.jpg', o), normalMap: tex('assets/ph/terry_cloth/nor.jpg', o), normalScale: new THREE.Vector2(1.6, 1.6), side: THREE.DoubleSide });
  };
  const redJacq = new THREE.MeshStandardMaterial({
    map: tex('assets/ph/quatrefoil_jacquard_fabric/diff.jpg', { srgb: true, repeat: 1.6 }),
    normalMap: tex('assets/ph/quatrefoil_jacquard_fabric/nor.jpg', { repeat: 1.6 }),
    roughnessMap: tex('assets/ph/quatrefoil_jacquard_fabric/rough.jpg', { repeat: 1.6 }),
    color: 0xff5a4a, roughness: 1,
  });

  // ============================================================ DINING TABLE
  const T = { x: 16.1, y: 15.4, w: 3.0, l: 5.5, top: 2.5, th: 0.1 };
  {
    const tbl = new THREE.Group(); tbl.position.set(T.x, 0, T.y); F.add(tbl);
    const marbleMap = goldMarble(T.w, T.l);
    const marble = new THREE.MeshPhysicalMaterial({
      map: marbleMap, roughness: 0.3, clearcoat: 0.55, clearcoatRoughness: 0.12, envMapIntensity: 0.3,
      normalMap: tex('assets/ph/marble_01/nor.jpg'), normalScale: new THREE.Vector2(0.08, 0.08),
    });
    const topG = rbox(T.w, T.th, T.l, 0.035, 3);
    planarUV(topG, -T.w / 2, T.w / 2, -T.l / 2, T.l / 2);
    add(topG, marble, tbl, 0, T.top - T.th / 2, 0);
    // recessed black metal apron + 4 slim tapered square legs with brass shoes
    const ax = T.w / 2 - 0.28, az = T.l / 2 - 0.35, aH = 0.22, aT = 0.07, aTop = T.top - T.th;
    add(new THREE.BoxGeometry(aT, aH, az * 2), blackMetal, tbl, -ax, aTop - aH / 2, 0);
    add(new THREE.BoxGeometry(aT, aH, az * 2), blackMetal, tbl, ax, aTop - aH / 2, 0);
    add(new THREE.BoxGeometry(ax * 2, aH, aT), blackMetal, tbl, 0, aTop - aH / 2, -az);
    add(new THREE.BoxGeometry(ax * 2, aH, aT), blackMetal, tbl, 0, aTop - aH / 2, az);
    const legH = aTop;
    const legG = new THREE.BoxGeometry(0.15, legH, 0.15, 1, 4, 1);
    { const p = legG.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.7 + 0.3 * ((p.getY(i) + legH / 2) / legH); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } legG.computeVertexNormals(); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      add(legG, blackMetal, tbl, sx * ax, legH / 2, sz * az);
      add(new THREE.BoxGeometry(0.115, 0.12, 0.115), brass, tbl, sx * ax, 0.06, sz * az);
    }
    ctx.collide({ x1: T.x - T.w / 2, y1: T.y - T.l / 2, x2: T.x + T.w / 2, y2: T.y + T.l / 2 });
    contactShadow(T.x, T.y, T.w - 0.3, T.l - 0.4, 0.28);
  }

  // ============================================================ CHAIRS (royal-blue velvet, walnut legs, brass ferrules)
  function makeChair() {
    const c = new THREE.Group();
    const legLen = 1.14;
    const legG = boxUV(new THREE.CylinderGeometry(0.055, 0.036, legLen, 20), 2);
    const ferG = new THREE.CylinderGeometry(0.039, 0.036, 0.09, 20);
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const l = add(legG, walnut, c, sx * 0.56, legLen / 2, sz * 0.52);
      l.rotation.z = sx * 0.035;
      if (sz < 0) { l.rotation.x = 0.12; l.position.z -= 0.04; }
      add(ferG, brass, l, 0, -legLen / 2 + 0.045, 0);
    }
    add(boxUV(rbox(1.36, 0.12, 1.3, 0.03, 2), 2), walnut, c, 0, 1.17, 0);
    // seat cushion (slightly crowned) with piping
    const seatG = rbox(1.5, 0.26, 1.46, 0.12, 5);
    { const p = seatG.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0) { const x = p.getX(i) / 0.75, z = p.getZ(i) / 0.73; p.setY(i, y + 0.035 * Math.max(0, 1 - x * x) * Math.max(0, 1 - z * z)); } } seatG.computeVertexNormals(); }
    add(boxUV(seatG, 0.8), blueVelvet, c, 0, 1.35, 0.03);
    {
      const sh = new THREE.Shape(); const w = 0.72, d = 0.7, rr = 0.12;
      sh.moveTo(-w + rr, -d); sh.lineTo(w - rr, -d); sh.quadraticCurveTo(w, -d, w, -d + rr); sh.lineTo(w, d - rr); sh.quadraticCurveTo(w, d, w - rr, d);
      sh.lineTo(-w + rr, d); sh.quadraticCurveTo(-w, d, -w, d - rr); sh.lineTo(-w, -d + rr); sh.quadraticCurveTo(-w, -d, -w + rr, -d);
      const pts = sh.getSpacedPoints(80).map((p) => new THREE.Vector3(p.x, 0, p.y));
      const curve = new THREE.CatmullRomCurve3(pts, true);
      const pip = add(new THREE.TubeGeometry(curve, 160, 0.026, 8, true), piping, c, 0, 1.47, 0.03);
      pip.castShadow = false;
    }
    // curved back: rounded-top shell, wrapped around the sitter, slightly reclined, with piping on its edge
    const bw = 1.46, bh = 1.4, br = 0.32, bt = 0.17;
    const bs = new THREE.Shape();
    bs.moveTo(-bw / 2, 0); bs.lineTo(bw / 2, 0); bs.lineTo(bw / 2, bh - br); bs.quadraticCurveTo(bw / 2, bh, bw / 2 - br, bh);
    bs.lineTo(-bw / 2 + br, bh); bs.quadraticCurveTo(-bw / 2, bh, -bw / 2, bh - br); bs.lineTo(-bw / 2, 0);
    const bg = new THREE.ExtrudeGeometry(bs, { depth: bt, steps: 1, curveSegments: 16, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 5 });
    bg.translate(0, 0, -bt / 2);
    const bend = (g) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, p.getZ(i) + 0.24 * Math.pow(x / 0.75, 2)); } g.computeVertexNormals(); return g; };
    const back = add(boxUV(bend(bg), 0.8), blueVelvet, c, 0, 1.38, -0.68);
    back.rotation.x = -0.17;
    {
      const pts = bs.getSpacedPoints(120).map((p) => new THREE.Vector3(p.x, p.y, 0.24 * Math.pow(p.x / 0.75, 2) + bt / 2 + 0.06));
      const pip = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.slice(0, -1), false), 240, 0.024, 8, false), piping);
      back.add(pip);
      // vertical channel seams following the curved front face
      const seamMat = new THREE.MeshStandardMaterial({ color: 0x0f2558, roughness: 0.8 });
      for (const sx of [-0.45, -0.15, 0.15, 0.45]) {
        const top = Math.abs(sx) > 0.3 ? bh - 0.24 : bh - 0.1;
        const sp = [];
        for (let k = 0; k <= 8; k++) { const y = 0.14 + (top - 0.14) * (k / 8); sp.push(new THREE.Vector3(sx, y, 0.24 * Math.pow(sx / 0.75, 2) + bt / 2 + 0.06)); }
        back.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 16, 0.011, 6), seamMat));
      }
    }
    return c;
  }
  const chairSpots = [
    [T.x, T.y - T.l / 2 - 0.36, 'S'], [T.x, T.y + T.l / 2 + 0.36, 'N'],
    [T.x - T.w / 2 - 0.36, T.y - 0.95, 'E'], [T.x - T.w / 2 - 0.36, T.y + 0.95, 'E'],
    [T.x + T.w / 2 + 0.36, T.y - 0.95, 'W'], [T.x + T.w / 2 + 0.36, T.y + 0.95, 'W'],
  ];
  const chairProto = makeChair();
  for (const [x, y, face] of chairSpots) {
    const ch = chairProto.clone(); ch.position.set(x, 0, y); ch.rotation.y = FACE[face]; F.add(ch);
    ctx.collide({ x1: x - 0.72, y1: y - 0.72, x2: x + 0.72, y2: y + 0.72 });
    contactShadow(x, y, 1.6, 1.6, 0.7, 'chair', FACE[face]);
  }

  // centrepiece: wooden bowl with pomegranates + a small vase
  {
    const bowl = ctx.fit(await ctx.model('assets/ph/wooden_bowl_01/wooden_bowl_01_1k.gltf'), { w: 1.0 });
    ctx.place(bowl, { x: T.x, y: T.y + 0.5, h: T.top });
    const pom = await ctx.model('assets/ph/food_pomegranate_01/food_pomegranate_01_1k.gltf');
    for (const [dx, dy, dh, rot] of [[-0.14, 0.05, 0.08, 0], [0.16, -0.04, 0.08, 1.7], [0.0, 0.18, 0.08, 3.1], [0.02, -0.06, 0.24, 0.8]]) {
      const p = ctx.fit(pom.clone(true), { h: 0.3 });
      ctx.place(p, { x: T.x + dx, y: T.y + 0.5 + dy, h: T.top + dh });
      p.rotation.y = rot;
    }
    const vase = ctx.fit(await ctx.model('assets/ph/ceramic_vase_03/ceramic_vase_03_1k.gltf'), { h: 1.0 });
    ctx.place(vase, { x: T.x + 0.1, y: T.y - 0.75, h: T.top });
    // a few eucalyptus stems in the vase
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x5d6b4c, roughness: 0.7 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x7f9a86, roughness: 0.65, side: THREE.DoubleSide });
    const leafG = new THREE.CircleGeometry(0.055, 14);
    const r = rng(77);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r() * 0.5, lean = 0.18 + r() * 0.2, len = 1.0 + r() * 0.5;
      const dir = new THREE.Vector3(Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean));
      const p0 = new THREE.Vector3(T.x + 0.1, T.top + 0.85, T.y - 0.75);
      const pts = [p0, p0.clone().addScaledVector(dir, len * 0.5), p0.clone().addScaledVector(dir, len).add(new THREE.Vector3(Math.cos(a) * 0.12, -0.05, Math.sin(a) * 0.12))];
      const curve = new THREE.CatmullRomCurve3(pts);
      add(new THREE.TubeGeometry(curve, 16, 0.008, 5), stemMat).castShadow = false;
      for (let k = 2; k < 12; k++) {
        const t = k / 12, pt = curve.getPoint(t);
        const lf = add(leafG, leafMat, F, pt.x, pt.y, pt.z);
        lf.rotation.set(r() * 3, r() * 3, r() * 3);
        lf.scale.setScalar(0.7 + (1 - t) * 0.6);
      }
    }
  }

  // pendants: two opal globes on brass canopies
  for (const py of [T.y - 0.95, T.y + 0.95]) {
    const p = new THREE.Group(); p.userData.hideInTop = true; F.add(p);
    const gh = 6.15;
    add(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 32), brass, p, T.x, 9.97, py);
    add(new THREE.CylinderGeometry(0.008, 0.008, 9.97 - gh - 0.4, 6), blackMetal, p, T.x, (9.97 + gh + 0.4) / 2, py).castShadow = false;
    add(new THREE.CylinderGeometry(0.07, 0.09, 0.18, 24), brass, p, T.x, gh + 0.42, py);
    const globe = add(new THREE.SphereGeometry(0.42, 48, 32), opal, p, T.x, gh, py);
    globe.castShadow = false;
    const l = new THREE.PointLight(0xffc98c, 4.5, 0, 2); l.position.set(T.x, gh - 0.1, py); p.add(l);
  }
  // keep the room fill a little softer now the pendants carry the table
  const fd = ctx.scene.getObjectByName('fill-dining'); if (fd) fd.intensity *= 0.85;

  // ============================================================ ART + PLANT (dining)
  {
    // framed print on toilet-C's east wall (wall face x = 11), facing E
    const art = framedArt(sunArt(), 2.6, 3.4);
    art.position.set(11.0, 5.1, 18.75); art.rotation.y = FACE.E;
    const plant = ctx.fit(await ctx.model('assets/ph/potted_plant_02/potted_plant_02_1k.gltf'), { h: 2.9 });
    ctx.place(plant, { x: 12.5, y: 18.6 });
    ctx.collide({ x1: 11.8, y1: 17.9, x2: 13.2, y2: 19.3 });
    contactShadow(12.5, 18.6, 1.5, 1.5, 0.45, 1);
    // botanical print on the north wall (toilet A's south wall, face y = 8) beside the bed-1 door
    const na = framedArt(leafArt(), 2.2, 2.9, 0.2);
    na.position.set(13.1, 5.1, 8.0); na.rotation.y = FACE.S;
  }

  // ============================================================ WASH-BASIN NOOK (x 8–11, y 12–16)
  {
    fbox(tiles, 8.0, 12.0, 11.0, 12.06, 0, 7.0);                       // tiled back wall
    fbox(brushed, 7.98, 12.0, 11.0, 12.1, 7.0, 7.04, 4);               // tile trim
    // floating walnut vanity
    const vx1 = 8.02, vx2 = 10.95, vy1 = 12.06, vy2 = 13.2;
    fbox(walnut, vx1, vy1, vx2, vy2, 1.55, 2.62, 2.5, 0.02);
    // two drawer fronts with a shadow gap + brass pulls
    const gapMat = new THREE.MeshStandardMaterial({ color: 0x1b120c, roughness: 0.9 });
    fbox(gapMat, vx1 + 0.02, vy2, vx2 - 0.02, vy2 + 0.005, 2.08, 2.1);
    fbox(gapMat, (vx1 + vx2) / 2 - 0.006, vy2, (vx1 + vx2) / 2 + 0.006, vy2 + 0.005, 1.57, 2.6);
    for (const hx of [(vx1 * 3 + vx2) / 4, (vx1 + vx2 * 3) / 4]) {
      fbox(brass, hx - 0.25, vy2, hx + 0.25, vy2 + 0.05, 2.47, 2.5);
      fbox(brass, hx - 0.25, vy2, hx + 0.25, vy2 + 0.05, 1.98, 2.01);
    }
    // white stone top
    fbox(quartz, 8.0, 12.06, 10.97, 13.26, 2.62, 2.74, 3, 0.012);
    // vessel basin (oval) + drain
    const bx = 9.3, by = 12.7, bh = 2.74;
    const prof = [[0, 0], [0.3, 0], [0.47, 0.05], [0.62, 0.18], [0.7, 0.36], [0.72, 0.44], [0.69, 0.455], [0.65, 0.4], [0.58, 0.22], [0.42, 0.09], [0.0, 0.06]]
      .map(([r, h]) => new THREE.Vector2(r, h));
    const basin = add(new THREE.LatheGeometry(prof, 72), ceramic, F, bx, bh, by);
    basin.scale.set(0.98, 1, 0.6);
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.012, 24), chrome, F, bx, bh + 0.066, by);
    // tall vessel mixer
    const fx = bx, fy = 12.17;
    add(new THREE.CylinderGeometry(0.06, 0.07, 0.04, 32), chrome, F, fx, bh + 0.02, fy);
    add(new THREE.CylinderGeometry(0.045, 0.05, 0.95, 32), chrome, F, fx, bh + 0.5, fy);
    const spout = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.12, 0.1), new THREE.Vector3(0, 0.12, 0.42), new THREE.Vector3(0, 0.02, 0.52)]);
    add(new THREE.TubeGeometry(spout, 40, 0.035, 16), chrome, F, fx, bh + 0.92, fy);
    const lever = add(new THREE.BoxGeometry(0.035, 0.035, 0.3), chrome, F, fx + 0.1, bh + 0.8, fy + 0.02);
    lever.rotation.y = 0.5; lever.rotation.x = -0.25;
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 20), chrome, F, fx + 0.06, bh + 0.8, fy).rotation.z = Math.PI / 2;
    // soap dispenser (amber glass) + small succulent pot + folded hand towel
    const amber = new THREE.MeshPhysicalMaterial({ color: 0x8a4a12, roughness: 0.1, transmission: 0.6, thickness: 0.2, transparent: true, opacity: 0.9 });
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.42, 32), amber, F, 10.35, bh + 0.21, 12.45);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 16), blackMetal, F, 10.35, bh + 0.47, 12.45);
    add(new THREE.BoxGeometry(0.16, 0.03, 0.035), blackMetal, F, 10.41, bh + 0.52, 12.45);
    const potMat = new THREE.MeshStandardMaterial({ color: 0xd9d2c5, roughness: 0.85 });
    add(new THREE.CylinderGeometry(0.16, 0.12, 0.28, 32), potMat, F, 10.6, bh + 0.14, 12.75);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f7a43, roughness: 0.6 });
    for (let i = 0; i < 9; i++) {
      const lf = add(new THREE.SphereGeometry(0.06, 12, 8), leafMat, F, 10.6 + Math.cos(i * 2.4) * 0.07, bh + 0.32 + (i % 3) * 0.04, 12.75 + Math.sin(i * 2.4) * 0.07);
      lf.scale.set(0.6, 1.6, 0.6); lf.rotation.z = Math.cos(i * 2.4) * 0.6; lf.rotation.x = Math.sin(i * 2.4) * 0.6;
    }
    const towel = new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 1, normalMap: tex('assets/ph/velour_velvet/nor.jpg'), normalScale: new THREE.Vector2(0.6, 0.6) });
    add(rbox(0.5, 0.1, 0.42, 0.04, 3), towel, F, 8.33, bh + 0.05, 12.8);
    add(rbox(0.48, 0.08, 0.4, 0.035, 3), towel, F, 8.34, bh + 0.14, 12.8);

    // arched mirror (real reflection) with brass frame
    const mw = 1.75, mh = 2.75, mxc = bx, mb = 3.85, mY = 12.06;
    const arch = (w, h, ox = 0, oy = 0) => {
      const s = new THREE.Shape(); const r = w / 2;
      s.moveTo(-r + ox, oy); s.lineTo(r - ox, oy); s.lineTo(r - ox, h - r); s.absarc(0, h - r, r - ox, 0, Math.PI, false); s.lineTo(-r + ox, oy);
      return s;
    };
    const frameShape = arch(mw + 0.12, mh + 0.06, 0, -0.06);
    frameShape.holes.push(arch(mw, mh, 0, 0));
    const fr = add(new THREE.ExtrudeGeometry(frameShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 48 }), brass, F, mxc, mb, mY);
    fr.castShadow = false;
    add(new THREE.ShapeGeometry(arch(mw + 0.02, mh + 0.01), 48), new THREE.MeshStandardMaterial({ color: 0x222222 }), F, mxc, mb, mY + 0.01);
    const mirror = new Reflector(new THREE.ShapeGeometry(arch(mw, mh), 48), { textureWidth: 1024, textureHeight: 1024, color: 0x8a8a88, clipBias: 0.003 });
    mirror.position.set(mxc, mb, mY + 0.05);
    F.add(mirror);
    // slim brass wall light over the mirror
    add(rbox(1.3, 0.12, 0.16, 0.05, 3), brass, F, mxc, mb + mh + 0.35, mY + 0.1);
    add(rbox(1.22, 0.04, 0.12, 0.015, 2), opal, F, mxc, mb + mh + 0.28, mY + 0.11);
    const ml = new THREE.PointLight(0xffd3a0, 2.2, 0, 2); ml.position.set(mxc, mb + mh + 0.1, 12.7); F.add(ml);
    // towel ring on the nook's south wall
    const ring = add(new THREE.TorusGeometry(0.28, 0.025, 12, 48), brass, F, 9.6, 4.1, 15.93);
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 20), brass, F, 9.6, 4.4, 15.95).rotation.x = Math.PI / 2;
    const hTowel = add(drapeGeo(0.55, 0.85, 0.75, 0.03, 4), terryMat(0x9fb3a1, 0.6), F, 9.6, 3.82, 15.9);
    void ring; void hTowel;
    ctx.collide({ x1: 8.0, y1: 12.0, x2: 11.0, y2: 13.3 });
  }

  // ============================================================ COMMON TOILET B (x 0.5–7.5, y 12–16)
  {
    const tt = 0.045;
    // wall tiles to 7'
    fbox(tiles, 0.5, 12.0, 7.5, 12.0 + tt, 0, 7);
    fbox(tiles, 0.5, 16.0 - tt, 7.5, 16.0, 0, 7);
    fbox(tiles, 0.5, 12.0 + tt, 0.5 + tt, 13.0, 0, 7);
    fbox(tiles, 0.5, 14.8, 0.5 + tt, 16.0 - tt, 0, 7);
    fbox(tiles, 0.5, 13.0, 0.5 + tt, 14.8, 0, 6);
    fbox(tiles, 7.5 - tt, 12.0 + tt, 7.5, 12.9, 0, 7);
    fbox(tiles, 7.5 - tt, 15.6, 7.5, 16.0 - tt, 0, 7);
    // brushed tile trims at 7'
    fbox(brushed, 0.5, 12.0, 7.5, 12.0 + tt + 0.02, 7.0, 7.04);
    fbox(brushed, 0.5, 16.0 - tt - 0.02, 7.5, 16.0, 7.0, 7.04);
    fbox(brushed, 0.5, 12.0, 0.5 + tt + 0.02, 16.0, 7.0, 7.04);

    // concealed-cistern ledge (tiled) with stone cap + flush plate
    const lx1 = 2.5, lx2 = 4.9, ly2 = 12.5;
    fbox(tiles, lx1, 12.0 + tt, lx2, ly2, 0, 3.5);
    fbox(quartz, lx1 - 0.02, 12.0 + tt, lx2 + 0.02, ly2 + 0.05, 3.5, 3.58, 3, 0.01);
    const wcx = 3.7;
    add(rbox(0.78, 0.5, 0.04, 0.03, 3), brushed, F, wcx, 3.12, ly2 + 0.02);
    add(rbox(0.34, 0.4, 0.03, 0.02, 3), chrome, F, wcx - 0.18, 3.12, ly2 + 0.04);
    add(rbox(0.34, 0.4, 0.03, 0.02, 3), chrome, F, wcx + 0.18, 3.12, ly2 + 0.04);
    // wall-hung WC facing S
    const wc = new THREE.Group(); wc.position.set(wcx, 0, ly2); F.add(wc);
    const bowlProf = [[0, 0], [0.3, 0], [0.42, 0.06], [0.54, 0.24], [0.6, 0.44], [0.62, 0.57], [0.57, 0.58], [0.5, 0.48], [0.3, 0.26], [0.0, 0.22]].map(([r, h]) => new THREE.Vector2(r, h));
    const bowl = add(new THREE.LatheGeometry(bowlProf, 64), ceramic, wc, 0, 0.76, 0.95);
    bowl.scale.set(0.95, 1, 1.3);
    add(rbox(0.92, 0.6, 0.6, 0.12, 4), ceramic, wc, 0, 1.04, 0.32);
    const ringG = new THREE.CylinderGeometry(0.6, 0.6, 0.05, 64);
    const seat = add(ringG, ceramic, wc, 0, 1.36, 0.95); seat.scale.set(0.95, 1, 1.3);
    const lid = add(new THREE.SphereGeometry(0.6, 64, 16, 0, Math.PI * 2, 0, Math.PI / 2), ceramic, wc, 0, 1.385, 0.93);
    lid.scale.set(0.94, 0.09, 1.28);
    for (const s of [-1, 1]) add(rbox(0.12, 0.06, 0.12, 0.02, 2), chrome, wc, s * 0.25, 1.4, 0.18);
    // health faucet (west of WC) and paper holder (east)
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 20), chrome, F, 2.7, 2.0, ly2 + 0.04).rotation.x = Math.PI / 2;
    const hf = add(rbox(0.09, 0.32, 0.09, 0.03, 2), chrome, F, 2.72, 1.9, ly2 + 0.13); hf.rotation.x = 0.2;
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.32, 12), chrome, F, 4.55, 2.35, ly2 + 0.12).rotation.z = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 12), chrome, F, 4.4, 2.35, ly2 + 0.05).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), F, 4.6, 2.2, ly2 + 0.2).rotation.z = Math.PI / 2;
    ctx.collide({ x1: lx1, y1: 12.0, x2: lx2, y2: 14.3 });

    // fixed glass shower screen at x 2.44 with chrome wall channel
    const gx = 2.44;
    add(new THREE.BoxGeometry(0.03, 6.5, 2.3), glassClear, F, gx, 0.1 + 3.25, 12.0 + tt + 1.15).renderOrder = 2;
    fbox(chrome, gx - 0.04, 12.0 + tt, gx + 0.04, 12.12, 0.1, 6.6, 4);
    fbox(chrome, gx - 0.035, 12.0 + tt, gx + 0.035, 14.4, 0.04, 0.1, 4);
    // stabiliser bar to the west wall
    add(new THREE.CylinderGeometry(0.025, 0.025, gx - 0.5 - tt, 12), chrome, F, (gx + 0.5 + tt) / 2, 6.4, 14.3).rotation.z = Math.PI / 2;
    ctx.collide({ x1: gx - 0.1, y1: 12.0, x2: gx + 0.1, y2: 14.45 });

    // shower: mixer + rain head on S wall at x 1.45, hand shower on rail
    const sx = 1.45, sw = 16.0 - tt;
    add(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 48), chrome, F, sx, 3.8, sw - 0.015).rotation.x = Math.PI / 2;
    const knob = add(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 24), chrome, F, sx, 3.8, sw - 0.08); knob.rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 16), chrome, F, sx, 6.85, sw - 0.475).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 20), chrome, F, sx, 6.85, sw - 0.02).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 12), chrome, F, sx, 6.75, sw - 0.9);
    add(rbox(0.85, 0.04, 0.85, 0.02, 2), chrome, F, sx, 6.63, sw - 0.9);
    add(new THREE.CylinderGeometry(0.02, 0.02, 2.0, 12), chrome, F, sx + 0.7, 4.3, sw - 0.06);
    add(rbox(0.1, 0.5, 0.1, 0.04, 2), chrome, F, sx + 0.7, 4.9, sw - 0.12);
    // linear-look square drain
    fbox(brushed, sx - 0.2, 14.25, sx + 0.2, 14.65, 0, 0.01, 1);
    for (let i = 0; i < 5; i++) fbox(new THREE.MeshStandardMaterial({ color: 0x333333 }), sx - 0.17, 14.29 + i * 0.075, sx + 0.17, 14.31 + i * 0.075, 0.009, 0.012, 1);
    // shower caddy with bottles on the W wall
    const cw = 0.5 + tt;
    fbox(brushed, cw, 15.0, cw + 0.4, 15.75, 4.0, 4.03, 1);
    fbox(brushed, cw + 0.38, 15.0, cw + 0.4, 15.75, 4.0, 4.18, 1);
    const bottleCols = [0xf4f1ea, 0x3d5a4a, 0xc9a77c];
    bottleCols.forEach((col, i) => {
      const bm = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35 });
      const hgt = 0.55 - i * 0.08;
      add(new THREE.CylinderGeometry(0.08, 0.085, hgt, 24), bm, F, cw + 0.2, 4.03 + hgt / 2, 15.13 + i * 0.22);
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 16), blackMetal, F, cw + 0.2, 4.03 + hgt + 0.035, 15.13 + i * 0.22);
    });
    // towel rail + towel on S wall
    const ty = 16.0 - tt;
    add(new THREE.CylinderGeometry(0.025, 0.025, 2.0, 16), chrome, F, 5.1, 4.5, ty - 0.22).rotation.z = Math.PI / 2;
    for (const ex of [4.1, 6.1]) add(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 16), chrome, F, ex, 4.5, ty - 0.11).rotation.x = Math.PI / 2;
    add(drapeGeo(1.15, 1.35, 1.05, 0.045, 7), terryMat(0x9fb3a1, 1.15), F, 5.1, 4.5, ty - 0.22);
    // bath mat inside the door
    { const mg = rbox(1.35, 0.035, 1.4, 0.016, 3); add(boxUV(mg, 0.8), terryMat(0xc9cfba), F, 6.57, 0.018, 14.75); }
    // flush ceiling light
    const cl = new THREE.Group(); cl.userData.hideInTop = true; F.add(cl);
    add(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 48), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0dc, emissiveIntensity: 1.2 }), cl, 4.0, 9.96, 14.0);
    const tl = new THREE.PointLight(0xfff0dc, 3.5, 0, 2); tl.position.set(4.0, 9.3, 14.0); cl.add(tl);
  }

  // ============================================================ LOBBY DAYBED (x 18.8–23.9, y 21.5–24.0) facing N
  {
    const x1 = 18.8, x2 = 23.9, y1 = 21.5, y2 = 23.97;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const fab = (w, h, d, r, seg = 5) => boxUV(new RoundedBoxGeometry(w, h, d, seg, r), 0.6);
    const welt = new THREE.MeshStandardMaterial({ color: 0x0e1748, roughness: 0.8 });
    const weltF = new THREE.MeshStandardMaterial({ color: 0x6a1242, roughness: 0.8 });
    // slim tapered walnut legs (6") with brass caps, soft contact shadow
    const legG = boxUV(new THREE.CylinderGeometry(0.045, 0.026, 0.5, 20), 1.5);
    for (const lx of [x1 + 0.3, cx, x2 - 0.3]) for (const ly of [y1 + 0.28, y2 - 0.28]) {
      add(legG, walnut, F, lx, 0.25, ly);
      add(new THREE.CylinderGeometry(0.029, 0.026, 0.05, 16), brass, F, lx, 0.025, ly);
    }
    contactShadow(cx, cy, x2 - x1 - 0.2, y2 - y1 - 0.2, 0.5);
    // royal-navy woven plinth with a welt along its top edge
    add(fab(x2 - x1, 0.58, y2 - y1, 0.09), navyVelvet, F, cx, 0.79, cy);
    add(roundRectTube(x2 - x1 - 0.04, y2 - y1 - 0.04, 0.09, 0.022), welt, F, cx, 1.07, cy).castShadow = false;
    // full-length low back against bedroom 3's north wall
    add(fab(x2 - x1, 1.54, 0.42, 0.17), navyVelvet, F, cx, 1.83, y2 - 0.21);
    // rounded east arm
    const ax0 = x2 - 0.48;
    add(fab(0.48, 1.19, y2 - y1 - 0.38, 0.22, 6), navyVelvet, F, x2 - 0.24, 1.655, y1 + (y2 - y1 - 0.38) / 2);
    // two magenta seat cushions: crowned, softly sat-in, piped top and bottom
    const sx1 = x1 + 0.04, sx2 = ax0 - 0.03, sy1 = y1 + 0.02, sy2 = y2 - 0.44, sh1 = 1.08, sh2 = 1.54;
    const cw = (sx2 - sx1) / 2 - 0.015, cd = sy2 - sy1, ch = sh2 - sh1;
    const seatG = boxUV(cushionGeo(cw, ch, cd, 0.12, 0.05, 0.035), 0.6);
    for (const k of [0, 1]) {
      const px = sx1 + cw / 2 + k * (cw + 0.03), py = (sy1 + sy2) / 2;
      const sc = add(seatG, fuchsia, F, px, (sh1 + sh2) / 2, py);
      if (k) sc.rotation.y = Math.PI; // vary the wrinkles
      add(roundRectTube(cw - 0.03, cd - 0.03, 0.11, 0.02), weltF, F, px, sh2 - 0.035, py).castShadow = false;
      add(roundRectTube(cw - 0.03, cd - 0.03, 0.11, 0.02), weltF, F, px, sh1 + 0.035, py).castShadow = false;
    }
    // row of three magenta back cushions leaning on the back (softened, slightly slumped)
    const bw = (sx2 - sx1) / 3 - 0.02;
    const backG = boxUV(cushionGeo(bw, 0.38, 1.1, 0.16, 0.07, 0.03), 0.6);
    backG.rotateX(Math.PI / 2);
    for (let k = 0; k < 3; k++) {
      const bc = add(backG, fuchsia, F, sx1 + bw / 2 + k * (bw + 0.03), sh2 + 0.52, 23.33);
      bc.rotation.set(Math.PI + 0.16 + (k - 1) * 0.03, 0, (k - 1) * 0.025);
    }
    // three plump scatter cushions at the east end (two red jacquard, one coral)
    const coral = velvet(0xc8452c, 0xe8735a, 0.3);
    const pg = pillowGeo(1.3, 1.3, 0.46);
    const c1 = add(pg, redJacq, F, 22.85, 2.11, 22.92); c1.rotation.set(0.32, 0.32, 0.06);
    const c2 = add(pg, redJacq, F, 22.05, 2.08, 22.98); c2.rotation.set(0.3, -0.18, -0.07);
    const c3 = add(pillowGeo(1.05, 1.05, 0.4), coral, F, ax0 - 0.22, sh2 + 0.5, 22.15); c3.rotation.y = Math.PI / 2; c3.rotateX(0.3);
    ctx.collide({ x1, y1, x2, y2 });

    // abstract canvas above the daybed (wall face y = 24)
    const la = framedArt(abstractArt(), 3.9, 2.6, 0.18);
    la.position.set(21.35, 4.15 + 1.3, 24.0); la.rotation.y = FACE.N;
  }
}

// extra view: the lobby daybed under its canvas, seen from the dining side
export const views = {
  'dining-lobby': { pos: [19.5, 16.8], look: [21.4, 23.5], lookH: 2.8 },
};
