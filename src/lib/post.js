import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// The "High" look: ambient occlusion (contact darkening in corners and under furniture) + tone mapping.
// Loaded on demand (dynamic import) so Medium/Low never download or build any of it.
export function createPost(renderer, scene, camera, { samples = 2, aoOff = false } = {}) {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr);
  composer.setSize(size.x, size.y);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const ao = new GTAOPass(scene, camera, size.x, size.y);
  ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 16 });
  ao.blendIntensity = 0.85;
  if (aoOff) ao.enabled = false;
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  return { composer, renderPass, ao };
}
