import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FT, CEILING, rooms, pieces } from './plan.js';
import { buildShell } from './shell.js';
import { makeCtx, pendingModels } from './lib/ctx.js';
import { pending as pendingTex, setAnisotropy } from './lib/materials.js';
import { Walker } from './controls.js';
import { defaultViews } from './views.js';

const params = new URLSearchParams(location.search);
const shotView = params.get('view');
const topPiece = params.get('top');
const shotMode = !!(shotView || topPiece);
const m = (ft) => ft * FT;

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: shotMode });
renderer.setPixelRatio(shotMode ? 1 : +(params.get('pr') || Math.min(devicePixelRatio, 1.5)));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // nothing moves: render the sun's shadow map once after load
document.getElementById('app').appendChild(renderer.domElement);
setAnisotropy(Math.min(16, renderer.capabilities.getMaxAnisotropy()));

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
});
const viewP = new THREE.TextureLoader().loadAsync('assets/backdrop/homecoming_center_rooftop_4k.jpg').then((t) => {
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
sun.shadow.mapSize.set(4096, 4096);
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
const loadPieces = Promise.all(Object.entries(modules).map(async ([path, load]) => {
  const id = path.match(/rooms\/(.+)\.js$/)[1];
  if (only && !only.includes(id)) return;
  try {
    const t0 = performance.now();
    const mod = await load();
    if (mod.views) Object.assign(views, mod.views);
    await mod.default(makeCtx(scene, renderer, colliders, id));
    window.__timing[id] = Math.round(performance.now() - t0);
    console.info(`piece ${id} built in ${window.__timing[id]} ms`);
  } catch (e) {
    console.error('piece failed', id, e);
  }
}));

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(renderer.getPixelRatio());
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 16 });
ao.blendIntensity = 0.85;
if (params.get('ao') === '0') ao.enabled = false;
composer.addPass(ao);
composer.addPass(new OutputPass());

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
  renderPass.camera = ortho;
  ao.camera = ortho;
  ao.enabled = false;
}

// ---------- HUD / minimap ----------
const hud = document.getElementById('hud');
const mapCanvas = document.getElementById('minimap');
const mapCtx = mapCanvas.getContext('2d');
const planImg = new Image();
planImg.src = 'plan.png';
const toPx = (x, y) => [40 + 28.5 * x, 133 + 27.8 * y];
function drawMap() {
  if (!planImg.complete) return;
  const W = mapCanvas.width, Hh = mapCanvas.height;
  const s = W / planImg.width;
  mapCtx.clearRect(0, 0, W, Hh);
  mapCtx.globalAlpha = 0.92;
  mapCtx.drawImage(planImg, 0, 0, W, planImg.height * s);
  mapCtx.globalAlpha = 1;
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
  const s = mapCanvas.width / planImg.width;
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
  composer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  frameNo++;
  if (!shotMode) {
    walker.update(dt);
    const p = walker.planPos();
    const r = roomAt(p.x, p.y);
    if (r !== lastRoom) {
      lastRoom = r;
      roomEl.innerHTML = r ? `<b>${r.name}</b>${r.label ? `<span>${r.label}</span>` : ''}` : '';
    }
    drawMap();
    autoQuality(dt);
  }
  composer.render(dt);
}

// Ambient occlusion is the priciest pass: drop it if the first ~1.5 s of walking runs under 40 fps. Q toggles it.
const perfSamples = [];
let qualityDecided = params.has('ao');
function setAO(on) {
  ao.enabled = on;
  const el = document.getElementById('quality');
  if (el) el.textContent = on ? 'High' : 'Fast';
}
function autoQuality(dt) {
  if (qualityDecided || frameNo < 30) return;
  perfSamples.push(dt);
  if (perfSamples.length < 90) return;
  qualityDecided = true;
  const fps = perfSamples.length / perfSamples.reduce((a, b) => a + b, 0);
  if (fps < 40) setAO(false);
}
addEventListener('keydown', (e) => {
  if (e.code === 'KeyQ') { qualityDecided = true; setAO(!ao.enabled); }
});

// Runtime budget for what the pieces built:
//  - transmission materials force a full extra opaque render whenever one is on screen -> plain alpha instead
//  - each planar Reflector re-renders the whole house -> only refresh a mirror when the viewer is near it
let frameNo = 0;
function optimizeScene() {
  const p = new THREE.Vector3();
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const mt of mats) if (mt.transmission > 0) { mt.transmission = 0; mt.needsUpdate = true; }
    if (o.isReflector && !shotMode) {
      const update = o.onBeforeRender;
      o.onBeforeRender = function (r, s, cam, ...rest) {
        o.getWorldPosition(p);
        if (frameNo < 3 || (cam.position.distanceTo(p) < 4.5 && frameNo % 2 === 0)) update.call(this, r, s, cam, ...rest);
      };
    }
  });
}

window.__stats = () => {
  const lights = {};
  let shadowLights = 0, meshes = 0;
  scene.traverse((o) => {
    if (o.isLight) { lights[o.type] = (lights[o.type] || 0) + 1; if (o.castShadow) shadowLights++; }
    if (o.isMesh) meshes++;
  });
  const i = renderer.info;
  return { lights, shadowLights, meshes, calls: i.render.calls, triangles: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries, programs: i.programs?.length };
};
window.__dbg = () => ({ tex: pendingTex.size, models: pendingModels.size, phase: window.__phase, urls: [...pendingModels].map((p) => p.url) });
async function start() {
  window.__phase = 'pieces';
  await Promise.all([hdrP, loadPieces]);
  window.__phase = 'assets';
  // wait for every texture/model requested during build
  while (pendingTex.size || pendingModels.size) await Promise.allSettled([...pendingTex, ...pendingModels]);
  window.__phase = 'compile';
  optimizeScene();
  if (shotView) setView(shotView);
  if (topPiece) setTop(topPiece);
  renderer.shadowMap.needsUpdate = true;
  renderer.compile(scene, activeCam);
  document.body.classList.add('loaded');
  if (shotMode) {
    document.body.classList.add('shot');
    for (let i = 0; i < 6; i++) composer.render(0.016);
    window.__ready = true;
    window.__views = Object.keys(views);
    return;
  }
  renderer.setAnimationLoop(frame);
}
start();
window.__views = () => Object.keys(views);
