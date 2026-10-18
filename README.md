# 3BHK walkthrough (house3d)

A three.js first-person walkthrough of one apartment, built to scale from `ref/plan.png`.
`BRIEF.md` describes the room-by-room spec and the rules for editing the room modules.

```bash
npm install
npm run dev        # development server (http://localhost:5199)
npm run build      # production bundle in dist/ (what you deploy)
npm start          # serve dist/ locally and on your network (vite preview --host)
```

`dist/` is a static site (relative paths), so it can be dropped onto any static host: GitHub Pages, Netlify, Cloudflare
Pages, an S3 bucket, a USB stick behind `npm start`.

Controls: click the view to look around, `W A S D` / arrows to walk, `Shift` to hurry, `Esc` to release the mouse,
click the minimap or a room button to jump. Touch: drag on the left half to walk, on the right half to look.

## Performance

The viewer is meant to run on anything from an integrated GPU to a gaming laptop. What makes that work:

| Area | What it does |
| --- | --- |
| **Quality tiers** (`src/lib/quality.js`) | *High* (ambient occlusion, sharp shadows), *Medium*, *Low*. The first guess comes from the GPU/CPU/device; **Auto** (default) then watches real frame times and lowers the render resolution step by step, dropping a tier only if that is not enough. The result is remembered for the next visit. The `Quality` button (or `Q`) cycles Auto / High / Medium / Low; `?q=low` forces a tier. |
| **Light budget** (`src/lib/lightBudget.js`) | three.js shades every pixel against *every* light, even ones behind walls. The flat has ~25 point lights; only the handful that reach the viewer (nearest, not blocked by a wall) are switched on and cross-faded as you walk. The count stays constant so shaders never recompile. |
| **Render on demand** | The scene is static, so a frame is rendered only when the view changes. Standing still costs no GPU at all. |
| **GPU-compressed textures** (`tools/optimize-assets.mjs`) | All Poly Haven textures are KTX2 (Basis Universal) and stay compressed in video memory (about 4x less than decoded JPEG), transcoded off the main thread. AO + roughness are packed into one texture. |
| **Lighter meshes** | Scanned plants/books (up to 176k triangles each) are simplified to ~10-25k; static props and the architectural shell are merged per material and area (1,800 meshes -> ~860). |
| **Line-of-sight culling** (`src/lib/cull.js`) | three.js only culls what is outside the camera frustum, so furniture in rooms behind walls was still drawn. Every few inches of movement a fan of 2-D rays against the plan's walls decides which rooms are reachable (mirrors count as extra viewpoints); the rest are skipped. Draw calls per frame: ~930 before, ~140 inside a bedroom to ~300 in the open-plan living/dining now. `node tools/cull-test.mjs` renders random viewpoints with and without culling and diffs the pixels (identical in 376 of 380 random viewpoints; in the other 4 at most 6 pixels differ, by <=19/255). |
| **Shaders compiled up front** | Textures are uploaded and every shader variant (screen + mirror/render-target) is compiled behind the loading screen, in time slices, so nothing stalls the first time you enter a room. |
| **Tamed mirrors** | Planar mirrors re-render the house; they now refresh only when near / first seen, at reduced size, and once more when you stop. |
| **Memory (phones)** | Once meshes and textures are on the GPU, their JavaScript copies (painted canvases, vertex arrays, compressed texture data) are freed; if the GPU context is ever lost the page reloads instead. On phones the rooms are built one at a time and each room's canvases are shrunk and uploaded straight away. Low tier shows mirrors as polished metal instead of re-rendering the flat. This is what stops mobile Chrome's "Aw, Snap!" (peak memory 2.2 GB -> ~1.4 GB in a Pixel 5 emulation, ~25 MB of JS heap once loaded). |
| **No GPU? Say so** | If the browser has graphics acceleration switched off (it then draws WebGL on the CPU - slow on any PC, and it loads the whole machine), a banner explains how to turn it on, and the view starts at Low / half resolution. |
| **Misc** | 2k sky panorama (4k only on High), 1k sky HDR (was 2k), shadow map 2048 (was 4096), no `backdrop-filter` blur over the live canvas, minimap redrawn only when you move, no external font request. |

Measured on the dev laptop (i5-12500H + RTX 3050, Chrome, production build, 1600x900), original -> now:

| | original | now |
| --- | --- | --- |
| time until the page is usable | ~55-70 s (the main thread was **frozen for ~62 s** compiling shaders on the first frame) | ~11 s, progress bar alive (longest stall 2.3 s) |
| download | 101 MB | ~31 MB |
| steady frame rate walking | ~70 fps, p95 28 ms | ~130 fps, p95 11 ms |
| draw calls / frame (Medium/Low) | ~930 | ~140 in a bedroom, ~300 in the open-plan area |
| texture memory (estimate) | ~1.2 GB | 0.17 GB (Low) to 0.43 GB (High) |
| GPU stress test (render target forced to 4800x2700) | 335 ms/frame | 171 ms (High) / 16.5 ms (Medium) / 12.1 ms (Low) |

The stress test pushes ~6x the pixels of a 1080p window, so it is a fair proxy for weaker hardware: a GPU several times slower than this one should still manage ~60 fps at 1080p on Medium/Low (Auto lowers the resolution if it cannot).
`node tools/perf.mjs` and the `?pr=3` flag reproduce these.

### Assets: two stages

`assets-src/` holds the full-size originals (never served). `public/assets/` holds the optimised copies the app loads.

```bash
node tools/ph.mjs get <polyhaven-id> 1k   # fetch a model/texture into assets-src/ph/<id>/
npm run assets                            # (re)build public/assets/ for everything the code references
```

`npm run assets` only touches assets referenced from `src/`, skips outputs that are up to date and takes a few
minutes on a cold run (the texture encoder is slow, but runs 4 jobs in parallel; `--jobs N`, `--only id,id`, `--force`).
Tuning knobs (mesh simplification targets, texture size caps) are at the top of `tools/optimize-assets.mjs`.

### Phones: the pre-built "lite" copy

Phones (and low-RAM devices) do not build the flat in the browser. `npm run bake` (tools/bake-lite.mjs) builds it once
in a desktop browser, exports it as one glTF and compresses it for phones (KTX2 textures, meshopt geometry) into
`public/assets/lite/scene.glb` + `scene.json` (lights, walls). Phones just download and display that file: about
half the memory and a fraction of the start-up work of building ~1,800 meshes and ~90 painted canvases themselves.

**Re-run `npm run bake` after changing any room, the shell or the assets** (after `npm run assets`), then commit the
two files. `?lite=1` shows the phone version on a desktop, `?lite=0` forces the full build on a phone.

### Measuring

```bash
npm run build
npm run perf                                  # starts the built site, prints load time, fps, draw calls
node tools/perf.mjs http://localhost:5199/?q=low&pr=3   # any URL; pr=3 renders 3x pixels to stress the GPU
```

Screenshots for visual checks still work as before (`npm run shot -- living-a --out shots/x`); screenshots always use the
High tier with every light on (`?q=medium&budget=1` previews what a lower tier looks like).
