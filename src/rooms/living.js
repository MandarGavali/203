// Piece: living — Living room 13'11"x17'0" (x 24.5–38.42, y 14–31) + 5'9" balcony (x 24.5–38.92, y 31.5–37.25).
//
// What's where (plan feet):
//   sofa        3-seater, x 24.65–27.15, y 20.15–27.0, faces E   (navy-blue frame/arms, fuchsia cushions, red pillows)
//   armchairs   N: x 27.3–29.9, y 17.7–20.35 faces S;  S: x 27.35–29.95, y 26.6–29.25 faces N (same family)
//   side tables 1.5' sq walnut + teal ceramic drum lamps at (25.85, 18.75) and (25.85, 28.2)
//   coffee tbl  x 27.75–30.45, y 22.0–25.2: navy metal frame, clear glass top over Nero-Marquina patterned panel
//   TV wall     fluted walnut panel on E wall y 19.9–26.7; low walnut console x 36.95–38.34, y 19.8–26.8; 65" TV;
//               gold/black-spotted vases at both console ends
//   art         framed abstract canvas on N wall centred x 29.6; second framed canvas on W wall (bed3 wall) centred y 28.3
//   entrance    walnut fluted shoe cabinet x 33.0-34.8, y 14.0-15.15 (clear of the main-door swing) + small print above
//   curtains    sheer linen stacks either side of the balcony slider
//   balcony     potted plant (25.95, 33.4), two mustard floor cushions (28.0, 33.5) & (26.0, 35.65), black round table (28.45, 35.4)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const F = 0.3048; // ft -> m
const BALC_H = -0.04 / F; // outdoor floors sit 4 cm below the indoor finish (shell)

export const views = {
  // default balcony view missed the west-end cluster; look across the balcony from its east end instead
  'living-a': { pos: [26.9, 30.5], look: [35, 18] },
  'living-balcony': { pos: [38.2, 32.4], look: [26.5, 35.2], lookH: 1.6, h: 5.0 },
  'living-sofa': { pos: [33.8, 23.4], look: [26, 23.4], lookH: 2.4, h: 4.6 },
  'living-tv': { pos: [26.6, 23.5], look: [38, 23.3], lookH: 3.6, h: 4.4 },
};

// ---------- small geometry helpers (local feet; all meshes cast + receive shadows) ----------

// planar UVs from the existing (smooth) normals, in metres-per-repeat; also fills uv1 for aoMap
function planarUV(g, size) {
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

function mesh(parent, geom, mat, uvSize) {
  if (uvSize ?? mat.userData?.worldSize) planarUV(geom, uvSize ?? mat.userData.worldSize);
  const m = new THREE.Mesh(geom, mat);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

// rounded box: w (local X) x h x d (local Z) feet, centred at x,z, bottom at y
function rbox(parent, mat, { w, h, d, x = 0, y = 0, z = 0, r = 0.06, seg = 4 }) {
  const rr = Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002);
  const g = new RoundedBoxGeometry(w * F, h * F, d * F, seg, Math.max(rr, 0.001) * F);
  g.translate(x * F, (y + h / 2) * F, z * F);
  return mesh(parent, g, mat);
}

// cushion / pillow: superellipsoid — square face, plump middle, thin tapered edges. w (X) x h (Y) x t (Z) feet
function pillowGeom(w, h, t, { sq = 0.28, seed = 1 } = {}) {
  const g = new THREE.SphereGeometry(1, 48, 32);
  const p = g.attributes.position;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const wob = [rnd(), rnd(), rnd(), rnd()].map((v) => (v - 0.5) * 0.22);
  const ph = rnd() * 6;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ex = Math.sign(x) * Math.pow(Math.abs(x), sq), ey = Math.sign(y) * Math.pow(Math.abs(y), sq);
    // pinch the corners a little, like a real filled cover
    const pinch = 1 - 0.13 * (1 - Math.abs(ey)) * Math.abs(ex) ** 4;
    const pinchY = 1 - 0.13 * (1 - Math.abs(ex)) * Math.abs(ey) ** 4;
    const bulge = 1 + wob[(x > 0 ? 1 : 0) + (y > 0 ? 2 : 0)] * (1 - Math.abs(ex)) * (1 - Math.abs(ey)) + 0.09 * Math.sin(ex * 4 + ph) * Math.sin(ey * 3 + ph * 0.7);
    p.setXYZ(i, ex * pinch * w / 2 * F, ey * pinchY * h / 2 * F, z * bulge * t / 2 * F);
  }
  g.computeVertexNormals();
  return g;
}

// Upholstered "soft box": rounded box with vertices packed into the rounded edges (so they read soft, not faceted),
// a domed crown on top and an optional sit-dip toward the front. Feet in, metres out; bottom at y=0, centred x/z.
// Returns { geom, seam(yLevel) } where seam() gives the welt-piping curve around the top (+1) or bottom (-1) edge.
function softBox(w, h, d, r, { crown = 0, sag = 0, seed = 1, wob = 0 } = {}) {
  r = Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
  const N = 20, k = 0.4;
  let g = new THREE.BoxGeometry(2, 2, 2, N, N, N);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r;
  const remap = (s, inner) => { const a = Math.abs(s); return Math.sign(s) * (a < 1 - k ? (a / (1 - k)) * inner : inner + ((a - (1 - k)) / k) * r); };
  const rnd = rng(seed * 97 + 13);
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  const disp = (x, z, top) => {
    const u = x / (w / 2), t = z / (d / 2);
    const bump = Math.max(0, (1 - u * u) * (1 - t * t));
    const dip = sag * Math.exp(-(u * u) / 0.35 - ((t - 0.25) ** 2) / 0.25);
    const ripple = wob * Math.sin(u * 3.1 + ph[0]) * Math.sin(t * 2.3 + ph[1]);
    return (crown * bump - dip * bump + ripple * bump) * top;
  };
  const p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(remap(p.getX(i), ix), remap(p.getY(i), iy), remap(p.getZ(i), iz));
    c.set(THREE.MathUtils.clamp(v.x, -ix, ix), THREE.MathUtils.clamp(v.y, -iy, iy), THREE.MathUtils.clamp(v.z, -iz, iz));
    const dir = v.clone().sub(c);
    if (dir.lengthSq() > 1e-12) v.copy(c).add(dir.normalize().multiplyScalar(r));
    const top = Math.max(0, (v.y + h / 2) / h) ** 2;
    v.y += disp(v.x, v.z, top) + h / 2;
    p.setXYZ(i, v.x * F, v.y * F, v.z * F);
  }
  g.computeVertexNormals();
  const seam = (side = 1) => {
    const e = r * 0.7, hx = ix + e, hz = iz + e, cr = e;
    const y = side > 0 ? h / 2 + iy + e * 0.92 : h / 2 - iy - e * 0.92;
    const topW = side > 0 ? ((iy + e) / h + 0.5) ** 2 : 0;
    const pts = [];
    const corners = [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]];
    for (const [sx, sz, a0] of corners) {
      const cx = sx * (hx - cr), cz = sz * (hz - cr);
      for (let i = 0; i <= 8; i++) {
        const a = a0 + (i / 8) * (Math.PI / 2);
        pts.push([cx + Math.cos(a) * cr, cz + Math.sin(a) * cr]);
      }
      // straight run to the next corner
      const [nx, nz] = corners[(corners.findIndex((c) => c[2] === a0) + 1) % 4];
      const ex = cx + Math.cos(a0 + Math.PI / 2) * cr, ez = cz + Math.sin(a0 + Math.PI / 2) * cr;
      const tx = nx * (hx - cr) + Math.cos(a0 + Math.PI / 2) * cr, tz = nz * (hz - cr) + Math.sin(a0 + Math.PI / 2) * cr;
      for (let j = 1; j < 12; j++) pts.push([ex + (tx - ex) * (j / 12), ez + (tz - ez) * (j / 12)]);
    }
    return new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x * F, (y + disp(x, z, topW)) * F, z * F)), true, 'centripetal');
  };
  return { geom: g, seam };
}

// welt piping along a closed curve
function piping(parent, mat, curve, rad = 0.028) {
  const g = new THREE.TubeGeometry(curve, 220, rad * F, 6, true);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

// soft contact shadow (blurred rounded rect) lying on the floor — grounds furniture beyond what the shadow map resolves
let _shadowTex;
function contactShadow(parent, w, d, { x = 0, z = 0, y = 0.004, opacity = 0.55, spread = 0.5 } = {}) {
  _shadowTex ||= canvasTex(256, 256, (g, W, H) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.filter = 'blur(12px)'; g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath(); g.roundRect(22, 22, W - 44, H - 44, 22); g.fill();
    g.filter = 'blur(18px)'; g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath(); g.roundRect(48, 48, W - 96, H - 96, 30); g.fill();
  }, false);
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: _shadowTex, transparent: true, opacity, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry((w + spread * 2) * F, (d + spread * 2) * F), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x * F, y, z * F);
  m.renderOrder = 1;
  parent.add(m);
  return m;
}

// small dark blob right under a leg/foot (darkest contact point)
let _blobTex;
function footShadow(parent, x, z, size = 0.4, opacity = 0.85) {
  _blobTex ||= canvasTex(64, 64, (g, W, H) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, '#fff'); grd.addColorStop(0.35, '#bbb'); grd.addColorStop(1, '#000');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
  }, false);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size * F, size * F),
    new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: _blobTex, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x * F, 0.006, z * F);
  m.renderOrder = 2;
  parent.add(m);
}

function lathe(parent, mat, pts, segs = 48) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r * F, y * F)), segs);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------- procedural textures ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// black Nero Marquina marble with white veins (coffee-table centre panel)
function neroMarquina() {
  return canvasTex(1024, 1024, (g, W, H) => {
    const r = rng(7);
    g.fillStyle = '#121212'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { // cloudy depth
      g.fillStyle = `rgba(${40 + r() * 30},${40 + r() * 30},${44 + r() * 30},0.05)`;
      g.beginPath(); g.arc(r() * W, r() * H, 20 + r() * 90, 0, 7); g.fill();
    }
    const vein = (x, y, ang, len, wdt, a) => {
      g.strokeStyle = `rgba(235,232,225,${a})`; g.lineWidth = wdt; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < len; k++) {
        ang += (r() - 0.5) * 0.5; x += Math.cos(ang) * 8; y += Math.sin(ang) * 8; g.lineTo(x, y);
        if (r() < 0.04 && wdt > 0.8) vein(x, y, ang + (r() - 0.5) * 1.6, len * 0.4, wdt * 0.55, a * 0.8);
      }
      g.stroke();
    };
    g.filter = 'blur(1.2px)';
    for (let i = 0; i < 9; i++) vein(r() * W * 0.3 - 100, r() * H, -0.6 + r() * 0.3, 120 + r() * 60, 1 + r() * 2.2, 0.55 + r() * 0.35);
    g.filter = 'blur(4px)';
    for (let i = 0; i < 5; i++) vein(r() * W * 0.3 - 100, r() * H, -0.6 + r() * 0.3, 150, 6, 0.08);
    g.filter = 'none';
  });
}

// gold glaze with black leopard-style rosettes (decor vases on the TV console, as drawn on the plan)
function goldSpots() {
  return canvasTex(1024, 1024, (g, W, H) => {
    const r = rng(11);
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#d9a94a'); grd.addColorStop(0.5, '#c8932f'); grd.addColorStop(1, '#d6a443');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 110; i++) {
      const x = r() * W, y = r() * H, s = 14 + r() * 22;
      g.fillStyle = '#8a5a1c';
      g.beginPath(); g.ellipse(x, y, s * 0.7, s * 0.55, r() * 3, 0, 7); g.fill();
      g.fillStyle = '#141008';
      const n = 3 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r() * 0.8;
        g.beginPath();
        g.ellipse(x + Math.cos(a) * s, y + Math.sin(a) * s * 0.85, s * (0.28 + r() * 0.2), s * (0.18 + r() * 0.15), a, 0, 7);
        g.fill();
      }
    }
    for (let i = 0; i < 120; i++) { g.fillStyle = '#17110a'; g.beginPath(); g.arc(r() * W, r() * H, 3 + r() * 6, 0, 7); g.fill(); }
  });
}

// woven upholstery melange (greyscale, mean ~0.78): threads + slubs + heathering, so fabric reads at room distance
function weaveTex(seed, { threads = 96, contrast = 1 } = {}) {
  return canvasTex(1024, 1024, (g, W, H) => {
    const r = rng(seed), cs = W / threads;
    g.fillStyle = '#c4c4c4'; g.fillRect(0, 0, W, H);
    const shade = (base) => { const v = Math.max(0, Math.min(255, Math.round(base))); return `rgb(${v},${v},${v})`; };
    // weft rows with slubs (runs of lighter/darker yarn)
    for (let j = 0; j < threads; j++) {
      let x = 0;
      while (x < W) {
        const len = 30 + r() * 220;
        g.fillStyle = shade(200 + (r() - 0.5) * 46 * contrast);
        g.fillRect(x, j * cs + 1, len, cs - 2);
        x += len;
      }
    }
    // warp floats over every other cell (plain weave)
    for (let i = 0; i < threads; i++) {
      const colBase = 196 + (r() - 0.5) * 30 * contrast;
      for (let j = (i % 2); j < threads; j += 2) {
        g.fillStyle = shade(colBase + (r() - 0.5) * 16 * contrast);
        g.fillRect(i * cs + 1, j * cs - 1, cs - 2, cs + 2);
      }
    }
    // gaps between yarns + heather speckle
    g.fillStyle = `rgba(0,0,0,${0.18 * contrast})`;
    for (let i = 0; i < threads; i++) { g.fillRect(i * cs, 0, 1, H); g.fillRect(0, i * cs, W, 1); }
    for (let k = 0; k < 6000; k++) { g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.12 * contrast})` : `rgba(0,0,0,${0.12 * contrast})`; g.fillRect(r() * W, r() * H, 2 + r() * 5, 1 + r() * 2); }
  });
}

// abstract canvas painting (N wall): indigo / terracotta / ochre — ties the sofa blues and balcony mustards together
function painting(seed = 23, pal = ['#1f3364', '#b8532f', '#d79a2b', '#7d2350'], ground = '#eee6d8', W0 = 1200, H0 = 800) {
  return canvasTex(W0, H0, (g, W, H) => {
    const r = rng(seed);
    g.fillStyle = ground; g.fillRect(0, 0, W, H);
    const blob = (x, y, rad, col, a) => {
      g.globalAlpha = a; g.fillStyle = col; g.beginPath();
      for (let k = 0; k <= 40; k++) {
        const t = (k / 40) * Math.PI * 2, rr = rad * (0.85 + r() * 0.15);
        g.lineTo(x + Math.cos(t) * rr * 1.2, y + Math.sin(t) * rr);
      }
      g.fill(); g.globalAlpha = 1;
    };
    g.filter = 'blur(2px)';
    const S = Math.min(W, H) / 800;
    const j = seed === 23 ? () => 0.05 : () => r() * 0.1;
    blob(W * (0.25 + j()), H * (0.5 + j()), 230 * S, pal[0], 0.92);
    blob(W * (0.57 + j()), H * (0.35 + j()), 190 * S, pal[1], 0.88);
    blob(W * (0.73 + j()), H * (0.65 + j()), 130 * S, pal[2], 0.9);
    blob(W * (0.42 + j()), H * (0.73 + j()), 90 * S, pal[3], 0.85);
    g.filter = 'none';
    g.strokeStyle = '#1b1b1b'; g.lineWidth = 5;
    g.beginPath(); g.arc(W * 0.52, H * 0.5, 260 * S, Math.PI * 1.05, Math.PI * 1.9); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.moveTo(W * 0.12, H * 0.86); g.lineTo(W * 0.9, H * 0.18); g.stroke();
    for (let i = 0; i < 9000; i++) { // canvas grain + dry-brush
      g.fillStyle = `rgba(${r() < 0.5 ? 255 : 0},${r() < 0.5 ? 255 : 0},${r() < 0.5 ? 255 : 0},0.035)`;
      g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 3);
    }
  });
}

// patterned border band for the coffee-table top (plan: blue frame with red/floral motifs round the dark centre)
function floralBand() {
  return canvasTex(512, 512, (g, W, H) => {
    const r = rng(31);
    g.fillStyle = '#1c2a5c'; g.fillRect(0, 0, W, H);
    const cell = 64;
    for (let y = 0; y < H; y += cell) for (let x = 0; x < W; x += cell) {
      const cx = x + cell / 2, cy = y + cell / 2;
      g.fillStyle = '#c8402f';
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; g.beginPath(); g.ellipse(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, 9, 5, a, 0, 7); g.fill(); }
      g.fillStyle = '#efe4cc'; g.beginPath(); g.arc(cx, cy, 5, 0, 7); g.fill();
      g.strokeStyle = '#7f9bd6'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + cell / 2, y + 10 + r() * 6, x + cell, y); g.stroke();
      g.fillStyle = '#efe4cc'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
    }
  });
}

// single-line ink drawing of a face in profile with a terracotta sun (sofa-wall piece)
function lineArt() {
  return canvasTex(1000, 760, (g, W, H) => {
    const r = rng(61);
    g.fillStyle = '#f1ebe0'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#c4532f'; g.beginPath(); g.arc(W * 0.68, H * 0.36, 120, 0, 7); g.fill();
    g.fillStyle = 'rgba(125,24,80,0.85)'; g.fillRect(W * 0.12, H * 0.62, W * 0.22, 14);
    g.strokeStyle = '#151515'; g.lineWidth = 5; g.lineCap = g.lineJoin = 'round';
    const pts = [[0.30, 0.90], [0.33, 0.70], [0.30, 0.62], [0.36, 0.55], [0.33, 0.50], [0.38, 0.46], [0.36, 0.40], [0.42, 0.34],
      [0.40, 0.26], [0.47, 0.17], [0.58, 0.14], [0.66, 0.20], [0.70, 0.32], [0.66, 0.46], [0.60, 0.56], [0.62, 0.70], [0.58, 0.90]];
    g.beginPath(); g.moveTo(pts[0][0] * W, pts[0][1] * H);
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i], [nx, ny] = pts[i + 1];
      g.quadraticCurveTo(x * W, y * H, ((x + nx) / 2) * W, ((y + ny) / 2) * H);
    }
    g.lineTo(pts[pts.length - 1][0] * W, pts[pts.length - 1][1] * H); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(W * 0.5, H * 0.31, 9, 0, 7); g.stroke(); // eye
    g.beginPath(); g.moveTo(W * 0.47, H * 0.42); g.quadraticCurveTo(W * 0.5, H * 0.45, W * 0.53, H * 0.42); g.stroke();
    for (let i = 0; i < 7000; i++) { g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.02})`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1); }
  });
}

// hand block-printed textile (ajrakh style): indigo ground, madder-red and cream motifs (entry print)
function blockPrint() {
  return canvasTex(600, 800, (g, W, H) => {
    const r = rng(71);
    g.fillStyle = '#1b2554'; g.fillRect(0, 0, W, H);
    const c = 75;
    for (let y = 0; y < H + c; y += c) for (let x = 0; x < W + c; x += c) {
      const ox = (y / c) % 2 ? c / 2 : 0, cx = x + ox, cy = y;
      g.fillStyle = '#a8322a';
      g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.lineTo(cx + Math.cos(a) * (k % 2 ? 14 : 28), cy + Math.sin(a) * (k % 2 ? 14 : 28)); } g.fill();
      g.fillStyle = '#efe2c6'; g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.fill();
      g.fillStyle = 'rgba(239,226,198,0.8)';
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; g.beginPath(); g.arc(cx + Math.cos(a) * 38, cy + Math.sin(a) * 38, 3, 0, 7); g.fill(); }
    }
    g.strokeStyle = '#efe2c6'; g.lineWidth = 6; g.strokeRect(18, 18, W - 36, H - 36);
    g.strokeStyle = '#a8322a'; g.lineWidth = 3; g.strokeRect(30, 30, W - 60, H - 60);
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.05})`; g.fillRect(r() * W, r() * H, 2, 2); } // ink unevenness
  });
}

// ---------- build ----------
export default async function build(ctx) {
  const { group, pbr } = ctx;

  // materials
  // fabrics: canvas weave/melange map (reads at room distance) + scanned linen/velvet normal & roughness.
  // `target` is the sRGB colour the fabric should read as; the map's ~0.57 linear mean is compensated.
  const weaves = { linen: weaveTex(5), velvet: weaveTex(9, { threads: 110, contrast: 0.85 }), chunky: weaveTex(13, { threads: 56, contrast: 1.3 }) };
  const woven = (target, { kind = 'linen', size = 0.3, nor = 'rough_linen', normalScale = 1.5, sheen = 0 } = {}) => {
    const P = sheen ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const m = new P({
      map: weaves[kind], normalMap: ctx.tex(`assets/ph/${nor}/nor.jpg`), roughnessMap: ctx.tex(`assets/ph/${nor}/rough.jpg`),
      roughness: 1, normalScale: new THREE.Vector2(normalScale, normalScale),
      ...(sheen ? { sheen, sheenRoughness: 0.8, sheenColor: new THREE.Color(target).multiplyScalar(1.6) } : {}),
    });
    m.color.set(target).multiplyScalar(1 / 0.57);
    m.userData.worldSize = size;
    return m;
  };
  const fabric = (id, mul, o = {}) => { const m = pbr(id, { roughness: 1, ...o }); m.color.setRGB(...mul); return m; };
  const M = {
    blue: woven(0x19224f, { size: 0.28 }),                                 // deep indigo-navy linen frame (plan's blue lines)
    bluePiping: woven(0x10153a, { size: 0.08, normalScale: 1 }),
    fuchsia: woven(0x7f1250, { kind: 'velvet', nor: 'velour_velvet', size: 0.25, sheen: 0.3, normalScale: 2 }), // fuchsia-magenta velvet seats
    red: woven(0xc4473a, { size: 0.22 }),                                   // coral-red linen pillows
    redDeep: woven(0x931e2a, { kind: 'velvet', nor: 'velour_velvet', size: 0.2, sheen: 0.35 }),
    walnut: pbr('american_walnut_veneer', { size: 0.9, roughness: 0.75 }),
    walnutDark: pbr('american_walnut_veneer', { size: 0.9, roughness: 0.7, color: 0x8a7468 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc89b4e, metalness: 1, roughness: 0.28 }),
    blackMetal: new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.7, roughness: 0.42 }),
    navyMetal: new THREE.MeshStandardMaterial({ color: 0x1b2c63, metalness: 0.65, roughness: 0.32 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.02, transparent: true, opacity: 0.15, depthWrite: false, envMapIntensity: 0.5 }), // no diffuse: only reflections, so the dark inlay shows through
    glassEdge: new THREE.MeshPhysicalMaterial({ color: 0x6fa58c, roughness: 0.05, transparent: true, opacity: 0.6, depthWrite: false }),
    band: Object.assign(new THREE.MeshStandardMaterial({ map: floralBand(), roughness: 0.55 }), { userData: { worldSize: 0.16 } }),
    stoneMatte: new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.85 }),
    nero: new THREE.MeshPhysicalMaterial({ map: neroMarquina(), roughness: 0.55, envMapIntensity: 0.15 }),
    gold: new THREE.MeshPhysicalMaterial({ map: goldSpots(), metalness: 0.55, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.08 }),
    teal: new THREE.MeshPhysicalMaterial({ color: 0x1d8a99, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
    shade: pbr('rough_linen', { size: 0.2, noMap: true, color: 0xf3ebdc, roughness: 1, side: THREE.DoubleSide, emissive: 0xffd9a0, emissiveIntensity: 0.6, normalScale: 0.5 }),
    mustard: woven(0xc98a1e, { kind: 'chunky', size: 0.3, normalScale: 2 }),   // mustard-orange cotton canvas poufs
    mustardPiping: woven(0xc8641a, { size: 0.08, normalScale: 1 }),
    curtain: pbr('rough_linen', { size: 0.25, noMap: true, color: 0xf4eee2, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.82, normalScale: 0.6 }),
    // unlit near-black glass that mirrors the sky/room env faintly (MixOperation) - glossy look with no point-light glints
    screen: new THREE.MeshBasicMaterial({ color: 0x050608, combine: THREE.MixOperation, reflectivity: 0.025 }), // higher mirrored the city panorama like a picture
    tvBody: new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.35, metalness: 0.4 }), // bezel / chassis
    ceramicWhite: new THREE.MeshPhysicalMaterial({ color: 0xf2efe8, roughness: 0.25, clearcoat: 0.6 }),
    stoneBlack: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.55 }),
    candle: new THREE.MeshStandardMaterial({ color: 0xf1e7d2, roughness: 0.6 }),
    downlight: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 1.2 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xf0eeea, roughness: 0.4, metalness: 0.2 }),
  };
  const bookCols = [0x7b2b2b, 0x24395e, 0xd9cfb8, 0x2f4a3a, 0xb07a2a, 0x3a3a3a];
  const bookMats = bookCols.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }));
  const pageMat = new THREE.MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.9 });

  // ---- reusable furniture builders (local feet, front = +Z) ----
  function books(parent, x, y, z, n = 3, seed = 3, rotY = 0) {
    const r = rng(seed);
    const s = new THREE.Group();
    let h = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.62 + r() * 0.25, d = 0.45 + r() * 0.15, t = 0.06 + r() * 0.05;
      const b = new THREE.Group();
      rbox(b, bookMats[Math.floor(r() * bookMats.length)], { w, h: t, d, r: 0.012, seg: 2 });
      rbox(b, pageMat, { w: w - 0.02, h: t - 0.02, d: d - 0.03, y: 0.01, x: 0.012, r: 0.005, seg: 1 });
      b.position.set(0, h * F, 0);
      b.rotation.y = (r() - 0.5) * 0.25;
      s.add(b);
      h += t;
    }
    s.position.set(x * F, y * F, z * F);
    s.rotation.y = rotY;
    parent.add(s);
    return h;
  }

  // a sofa/armchair of the same family: slim tapered walnut legs lifting it ~5", indigo linen frame (slim arms, low back),
  // fuchsia velvet box cushions with navy welt piping, small gaps, crowned tops with a sit-dip; soft red throw pillows.
  function seat({ W, D, seats, pillows = [], seed = 1 }) {
    const g = new THREE.Group();
    const armW = 0.36, backT = 0.42, legH = 0.42, deckTop = 1.2, armTop = 1.95, backTop = 2.55;
    const part = (mat, w, h, d, r, x, y, z, opts) => {
      const sb = softBox(w, h, d, r, opts);
      const m = mesh(g, sb.geom, mat);
      m.position.set(x * F, y * F, z * F);
      return { m, sb };
    };
    // legs: slim tapered walnut with a brass ferrule
    const legXs = seats > 1 ? [-W / 2 + 0.22, 0, W / 2 - 0.22] : [-W / 2 + 0.22, W / 2 - 0.22];
    for (const lx of legXs) for (const lz of [-D / 2 + 0.22, D / 2 - 0.22]) {
      if (lx === 0 && lz > 0) continue; // centre support only at the back
      lathe(g, M.walnutDark, [[0, 0.04], [0.04, 0.04], [0.065, legH], [0, legH]], 16).position.set(lx * F, 0, lz * F);
      lathe(g, M.brass, [[0, 0], [0.038, 0], [0.042, 0.05], [0, 0.05]], 16).position.set(lx * F, 0, lz * F);
      footShadow(g, lx, lz);
    }
    // base rail (deck), arms, back — upholstered frame
    part(M.blue, W, deckTop - legH, D, 0.07, 0, legH, 0);
    for (const sx of [-1, 1]) {
      const arm = part(M.blue, armW, armTop - legH, D, 0.15, sx * (W / 2 - armW / 2), legH, 0, { crown: 0.02, seed: seed + sx });
      piping(g, M.bluePiping, arm.sb.seam(1), 0.022).position.copy(arm.m.position);
    }
    const back = part(M.blue, W - 2 * armW + 0.02, backTop - legH, backT, 0.15, 0, legH, -D / 2 + backT / 2, { crown: 0.02, seed });
    piping(g, M.bluePiping, back.sb.seam(1), 0.022).position.copy(back.m.position);
    // seat + back cushions
    const gap = 0.07;
    const inner = W - 2 * armW - 0.03, cw = inner / seats, sd = D - backT - 0.03;
    for (let i = 0; i < seats; i++) {
      const cx = -inner / 2 + cw * (i + 0.5);
      const sc = part(M.fuchsia, cw - gap, 0.5, sd, 0.18, cx, deckTop, D / 2 - sd / 2 - 0.02, { crown: 0.1, sag: 0.035, wob: 0.015, seed: seed * 7 + i });
      for (const side of [1, -1]) piping(g, M.bluePiping, sc.sb.seam(side)).position.copy(sc.m.position);
      // back cushion: built lying down (crown = its front face), stood up and reclined
      const bw = cw - gap, bh = 1.12, bt = 0.5;
      const bg = new THREE.Group();
      const bsb = softBox(bw, bt, bh, 0.21, { crown: 0.12, wob: 0.02, seed: seed * 11 + i });
      mesh(bg, bsb.geom, M.fuchsia);
      for (const side of [1, -1]) piping(bg, M.bluePiping, bsb.seam(side));
      bg.rotation.x = Math.PI / 2 - 0.17;
      bg.position.set(cx * F, (deckTop + 0.5 + bh / 2 - 0.04) * F, (-D / 2 + backT - 0.12) * F);
      g.add(bg);
    }
    // throw pillows, leaning on the back cushions
    for (const p of pillows) {
      const s = p.s ?? 1.4;
      const pm = mesh(g, pillowGeom(s, s * 0.96, 0.4, { seed: p.seed ?? 5 }), p.mat ?? M.red);
      pm.position.set(p.x * F, (deckTop + 0.45 + s / 2 - 0.1) * F, (-D / 2 + backT + 0.55) * F);
      pm.rotation.set(-0.32, p.ry ?? 0, p.rz ?? 0);
    }
    // soft contact shadow under the whole piece
    contactShadow(g, W, D, { opacity: 0.8, spread: 0.3 });
    return g;
  }

  function sideTableWithLamp(x, y, lampOn = true) { // one short-range 2700K light per lamp (TV screen is unlit, so no glints)
    const g = new THREE.Group();
    const S = 1.5, H = 1.95, top = 0.1;
    rbox(g, M.walnut, { w: S, h: top, d: S, y: H - top, r: 0.03 });
    rbox(g, M.walnut, { w: S - 0.2, h: 0.07, d: S - 0.2, y: 0.42, r: 0.02 }); // shelf
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rbox(g, M.blackMetal, { w: 0.09, h: H - top, d: 0.09, x: sx * (S / 2 - 0.08), z: sz * (S / 2 - 0.08), r: 0.015, seg: 2 });
    books(g, -0.05, 0.49, 0.02, 2, Math.round(x * 10 + y));
    // lamp: teal glazed ceramic gourd + linen drum shade
    const lamp = new THREE.Group();
    lathe(lamp, M.teal, [[0, 0], [0.22, 0], [0.3, 0.12], [0.36, 0.38], [0.33, 0.62], [0.2, 0.82], [0.09, 0.95], [0.08, 1.02], [0, 1.02]]);
    lathe(lamp, M.brass, [[0, 1.0], [0.06, 1.0], [0.04, 1.35], [0, 1.35]], 16);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * F, 0.58 * F, 0.72 * F, 48, 1, true), M.shade);
    shade.position.y = 1.55 * F;
    shade.castShadow = true;
    lamp.add(shade);
    lamp.position.set(0.12 * F, H * F, -0.1 * F);
    g.add(lamp);
    if (lampOn) {
      const l = new THREE.PointLight(0xffb46b, 2.2, 3.2, 2);
      l.position.set(0.12 * F, (H + 1.5) * F, -0.1 * F);
      g.add(l);
    }
    ctx.place(g, { x, y, face: 'E' });
    ctx.collide({ x1: x - S / 2, y1: y - S / 2, x2: x + S / 2, y2: y + S / 2 });
  }

  // shared fill dimmed so light falls off from the bright balcony slider toward the TV wall (living: fill + 2 lamps = 3 lights)
  const fill = ctx.scene.getObjectByName('fill-living');
  if (fill) { fill.intensity *= 0.6; fill.position.z = ctx.m(26.5); }

  // ================= SOFA (faces E) =================
  {
    const W = 6.85, D = 2.45;
    // local +X points north after face 'E' -> one pillow at the north end, two at the south end (as drawn)
    const sofa = seat({
      W, D, seats: 3, pillows: [
        { x: 2.15, ry: -0.12, rz: 0.06, seed: 3 },
        { x: -2.2, ry: 0.15, rz: -0.08, seed: 7 },
        { x: -1.55, ry: 0.05, rz: 0.1, s: 1.3, seed: 9, mat: M.redDeep },
      ],
    });
    // folded throw over the south arm
    const throwG = new THREE.Group();
    const throwMat = fabric('wool_boucle', [1.5, 1.45, 1.4], { size: 0.12, normalScale: 1.2 });
    const tTop = softBox(0.46, 0.07, 1.5, 0.03, { wob: 0.01, seed: 5 });
    mesh(throwG, tTop.geom, throwMat);
    const tDrop = softBox(0.07, 0.75, 1.5, 0.03, { seed: 6 });
    mesh(throwG, tDrop.geom, throwMat).position.set(-0.235 * F, -0.7 * F, 0);
    throwG.position.set((-W / 2 + 0.18) * F, 1.95 * F, 0.2 * F);
    sofa.add(throwG);
    ctx.place(sofa, { x: 24.6 + D / 2, y: 20.15 + W / 2, face: 'E' });
    ctx.collide({ x1: 24.6, y1: 20.15, x2: 24.6 + D, y2: 20.15 + W });
  }

  // ================= ARMCHAIRS =================
  {
    const S = 2.6, xN = 27.12, yN = 17.72, xS = 27.15, yS = 26.62;
    const n = seat({ W: S, D: S, seats: 1, seed: 3, pillows: [{ x: 0.1, ry: 0.2, rz: 0.12, s: 1.25, seed: 13 }] });
    ctx.place(n, { x: xN + S / 2, y: yN + S / 2, face: 'S' });
    ctx.collide({ x1: xN, y1: yN, x2: xN + S, y2: yN + S });
    const s = seat({ W: S, D: S, seats: 1, seed: 5, pillows: [{ x: -0.1, ry: -0.2, rz: -0.1, s: 1.25, seed: 17 }] });
    ctx.place(s, { x: xS + S / 2, y: yS + S / 2, face: 'N' });
    ctx.collide({ x1: xS, y1: yS, x2: xS + S, y2: yS + S });
  }

  // ================= SIDE TABLES + LAMPS =================
  sideTableWithLamp(25.85, 18.75);
  sideTableWithLamp(25.85, 28.2);

  // ================= COFFEE TABLE =================
  {
    const g = new THREE.Group();
    const W = 2.7, D = 3.2, H = 1.38, t = 0.1; // W along plan x (local X), D along plan y (local Z)
    // navy frame: legs, top ring, lower ring
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rbox(g, M.navyMetal, { w: t, h: H - 0.04, d: t, x: sx * (W / 2 - t / 2), z: sz * (D / 2 - t / 2), r: 0.012, seg: 2 });
    for (const yy of [H - 0.2, 0.22]) {
      for (const sz of [-1, 1]) rbox(g, M.navyMetal, { w: W, h: 0.12, d: t, z: sz * (D / 2 - t / 2), y: yy, r: 0.012, seg: 2 });
      for (const sx of [-1, 1]) rbox(g, M.navyMetal, { w: t, h: 0.12, d: D, x: sx * (W / 2 - t / 2), y: yy, r: 0.012, seg: 2 });
    }
    // dark patterned marble panel (plan's hatched centre) set into the top frame, glass top over it
    const nero = rbox(g, M.nero, { w: W - 0.6, h: 0.06, d: D - 0.6, y: H - 0.2, r: 0.01, seg: 1 });
    nero.geometry.deleteAttribute('uv'); nero.geometry.deleteAttribute('uv1');
    planarUV(nero.geometry, (W - 0.6) * F);
    // patterned border band (navy with coral florets) between the navy frame and the dark centre, as drawn
    for (const sz of [-1, 1]) rbox(g, M.band, { w: W - 0.2, h: 0.06, d: 0.2, z: sz * (D / 2 - 0.2), y: H - 0.2, r: 0.005, seg: 1 });
    for (const sx of [-1, 1]) rbox(g, M.band, { w: 0.2, h: 0.06, d: D - 0.6, x: sx * (W / 2 - 0.2), y: H - 0.2, r: 0.005, seg: 1 });
    // clear low-iron glass top with a green-tinted polished edge
    const glass = rbox(g, M.glass, { w: W + 0.06, h: 0.04, d: D + 0.06, y: H - 0.04, r: 0.012, seg: 2 });
    glass.castShadow = false; glass.renderOrder = 2;
    for (const sz of [-1, 1]) { const e = rbox(g, M.glassEdge, { w: W + 0.06, h: 0.04, d: 0.02, z: sz * (D / 2 + 0.02), y: H - 0.04, r: 0.008, seg: 1 }); e.castShadow = false; e.renderOrder = 3; }
    for (const sx of [-1, 1]) { const e = rbox(g, M.glassEdge, { w: 0.02, h: 0.04, d: D + 0.02, x: sx * (W / 2 + 0.02), y: H - 0.04, r: 0.008, seg: 1 }); e.castShadow = false; e.renderOrder = 3; }
    // lower shelf: matte charcoal stone
    rbox(g, M.stoneMatte, { w: W - 0.15, h: 0.04, d: D - 0.15, y: 0.3, r: 0.01, seg: 1 });
    // styling: books + bowl + small succulent
    books(g, -0.55, H, 0.7, 3, 41, 0.3);
    lathe(g, M.brass, [[0, 0], [0.18, 0], [0.32, 0.06], [0.42, 0.2], [0.4, 0.21], [0.3, 0.08], [0, 0.03]]).position.set(0.45 * F, H * F, -0.65 * F);
    const succ = ctx.fit(await ctx.model('assets/ph/potted_plant_04/potted_plant_04_1k.gltf'), { h: 0.55 });
    succ.position.set(0.4 * F, H * F, 0.55 * F);
    g.add(succ);
    lathe(g, M.candle, [[0, 0], [0.12, 0], [0.12, 0.35], [0, 0.35]], 24).position.set(0.42 * F, (H + 0.05) * F, -0.65 * F);
    contactShadow(g, W, D, { opacity: 0.6, spread: 0.3 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) footShadow(g, sx * (W / 2 - 0.05), sz * (D / 2 - 0.05), 0.35, 0.8);
    ctx.place(g, { x: 27.75 + W / 2, y: 22.0 + D / 2, face: 'S' });
    ctx.collide({ x1: 27.75, y1: 22.0, x2: 27.75 + W, y2: 22.0 + D });
  }

  // ================= TV WALL (E wall, faces W) =================
  {
    const g = new THREE.Group(); // local: X along wall (north = +X when facing W? see below), Z out from wall
    // face 'W': local +Z -> west, local +X -> south. Wall surface at local z = 0 (plan x 38.42).
    const yc = 23.3; // centre of the composition along the wall
    // fluted walnut panel behind TV
    const PW = 6.8, PH = 9.0;
    rbox(g, M.walnutDark, { w: PW, h: PH, d: 0.05, z: 0.025, r: 0.01, seg: 1 });
    const n = 34;
    for (let i = 0; i < n; i++) {
      const x = -PW / 2 + (i + 0.5) * (PW / n);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * F, 0.075 * F, PH * F, 12, 1, false, 0, Math.PI), M.walnut);
      planarUV(c.geometry, 0.9);
      c.rotation.y = -Math.PI / 2;
      c.position.set(x * F, (PH / 2) * F, 0.05 * F);
      c.castShadow = c.receiveShadow = true;
      g.add(c);
    }
    // brass reveal line at the top of the panel
    rbox(g, M.brass, { w: PW, h: 0.05, d: 0.16, y: PH, z: 0.08, r: 0.01, seg: 1 });
    // low console: recessed plinth + walnut body + 4 fluted-front drawers + thin black stone top
    const CW = 4.7, CD = 1.38, CH = 1.55;
    rbox(g, M.stoneBlack, { w: CW - 0.3, h: 0.28, d: CD - 0.2, z: 0.1 + (CD - 0.2) / 2, r: 0.01, seg: 1 });
    rbox(g, M.walnut, { w: CW, h: CH - 0.28 - 0.08, d: CD - 0.02, z: 0.1 + CD / 2, y: 0.28, r: 0.03 });
    rbox(g, M.stoneBlack, { w: CW + 0.04, h: 0.08, d: CD + 0.02, z: 0.1 + CD / 2, y: CH - 0.08, r: 0.02 });
    const nd = 3, dw = CW / nd;
    for (let i = 0; i < nd; i++) {
      const x = -CW / 2 + dw * (i + 0.5);
      rbox(g, M.walnutDark, { w: dw - 0.05, h: CH - 0.28 - 0.08 - 0.1, d: 0.04, x, z: 0.1 + CD + 0.0, y: 0.33, r: 0.01, seg: 1 });
      for (let k = 0; k < 13; k++) {
        const fx = x - (dw - 0.2) / 2 + (k + 0.5) * ((dw - 0.2) / 13);
        const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * F, 0.045 * F, (CH - 0.55) * F, 10, 1, false, 0, Math.PI), M.walnut);
        planarUV(fl.geometry, 0.9);
        fl.rotation.y = -Math.PI / 2;
        fl.position.set(fx * F, (0.38 + (CH - 0.55) / 2) * F, (0.1 + CD + 0.02) * F);
        fl.castShadow = fl.receiveShadow = true;
        g.add(fl);
      }
      rbox(g, M.brass, { w: 0.5, h: 0.04, d: 0.06, x, y: CH - 0.2, z: 0.1 + CD + 0.06, r: 0.015, seg: 2 });
    }
    // 65" TV, wall-mounted
    // 1.2in deep chassis, ~0.4in bezel, hung ~0.8in off the fluted panel on a hidden bracket
    const TW = 4.75, TH = 2.72, tvB = 3.05, tvZ = 0.245, bez = 0.033;
    rbox(g, M.tvBody, { w: TW, h: TH, d: 0.1, y: tvB, z: tvZ, r: 0.015, seg: 2 });
    rbox(g, M.tvBody, { w: 1.2, h: 0.9, d: 0.07, y: tvB + 0.9, z: 0.16, r: 0.01, seg: 1 }); // bracket
    const scr = new THREE.Mesh(new THREE.PlaneGeometry((TW - 2 * bez) * F, (TH - 2 * bez - 0.015) * F), M.screen);
    scr.position.set(0, (tvB + TH / 2 + 0.008) * F, (tvZ + 0.051) * F);
    // per-material env reflection (scene.environment alone would use the scene-wide intensity)
    const useEnv = () => {
      if (!M.screen.envMap && ctx.scene.background?.isTexture) { M.screen.envMap = ctx.scene.background; M.screen.needsUpdate = true; }
      if (!M.glass.envMap && ctx.scene.environment) {
        for (const mt of [M.glass, M.nero]) { mt.envMap = ctx.scene.environment; mt.needsUpdate = true; }
      }
    };
    useEnv();
    scr.onBeforeRender = useEnv;
    g.add(scr);
    // soft shadow the TV throws on the fluted panel
    const ts = contactShadow(g, TW, TH, { opacity: 0.4, spread: 0.3 });
    ts.rotation.x = 0; ts.position.set(0, (tvB + TH / 2 - 0.08) * F, 0.135 * F);
    // gold/black-spotted FLOOR urn-planters at both ends of the console (plan's spotted pieces, y 19.7–20.9 / 25.7–26.8)
    const urn = [[0, 0], [0.32, 0], [0.36, 0.06], [0.5, 0.45], [0.6, 1.1], [0.6, 1.55], [0.52, 2.1], [0.4, 2.45], [0.36, 2.62],
      [0.42, 2.72], [0.44, 2.78], [0.4, 2.8], [0.35, 2.7], [0.33, 2.6]];
    const soil = new THREE.MeshStandardMaterial({ color: 0x2b2018, roughness: 1 });
    const leafy = await ctx.model('assets/ph/potted_plant_02/potted_plant_02_1k.gltf');
    const uz = 1.05; // urn centre 1.05 ft off the wall: body clear by ~5in
    for (const [ux, rot] of [[20.3 - yc, 0.4], [26.2 - yc, 2.2]]) {
      const u = lathe(g, M.gold, urn, 64);
      u.position.set(ux * F, 0, uz * F);
      u.rotation.y = rot;
      const top = new THREE.Mesh(new THREE.CircleGeometry(0.34 * F, 32), soil);
      top.rotation.x = -Math.PI / 2;
      top.position.set(ux * F, 2.62 * F, uz * F);
      g.add(top);
      // leafy plant growing out of the urn (Poly Haven pot hidden)
      const pl = leafy.clone(true);
      pl.traverse((o) => { if (o.isMesh && /_(pot|dirt)$/i.test(o.name)) o.visible = false; });
      // keep foliage off the wall and inside y 19.7-26.8: the plant's long (-Z) side faces the room
      pl.scale.setScalar(0.9);
      pl.rotation.y = Math.PI + (ux < 0 ? -0.35 : 0.35);
      pl.position.set(ux * F, 2.62 * F - 0.3 * 0.9, uz * F);
      g.add(pl);
      contactShadow(g, 1.2, 1.2, { x: ux, z: uz, opacity: 0.7, spread: 0.25 });
      ctx.collide({ x1: 36.95, y1: yc + ux - 0.62, x2: 38.42, y2: yc + ux + 0.62 });
    }
    contactShadow(g, CW, CD, { z: 0.1 + CD / 2, opacity: 0.75, spread: 0.3 });
    // styled console top: books + small sculpture + candle
    books(g, -1.0, CH, 0.1 + CD / 2, 3, 77, 0.1);
    lathe(g, M.ceramicWhite, [[0, 0], [0.15, 0], [0.22, 0.2], [0.2, 0.4], [0.07, 0.62], [0.09, 0.7], [0, 0.7]]).position.set(1.05 * F, CH * F, (0.1 + CD / 2) * F);
    ctx.place(g, { x: 38.42, y: yc, face: 'W' });
    ctx.collide({ x1: 38.42 - 0.1 - CD, y1: yc - CW / 2, x2: 38.42, y2: yc + CW / 2 });
  }

  // ================= ART on N wall =================
  {
    const g = new THREE.Group();
    const AW = 4.6, AH = 3.1;
    rbox(g, M.blackMetal, { w: AW + 0.12, h: AH + 0.12, d: 0.12, z: 0.06, r: 0.01, seg: 1 });
    const cm = new THREE.MeshStandardMaterial({ map: painting(), roughness: 0.85 });
    const c = new THREE.Mesh(new THREE.PlaneGeometry(AW * F, AH * F), cm);
    c.position.set(0, (AH / 2 + 0.06) * F, 0.125 * F);
    g.add(c);
    g.position.y = 3.9 * F;
    const wrap = new THREE.Group(); wrap.add(g);
    ctx.place(wrap, { x: 29.6, y: 14.0, face: 'S' });
  }

  // ================= ART on W wall (bedroom 3 east wall, y 24.5-31) above the south side table =================
  {
    const g = new THREE.Group();
    const AW = 3.3, AH = 2.5;
    rbox(g, M.walnutDark, { w: AW + 0.16, h: AH + 0.16, d: 0.1, z: 0.05, r: 0.01, seg: 1 });
    rbox(g, new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.9 }), { w: AW - 0.02, h: AH - 0.02, d: 0.02, y: 0.09, z: 0.1, r: 0.004, seg: 1 }); // mount
    const c = new THREE.Mesh(new THREE.PlaneGeometry((AW - 0.5) * F, (AH - 0.5) * F),
      new THREE.MeshStandardMaterial({ map: lineArt(), roughness: 0.85 }));
    c.position.set(0, (AH / 2 + 0.08) * F, 0.125 * F);
    g.add(c);
    g.position.y = 4.35 * F;
    const wrap = new THREE.Group(); wrap.add(g);
    ctx.place(wrap, { x: 24.5, y: 28.3, face: 'E' });
  }

  // ================= SHOE CABINET + key ledge by the entrance (N wall, x 33.0-34.8, clear of the door swing) =================
  {
    const g = new THREE.Group(); // face S: wall at local z = 0, front toward +Z (south)
    const CW = 1.8, CD = 1.15, CH = 2.9;
    rbox(g, M.stoneBlack, { w: CW - 0.2, h: 0.25, d: CD - 0.15, z: (CD - 0.15) / 2, r: 0.01, seg: 1 }); // plinth
    rbox(g, M.walnut, { w: CW, h: CH - 0.25 - 0.07, d: CD, z: CD / 2, y: 0.25, r: 0.025 });
    rbox(g, M.stoneBlack, { w: CW + 0.04, h: 0.07, d: CD + 0.03, z: CD / 2 + 0.01, y: CH - 0.07, r: 0.015 });
    for (const sx of [-1, 1]) {
      const dx = sx * CW / 4;
      rbox(g, M.walnutDark, { w: CW / 2 - 0.05, h: CH - 0.45, d: 0.04, x: dx, z: CD + 0.01, y: 0.3, r: 0.01, seg: 1 });
      for (let k = 0; k < 7; k++) {
        const fx = dx - (CW / 2 - 0.2) / 2 + (k + 0.5) * ((CW / 2 - 0.2) / 7);
        const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * F, 0.045 * F, (CH - 0.65) * F, 10, 1, false, 0, Math.PI), M.walnut);
        planarUV(fl.geometry, 0.9);
        fl.rotation.y = -Math.PI / 2;
        fl.position.set(fx * F, (0.4 + (CH - 0.65) / 2) * F, (CD + 0.03) * F);
        fl.castShadow = fl.receiveShadow = true;
        g.add(fl);
      }
      rbox(g, M.brass, { w: 0.04, h: 0.45, d: 0.05, x: dx - sx * (CW / 4 - 0.12), y: CH - 1.05, z: CD + 0.07, r: 0.012, seg: 2 });
    }
    // styling: brass key tray, small vase, a book
    lathe(g, M.brass, [[0, 0], [0.22, 0], [0.26, 0.05], [0.25, 0.06], [0.2, 0.015], [0, 0.015]]).position.set(-0.4 * F, CH * F, 0.6 * F);
    lathe(g, M.ceramicWhite, [[0, 0], [0.1, 0], [0.16, 0.18], [0.12, 0.42], [0.06, 0.55], [0.07, 0.6], [0, 0.6]]).position.set(0.45 * F, CH * F, 0.5 * F);
    books(g, 0.1, CH, 0.55, 1, 91, 0.2);
    contactShadow(g, CW, CD, { z: CD / 2, opacity: 0.75, spread: 0.3 });
    // small framed print above
    const art = new THREE.Group();
    rbox(art, M.blackMetal, { w: 1.35, h: 1.75, d: 0.08, z: 0.04, r: 0.008, seg: 1 });
    const pr = new THREE.Mesh(new THREE.PlaneGeometry(1.1 * F, 1.5 * F),
      new THREE.MeshStandardMaterial({ map: blockPrint(), roughness: 0.85 }));
    pr.position.set(0, 0.875 * F, 0.085 * F);
    art.add(pr);
    art.position.y = 3.75 * F; // centred over the cabinet, ~10in above its top
    g.add(art);
    ctx.place(g, { x: 33.9, y: 14.0, face: 'S' });
    ctx.collide({ x1: 33.0, y1: 14.0, x2: 34.8, y2: 14.0 + CD });
  }

  // ================= CURTAINS either side of the balcony slider =================
  {
    const curtain = (xa, xb) => {
      const w = xb - xa, h = 9.35, folds = Math.round(w * 4.2);
      const g = new THREE.PlaneGeometry(w * F, h * F, folds * 8, 24);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        const u = (x / F + w / 2) / w;
        const k = 1 + 0.35 * (0.5 - y / (h * F)); // folds open up a touch toward the hem
        p.setZ(i, Math.sin(u * folds * Math.PI * 2) * 0.045 * k);
      }
      g.computeVertexNormals();
      planarUV(g, 0.25);
      const m = new THREE.Mesh(g, M.curtain);
      m.castShadow = true; m.receiveShadow = true;
      m.position.set(((xa + xb) / 2) * F, (h / 2 + 0.05) * F, 30.62 * F);
      group.add(m);
    };
    curtain(24.65, 27.0);
    curtain(35.5, 38.3);
    // ceiling track
    ctx.box(M.trim, { x1: 24.6, y1: 30.55, x2: 38.4, y2: 30.72, h1: 9.45, h2: 9.55 });
  }

  // ================= DOWNLIGHTS (recessed, ceiling) =================
  for (const x of [27.5, 31.6, 35.6]) for (const y of [17.0, 23.3, 28.8]) {
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * F, 0.28 * F, 0.02 * F, 32), M.trim);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * F, 0.2 * F, 0.025 * F, 32), M.downlight);
    for (const o of [trim, lens]) { o.position.set(x * F, (ctx.CEILING - 0.012) * F, y * F); o.userData.hideInTop = true; group.add(o); }
  }

  // ================= BALCONY =================
  {
    // potted plant at the west end
    const plant = ctx.fit(await ctx.model('assets/ph/potted_plant_01/potted_plant_01_1k.gltf'), { h: 4.2 });
    ctx.place(plant, { x: 25.95, y: 33.4, h: BALC_H, face: 'S' });
    ctx.collide({ x1: 25.1, y1: 32.6, x2: 26.8, y2: 34.3 });

    // two mustard-orange floor cushions (tufted, with piping)
    const floorCushion = (x, y, rot, seed) => {
      const g = new THREE.Group();
      const sb = softBox(2.1, 0.75, 2.1, 0.2, { crown: 0.08, sag: 0.03, wob: 0.02, seed });
      mesh(g, sb.geom, M.mustard);
      for (const side of [1, -1]) piping(g, M.mustardPiping, sb.seam(side), 0.03);
      // centre tuft button sunk into the crown
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07 * F, 14, 10), M.mustardPiping);
      b.position.set(0, (0.75 + 0.08 - 0.03 - 0.03) * F, 0); b.scale.y = 0.55; g.add(b);
      contactShadow(g, 2.0, 2.0, { opacity: 0.6, spread: 0.3 });
      g.position.y = 0.02 * F;
      const wrap = new THREE.Group(); wrap.add(g);
      ctx.place(wrap, { x, y, h: BALC_H, face: rot });
      ctx.collide({ x1: x - 1, y1: y - 1, x2: x + 1, y2: y + 1 });
    };
    floorCushion(28.0, 33.5, 8, 21);
    floorCushion(26.0, 35.65, -6, 33);

    // small round black table (low, for floor seating)
    const t = new THREE.Group();
    const R = 0.88, TH = 1.45;
    lathe(t, M.blackMetal, [[0, TH - 0.06], [R, TH - 0.06], [R + 0.01, TH - 0.03], [R, TH], [0, TH]], 64);
    lathe(t, M.blackMetal, [[0, TH - 0.07], [R - 0.02, TH - 0.07], [R - 0.02, TH - 0.18], [R - 0.06, TH - 0.18], [R - 0.06, TH - 0.09], [0, TH - 0.09]], 64);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * F, 0.025 * F, (TH - 0.1) * F / Math.cos(0.12), 10), M.blackMetal);
      leg.position.set(Math.cos(a) * (R - 0.25) * F, (TH - 0.1) / 2 * F, Math.sin(a) * (R - 0.25) * F);
      leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
      leg.castShadow = true; t.add(leg);
    }
    // two tea glasses + a small succulent
    for (const [cx, cz] of [[0.3, 0.1], [-0.1, -0.35]]) {
      const cup = lathe(t, M.ceramicWhite, [[0, 0], [0.09, 0], [0.11, 0.22], [0.1, 0.22], [0.085, 0.02], [0, 0.02]], 24);
      cup.position.set(cx * F, TH * F, cz * F);
    }
    const succ = ctx.fit(await ctx.model('assets/ph/potted_plant_04/potted_plant_04_1k.gltf'), { h: 0.5 });
    succ.position.set(-0.3 * F, TH * F, 0.3 * F);
    t.add(succ);
    ctx.place(t, { x: 28.45, y: 35.4, h: BALC_H, face: 'S' });
    ctx.collide({ x1: 28.45 - R, y1: 35.4 - R, x2: 28.45 + R, y2: 35.4 + R });
  }
}
