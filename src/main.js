import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { FT, CEILING, rooms, pieces } from './plan.js';
import { buildShell } from './shell.js';
import { makeCtx, pendingModels } from './lib/ctx.js';
import { pending as pendingTex, setAnisotropy, loadStats } from './lib/materials.js';
import { initKTX2 } from './lib/ktx2.js';
import { Quality } from './lib/quality.js';
import { LightBudget } from './lib/lightBudget.js';
import { Culler } from './lib/cull.js';
import { mergeStatic, stripTransmission, setupMirrors, capCanvasTextures, convertAreaLights, freeGeometryAfterUpload, freeTextureData } from './lib/optimize.js';
import { Walker } from './controls.js';
import { defaultViews } from './views.js';

const params = new URLSearchParams(location.search);
const shotView = params.get('view');
const topPiece = params.get('top');
const shotMode = !!(shotView || topPiece);
const m = (ft) => ft * FT;

// Performance model (see README "Performance"):
//  - quality tiers + dynamic resolution keep the frame rate up on any GPU        (src/lib/quality.js)
//  - only the lights that matter to the viewer are switched on                   (src/lib/lightBudget.js)
//  - static props are merged, textures are GPU-compressed, mirrors are throttled (src/lib/optimize.js, tools/optimize-assets.mjs)
//  - the scene is static: a frame is only rendered when something changed
const quality = new Quality(params, { shotMode });
const tier0 = quality.settings;
const fixedPR = params.has('pr') ? +params.get('pr') : null; // ?pr=2 pins the pixel ratio (benchmarks)

// ---------- loading screen ----------
const loaderEl = document.getElementById('loader');
const statusEl = loaderEl.querySelector('p');
const barEl = loaderEl.querySelector('.bar i');
let barPct = 0;
function setStatus(text, pct) {
  statusEl.textContent = text;
  if (pct != null) {
    barPct = Math.max(barPct, pct); // never walks backwards
    loaderEl.classList.add('determinate');
    barEl.style.width = `${(barPct * 100).toFixed(0)}%`;
  }
}
// Hardware acceleration off = WebGL on the CPU: slow however light the scene is, and it loads the whole PC. Say so.
if (quality.software) {
  const n = document.getElementById('notice');
  n.querySelector('span').innerHTML = '<b>Graphics acceleration is off in this browser</b>, so the 3D view is drawn by the CPU and will be slow. '
    + 'Turn on <b>“Use graphics acceleration when available”</b> (Settings → System) and restart the browser.';
  n.classList.add('show');
  n.querySelector('button').onclick = () => n.classList.remove('show');
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// ---------- renderer ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: quality.tier !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: shotMode });
} catch (e) {
  statusEl.textContent = 'This browser could not start 3D graphics (WebGL). Try another browser, or enable hardware acceleration in its settings.';
  loaderEl.querySelector('.bar').style.display = 'none';
  throw e;
}
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // nothing moves: render the sun's shadow map once after load (and after a tier change)
document.getElementById('app').appendChild(renderer.domElement);
// GPU resets (driver update, laptop GPU switch, sleep) drop the context: three.js rebuilds everything from the data it kept
// GPU resets (driver update, laptop GPU switch, low memory on phones) drop the context. The JS-side copies of meshes and
// textures are freed after upload to save memory, so recover by reloading - at most once a minute, to avoid loops.
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  let last = 0;
  try { last = +sessionStorage.getItem('house3d.reloadedAt') || 0; } catch { /* storage blocked */ }
  if (Date.now() - last > 60000) {
    try { sessionStorage.setItem('house3d.reloadedAt', String(Date.now())); } catch { /* storage blocked */ }
    toast('Graphics were interrupted - reloading…');
    setTimeout(() => location.reload(), 800);
  } else toast('Graphics keep being interrupted - try Quality: Low, or close other tabs and reload.');
});
setAnisotropy(Math.min(tier0.aniso, renderer.capabilities.getMaxAnisotropy()));
initKTX2(renderer);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 200);

// ---------- environment ----------
const pmrem = new THREE.PMREMGenerator(renderer);
// Lighting comes from a clean sky HDRI; what you SEE through the windows is a separate city-rooftop panorama
// (a puresky horizon is a white haze, which made every window read as frosted glass). Nothing outside is modelled.
const skyP = new HDRLoader().loadAsync('assets/ph/kloofendal_48d_partly_cloudy_puresky/kloofendal_48d_partly_cloudy_puresky.hdr').then((hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  scene.environmentIntensity = 0.55;
  hdr.dispose(); // the prefiltered cube is all that is needed: free the full-size float texture
  pmrem.dispose();
});
const viewP = new THREE.TextureLoader().loadAsync(`assets/backdrop/rooftop_${tier0.backdrop}.jpg`).then((t) => {
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
  scene.backgroundIntensity = +(params.get('bg') || 1.5);
  // 90°: the panorama's own rooftop furniture ends up behind the flat's blind east side
  scene.backgroundRotation.y = THREE.MathUtils.degToRad(+(params.get('bgrot') ?? 90));
});
const hdrP = Promise.all([skyP, viewP]);

// sun: late-afternoon from the south-west, streams through balcony sliders and bedroom 3's window
const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
const centre = new THREE.Vector3(m(19.5), 0, m(18.5));
sun.position.copy(centre).add(new THREE.Vector3(-9, 11, 14));
sun.target.position.copy(centre);
sun.castShadow = true;
sun.shadow.mapSize.set(tier0.shadow, tier0.shadow);
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 50 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
// stand-in for bounced daylight: warm from below (floors), neutral from above
const bounce = new THREE.HemisphereLight(0xfffaf2, 0xd9c8b0, 1.1);
scene.add(bounce);

// ---------- shell ----------
const shell = buildShell();
scene.add(shell.group);
const colliders = shell.colliders;

// soft fill per room: one warm ceiling light (rooms can add their own fixtures)
for (const [id, r] of Object.entries(rooms)) {
  if (r.outdoor) continue;
  const area = (r.x2 - r.x1) * (r.y2 - r.y1);
  const l = new THREE.PointLight(0xffe4c4, Math.min(14, 2 + area * 0.06), 0, 2);
  // hung at 6.5 ft, not at the ceiling: right under the ceiling it burns a hotspot into the paint
  l.position.set(m((r.x1 + r.x2) / 2), m(6.5), m((r.y1 + r.y2) / 2));
  l.name = 'fill-' + id;
  scene.add(l);
}

// ---------- room pieces ----------
const modules = import.meta.glob('./rooms/*.js');
const views = { ...defaultViews };
// ?only=bed1,dining loads just those pieces (faster screenshots while iterating on one piece)
const only = params.get('only')?.split(',');
window.__timing = {};
async function buildPiece([path, load]) {
  const id = path.match(/rooms\/(.+)\.js$/)[1];
  if (only && !only.includes(id)) return;
  try {
    const t0 = performance.now();
    const mod = await load();
    if (mod.views) Object.assign(views, mod.views);
    const ctx = makeCtx(scene, renderer, colliders, id);
    await mod.default(ctx);
    // phones: shrink, upload and free this room's painted canvases now, so only one room's worth is ever in memory
    if (quality.constrained && !shotMode) capCanvasTextures(ctx.group, quality.settings.canvasMax, (t) => { renderer.initTexture(t); freeTextureData(t); });
    window.__timing[id] = Math.round(performance.now() - t0);
    console.info(`piece ${id} built in ${window.__timing[id]} ms`);
  } catch (e) {
    console.error('piece failed', id, e);
  }
}
// on phones, build one room at a time: building them all at once briefly needs far more memory than the result
const loadPieces = quality.constrained
  ? Object.entries(modules).reduce((p, e) => p.then(() => buildPiece(e)), Promise.resolve())
  : Promise.all(Object.entries(modules).map(buildPiece));

// ---------- camera modes ----------
let activeCam = camera;
const walker = new Walker(camera, renderer.domElement, colliders);
walker.setPose(32.5, 29.5, 305); // living room by the balcony slider, looking across the sofa set to the dining
window.__walker = walker;

function setView(name) {
  const v = views[name];
  if (!v) { console.warn('no view', name, Object.keys(views)); return; }
  camera.fov = v.fov || 62;
  camera.position.set(m(v.pos[0]), m(v.h ?? 5.2), m(v.pos[1]));
  camera.lookAt(m(v.look[0]), m(v.lookH ?? 4.2), m(v.look[1]));
  camera.updateProjectionMatrix();
}

function setTop(pieceId) {
  const ids = pieceId === 'all' ? Object.keys(rooms) : pieces[pieceId].rooms;
  const rs = ids.map((k) => rooms[k]);
  const pad = 0.8;
  const x1 = Math.min(...rs.map((r) => r.x1)) - pad, x2 = Math.max(...rs.map((r) => r.x2)) + pad;
  const y1 = Math.min(...rs.map((r) => r.y1)) - pad, y2 = Math.max(...rs.map((r) => r.y2)) + pad;
  const w = m(x2 - x1), h = m(y2 - y1);
  const aspect = innerWidth / innerHeight;
  let hw = w / 2, hh = h / 2;
  if (hw / hh > aspect) hh = hw / aspect; else hw = hh * aspect;
  const ortho = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 50);
  ortho.position.set(m((x1 + x2) / 2), m(CEILING - 0.2), m((y1 + y2) / 2));
  ortho.up.set(0, 0, -1);
  ortho.lookAt(ortho.position.x, 0, ortho.position.z);
  shell.ceiling.visible = false;
  shell.roof.visible = false;
  scene.traverse((o) => { if (o.userData.hideInTop) o.visible = false; }); // e.g. pendant lamps, ceiling fans
  activeCam = ortho;
  post.renderPass.camera = ortho;
  post.ao.camera = ortho;
  post.ao.enabled = false;
}

// ---------- quality / render pipeline ----------
let post = null;            // { composer, renderPass, ao } - only built for the High tier
let usePost = false;
let lights = null, mirrors = null, culler = null;
const mirrorState = { frame: 0, force: false, cfg: tier0.mirror };
let forceFrames = 3;        // render this many frames regardless (start-up, resize, quality change)

async function ensurePost() {
  if (post) return;
  const { createPost } = await import('./lib/post.js');
  post = createPost(renderer, scene, camera, { samples: shotMode ? 4 : 2, aoOff: params.get('ao') === '0' });
}

function applyResolution() {
  const t = quality.settings;
  const base = Math.min(devicePixelRatio, t.dprMax, Math.sqrt((t.maxMP * 1e6) / (innerWidth * innerHeight)));
  const pr = fixedPR ?? Math.max(0.5, (shotMode ? 1 : base) * quality.res);
  renderer.setPixelRatio(pr);
  if (post) { post.composer.setPixelRatio(pr); post.composer.setSize(innerWidth, innerHeight); }
  forceFrames = Math.max(forceFrames, 2);
}

let appliedTier = null, tierToken = 0;
const toastEl = document.getElementById('toast');
const toast = (text) => { if (toastEl) { toastEl.textContent = text; toastEl.classList.toggle('show', !!text); } };
async function applyTier(initial = false) {
  const token = ++tierToken;
  const t = quality.settings;
  if (t.composer) await ensurePost();
  if (!initial && appliedTier !== quality.tier) {
    // compile the new tier's shaders first while the current frames keep rendering, then switch in one go
    toast('Adjusting graphics…');
    await precompile(t);
    toast('');
    if (token !== tierToken) return; // superseded by a newer change
  }
  usePost = t.composer && !!post;
  if (appliedTier !== quality.tier) {
    appliedTier = quality.tier;
    if (sun.shadow.mapSize.x !== t.shadow) {
      sun.shadow.map?.dispose(); sun.shadow.map = null;
      sun.shadow.mapSize.set(t.shadow, t.shadow);
    }
    renderer.shadowMap.needsUpdate = true;
    if (lights && params.get('budget') !== '0' && (!shotMode || params.has('budget'))) lights.setBudget(t.lights, camera.position);
    mirrors?.configure(t.mirror);
    capCanvasTextures(scene, t.canvasMax);
  }
  applyResolution();
  updateQualityLabel();
}
quality.onChange = () => { applyTier(); };

const qBtn = document.getElementById('quality');
function updateQualityLabel() { if (qBtn) qBtn.textContent = quality.label; }
qBtn?.addEventListener('click', (e) => { e.stopPropagation(); quality.cycle(); });
addEventListener('keydown', (e) => { if (e.code === 'KeyQ' && !e.repeat) quality.cycle(); });

// ---------- HUD / minimap ----------
const PLAN_W = 1159; // px width of the original plan drawing; the constants below are in those pixels
const mapCanvas = document.getElementById('minimap');
const mapCtx = mapCanvas.getContext('2d');
const planImg = new Image();
let mapBg = null;    // the plan, drawn once at canvas size
planImg.onload = () => {
  mapBg = document.createElement('canvas');
  mapBg.width = mapCanvas.width; mapBg.height = mapCanvas.height;
  const c = mapBg.getContext('2d');
  c.globalAlpha = 0.92;
  c.drawImage(planImg, 0, 0, mapBg.width, planImg.height * (mapBg.width / planImg.width));
  mapDirty = true;
};
planImg.src = 'assets/plan.webp';
const toPx = (x, y) => [40 + 28.5 * x, 133 + 27.8 * y];
let mapDirty = true;
function drawMap() {
  if (!mapBg) return;
  const W = mapCanvas.width, Hh = mapCanvas.height, s = W / PLAN_W;
  mapCtx.clearRect(0, 0, W, Hh);
  mapCtx.drawImage(mapBg, 0, 0);
  const p = walker.planPos();
  const [px, py] = toPx(p.x, p.y);
  mapCtx.save();
  mapCtx.translate(px * s, py * s);
  mapCtx.rotate(walker.yaw);
  mapCtx.fillStyle = 'rgba(232, 80, 40, 0.28)';
  mapCtx.beginPath(); mapCtx.moveTo(0, 0); mapCtx.arc(0, 0, 34, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); mapCtx.fill();
  mapCtx.fillStyle = '#e8502a';
  mapCtx.strokeStyle = '#fff'; mapCtx.lineWidth = 2;
  mapCtx.beginPath(); mapCtx.arc(0, 0, 6, 0, Math.PI * 2); mapCtx.fill(); mapCtx.stroke();
  mapCtx.restore();
}
mapCanvas.addEventListener('click', (e) => {
  const r = mapCanvas.getBoundingClientRect();
  const s = mapCanvas.width / PLAN_W;
  const px = ((e.clientX - r.left) * (mapCanvas.width / r.width)) / s, py = ((e.clientY - r.top) * (mapCanvas.height / r.height)) / s;
  const x = (px - 40) / 28.5, y = (py - 133) / 27.8;
  walker.teleport(x, y);
});

function roomAt(x, y) {
  for (const [id, r] of Object.entries(rooms)) if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) return r;
  return null;
}
const roomEl = document.getElementById('room');
let lastRoom = null;

// room jump list
const jump = document.getElementById('jump');
const jumpSpots = {
  living: [30.5, 27, 320], dining: [21.5, 18.5, 300], kitchen: [24, 10, 25], bed1: [9.5, 9.5, 315],
  bed2: [10.5, 23.0, 220], bed3: [14, 26, 140], toiletA: [12.5, 6.5, 30], wash: [18.5, 6.5, 0],
  balcL: [31, 34, 200], balc2: [6, 36, 180], toiletC: [8, 19.5, 300], toiletB: [6.5, 14.5, 270],
};
window.__jumpSpots = jumpSpots;
for (const [id, [x, y, yaw]] of Object.entries(jumpSpots)) {
  const b = document.createElement('button');
  b.textContent = rooms[id].name.replace(' (attached)', '').replace(' (common)', '');
  b.onclick = (e) => { e.stopPropagation(); walker.setPose(x, y, yaw); };
  jump.appendChild(b);
}

// ---------- loop ----------
addEventListener('resize', () => {
  if (shotMode) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  applyResolution(); // the pixel budget depends on the window size; also resizes the composer
});

function render() {
  // the sun's shadow map is rendered once, from everything: un-cull for that frame, then hide hidden rooms again
  const shadowPass = culler?.enabled && renderer.shadowMap.needsUpdate;
  if (shadowPass) culler.showAll();
  if (usePost) post.composer.render();
  else renderer.render(scene, activeCam);
  mirrorState.frame++;
  if (shadowPass) { const p = walker.planPos(); culler.update(p.x, p.y, true); }
}

let last = performance.now(), prevRendered = false, wasActive = false, fading = false;
function frame(now) {
  const dtMs = now - last; last = now;
  const dt = Math.min(dtMs / 1000, 0.05);
  walker.update(dt);
  const moved = walker.dirty;
  if (moved) walker.dirty = false;

  if (moved) { const p = walker.planPos(); culler.update(p.x, p.y); }
  if (moved || fading) fading = lights.update(camera.position, dt);
  const need = moved || fading || forceFrames > 0;
  if (!need) {
    // came to rest: one last full-quality refresh of the mirrors, then sleep (no GPU work at all)
    if (wasActive) { wasActive = false; mirrorState.force = true; render(); mirrorState.force = false; }
    prevRendered = false;
    return;
  }
  if (forceFrames > 0) forceFrames--;
  wasActive = true;
  render();
  if (prevRendered) quality.sample(dtMs);
  prevRendered = true;

  if (moved) {
    const p = walker.planPos();
    const r = roomAt(p.x, p.y);
    if (r !== lastRoom) {
      lastRoom = r;
      roomEl.innerHTML = r ? `<b>${r.name}</b>${r.label ? `<span>${r.label}</span>` : ''}` : '';
    }
    mapDirty = true;
  }
  if (mapDirty) { mapDirty = false; drawMap(); }
}

// Programs differ for the screen (tone mapping + sRGB output) and for render targets (mirrors, the High-tier composer),
// and the light count is baked into every shader. This compiles the variants a tier will draw, in parallel in the
// driver and in small time slices on our side, without touching what is currently on screen - so neither start-up nor
// a quality switch stalls on a first frame that needs a new shader.
function programKey(o) {
  const g = o.geometry, a = g.attributes;
  return [o.material.uuid, o.receiveShadow, !!a.uv1, !!a.color, !!a.normal, !!a.tangent, o.isInstancedMesh, o.isSkinnedMesh, !!g.morphAttributes.position].join('|');
}
async function precompile(t, sliceMs = 8) {
  const reps = new Map(), mirrorRT = [];
  scene.traverse((o) => {
    if (o.isReflector) mirrorRT.push(o.getRenderTarget());
    if (!o.isMesh || !o.material || Array.isArray(o.material) || !(o.visible || o.userData.culled)) return;
    const k = programKey(o);
    if (!reps.has(k)) reps.set(k, o);
  });
  const targets = (t.composer && post) ? [post.composer.readBuffer] : [null, ...(mirrorRT.length && !t.mirror.off ? [mirrorRT[0]] : [])];
  const list = [...reps.values()], jobs = [];
  for (let i = 0; i < list.length;) {
    const t0 = performance.now();
    const batch = () => {
      const prev = renderer.getRenderTarget();
      while (i < list.length && performance.now() - t0 < sliceMs) {
        const mesh = list[i++];
        for (const rt of targets) { renderer.setRenderTarget(rt); jobs.push(renderer.compileAsync(mesh, activeCam, scene)); }
      }
      renderer.setRenderTarget(prev);
    };
    if (lights && lights.enabled) lights.withBudget(t.lights, batch); else batch();
    await nextFrame();
  }
  await Promise.all(jobs);
}

// Everything is uploaded to the GPU and every shader compiled while the loading screen is still up, so walking into
// a new room never stalls. Texture uploads are time-sliced so the page stays responsive.
const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap', 'emissiveMap', 'bumpMap', 'alphaMap', 'lightMap', 'envMap'];
async function prewarm() {
  const texs = new Set();
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const mt of mats) for (const k of TEX_KEYS) if (mt[k]?.isTexture && !mt[k].isRenderTargetTexture && mt[k] !== scene.environment && (mt[k].isCompressedTexture ? mt[k].mipmaps.length : mt[k].image)) texs.add(mt[k]);
  });
  const list = [...texs];
  for (let i = 0; i < list.length;) {
    const t0 = performance.now();
    while (i < list.length && performance.now() - t0 < 10) {
      const t = list[i++];
      renderer.initTexture(t);
      if (!shotMode) freeTextureData(t);
    }
    setStatus(`Preparing graphics… ${Math.round((i / list.length) * 100)}%`, 0.8 + 0.15 * (i / list.length));
    await nextFrame();
  }
  if (!shotMode) freeGeometryAfterUpload(scene);
  console.info(`[load] textures initialised @${Math.round(performance.now())}ms`);
  setStatus('Compiling shaders…', 0.96);
  await precompile(quality.settings);
  console.info(`[load] shaders compiled @${Math.round(performance.now())}ms`);
}

window.__three = { renderer, scene, get composer() { return post?.composer; } };
window.__quality = quality;
window.__cull = () => culler;
window.__roomAt = (x, y) => !!roomAt(x, y);
window.__renderOnce = () => { mirrorState.force = true; render(); mirrorState.force = false; }; // test hook (tools/cull-test.mjs)
window.__stats = () => {
  const lightCount = {};
  let shadowLights = 0, meshes = 0, visibleLights = 0;
  scene.traverse((o) => {
    if (o.isLight) { lightCount[o.type] = (lightCount[o.type] || 0) + 1; if (o.castShadow) shadowLights++; if (o.visible) visibleLights++; }
    if (o.isMesh) meshes++;
  });
  const i = renderer.info;
  return { tier: quality.tier, res: quality.res, lights: lightCount, visibleLights, shadowLights, meshes, calls: i.render.calls, triangles: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries, programs: i.programs?.length };
};
window.__dbg = () => ({ tex: pendingTex.size, models: pendingModels.size, phase: window.__phase, urls: [...pendingModels].map((p) => p.url) });
window.__views = () => Object.keys(views);

const mark = (s) => console.info(`[load] ${s} @${Math.round(performance.now())}ms`);
async function start() {
  mark('start');
  window.__phase = 'pieces';
  setStatus('Building rooms…', 0.05);
  const progress = setInterval(() => {
    const { requested, done } = loadStats;
    if (requested) setStatus(window.__phase === 'assets' ? `Loading textures & models… ${done}/${requested}` : 'Building rooms…', 0.1 + 0.6 * (done / requested));
  }, 120);
  await Promise.all([hdrP, loadPieces]);
  mark('pieces+env built');
  window.__phase = 'assets';
  // wait for every texture/model requested during build
  while (pendingTex.size || pendingModels.size) await Promise.allSettled([...pendingTex, ...pendingModels]);
  clearInterval(progress);
  mark('assets loaded');
  window.__phase = 'optimize';
  setStatus('Optimizing…', 0.75);
  stripTransmission(scene);
  convertAreaLights(scene);
  const merged = mergeStatic(scene, { skip: [shell.ceiling, shell.roof] }); // top view toggles those two
  console.info(`merged static meshes: ${merged.before} -> ${merged.after}`);
  mirrors = setupMirrors(scene, mirrorState);
  lights = new LightBudget(scene);
  culler = new Culler(scene, { skip: [shell.ceiling, shell.roof] });
  culler.enabled = !shotMode ? params.get('cull') !== '0' : params.get('cull') === '1';
  scene.matrixWorldAutoUpdate = false; // everything is static: no need to re-walk ~3000 nodes every frame
  if (shotView) setView(shotView);
  if (topPiece) { await ensurePost(); setTop(topPiece); }
  mark('merged');
  window.__phase = 'compile';
  await applyTier(true);
  mark('tier applied');
  camera.updateMatrixWorld(true);
  if (params.get('budget') === '0' || (shotMode && !params.has('budget'))) lights.enabled = false;
  await prewarm();
  mark('prewarmed');
  // first frames behind the loading screen: builds the shadow map and the AO/mirror targets so the reveal is smooth
  renderer.shadowMap.needsUpdate = true;
  mirrorState.force = true;
  render();
  console.info(`[load] first render @${Math.round(performance.now())}ms programs=${renderer.info.programs.length}`);
  render();
  mirrorState.force = false;
  mark('first frames rendered');
  document.body.classList.add('loaded');
  setTimeout(() => loaderEl.remove(), 900);
  if (shotMode) {
    document.body.classList.add('shot');
    for (let i = 0; i < 6; i++) render();
    window.__ready = true;
    window.__views = Object.keys(views);
    return;
  }
  renderer.setAnimationLoop(frame);
}
start();
