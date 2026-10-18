import * as THREE from 'three';
import { FT } from './plan.js';

// First-person walker in plan feet. yaw = compass radians (0 = north, clockwise), pitch radians.
// Desktop: click to capture mouse, WASD/arrows to walk, Shift to hurry. Touch: left half drags to walk, right half to look.
const EYE = 5.25;      // ft
const RADIUS = 0.6;    // ft (shoulder half-width; 0.75 couldn't fit past fittings in the 4' toilets)
const SPEED = 4.2;     // ft/s

export class Walker {
  constructor(camera, dom, colliders) {
    this.camera = camera;
    this.colliders = colliders;
    this.x = 0; this.y = 0; this.yaw = 0; this.pitch = -0.05;
    this.dirty = true;
    this.keys = new Set();
    this.locked = false;
    this.touchMove = null; this.touchLook = null;
    camera.rotation.order = 'YXZ';

    dom.addEventListener('click', () => { if (!matchMedia('(pointer: coarse)').matches) dom.requestPointerLock(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      document.body.classList.toggle('locked', this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw += e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.35, 1.35);
    });
    addEventListener('keydown', (e) => { this.keys.add(e.code); });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => this.keys.clear());

    dom.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        const s = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY };
        if (t.clientX < innerWidth / 2 && !this.touchMove) this.touchMove = s;
        else if (!this.touchLook) this.touchLook = s;
      }
    }, { passive: true });
    dom.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (this.touchMove?.id === t.identifier) { this.touchMove.x = t.clientX; this.touchMove.y = t.clientY; }
        if (this.touchLook?.id === t.identifier) {
          this.yaw += (t.clientX - this.touchLook.x) * 0.005;
          this.pitch = THREE.MathUtils.clamp(this.pitch - (t.clientY - this.touchLook.y) * 0.005, -1.35, 1.35);
          this.touchLook.x = t.clientX; this.touchLook.y = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this.touchMove?.id === t.identifier) this.touchMove = null;
        if (this.touchLook?.id === t.identifier) this.touchLook = null;
      }
    };
    dom.addEventListener('touchend', end);
    dom.addEventListener('touchcancel', end);
  }

  setPose(x, y, yawDeg = 0, pitch = -0.05) {
    this.x = x; this.y = y; this.yaw = THREE.MathUtils.degToRad(yawDeg); this.pitch = pitch;
    this.apply();
  }

  teleport(x, y) {
    if (!this.blocked(x, y)) { this.x = x; this.y = y; this.apply(); }
  }

  planPos() { return { x: this.x, y: this.y }; }

  blocked(x, y) {
    for (const c of this.colliders) {
      const cx = Math.max(c.x1, Math.min(x, c.x2)), cy = Math.max(c.y1, Math.min(y, c.y2));
      if ((x - cx) ** 2 + (y - cy) ** 2 < RADIUS * RADIUS) return true;
    }
    return false;
  }

  update(dt) {
    const k = this.keys;
    let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    if (k.has('ArrowLeft')) this.yaw -= 1.8 * dt;
    if (k.has('ArrowRight')) this.yaw += 1.8 * dt;
    if (this.touchMove) {
      f = THREE.MathUtils.clamp(-(this.touchMove.y - this.touchMove.y0) / 60, -1, 1);
      s = THREE.MathUtils.clamp((this.touchMove.x - this.touchMove.x0) / 60, -1, 1);
    }
    const len = Math.hypot(f, s);
    if (len > 0) {
      const sp = SPEED * (k.has('ShiftLeft') || k.has('ShiftRight') ? 1.8 : 1) * dt / Math.max(1, len);
      const fx = Math.sin(this.yaw), fy = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), ry = Math.sin(this.yaw);
      const dx = (fx * f + rx * s) * sp, dy = (fy * f + ry * s) * sp;
      // slide along obstacles
      if (!this.blocked(this.x + dx, this.y)) this.x += dx;
      if (!this.blocked(this.x, this.y + dy)) this.y += dy;
    }
    return this.apply();
  }

  /** Writes the pose to the camera and raises `dirty` when it changed, so the render loop can skip frames while nothing moves. */
  apply() {
    const moved = this.x !== this._x || this.y !== this._y || this.yaw !== this._yaw || this.pitch !== this._pitch;
    if (moved) {
      this._x = this.x; this._y = this.y; this._yaw = this.yaw; this._pitch = this.pitch;
      this.dirty = true;
      this.camera.position.set(this.x * FT, EYE * FT, this.y * FT);
      this.camera.rotation.set(this.pitch, -this.yaw, 0);
    }
    return moved;
  }
}
