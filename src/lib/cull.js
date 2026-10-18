import * as THREE from 'three';
import { FT, walls } from '../plan.js';

// Line-of-sight culling. The flat is a handful of rooms joined by doorways: from inside one room the others are hidden
// behind walls, yet three.js (frustum culling only) still submits all their furniture - roughly half the draw calls.
//
// Every few inches of movement a fan of 2-D rays is cast from the viewer against the solid walls of plan.js (windows and
// doorways are gaps in that list, so they correctly let sight through). A mesh is drawn only if one of those rays
// reaches its (padded) footprint before hitting a wall. Padding + ray density make this conservative: it may draw
// something hidden, never hide something visible. See tools/cull-test.mjs for the pixel-diff check.

const RAYS = 720;
const PAD = 0.4;          // ft added around every footprint (less than a wall's 0.5 ft so neighbours behind a wall stay culled)
const STEP = 0.25;        // ft of movement between updates
const BIG = 22;           // ft: footprints this large (floors, walls, roof) are always drawn

export class Culler {
  constructor(scene, { skip = [] } = {}) {
    this.enabled = true;
    this.items = [];
    const skipped = new Set(skip), box = new THREE.Box3();
    scene.updateMatrixWorld(true);
    for (const root of scene.children) {
      if (!(root.name.startsWith('piece-') || root.name === 'shell')) continue;
      root.traverse((o) => {
        if (!o.isMesh || skipped.has(o)) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        const x1 = box.min.x / FT - PAD, x2 = box.max.x / FT + PAD, y1 = box.min.z / FT - PAD, y2 = box.max.z / FT + PAD;
        if (x2 - x1 > BIG || y2 - y1 > BIG) return;
        this.items.push({ mesh: o, x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, hidden: false });
      });
    }
    // planar mirrors show what is in front of THEM, which the viewer may not see directly: treat each as a second viewpoint
    this.mirrors = [];
    const q = new THREE.Vector3();
    for (const it of this.items) {
      if (!it.mesh.isReflector) continue;
      q.set(0, 0, 1).transformDirection(it.mesh.matrixWorld);
      const len = Math.hypot(q.x, q.z) || 1;
      this.mirrors.push({ it, nx: q.x / len, ny: q.z / len });
    }
    this.dirs = new Float32Array(RAYS * 2);
    for (let k = 0; k < RAYS; k++) { const a = (k / RAYS) * Math.PI * 2; this.dirs[k * 2] = Math.cos(a); this.dirs[k * 2 + 1] = Math.sin(a); }
    this.depth = new Float32Array(RAYS);
    this.mdepth = new Float32Array(RAYS);
    this.wall = new Float32Array(walls.length * 4);
    walls.forEach((w, i) => { this.wall.set([w.x1, w.y1, w.x2, w.y2], i * 4); });
    this.lastX = 1e9; this.lastY = 1e9;
  }

  /** nearest hit of a ray with an axis-aligned rect: distance, or Infinity */
  static hit(ox, oy, dx, dy, x1, y1, x2, y2) {
    let t0 = 0, t1 = Infinity;
    if (Math.abs(dx) < 1e-9) { if (ox < x1 || ox > x2) return Infinity; } else {
      let a = (x1 - ox) / dx, b = (x2 - ox) / dx; if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a; if (b < t1) t1 = b;
    }
    if (Math.abs(dy) < 1e-9) { if (oy < y1 || oy > y2) return Infinity; } else {
      let a = (y1 - oy) / dy, b = (y2 - oy) / dy; if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a; if (b < t1) t1 = b;
    }
    return t0 <= t1 ? t0 : Infinity;
  }

  showAll() {
    for (const it of this.items) if (it.hidden) { it.mesh.visible = true; it.mesh.userData.culled = false; it.hidden = false; }
    this.lastX = 1e9; // force a fresh update afterwards
  }

  _fan(x, y, depth, nx = 0, ny = 0, half = false) {
    const { dirs, wall } = this;
    for (let k = 0; k < RAYS; k++) {
      const dx = dirs[k * 2], dy = dirs[k * 2 + 1];
      if (half && dx * nx + dy * ny < -0.05) { depth[k] = -1; continue; } // behind a mirror: nothing to reflect
      let d = Infinity;
      for (let i = 0; i < wall.length; i += 4) {
        const t = Culler.hit(x, y, dx, dy, wall[i], wall[i + 1], wall[i + 2], wall[i + 3]);
        if (t < d) d = t;
      }
      depth[k] = d;
    }
  }

  /** is the footprint reachable from (x, y) by a ray that has not hit a wall (per the depth fan)? */
  _sees(x, y, depth, it) {
    if (x >= it.x1 && x <= it.x2 && y >= it.y1 && y <= it.y2) return true;
    const TWO_PI = Math.PI * 2, { dirs } = this;
    // angular span of the footprint as seen from the viewer
    const ac = Math.atan2(it.cy - y, it.cx - x);
    let lo = Infinity, hi = -Infinity;
    for (const [px, py] of [[it.x1, it.y1], [it.x2, it.y1], [it.x1, it.y2], [it.x2, it.y2]]) {
      let r = Math.atan2(py - y, px - x) - ac;
      if (r > Math.PI) r -= TWO_PI; else if (r < -Math.PI) r += TWO_PI;
      if (r < lo) lo = r; if (r > hi) hi = r;
    }
    if (hi - lo > Math.PI * 0.75) return true; // very close to a large footprint
    const k0 = Math.floor(((ac + lo) / TWO_PI) * RAYS) - 1, k1 = Math.ceil(((ac + hi) / TWO_PI) * RAYS) + 1;
    for (let k = k0; k <= k1; k++) {
      const kk = ((k % RAYS) + RAYS) % RAYS;
      if (depth[kk] < 0) continue;
      const t = Culler.hit(x, y, dirs[kk * 2], dirs[kk * 2 + 1], it.x1, it.y1, it.x2, it.y2);
      if (t <= depth[kk]) return true;
    }
    return false;
  }

  /** Recompute visibility for a viewer at plan (x, y) in feet. Cheap no-op while the viewer has barely moved. */
  update(x, y, force = false) {
    if (!this.enabled) return;
    if (!force && Math.abs(x - this.lastX) < STEP && Math.abs(y - this.lastY) < STEP) return;
    this.lastX = x; this.lastY = y;
    this._fan(x, y, this.depth);
    for (const it of this.items) it.vis = this._sees(x, y, this.depth, it);
    for (const m of this.mirrors) {
      if (!m.it.vis) continue; // the viewer cannot see this mirror, so what it reflects does not matter
      const mx = m.it.cx + m.nx * 0.2, my = m.it.cy + m.ny * 0.2; // just in front of the glass, outside the wall
      this._fan(mx, my, this.mdepth, m.nx, m.ny, true);
      for (const it of this.items) if (!it.vis && this._sees(mx, my, this.mdepth, it)) it.vis = true;
    }
    for (const it of this.items) {
      if (it.vis === it.hidden) { // state change (visible now but hidden before, or the reverse)
        it.hidden = !it.vis;
        it.mesh.visible = it.vis;
        it.mesh.userData.culled = !it.vis;
      }
    }
  }

  get hiddenCount() { let n = 0; for (const it of this.items) if (it.hidden) n++; return n; }
}
