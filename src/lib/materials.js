import * as THREE from 'three';

// Shared PBR material library. Textures live in public/assets/ph/<id>/{diff,nor,rough,ao}.jpg.
// Every surface built by shell/rooms uses world-space UVs (see worldUV), so `size` = metres per texture repeat.

const loader = new THREE.TextureLoader();
const texCache = new Map();
let maxAniso = 8;
export const pending = new Set();

export function setAnisotropy(n) { maxAniso = n; }

export function tex(url, { srgb = false, repeat = 1 } = {}) {
  const key = url + (srgb ? ':s' : '') + ':' + repeat;
  if (texCache.has(key)) return texCache.get(key);
  // TextureLoader hands back the texture immediately; `pending` lets the app wait for every image.
  let done;
  const p = new Promise((res) => (done = res));
  pending.add(p);
  p.then(() => pending.delete(p));
  const t = loader.load(url, () => done(), undefined, () => { console.warn('missing texture', url); done(); });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  t.repeat.set(repeat, repeat);
  texCache.set(key, t);
  return t;
}

/**
 * PBR material from a Poly Haven texture set.
 * @param {string} id     folder under public/assets/ph
 * @param {object} o      { size (m per repeat), color (tint), roughness (multiplier), normalScale, ao, ...MeshPhysicalMaterial params }
 */
export function pbr(id, o = {}) {
  const base = `assets/ph/${id}/`;
  const { size = 1, color, roughness = 1, normalScale = 1, ao = true, physical = false, noMap = false, ...rest } = o;
  const M = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new M({
    map: noMap ? null : tex(base + 'diff.jpg', { srgb: true }),
    normalMap: tex(base + 'nor.jpg'),
    roughnessMap: tex(base + 'rough.jpg'),
    aoMap: ao ? tex(base + 'ao.jpg') : null,
    roughness,
    color: color ? new THREE.Color(color) : new THREE.Color(0xffffff),
    ...rest,
  });
  m.normalScale.set(normalScale, normalScale);
  m.userData.worldSize = size;
  return m;
}

// Assign world-space planar UVs (and uv1 for aoMap) to a BufferGeometry already in world/group space.
// Picks the projection plane per-face from its normal, so boxes tile seamlessly across walls.
export function worldUV(geom, size = 1, offset = new THREE.Vector2()) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  g.computeVertexNormals();
  const pos = g.attributes.position, nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = -z; }
    else if (ax >= az) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = (u + offset.x) / size;
    uv[i * 2 + 1] = (v + offset.y) / size;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('uv1', new THREE.BufferAttribute(uv.slice(), 2));
  return g;
}

// Common shared materials (create once, reuse everywhere).
let _lib;
export function lib() {
  if (_lib) return _lib;
  _lib = {
    // painted plaster: flat paint colour, plaster only contributes relief + roughness variation
    wall:     pbr('white_plaster_02', { size: 2.0, color: 0xefe9df, normalScale: 0.18, roughness: 0.95, noMap: true, ao: false }),
    ceiling:  pbr('white_plaster_02', { size: 2.0, color: 0xf7f5f0, normalScale: 0.1, noMap: true, ao: false }),
    tile:     pbr('marble_01',        { size: 2.4, color: 0xffffff, roughness: 0.45, normalScale: 0.4 }),  // 60 cm vitrified tiles
    wood:     pbr('laminate_floor_02',{ size: 2.0, color: 0xffffff, roughness: 0.8 }),
    bathtile: pbr('interior_tiles',   { size: 1.2, color: 0xffffff, roughness: 0.9 }),
    deck:     pbr('patio_tiles',      { size: 1.5, color: 0xffffff }),
    frame:    new THREE.MeshStandardMaterial({ color: 0x2b2b2d, roughness: 0.45, metalness: 0.6 }),       // window/slider aluminium
    doorWood: pbr('teak_veneer',      { size: 1, color: 0xd9b89a, roughness: 0.7, ao: false }),
    doorTrim: new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.5 }),
    steel:    new THREE.MeshStandardMaterial({ color: 0xcfd2d4, roughness: 0.25, metalness: 1 }),
    // clear float glass: plain alpha + env reflections (transmission rendered hazy through the AO pass)
    // kept faint: strong env/specular made panes read as grey boards with point-light "stars" in them
    glass:    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.05, envMapIntensity: 0.3, specularIntensity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
    frosted:  new THREE.MeshStandardMaterial({ color: 0xf4f6f6, roughness: 0.9, transparent: true, opacity: 0.88, emissive: 0xdfe6ea, emissiveIntensity: 0.35, side: THREE.DoubleSide }),
    skirting: new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.6 }),
    slabEdge: new THREE.MeshStandardMaterial({ color: 0xd9d4ca, roughness: 0.9 }),
  };
  return _lib;
}
