import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FT, CEILING, rooms } from '../plan.js';
import { lib, pbr, worldUV, tex, loadStats, getAnisotropy } from './materials.js';
import { getKTX2 } from './ktx2.js';

// The API every room module receives. All positions are PLAN FEET: x east, y south, h up (feet above floor).
//
//   ctx.v3(x, y, h=0)                 -> THREE.Vector3 in metres
//   ctx.m(ft)                         -> metres
//   await ctx.model(url)              -> fresh clone of a glTF scene (shadows on). url relative to /public, e.g. 'assets/ph/sofa_02/sofa_02_1k.gltf'
//   ctx.fit(obj, { w, d, h, mode })   -> scales obj so its local bbox is w (local X) x d (local Z) x h (Y) FEET; mode 'stretch' | 'uniform' (default uniform, fits inside).
//                                         Also re-centres so origin = bottom-centre. Pass only some of w/d/h to constrain just those.
//   ctx.place(obj, { x, y, h=0, face='S' })  -> positions obj (origin bottom-centre) at plan (x,y), lifted h ft. face = direction the
//                                         object's local +Z "front" points: 'N','S','E','W' or degrees clockwise from S... use letters.
//   ctx.box(mat, { x1,y1,x2,y2, h1,h2 }) -> axis-aligned box mesh in plan feet (handy for built-ins: counters, wardrobes, cladding)
//   ctx.collide({ x1,y1,x2,y2 })      -> walker can't enter this plan-ft rect (call for every piece of furniture you can't walk through)
//   ctx.light(light)                  -> adds a light to the room group
//   ctx.mat                           -> shared library (wall, tile, wood, bathtile, deck, frame, steel, glass, doorWood, ...)
//   ctx.pbr(id, opts), ctx.tex(url), ctx.worldUV(geom, size) -> materials helpers (see lib/materials.js)
//   ctx.group                         -> THREE.Group for this piece (add anything here)
//   ctx.rooms                         -> room rects from plan.js

const gltf = new GLTFLoader();
const modelCache = new Map();
export const pendingModels = new Set();

function loadModel(url) {
  if (!modelCache.has(url)) {
    if (!gltf.ktx2Loader) gltf.setKTX2Loader(getKTX2()); // models ship GPU-compressed KTX2 textures
    loadStats.requested++;
    const p = gltf.loadAsync(url).then((g) => {
      loadStats.done++;
      g.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = o.receiveShadow = true;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const mt of mats) if (mt.map) mt.map.anisotropy = getAnisotropy();
        }
      });
      return g.scene;
    });
    p.url = url;
    pendingModels.add(p);
    p.finally(() => pendingModels.delete(p));
    modelCache.set(url, p);
  }
  return modelCache.get(url).then((s) => s.clone(true));
}

const FACE = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };

export function makeCtx(scene, renderer, colliders, pieceId) {
  const group = new THREE.Group();
  group.name = 'piece-' + pieceId;
  scene.add(group);
  const m = (ft) => ft * FT;
  return {
    THREE, FT, CEILING, rooms, group, renderer, scene,
    mat: lib(), pbr, worldUV, tex, m,
    v3: (x, y, h = 0) => new THREE.Vector3(m(x), m(h), m(y)),
    model: loadModel,
    fit(obj, { w, d, h, mode = 'uniform' } = {}) {
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj);
      const s = b.getSize(new THREE.Vector3());
      const want = { x: w && m(w), y: h && m(h), z: d && m(d) };
      let sx = want.x ? want.x / s.x : null, sy = want.y ? want.y / s.y : null, sz = want.z ? want.z / s.z : null;
      if (mode === 'uniform') {
        const k = Math.min(...[sx, sy, sz].filter((v) => v));
        sx = sy = sz = k;
      } else {
        const k = [sx, sy, sz].find((v) => v) || 1;
        sx ||= k; sy ||= k; sz ||= k;
      }
      obj.scale.multiply(new THREE.Vector3(sx, sy, sz));
      obj.updateMatrixWorld(true);
      const b2 = new THREE.Box3().setFromObject(obj);
      const c = b2.getCenter(new THREE.Vector3());
      // wrap so the returned object's origin is bottom-centre
      const wrap = new THREE.Group();
      obj.position.sub(new THREE.Vector3(c.x, b2.min.y, c.z));
      wrap.add(obj);
      return wrap;
    },
    place(obj, { x, y, h = 0, face = 'S' }) {
      obj.position.set(m(x), m(h), m(y));
      obj.rotation.y = typeof face === 'number' ? THREE.MathUtils.degToRad(face) : FACE[face];
      group.add(obj);
      return obj;
    },
    box(mat, { x1, y1, x2, y2, h1 = 0, h2 }) {
      const g = new THREE.BoxGeometry(m(x2 - x1), m(h2 - h1), m(y2 - y1));
      g.translate(m((x1 + x2) / 2), m((h1 + h2) / 2), m((y1 + y2) / 2));
      const size = mat.userData?.worldSize;
      const mesh = new THREE.Mesh(size ? worldUV(g, size) : g, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    },
    collide(r) { colliders.push({ x1: Math.min(r.x1, r.x2), y1: Math.min(r.y1, r.y2), x2: Math.max(r.x1, r.x2), y2: Math.max(r.y1, r.y2) }); },
    light(l) { group.add(l); if (l.target) group.add(l.target); return l; },
  };
}
