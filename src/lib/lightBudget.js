import * as THREE from 'three';
import { FT, walls } from '../plan.js';

// three.js shades every fragment against EVERY enabled light, however far away: with ~25 point lights in the flat
// that was the single biggest GPU cost. Only a handful matter at any moment (the rest are behind walls), so this
// keeps a fixed number of point lights switched on - the ones that matter most to the viewer - and fades others in/out.
//
// The number of enabled lights stays constant (budget + a couple of spare slots used for cross-fading), because
// changing it would make three.js recompile every shader.

const FADE_S = 0.45;
const SPARE = 2;
const SEG_PAD = 0.05; // ft

// does the plan-feet segment a->b cross a solid wall?
function blocked(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  for (const w of walls) {
    let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[ax, dx, w.x1 - SEG_PAD, w.x2 + SEG_PAD], [ay, dy, w.y1 - SEG_PAD, w.y2 + SEG_PAD]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 2; break; } continue; }
      let a = (lo - p) / d, b = (hi - p) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) break;
    }
    if (t0 <= t1) return true;
  }
  return false;
}

export class LightBudget {
  constructor(scene) {
    this.entries = [];
    this.slots = [];
    this.budget = 99;
    const p = new THREE.Vector3();
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!o.isPointLight) return;
      o.getWorldPosition(p);
      this.entries.push({ light: o, base: o.intensity, x: p.x, y: p.y, z: p.z, fx: p.x / FT, fy: p.z / FT, f: 1, target: 1, score: 0 });
    });
    this.enabled = this.entries.length > 0;
  }

  _score(e, cam, cfx, cfy) {
    const dx = e.x - cam.x, dy = e.y - cam.y, dz = e.z - cam.z;
    let s = e.base / (dx * dx + dy * dy + dz * dz + 1);
    if (blocked(cfx, cfy, e.fx, e.fy)) s *= 0.12;
    return s * (e.target > 0 && e.light.visible ? 1.25 : 1); // hysteresis: don't flap between near-equal lights
  }

  /** Choose which lights are on. Call once before first render and whenever the budget (tier) changes. */
  setBudget(n, cam) {
    if (!this.enabled) return;
    this.budget = Math.min(n, this.entries.length);
    const total = Math.min(this.budget + SPARE, this.entries.length);
    const cfx = cam.x / FT, cfy = cam.z / FT;
    for (const e of this.entries) { e.score = this._score(e, cam, cfx, cfy); e.target = 0; e.f = 0; }
    const ranked = [...this.entries].sort((a, b) => b.score - a.score);
    this.slots = ranked.slice(0, total);
    for (const e of this.entries) e.light.visible = false;
    ranked.forEach((e, i) => {
      if (i < total) { e.light.visible = true; e.target = i < this.budget ? 1 : 0; e.f = e.target; }
      e.light.intensity = e.base * e.f;
    });
  }

  /**
   * Runs fn() with exactly the number of lights a given budget would switch on, then restores the real state.
   * Used to pre-compile the shaders of a quality tier before switching to it (the light count is part of every shader).
   */
  withBudget(n, fn) {
    if (!this.enabled) return fn();
    const saved = this.entries.map((e) => e.light.visible);
    const total = Math.min(Math.min(n, this.entries.length) + SPARE, this.entries.length);
    this.entries.forEach((e, i) => { e.light.visible = i < total; });
    try { return fn(); } finally { this.entries.forEach((e, i) => { e.light.visible = saved[i]; }); }
  }

  /** @returns true while any light is still fading (the caller must keep rendering) */
  update(cam, dt, instant = false) {
    if (!this.enabled) return false;
    const cfx = cam.x / FT, cfy = cam.z / FT;
    for (const e of this.entries) e.score = this._score(e, cam, cfx, cfy);
    const ranked = [...this.entries].sort((a, b) => b.score - a.score);
    const wanted = new Set(ranked.slice(0, this.budget));
    const inSlots = new Set(this.slots);
    for (const e of this.slots) e.target = wanted.has(e) ? 1 : 0;
    // bring in wanted lights that are not on yet, taking over a slot that has finished fading out
    for (const e of ranked) {
      if (!wanted.has(e) || inSlots.has(e)) continue;
      let vi = -1;
      for (let i = 0; i < this.slots.length; i++) {
        const s = this.slots[i];
        if (!wanted.has(s) && s.f <= 0.02 && (vi < 0 || s.score < this.slots[vi].score)) vi = i;
      }
      if (vi < 0) break; // all spare slots still fading: next frame
      const out = this.slots[vi];
      out.light.visible = false; out.f = 0; out.target = 0; inSlots.delete(out);
      this.slots[vi] = e; inSlots.add(e);
      e.light.visible = true; e.f = 0; e.target = 1;
    }
    let animating = false;
    const k = instant ? 1 : dt / FADE_S;
    for (const e of this.slots) {
      if (e.f !== e.target) {
        e.f = e.f < e.target ? Math.min(e.target, e.f + k) : Math.max(e.target, e.f - k);
        if (e.f !== e.target) animating = true;
        const s = e.f * e.f * (3 - 2 * e.f);
        e.light.intensity = e.base * s;
      }
    }
    return animating;
  }
}
