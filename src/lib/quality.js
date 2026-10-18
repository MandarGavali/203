// Quality tiers + the controller that keeps the walkthrough smooth on whatever machine opens it.
//
// - detectTier(): first guess from the GPU/CPU/device (a saved choice or ?q=low|medium|high overrides it)
// - Quality: in 'auto' mode it watches real frame times and (1) lowers the render resolution, then (2) drops a tier
//   if that is not enough. It remembers the outcome so the next visit starts at the right place.

// dprMax caps the device pixel ratio; maxMP caps the rendered pixel count (megapixels). The pixel budget is what really
// limits the GPU, so a phone-sized screen can be rendered sharper than a 4K monitor.
export const TIERS = {
  high:   { label: 'High',   composer: true,  dprMax: 2,   maxMP: 4.7,  shadow: 2048, lights: 12, aniso: 8, canvasMax: 2048, backdrop: '4k', mirror: { scale: 0.75, every: 2, dist: 4.5, msaa: 2 } },
  medium: { label: 'Medium', composer: false, dprMax: 1.5, maxMP: 3.2, shadow: 2048, lights: 8,  aniso: 4, canvasMax: 1024, backdrop: '2k', mirror: { scale: 0.5,  every: 2, dist: 4.0, msaa: 0 } },
  low:    { label: 'Low',    composer: false, dprMax: 1.5, maxMP: 2.1, shadow: 1024, lights: 5,  aniso: 2, canvasMax: 512,  backdrop: '2k', mirror: { off: true, scale: 0.35, every: 3, dist: 3.2, msaa: 0 } },
};
export const ORDER = ['high', 'medium', 'low'];
// multipliers applied on top of the tier's pixel ratio while auto-adapting
export const RES_STEPS = [1, 0.85, 0.72, 0.6, 0.5];

const KEY = 'house3d.quality.v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const write = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* private mode / blocked: fine */ } };

export function gpuName() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(name || '');
  } catch { return ''; }
}

/**
 * True when the browser can only draw WebGL on the CPU (hardware acceleration switched off, GPU blocklisted, remote
 * desktop...). Asking for a context that must not have a "major performance caveat" fails in exactly that case, and
 * it also works in browsers that hide the GPU name (Brave, Firefox resistFingerprinting).
 */
export function softwareRendering(gpu = gpuName()) {
  if (/SwiftShader|llvmpipe|Software|Basic Render|softpipe/i.test(gpu)) return true;
  try {
    const gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (gl) { gl.getExtension('WEBGL_lose_context')?.loseContext(); return false; }
    const any = document.createElement('canvas').getContext('webgl2');
    any?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!any;
  } catch { return false; }
}

/** Phones/tablets and low-RAM devices: the browser kills a tab long before desktop limits, so memory comes first. */
export const memoryConstrained = () => matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.deviceMemory || 8) <= 4;

export function detectTier(gpu = gpuName()) {
  const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 4;
  if (/SwiftShader|llvmpipe|Software|Basic Render|softpipe/i.test(gpu)) return 'low';
  if (mobile || mem <= 4 || cores <= 2) return 'low';
  if (/Intel/i.test(gpu) && /(UHD|HD Graphics|GMA)/i.test(gpu) && !/Iris|Xe|Arc/i.test(gpu)) return 'low';
  if (/Intel/i.test(gpu) || /Radeon\(TM\) Graphics|Vega|Mali|Adreno|PowerVR/i.test(gpu)) return 'medium';
  if (/NVIDIA|GeForce|RTX|GTX|Radeon RX|Radeon Pro|Apple M|Apple GPU/i.test(gpu)) return cores >= 6 ? 'high' : 'medium';
  return 'medium';
}

export class Quality {
  /** @param {URLSearchParams} params */
  constructor(params, { shotMode = false } = {}) {
    this.gpu = gpuName();
    this.software = !shotMode && softwareRendering(this.gpu);
    this.constrained = memoryConstrained();
    const saved = read();
    const q = params.get('q');
    this.shotMode = shotMode;
    if (shotMode) { this.mode = TIERS[q] ? q : 'high'; this.tier = this.mode; this.res = 1; } // screenshots: fixed tier, default High
    else if (TIERS[q]) { this.mode = q; this.tier = q; this.res = 1; }
    else if (q === 'auto') { this.mode = 'auto'; this.tier = detectTier(this.gpu); this.res = 1; }
    else if (TIERS[saved.mode]) { this.mode = saved.mode; this.tier = saved.mode; this.res = 1; }
    else {
      this.mode = 'auto';
      this.tier = TIERS[saved.tier] ? saved.tier : detectTier(this.gpu);
      this.res = RES_STEPS.includes(saved.res) ? saved.res : 1;
    }
    // drawing on the CPU: start at the cheapest settings instead of discovering it frame by frame
    if (this.software && this.mode === 'auto') { this.tier = 'low'; this.res = RES_STEPS[RES_STEPS.length - 1]; }
    this.onChange = () => {};
    this.samples = []; this.good = 0; this.bad = 0; this.cool = 90; // frames to ignore (shader warm-up, post-change settle)
    this.ceiling = 0;      // index into RES_STEPS we must not go above again (set when an upscale made things slow)
    this.lastUp = -1;
    this.settled = 0;
  }

  get settings() { return TIERS[this.tier]; }
  get label() { return this.mode === 'auto' ? `Auto · ${TIERS[this.tier].label}` : TIERS[this.tier].label; }

  /** Cycle Auto -> High -> Medium -> Low (button / Q key). */
  cycle() { this.set({ auto: 'high', high: 'medium', medium: 'low', low: 'auto' }[this.mode]); }

  set(mode) {
    this.mode = mode;
    if (mode !== 'auto') this.tier = mode; else this.tier = this.software ? 'low' : detectTier(this.gpu);
    this.res = 1; this.ceiling = 0; this.lastUp = -1;
    this.reset();
    write(mode === 'auto' ? { mode: 'auto', tier: this.tier, res: 1 } : { mode });
    this.onChange(this);
  }

  reset() { this.samples.length = 0; this.good = this.bad = 0; this.cool = 60; this.settled = 0; }

  /** Feed the time (ms) between two consecutively rendered frames. */
  sample(ms) {
    if (this.mode !== 'auto' || this.shotMode) return;
    if (this.cool > 0) { this.cool--; return; }
    this.samples.push(Math.min(ms, 100));
    if (this.samples.length < 40) return;
    const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples.length = 0;

    const i = RES_STEPS.indexOf(this.res);
    if (mean > 24) {                       // under ~42 fps
      this.good = 0; this.settled = 0;
      if (this.lastUp === i && i > 0) this.ceiling = Math.max(this.ceiling, i); // that upscale did not hold: stay below it
      if (i < RES_STEPS.length - 1) this.apply({ res: RES_STEPS[i + 1] });
      else if (mean > 28 && ++this.bad >= 2 && this.tier !== 'low') this.apply({ tier: ORDER[ORDER.indexOf(this.tier) + 1], res: 1 });
    } else if (mean < 18.5) {              // holding a full refresh: try a sharper image
      this.bad = 0;
      if (++this.good >= 4 && i > this.ceiling) { this.lastUp = i - 1; this.good = 0; this.apply({ res: RES_STEPS[i - 1] }); }
      else if (++this.settled >= 6) { this.settled = -1e9; write({ mode: 'auto', tier: this.tier, res: this.res }); }
    } else { this.good = 0; this.bad = 0; }
  }

  apply({ tier, res }) {
    if (tier) { this.tier = tier; this.ceiling = 0; this.lastUp = -1; }
    if (res) this.res = res;
    this.cool = 45; this.samples.length = 0; this.settled = 0;
    write({ mode: 'auto', tier: this.tier, res: this.res });
    this.onChange(this);
  }
}
