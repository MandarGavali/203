import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FT } from '../plan.js';

// Runtime clean-up of what the room modules built. Nothing here changes how the flat looks; it changes how much work
// the CPU/GPU does to draw it.

const CELL = 12 * FT;          // merge only inside ~12 ft cells so frustum culling still discards what is behind you
const MAX_VERTS = 6000;        // big meshes (scanned plants etc.) gain nothing from merging
const idle = THREE.Object3D.prototype.onBeforeRender;
const idleAfter = THREE.Object3D.prototype.onAfterRender;

function flipWinding(g) {
  if (g.index) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
  } else {
    for (const attr of Object.values(g.attributes)) {
      const n = attr.itemSize, a = attr.array;
      for (let i = 0; i < attr.count; i += 3) for (let c = 0; c < n; c++) {
        const p = (i + 1) * n + c, q = (i + 2) * n + c, t = a[p]; a[p] = a[q]; a[q] = t;
      }
    }
  }
}

/**
 * Merge static opaque meshes that share a material into one mesh per ~12 ft cell (rooms and the architectural shell):
 * ~1100 draw calls become ~500, which is what limits frame rate on weak CPUs. Props that other code hooks into (onBeforeRender), transparent
 * glass, mirrors and big scanned models are left alone.
 */
export function mergeStatic(scene, { skip = [] } = {}) {
  const skipped = new Set(skip);
  const stats = { before: 0, after: 0 };
  scene.updateMatrixWorld(true);
  for (const root of scene.children) {
    if (!(root.name.startsWith('piece-') || root.name === 'shell')) continue;
    const buckets = new Map(), victims = [];
    const center = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      stats.before++;
      if (skipped.has(o)) return;
      if (o.isInstancedMesh || o.isSkinnedMesh || o.isReflector || Array.isArray(o.material)) return;
      const mat = o.material, g = o.geometry;
      if (mat.transparent || mat.transmission > 0) return;
      if (o.onBeforeRender !== idle || o.onAfterRender !== idleAfter || o.renderOrder !== 0 || !o.frustumCulled || o.layers.mask !== 1) return;
      if (!g.attributes.position || g.attributes.position.count > MAX_VERTS || Object.keys(g.morphAttributes).length) return;
      let hide = false;
      for (let a = o; a && a !== root.parent; a = a.parent) {
        if (!a.visible || a.userData.noMerge) return;
        if (a.userData.hideInTop) hide = true;
      }
      if (!g.boundingSphere) g.computeBoundingSphere();
      center.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld);
      const key = [mat.uuid, o.castShadow, o.receiveShadow, hide, Math.floor(center.x / CELL), Math.floor(center.z / CELL), Math.floor(center.y / CELL),
        !!g.index, Object.keys(g.attributes).sort().join()].join('|');
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat, hide, cast: o.castShadow, recv: o.receiveShadow, geoms: [], meshes: [] }));
      const c = g.clone();
      c.clearGroups();
      c.applyMatrix4(o.matrixWorld);
      if (o.matrixWorld.determinant() < 0) flipWinding(c);
      b.geoms.push(c); b.meshes.push(o);
    });
    for (const b of buckets.values()) {
      if (b.geoms.length < 2) continue;
      const merged = mergeGeometries(b.geoms, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.cast; mesh.receiveShadow = b.recv;
      mesh.userData.hideInTop = b.hide;
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
      victims.push(...b.meshes);
    }
    for (const o of victims) o.parent.remove(o);
  }
  for (const root of scene.children) if (root.name.startsWith('piece-') || root.name === 'shell') root.traverse((o) => { if (o.isMesh) stats.after++; });
  return stats;
}

/** Transmission forces an extra full opaque render pass whenever such a material is on screen: plain alpha instead. */
export function stripTransmission(scene) {
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const mt of mats) if (mt.transmission > 0) { mt.transmission = 0; mt.needsUpdate = true; }
  });
}

/**
 * Planar mirrors re-render the whole house. Tame them: only near (or first-seen) mirrors refresh, every Nth frame,
 * into a smaller target; `state.force` makes one extra full-quality refresh (used when the viewer stops moving).
 */
export function setupMirrors(scene, state) {
  const p = new THREE.Vector3(), list = [];
  scene.traverse((o) => {
    if (!o.isReflector) return;
    list.push(o);
    const update = o.onBeforeRender;
    const rt = o.getRenderTarget();
    // Low tier: a plain polished-metal stand-in instead of a live reflection (no extra render, no extra shaders)
    const fake = new THREE.MeshStandardMaterial({ color: 0xc9ced1, metalness: 1, roughness: 0.08 });
    o.userData.mirror = { w: rt.width, h: rt.height, samples: rt.samples, seen: false, real: o.material, fake };
    o.onBeforeRender = function (r, s, cam, ...rest) {
      const m = o.userData.mirror;
      if (state.cfg.off) return;
      o.getWorldPosition(p);
      const near = cam.position.distanceTo(p) < state.cfg.dist;
      const every = near ? state.cfg.every : 10;
      if (m.seen && !state.force && (state.frame % every !== 0 || state.frame === m.last)) return;
      m.seen = true; m.last = state.frame;
      update.call(this, r, s, cam, ...rest);
    };
  });
  return {
    count: list.length,
    /** resize mirror targets for a tier */
    configure(cfg) {
      state.cfg = cfg;
      for (const o of list) {
        const m = o.userData.mirror, rt = o.getRenderTarget();
        o.material = cfg.off ? m.fake : m.real;
        if (cfg.off) { rt.dispose(); continue; }
        const w = Math.max(64, Math.round(m.w * cfg.scale)), h = Math.max(64, Math.round(m.h * cfg.scale));
        rt.samples = Math.min(m.samples, cfg.msaa);
        rt.setSize(w, h);
        m.seen = false;
      }
    },
  };
}

/**
 * The rooms paint some fabrics/rugs/art on 1024-2048 px canvases. Uncompressed they cost ~22 MB of video memory each
 * (with mipmaps); on Medium/Low they are shown from a smaller copy. The full-size canvas is kept so High can restore it.
 */
export function capCanvasTextures(scene, maxDim, onEach = null) {
  const seen = new Set();
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const mt of mats) for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'emissiveMap', 'bumpMap', 'alphaMap']) {
      const t = mt[k];
      if (!t || seen.has(t) || !t.isCanvasTexture || t.userData.frozen) continue;
      seen.add(t);
      const full = (t.userData.fullCanvas ||= t.image);
      const kScale = Math.min(1, maxDim / Math.max(full.width, full.height));
      const cache = (t.userData.scaled ||= new Map());
      let want = full;
      if (kScale < 1) {
        const key = Math.round(Math.max(full.width, full.height) * kScale);
        want = cache.get(key);
        if (!want) {
          want = document.createElement('canvas');
          want.width = Math.max(4, Math.round(full.width * kScale)); want.height = Math.max(4, Math.round(full.height * kScale));
          const c = want.getContext('2d');
          c.imageSmoothingQuality = 'high';
          c.drawImage(full, 0, 0, want.width, want.height);
          cache.set(key, want);
        }
      }
      if (t.image !== want) { t.dispose(); t.image = want; t.needsUpdate = true; }
      onEach?.(t);
    }
  });
}

/**
 * RectAreaLights add the LTC lookup code to EVERY shader and cost several point lights' worth of maths per fragment,
 * for two small under-cabinet strips in the kitchen. Replace each by a point light of equal illuminance on the counter
 * (~0.9 m below the strip; L * area / d^2). They then also join the light budget, so they only cost anything in the kitchen.
 */
export function convertAreaLights(scene) {
  const rects = [];
  scene.traverse((o) => { if (o.isRectAreaLight) rects.push(o); });
  for (const r of rects) {
    const area = r.width * r.height, d = 0.9;
    const p = new THREE.PointLight(r.color, (r.intensity * area) / (d * d), 0, 2);
    p.position.copy(r.position);
    p.name = 'strip';
    r.parent.add(p);
    r.parent.remove(r);
    r.dispose?.();
  }
  return rects.length;
}

/**
 * Once something is on the GPU, the copy kept in JavaScript memory is only needed to rebuild after a lost WebGL
 * context, and main.js reloads the page in that case instead. Dropping those copies roughly halves the tab's memory
 * (~240 MB of painted canvases, ~100 MB of compressed texture data, the vertex arrays), which is what keeps phones from
 * killing the tab ("Aw, Snap!") and stops desktops from paging.
 */
function dropArray() { this.array = null; }
export function freeGeometryAfterUpload(scene) {
  const seen = new Set();
  scene.traverse((o) => {
    const g = o.geometry;
    if (!g || seen.has(g)) return;
    seen.add(g);
    if (!g.boundingSphere) g.computeBoundingSphere(); // frustum culling needs these after the arrays are gone
    if (!g.boundingBox) g.computeBoundingBox();
    for (const a of [g.index, ...Object.values(g.attributes)]) {
      if (!a) continue;
      const buf = a.isInterleavedBufferAttribute ? a.data : a;
      if (!buf.onUploadCallback || buf.onUploadCallback === dropArray || buf.onUploadCallback.name === 'onUploadCallback') buf.onUpload(dropArray);
    }
  });
}

/** Call right after renderer.initTexture(t): forget the CPU-side pixels of a texture that is now on the GPU. */
export function freeTextureData(t) {
  t.userData.frozen = true; // capCanvasTextures must not rescale it any more
  if (t.isCompressedTexture) { t.mipmaps = []; return; }
  if (t.isCanvasTexture) {
    for (const c of [t.image, t.userData.fullCanvas, ...(t.userData.scaled?.values() || [])]) if (c && c.width) { c.width = 1; c.height = 1; }
    t.userData.fullCanvas = null; t.userData.scaled = null;
  }
}
