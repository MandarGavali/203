// Greyscale height canvas (R channel) -> tangent-space normal-map canvas, wrapping at the edges.
// Same maths as the per-room copies it replaced, with row offsets hoisted out of the pixel loop (several times faster:
// these run at start-up on 1-2 megapixel canvases).
export function normalCanvasFromHeight(src, strength = 2) {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const od = new Uint8ClampedArray(w * h * 4);
  const k = strength / 255;
  for (let y = 0; y < h; y++) {
    const up = ((y + h - 1) % h) * w, row = y * w, down = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      const xm = x === 0 ? w - 1 : x - 1, xp = x === w - 1 ? 0 : x + 1;
      const dx = (sd[(row + xp) * 4] - sd[(row + xm) * 4]) * k;
      const dy = (sd[(down + x) * 4] - sd[(up + x) * 4]) * k;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (row + x) * 4;
      od[i] = (-dx * inv * 0.5 + 0.5) * 255;
      od[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      od[i + 2] = (inv * 0.5 + 0.5) * 255;
      od[i + 3] = 255;
    }
  }
  out.getContext('2d').putImageData(new ImageData(od, w, h), 0, 0);
  return out;
}
