// Piece: bed2 — Bedroom 2 (x 0.5–11.5, y 21–34) + attached Toilet C (x 0.5–10.5, y 16.5–20.5) + 3' balcony (x 0–11.5, y 34.5–37.5).
//
// What's where (plan feet):
//   Bedroom  - plum wardrobe on W wall x 0.5–2.3, y 21–28, h 0–7.5 (4 shutters + loft row, gold bar pulls)
//            - queen bed, teak frame, headboard on E wall: x 5.1–11.5, y 25.55–30.45, facing W; rust/cream diagonal-stripe duvet (cloth drape) + sheet fold-back + turned corner; rust rug x 4.2–8.5, y 24.6–31.4
//            - teak nightstands x 10.0–11.5 at y 24.0–25.5 and 30.5–32.0, round drum lamps (3-spoke spider like the plan symbol)
//            - art over the headboard, split AC on N wall, flush ceiling light, sheer curtains at the balcony slider
//   Toilet C - wall tiles to 7' (grey-beige 2'x1'), vanity counter x 9.0–10.5 full depth on floating oak drawers, black-framed glass partition at x 9.0 (y 16.5–17.65), basin y 18.6,
//              mirror over it; wall-hung WC on N wall x≈4.6; walk-in shower x 0.5–3.2 with fixed glass screen at x 3.2, under the ventilator
//   Balcony  - two potted shrubs at the W (x≈1.2) and E (x≈10.7) ends, y≈36.1
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

export const views = {
  'bed2-a':      { pos: [10.7, 23.6], look: [2.5, 31.0], lookH: 3.0 },
  'bed2-b':      { pos: [1.6, 33.4],  look: [10.5, 25.5], lookH: 3.4 },
  'bed2-bed':    { pos: [2.8, 28.0],  look: [11.5, 28.0], lookH: 3.0, fov: 66 },
  'bed2-toilet': { pos: [7.9, 20.2],  look: [1.0, 17.6], lookH: 3.8, fov: 80 },
  'bed2-vanity': { pos: [7.3, 17.0],  look: [10.5, 19.0], lookH: 3.9, fov: 72 },
  'bed2-balcony':{ pos: [10.9, 34.95], look: [0.0, 36.6], h: 5.0, lookH: 2.2, fov: 72 },
  'bed2-balcony-e':{ pos: [0.6, 34.95], look: [11.5, 36.6], h: 5.0, lookH: 2.2, fov: 72 },
};

export default async function build(ctx) {
  const { m, group } = ctx;
  const L = ctx.mat;

  // ---------------------------------------------------------------- helpers
  // planar world-space UVs that keep the geometry's own (smooth) normals
  function uvWorld(g, size) {
    const pos = g.attributes.position, nor = g.attributes.normal;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      let u, v;
      if (ay >= ax && ay >= az) { u = x; v = -z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
      uv[i * 2] = u / size; uv[i * 2 + 1] = v / size;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('uv1', new THREE.BufferAttribute(uv.slice(), 2));
    return g;
  }
  const add = (mesh, { shadow = true } = {}) => { mesh.castShadow = shadow; mesh.receiveShadow = true; group.add(mesh); return mesh; };
  // rounded box in plan feet (world-space UVs)
  function rb(mat, x1, y1, x2, y2, h1, h2, r = 0.006, seg = 3) {
    const w = m(x2 - x1), hh = m(h2 - h1), d = m(y2 - y1);
    const rr = Math.min(r, w / 2 - 1e-4, hh / 2 - 1e-4, d / 2 - 1e-4);
    const g = new RoundedBoxGeometry(w, hh, d, seg, Math.max(rr, 1e-4));
    g.translate(m((x1 + x2) / 2), m((h1 + h2) / 2), m((y1 + y2) / 2));
    uvWorld(g, mat.userData?.worldSize || 1);
    return add(new THREE.Mesh(g, mat));
  }
  // any geometry built in metres around its own origin -> placed at plan (x,y,h), rotated ry
  function put(geom, mat, x, y, h = 0, ry = 0) {
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(m(x), m(h), m(y));
    mesh.rotation.y = ry;
    return add(mesh);
  }
  function canvasTex(w, h, draw, { srgb = true, repeat = 1 } = {}) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    t.repeat.set(repeat, repeat);
    return t;
  }
  // deterministic noise
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // ---------------------------------------------------------------- materials
  const teak = ctx.pbr('teak_veneer', { size: 1.0, roughness: 0.75, ao: false, color: 0xd8c2ae });
  const teakDark = ctx.pbr('teak_veneer', { size: 1.0, roughness: 0.8, ao: false, color: 0x6e4a32 });
  const plum = ctx.pbr('white_maple_veneer', { size: 1.4, color: 0x560a49, roughness: 0.55, normalScale: 0.35, ao: false, physical: true, clearcoat: 0.15, clearcoatRoughness: 0.4 });
  const plumCarcass = ctx.pbr('white_maple_veneer', { size: 1.4, color: 0x46083b, roughness: 0.6, normalScale: 0.3, ao: false });
  const shadowGap = new THREE.MeshStandardMaterial({ color: 0x1c1418, roughness: 0.9 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a46a, metalness: 1, roughness: 0.28 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 1, roughness: 0.08 });
  const blackMetal = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.45 });
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xf6f5f1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  const whitePlastic = new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.35 });
  const sheet = ctx.pbr('cotton_jersey', { size: 0.35, noMap: true, color: 0xf3f0e8, roughness: 1, normalScale: 0.6, ao: false });
  const linenWhite = ctx.pbr('rough_linen', { size: 0.45, noMap: true, color: 0xf1ede4, roughness: 1, normalScale: 0.7, ao: false });
  const upholstery = ctx.pbr('rough_linen', { size: 0.5, noMap: true, color: 0xb9a68c, roughness: 1, normalScale: 0.9, ao: false });
  const rustCushion = ctx.pbr('rough_linen', { size: 0.45, noMap: true, color: 0x9c4a22, roughness: 1, normalScale: 0.8, ao: false });
  // engineered quartz counter (seamless speckle + faint veins)
  const quartzMap = canvasTex(1024, 1024, (g, W, H) => {
    g.fillStyle = '#ebe6dd'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 26000; i++) {
      const v = rnd();
      g.fillStyle = v < 0.5 ? `rgba(150,140,128,${0.25 * rnd()})` : v < 0.8 ? `rgba(255,255,250,${0.5 * rnd()})` : `rgba(110,100,92,${0.3 * rnd()})`;
      const r = 0.6 + rnd() * 1.8;
      g.fillRect(rnd() * W, rnd() * H, r, r);
    }
    g.strokeStyle = 'rgba(160,150,138,0.18)'; g.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      g.beginPath(); let x = rnd() * W, y = 0; g.moveTo(x, y);
      while (y < H) { x += (rnd() - 0.5) * 60; y += 30 + rnd() * 40; g.lineTo(x, y); }
      g.stroke();
    }
  });
  const stone = new THREE.MeshPhysicalMaterial({ map: quartzMap, roughness: 0.22, clearcoat: 0.4, clearcoatRoughness: 0.15 });
  stone.userData.worldSize = 1.0;
  const clearGlass = new THREE.MeshPhysicalMaterial({ color: 0xdfe9e4, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.1, envMapIntensity: 0.8, depthWrite: false, side: THREE.DoubleSide });
  const glassEdge = new THREE.MeshStandardMaterial({ color: 0x8fa89c, roughness: 0.1, transparent: true, opacity: 0.55 });
  // bathroom fittings: matte black
  const fitting = new THREE.MeshStandardMaterial({ color: 0x1d1d1f, metalness: 0.5, roughness: 0.42 });

  // bedspread: rust-brown diagonal stripes on cream (bands of constant x+y, as drawn), jersey weave normal
  const stripeTex = canvasTex(1024, 1024, (g, W, H) => {
    const img = g.createImageData(W, H);
    const P = W / 6; // 6 stripe periods per tile
    const rust = [98, 42, 10], cream = [238, 216, 182];
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const t = ((px + py) % P) / P, e = 0.012, R = 0.55;
      const dist = t < R ? Math.min(t, R - t) : -Math.min(t - R, 1 - t);
      const k = Math.min(1, Math.max(0, 0.5 + dist / (2 * e)));
      const weave = ((px % 4 < 2) ^ (py % 4 < 2)) ? 1.0 : 0.94;
      const n = 0.96 + 0.08 * Math.random();
      const i = (py * W + px) * 4;
      for (let c = 0; c < 3; c++) img.data[i + c] = Math.min(255, (rust[c] * k + cream[c] * (1 - k)) * weave * n);
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  const jerseyN = ctx.tex('assets/ph/cotton_jersey/nor.jpg', { repeat: 5 });
  const bedspreadMat = new THREE.MeshStandardMaterial({ map: stripeTex, normalMap: jerseyN, roughness: 0.9, side: THREE.DoubleSide });
  bedspreadMat.normalScale.set(1.1, 1.1);
  const linenN = ctx.tex('assets/ph/rough_linen/nor.jpg', { repeat: 3 });
  const sheetFold = new THREE.MeshPhysicalMaterial({ color: 0xf5f2ea, normalMap: linenN, roughness: 0.95, sheen: 0.5, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide });
  const duvetReverse = new THREE.MeshPhysicalMaterial({ color: 0xe8cba2, normalMap: linenN, roughness: 0.95, sheen: 0.5, sheenColor: new THREE.Color(0xfff4e6) });

  // wall tiles: 600x300 grey-beige matt, stack bond, 2 mm grout. Canvas = 2 x 4 tiles = 4 ft square.
  const TILE_REPEAT = m(4);
  const tileTone = [];
  for (let i = 0; i < 8; i++) tileTone.push(0.965 + 0.05 * rnd());
  const drawTiles = (bump) => (g, W, H) => {
    const tw = W / 2, th = H / 4, grout = 3;
    g.fillStyle = bump ? '#202020' : '#a9a094';
    g.fillRect(0, 0, W, H);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
      const k = tileTone[r * 2 + c];
      if (bump) g.fillStyle = '#f0f0f0';
      else g.fillStyle = `rgb(${Math.round(207 * k)},${Math.round(198 * k)},${Math.round(184 * k)})`;
      g.fillRect(c * tw + grout / 2, r * th + grout / 2, tw - grout, th - grout);
      if (!bump) {
        // soft stone-like mottling
        for (let s = 0; s < 260; s++) {
          const x = c * tw + grout + rnd() * (tw - 2 * grout), y = r * th + grout + rnd() * (th - 2 * grout);
          const rad = 6 + rnd() * 26;
          const gr = g.createRadialGradient(x, y, 0, x, y, rad);
          const a = 0.035 * rnd();
          gr.addColorStop(0, rnd() > 0.5 ? `rgba(255,250,240,${a})` : `rgba(120,105,90,${a})`);
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr;
          g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
      }
    }
  };
  const tileMap = canvasTex(1024, 1024, drawTiles(false));
  const tileBump = canvasTex(1024, 1024, drawTiles(true), { srgb: false });
  const wallTile = new THREE.MeshStandardMaterial({ map: tileMap, bumpMap: tileBump, bumpScale: 1.2, roughness: 0.62 });
  wallTile.userData.worldSize = TILE_REPEAT;

  // ================================================================= BEDROOM
  // ---- wardrobe on W wall: x 0.5–2.3, y 21–28, h 0–7.5
  {
    const X0 = 0.5, X1 = 2.25, Y0 = 21.0, Y1 = 28.0, TOP = 7.5, PL = 0.33;
    rb(shadowGap, X0, Y0, X1 - 0.12, Y1 - 0.05, 0, PL, 0.003);                 // recessed plinth
    rb(plumCarcass, X0, Y0, X1, Y1, PL, TOP, 0.004);                            // carcass
    rb(plumCarcass, X0, Y1 - 0.06, X1 + 0.06, Y1, 0, TOP, 0.004);               // finished end panel to the floor
    const n = 4, gap = 0.012, sw = (Y1 - 0.06 - Y0) / n, split = 6.25;
    for (let i = 0; i < n; i++) {
      const a = Y0 + i * sw + gap / 2, b = Y0 + (i + 1) * sw - gap / 2;
      rb(plum, X1, a, X1 + 0.06, b, PL + 0.02, split - gap / 2, 0.006);         // main shutter
      rb(plum, X1, a, X1 + 0.06, b, split + gap / 2, TOP - 0.02, 0.006);        // loft shutter
      // pulls: pairs meet in the middle of each 2-door section
      const handleY = i % 2 === 0 ? b - 0.12 : a + 0.12;
      const pull = new THREE.CylinderGeometry(0.008, 0.008, m(1.5), 12);
      put(pull, brass, X1 + 0.06 + 0.07, handleY, 3.2 + 0.75);
      for (const hh of [3.25, 4.65]) {
        const post = new THREE.CylinderGeometry(0.005, 0.005, m(0.07), 8);
        post.rotateZ(Math.PI / 2);
        put(post, brass, X1 + 0.06 + 0.035, handleY, hh);
      }
      const lp = new THREE.CylinderGeometry(0.006, 0.006, m(0.35), 10);
      lp.rotateX(Math.PI / 2);
      put(lp, brass, X1 + 0.06 + 0.03, i % 2 === 0 ? b - 0.3 : a + 0.3, split + 0.18);
    }
    ctx.collide({ x1: X0, y1: Y0, x2: X1 + 0.1, y2: Y1 });
  }

  // ---- soft cloth drape: a top rectangle (plan ft) whose cloth wraps over a rounded edge (radius r) and hangs D below `top`
  // on the sides (and the foot when `foot`). Corners use a superellipse so they round off; hanging part gets gentle folds.
  // UVs follow the unfolded cloth, so stripes run continuously over the edge like real fabric.
  function drape({ x0, x1, y0, y1, top, D, r, foot = true, puff = 0, quilt = 0, amp = 0.05, size = 1, res = 0.1, pe = 4, wrinkle = 0 }) {
    const E = (Math.PI * r) / 2 + D - r;
    const aMin = foot ? x0 - E : x0, aMax = x1, bMin = y0 - E, bMax = y1 + E;
    const na = Math.ceil((aMax - aMin) / res), nb = Math.ceil((bMax - bMin) / res);
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nb; j++) for (let i = 0; i <= na; i++) {
      const a = aMin + ((aMax - aMin) * i) / na, b = bMin + ((bMax - bMin) * j) / nb;
      const cx = Math.min(Math.max(a, x0), x1), cy = Math.min(Math.max(b, y0), y1);
      const dx = a - cx, dy = b - cy;
      let e = Math.pow(Math.abs(dx) ** pe + Math.abs(dy) ** pe, 1 / pe);
      // low-frequency creases (feet): shared by top and hanging parts so stripes pick up shading
      const W = wrinkle * (Math.sin(a * 2.3 + 1.7 * Math.sin(b * 1.1)) * Math.sin(b * 1.9 + 0.9 * Math.sin(a * 0.8)) + 0.6 * Math.sin((a - b) * 3.1 + 0.5));
      let X = cx, Y = cy, Hh = top;
      if (e > 1e-6) {
        const dl = Math.hypot(dx, dy), ux = dx / dl, uy = dy / dl;
        if (e > E) e = E;
        let hz, vz;
        if (e <= (Math.PI * r) / 2) { hz = r * Math.sin(e / r); vz = r * (1 - Math.cos(e / r)); }
        else { const Lh = e - (Math.PI * r) / 2; hz = r + 0.01 * Lh; vz = r + Lh; }
        const t = Math.min(1, Math.max(0, (vz - r) / Math.max(D - r, 1e-3)));
        hz += amp * t * (0.5 + 0.5 * Math.sin((2 * Math.PI * (a + b)) / 0.9)) + t * Math.abs(W) * 1.2;
        X = cx + ux * hz; Y = cy + uy * hz; Hh = top - vz + t * W * 1.5;
      }
      // puffy top: dome + quilting, fading out over the rounded edge
      const fu = ((cx - x0) / (x1 - x0)) * 2 - 1, fv = ((cy - y0) / (y1 - y0)) * 2 - 1;
      const fall = Math.max(0, 1 - e / r);
      Hh += fall * (puff * (1 - fu ** 4) * (1 - fv ** 4) + quilt * Math.abs(Math.sin((Math.PI * cx) / 1.2) * Math.sin((Math.PI * cy) / 1.2)) + W);
      pos.push(m(X), m(Hh), m(Y));
      uv.push(m(a) / size, -m(b) / size);
    }
    for (let j = 0; j < nb; j++) for (let i = 0; i < na; i++) {
      const k = j * (na + 1) + i;
      idx.push(k, k + na + 1, k + 1, k + 1, k + na + 1, k + na + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // hem path along the free edge (row j=0 -> column i=0 when foot -> row j=nb), for piping
    const hem = [];
    const pushV = (i, j) => { const k = (j * (na + 1) + i) * 3; const v = new THREE.Vector3(pos[k], pos[k + 1], pos[k + 2]); if (!hem.length || hem[hem.length - 1].distanceTo(v) > 0.004) hem.push(v); };
    for (let i = na; i >= 0; i--) pushV(i, 0);
    if (foot) for (let j = 1; j <= nb; j++) pushV(0, j);
    for (let i = foot ? 1 : 0; i <= na; i++) pushV(i, nb);
    g.userData.hem = hem;
    return g;
  }

  // ---- bed: headboard on E wall, foot to the W. Bed x 5.1-11.5, y 25.55-30.45
  const BX0 = 5.1, BX1 = 11.15, BY0 = 25.55, BY1 = 30.45, BYC = (BY0 + BY1) / 2;
  {
    rb(shadowGap, BX0 + 0.3, BY0 + 0.3, BX1 - 0.2, BY1 - 0.3, 0, 0.3, 0.003);   // recessed plinth
    rb(teak, BX0 + 0.04, BY0 + 0.04, BX1, BY1 - 0.04, 0.3, 1.12, 0.02, 4);      // platform base
    rb(sheet, BX0 + 0.1, BY0 + 0.09, BX1 - 0.03, BY1 - 0.09, 1.12, 1.84, 0.05, 5); // mattress in white sheet
    // headboard: teak frame + channel-tufted linen panel
    rb(teak, BX1, BY0 - 0.05, 11.5, BY1 + 0.05, 0, 3.9, 0.025, 4);
    const ch = 7, cw = (BY1 - BY0 - 0.2) / ch;
    for (let i = 0; i < ch; i++) {
      const a = BY0 + 0.1 + i * cw;
      rb(upholstery, BX1 - 0.16, a + 0.01, BX1, a + cw - 0.01, 1.7, 3.65, 0.035, 4);
    }
    // striped duvet: top x 5.2-10.3, hangs ~11" over the foot and both sides with rounded corners
    const mx0 = BX0 + 0.1, my0 = BY0 + 0.09, my1 = BY1 - 0.09;
    const dg = drape({ x0: mx0, x1: 10.3, y0: my0, y1: my1, top: 1.86, D: 0.72, r: 0.26, foot: true, puff: 0.1, quilt: 0.012, amp: 0.035, size: m(3.6), res: 0.07, pe: 2.6, wrinkle: 0.025 });
    add(new THREE.Mesh(dg, bedspreadMat));
    const piping = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(dg.userData.hem), dg.userData.hem.length * 2, m(0.018), 6, false);
    add(new THREE.Mesh(piping, bedspreadMat));
    // white top sheet folded back over the duvet across the head end (~1.2' deep), with a rolled cuff edge
    const fold = new THREE.Mesh(drape({ x0: 8.95, x1: 10.45, y0: my0 - 0.01, y1: my1 + 0.01, top: 2.04, D: 0.42, r: 0.17, foot: false, puff: 0.02, amp: 0.02, size: 0.4 }), sheetFold);
    add(fold);
    const cuff = new THREE.CylinderGeometry(m(0.07), m(0.07), m(my1 - my0 + 0.25), 20);
    cuff.rotateX(Math.PI / 2);
    put(cuff, sheetFold, 8.97, BYC, 1.99);
    // the plan's turned-back triangular flap (south side by the pillows): duvet corner folded back, cream underside up,
    // a thick soft slab lying on the sheet with a rolled striped crease along the diagonal
    {
      const P = [[8.97, my1 + 0.05], [10.0, my1 + 0.05], [10.0, 29.3]];
      const tri = new THREE.Shape();
      tri.moveTo(m(P[0][0]), m(P[0][1])); tri.lineTo(m(P[1][0]), m(P[1][1])); tri.lineTo(m(P[2][0]), m(P[2][1])); tri.closePath();
      const tg = new THREE.ExtrudeGeometry(tri, { depth: m(0.04), bevelEnabled: true, bevelThickness: m(0.025), bevelSize: m(0.035), bevelSegments: 4, curveSegments: 1 });
      tg.rotateX(Math.PI / 2);
      const tm = add(new THREE.Mesh(tg, duvetReverse));
      tm.position.y = m(2.11);
      const len = Math.hypot(P[2][0] - P[0][0], P[2][1] - P[0][1]);
      const crease = new THREE.CapsuleGeometry(m(0.05), m(len - 0.1), 6, 16);
      crease.rotateZ(Math.PI / 2);
      const cm = put(crease, bedspreadMat, (P[0][0] + P[2][0]) / 2, (P[0][1] + P[2][1]) / 2, 2.06);
      cm.rotation.y = -Math.atan2(P[2][1] - P[0][1], P[2][0] - P[0][0]);
    }
    // pillows (white), leaning on the headboard, and two rust accent cushions
    function pillow(w, d, t) {
      const g = new THREE.BoxGeometry(w, t, d, 18, 4, 14);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) / (w / 2), v = p.getZ(i) / (d / 2);
        const f = (1 - Math.pow(Math.abs(u), 4)) * (1 - Math.pow(Math.abs(v), 4));
        p.setY(i, p.getY(i) * (0.18 + 0.82 * Math.sqrt(Math.max(f, 0))));
        p.setX(i, p.getX(i) * (1 - 0.04 * (1 - Math.abs(v))));
      }
      g.computeVertexNormals();
      return g;
    }
    for (const yc of [BYC - 1.15, BYC + 1.15]) {
      const pg = pillow(m(2.2), m(1.45), m(0.55));
      const p = put(pg, linenWhite, 10.45, yc, 2.2);
      p.rotation.order = 'YXZ';
      p.rotation.y = Math.PI / 2;
      p.rotation.x = -0.32; // lean back onto the headboard
    }
    ctx.collide({ x1: BX0 - 0.2, y1: BY0 - 0.15, x2: 11.5, y2: BY1 + 0.15 });
  }

  // ---- rug under the foot half of the bed (plan's brown outline): low-pile rust-brown, darker border + cream pinstripe
  {
    const RX0 = 4.2, RX1 = 8.5, RY0 = 24.6, RY1 = 31.4;
    const rugTex = canvasTex(640, 1012, (g, W, H) => {
      g.fillStyle = '#7a3f22'; g.fillRect(0, 0, W, H);
      const img = g.getImageData(0, 0, W, H);
      for (let i = 0; i < img.data.length; i += 4) { const n = 0.88 + 0.2 * Math.random(); img.data[i] *= n; img.data[i + 1] *= n; img.data[i + 2] *= n; }
      g.putImageData(img, 0, 0);
      const bw = 46;
      g.strokeStyle = 'rgba(70,32,18,0.85)'; g.lineWidth = bw; g.strokeRect(bw / 2, bw / 2, W - bw, H - bw);
      g.strokeStyle = 'rgba(232,212,180,0.8)'; g.lineWidth = 4; g.strokeRect(bw + 10, bw + 10, W - 2 * bw - 20, H - 2 * bw - 20);
      for (let i = 0; i < 4000; i++) { g.fillStyle = Math.random() > 0.5 ? 'rgba(160,90,50,0.25)' : 'rgba(60,28,14,0.25)'; g.fillRect(Math.random() * W, Math.random() * H, 1.5, 4); }
    });
    const rugMat = new THREE.MeshStandardMaterial({ map: rugTex, normalMap: ctx.tex('assets/ph/rough_linen/nor.jpg', { repeat: 4 }), roughness: 1 });
    rugMat.normalScale.set(1.4, 1.4);
    const rg = new RoundedBoxGeometry(m(RX1 - RX0), m(0.025), m(RY1 - RY0), 2, 0.003);
    const rug = put(rg, rugMat, (RX0 + RX1) / 2, (RY0 + RY1) / 2, 0.0125);
    rug.castShadow = false;
  }

  // ---- nightstands + round drum lamps (shade top shows a 3-spoke spider, like the plan symbol)
  const nightstands = [[24.0, 25.5], [30.5, 32.0]];
  for (const [y0, y1] of nightstands) {
    const x0 = 9.98, x1 = 11.48, TOP = 1.95, yc = (y0 + y1) / 2;
    rb(teak, x0, y0, x1, y1, 0.35, TOP, 0.015, 3);
    // legs
    for (const [lx, ly] of [[x0 + 0.12, y0 + 0.12], [x0 + 0.12, y1 - 0.12], [x1 - 0.12, y0 + 0.12], [x1 - 0.12, y1 - 0.12]]) {
      const lg = new THREE.CylinderGeometry(0.014, 0.01, m(0.35), 12);
      lg.translate(0, m(0.35) / 2, 0);
      put(lg, teakDark, lx, ly, 0);
    }
    // two drawer fronts (darker reveal behind) + brass knob pulls
    rb(shadowGap, x0 - 0.005, y0 + 0.06, x0 + 0.02, y1 - 0.06, 0.45, TOP - 0.1, 0.002);
    for (const [a, b] of [[0.47, 1.12], [1.15, TOP - 0.12]]) {
      rb(teak, x0 - 0.04, y0 + 0.07, x0 + 0.01, y1 - 0.07, a, b, 0.01, 3);
      const kb = new THREE.CylinderGeometry(0.008, 0.008, m(0.4), 10);
      kb.rotateX(Math.PI / 2);
      put(kb, brass, x0 - 0.075, yc, (a + b) / 2 + 0.12);
    }
    ctx.collide({ x1: x0, y1: y0, x2: x1, y2: y1 });

    // lamp: ceramic gourd base, brass stem, linen drum shade
    const lx = 10.85, ly = yc;
    const prof = [];
    const pts = [[0.0, 0], [0.06, 0], [0.075, 0.02], [0.085, 0.07], [0.08, 0.13], [0.05, 0.19], [0.02, 0.23], [0.016, 0.25], [0, 0.25]];
    for (const [r, h] of pts) prof.push(new THREE.Vector2(r, h));
    const baseG = new THREE.LatheGeometry(prof, 40);
    put(baseG, new THREE.MeshPhysicalMaterial({ color: 0x4a6b6a, roughness: 0.25, clearcoat: 0.8 }), lx, ly, TOP);
    const stemG = new THREE.CylinderGeometry(0.006, 0.006, 0.16, 10);
    stemG.translate(0, 0.08, 0);
    put(stemG, brass, lx, ly, TOP + 0.25 / 0.3048);
    const shadeH = 0.21, shadeR = 0.15, shadeBottom = TOP + (0.25 + 0.06) / 0.3048;
    const shadeG = new THREE.CylinderGeometry(shadeR, shadeR, shadeH, 48, 1, true);
    shadeG.translate(0, shadeH / 2, 0);
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0xf4ecdc, roughness: 1, side: THREE.DoubleSide, emissive: 0xffc98a, emissiveIntensity: 0.55 });
    const shade = put(shadeG, shadeMat, lx, ly, shadeBottom);
    shade.castShadow = false;
    // spider fitting: ring + 3 spokes at the shade top
    const ringG = new THREE.TorusGeometry(shadeR, 0.003, 6, 48);
    ringG.rotateX(Math.PI / 2);
    put(ringG, brass, lx, ly, shadeBottom + shadeH / 0.3048);
    put(ringG.clone(), brass, lx, ly, shadeBottom);
    for (let k = 0; k < 3; k++) {
      const sg = new THREE.CylinderGeometry(0.0025, 0.0025, shadeR, 6);
      sg.rotateZ(Math.PI / 2);
      sg.translate(shadeR / 2, 0, 0);
      const s = put(sg, brass, lx, ly, shadeBottom + (shadeH - 0.01) / 0.3048);
      s.rotation.y = (k * 2 * Math.PI) / 3 + Math.PI / 2;
    }
    const hubG = new THREE.CylinderGeometry(0.018, 0.018, 0.015, 16);
    put(hubG, brass, lx, ly, shadeBottom + (shadeH - 0.018) / 0.3048);
    const bulbG = new THREE.SphereGeometry(0.03, 16, 12);
    const bulb = put(bulbG, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 3 }), lx, ly, shadeBottom + 0.2);
    bulb.castShadow = false;
    const pl = new THREE.PointLight(0xffc98a, 0.9, m(9), 2);
    pl.position.copy(ctx.v3(lx, ly, shadeBottom + 0.35));
    ctx.light(pl);
  }

  // nightstand decor: books + alarm clock (N stand), books + framed photo (S stand)
  const bookMats = [0x2d4a5a, 0xb7a17a, 0x7a3b2a, 0xe6dfd0].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
  const pages = new THREE.MeshStandardMaterial({ color: 0xf2ecdc, roughness: 0.9 });
  function books(x, y, h, n) {
    let z = h;
    for (let i = 0; i < n; i++) {
      const t = 0.09 + 0.04 * rnd(), w = 0.55 + 0.15 * rnd(), d = 0.75 + 0.12 * rnd();
      const g = new THREE.BoxGeometry(m(w), m(t), m(d));
      const b = put(g, [bookMats[i % 4], bookMats[i % 4], bookMats[i % 4], bookMats[i % 4], pages, pages], x, y, z + t / 2);
      b.position.y = m(z + t / 2);
      b.rotation.y = (rnd() - 0.5) * 0.25;
      z += t;
    }
  }
  books(10.32, 24.45, 1.95, 3);
  books(10.32, 31.55, 1.95, 2);
  {
    const clock = ctx.fit(await ctx.model('assets/ph/alarm_clock_01/alarm_clock_01_1k.gltf'), { h: 0.38 });
    ctx.place(clock, { x: 10.3, y: 25.1, h: 1.95, face: 'W' });
    clock.rotation.y += 0.35;
    const photo = ctx.fit(await ctx.model('assets/ph/standing_picture_frame_02/standing_picture_frame_02_1k.gltf'), { h: 0.62 });
    ctx.place(photo, { x: 10.35, y: 30.85, h: 1.95, face: 'W' });
    photo.rotation.y -= 0.3;
  }

  // ---- art over the headboard (procedural warm abstract, oak float frame)
  {
    const art = canvasTex(1024, 768, (g, W, H) => {
      g.fillStyle = '#efe4d2'; g.fillRect(0, 0, W, H);
      // paper grain
      for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(90,70,50,${0.03 * Math.random()})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
      g.fillStyle = '#b5552b'; g.beginPath(); g.moveTo(170, 640); g.lineTo(170, 360); g.arc(330, 360, 160, Math.PI, 0); g.lineTo(490, 640); g.closePath(); g.fill();
      g.fillStyle = '#d9a35a'; g.beginPath(); g.arc(640, 300, 120, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5d6b5a'; g.beginPath(); g.moveTo(560, 640); g.quadraticCurveTo(720, 420, 880, 640); g.closePath(); g.fill();
      g.strokeStyle = '#2b2622'; g.lineWidth = 6; g.beginPath(); g.moveTo(120, 640); g.lineTo(920, 640); g.stroke();
      g.fillStyle = '#8a3f22'; g.beginPath(); g.arc(330, 640, 70, Math.PI, 0); g.fill();
    });
    const ax = 11.47, ay0 = 26.4, ay1 = 29.6, ah0 = 4.55, ah1 = 6.95;
    rb(teakDark, ax - 0.08, ay0, ax, ay1, ah0, ah1, 0.006);
    const cg = new THREE.PlaneGeometry(m(ay1 - ay0 - 0.16), m(ah1 - ah0 - 0.16));
    const canvas = put(cg, new THREE.MeshStandardMaterial({ map: art, roughness: 0.9 }), ax - 0.085, (ay0 + ay1) / 2, (ah0 + ah1) / 2);
    canvas.rotation.y = -Math.PI / 2;
    canvas.castShadow = false;
  }

  // ---- split AC on the N wall, above the toilet-door wall section (hidden in top view)
  {
    const ac = rb(whitePlastic, 2.8, 21.0, 5.6, 21.75, 8.1, 9.05, 0.04, 4);
    ac.userData.hideInTop = true;
    const vent = rb(new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.5 }), 2.95, 21.6, 5.45, 21.76, 8.13, 8.27, 0.01);
    vent.userData.hideInTop = true;
    const led = rb(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x3aa0ff, emissiveIntensity: 0.6 }), 5.1, 21.75, 5.3, 21.76, 8.6, 8.66, 0.002);
    led.userData.hideInTop = true;
  }

  // ---- flush LED ceiling light
  {
    const cx = 6.0, cy = 27.5;
    const body = new THREE.CylinderGeometry(m(0.9), m(0.95), m(0.18), 64);
    const b = put(body, whitePlastic, cx, cy, 10 - 0.09);
    b.userData.hideInTop = true;
    const diff = new THREE.CircleGeometry(m(0.82), 64);
    diff.rotateX(Math.PI / 2);
    const d = put(diff, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3e2, emissiveIntensity: 1.6 }), cx, cy, 10 - 0.181);
    d.userData.hideInTop = true;
    d.castShadow = false;
  }
  const fill = ctx.scene.getObjectByName('fill-bed2');
  if (fill) { fill.position.copy(ctx.v3(6.0, 27.5, 9.0)); fill.intensity *= 0.9; }

  // ---- sheer curtains at the balcony slider (gathered at both ends) + black rod
  {
    const rodY = 33.82, rodH = 8.15;
    const rod = new THREE.CylinderGeometry(0.012, 0.012, m(9.2), 16);
    rod.rotateZ(Math.PI / 2);
    put(rod, blackMetal, 6.25, rodY, rodH);
    for (const bx of [1.75, 10.75]) {
      const br = rb(blackMetal, bx - 0.04, rodY, bx + 0.04, 34.0, rodH - 0.08, rodH + 0.06, 0.004);
      br.castShadow = false;
      const fin = new THREE.SphereGeometry(0.022, 12, 10);
      put(fin, blackMetal, bx < 5 ? 1.65 : 10.85, rodY, rodH);
    }
    const sheer = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.82 });
    const curtain = (xa, xb) => {
      const w = m(xb - xa), hgt = m(rodH - 0.08);
      const g = new THREE.PlaneGeometry(w, hgt, 80, 24);
      const p = g.attributes.position;
      const folds = Math.round((xb - xa) * 5.5);
      for (let i = 0; i < p.count; i++) {
        const u = (p.getX(i) + w / 2) / w, v = (p.getY(i) + hgt / 2) / hgt;
        const amp = 0.03 + 0.012 * (1 - v);
        p.setZ(i, Math.sin(u * folds * Math.PI * 2) * amp + Math.sin(u * 7.3 + v * 2) * 0.006);
      }
      g.computeVertexNormals();
      g.translate(0, hgt / 2 + m(0.04), 0);
      const c = put(g, sheer, (xa + xb) / 2, rodY - 0.04, 0);
      c.castShadow = false;
      return c;
    };
    curtain(1.8, 3.3);
    curtain(9.2, 10.7);
  }

  // ================================================================= TOILET C
  const T = { x1: 0.5, y1: 16.5, x2: 10.5, y2: 20.5 }, TH = 7.0, tt = 0.03;
  {
    // N wall (y 16.5)
    rb(wallTile, T.x1, T.y1, T.x2, T.y1 + tt, 0, TH, 0.002, 1);
    // S wall (y 20.5) either side of the door (x 6.5–9.0)
    rb(wallTile, T.x1, T.y2 - tt, 6.5, T.y2, 0, TH, 0.002, 1);
    rb(wallTile, 9.0, T.y2 - tt, T.x2, T.y2, 0, TH, 0.002, 1);
    // E wall (x 10.5)
    rb(wallTile, T.x2 - tt, T.y1, T.x2, T.y2, 0, TH, 0.002, 1);
    // W wall (x 0.5) around the ventilator (y 17.5–19, sill 6)
    rb(wallTile, T.x1, T.y1, T.x1 + tt, 17.5, 0, TH, 0.002, 1);
    rb(wallTile, T.x1, 19.0, T.x1 + tt, T.y2, 0, TH, 0.002, 1);
    rb(wallTile, T.x1, 17.5, T.x1 + tt, 19.0, 0, 6.0, 0.002, 1);
    // brushed trim along the top edge of the tiling
    const trim = new THREE.MeshStandardMaterial({ color: 0xbdb7ae, metalness: 1, roughness: 0.35 });
    rb(trim, T.x1, T.y1, T.x2, T.y1 + tt + 0.015, TH, TH + 0.025, 0.002, 1);
    rb(trim, T.x1, T.y2 - tt - 0.015, 6.5, T.y2, TH, TH + 0.025, 0.002, 1);
    rb(trim, 9.0, T.y2 - tt - 0.015, T.x2, T.y2, TH, TH + 0.025, 0.002, 1);
    rb(trim, T.x2 - tt - 0.015, T.y1, T.x2, T.y2, TH, TH + 0.025, 0.002, 1);
    rb(trim, T.x1, T.y1, T.x1 + tt + 0.015, 17.5, TH, TH + 0.025, 0.002, 1);
    rb(trim, T.x1, 19.0, T.x1 + tt + 0.015, T.y2, TH, TH + 0.025, 0.002, 1);
    // tiled reveal under the ventilator
    rb(wallTile, T.x1 - 0.5, 17.5, T.x1 + tt, 19.0, 5.97, 6.0, 0.002, 1);
  }

  // ---- vanity: full-depth stone counter x 9.0–10.5 (the plan's line at x≈9), floating teak drawers, vessel basin at y 18.5
  {
    const cx0 = 9.0, cx1 = T.x2 - tt, top = 2.75;
    rb(stone, cx0 - 0.04, T.y1 + tt, cx1, T.y2 - tt, top - 0.14, top, 0.01, 3);
    // floating cabinet, 3 oak drawer fronts with gaps + brass bar pulls
    rb(teakDark, cx0 + 0.12, T.y1 + tt, cx1, T.y2 - tt, 1.15, top - 0.14, 0.004);
    const yA = T.y1 + tt + 0.02, yB = T.y2 - tt - 0.02, nD = 3, dw = (yB - yA) / nD;
    for (let k = 0; k < nD; k++) {
      const a = yA + k * dw + 0.012, b = yA + (k + 1) * dw - 0.012;
      rb(teak, cx0 + 0.07, a, cx0 + 0.13, b, 1.18, top - 0.17, 0.008, 3);
      const pull = new THREE.CylinderGeometry(0.006, 0.006, m(0.6), 10);
      pull.rotateX(Math.PI / 2);
      put(pull, brass, cx0 + 0.03, (a + b) / 2, top - 0.42);
    }
    const glow = rb(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe2b8, emissiveIntensity: 1.3 }), cx0 + 0.2, T.y1 + 0.1, cx0 + 0.3, T.y2 - 0.1, 1.14, 1.15, 0.001);
    glow.castShadow = false;
    ctx.collide({ x1: cx0 - 0.05, y1: T.y1, x2: T.x2, y2: T.y2 });
    // the plan's partition at x 9.0: clear glass screen with a slim black frame, N wall -> y 17.65, from the counter up to 7'
    // (sets the basin alcove off from the WC side; the basin stays reachable from the passage by the door)
    {
      const gy0 = T.y1 + tt, gy1 = 17.65, gh0 = top, gh1 = 7.0;
      const pane = put(new THREE.BoxGeometry(m(0.025), m(gh1 - gh0), m(gy1 - gy0)), clearGlass, cx0 + 0.02, (gy0 + gy1) / 2, (gh0 + gh1) / 2);
      pane.position.y = m((gh0 + gh1) / 2);
      pane.castShadow = false; pane.renderOrder = 2;
      rb(fitting, cx0 - 0.01, gy0, cx0 + 0.05, gy1 + 0.02, gh1 - 0.02, gh1 + 0.03, 0.004, 2);      // top rail
      rb(fitting, cx0 - 0.01, gy1 - 0.02, cx0 + 0.05, gy1 + 0.02, gh0, gh1, 0.004, 2);            // free edge
      rb(fitting, cx0 - 0.01, gy0, cx0 + 0.05, gy0 + 0.04, gh0, gh1, 0.004, 2);                   // wall channel
      rb(fitting, cx0 - 0.015, gy0, cx0 + 0.055, gy1 + 0.02, gh0, gh0 + 0.06, 0.004, 2);          // base channel
    }

    // vessel basin
    const by = 18.6, bx = 9.72;
    const pts = [];
    const outer = [[0.0, 0], [0.09, 0], [0.15, 0.03], [0.185, 0.08], [0.2, 0.13], [0.19, 0.13], [0.175, 0.085], [0.14, 0.04], [0.07, 0.022], [0.0, 0.022]];
    for (const [r, h] of outer) pts.push(new THREE.Vector2(r, h));
    put(new THREE.LatheGeometry(pts, 56), ceramic, bx, by, top);
    const drain = new THREE.CylinderGeometry(0.022, 0.022, 0.004, 24);
    put(drain, L.steel, bx, by, top + 0.075);
    // tall vessel mixer at the back
    const fx = 10.25;
    const body = new THREE.CylinderGeometry(0.018, 0.022, 0.26, 24);
    body.translate(0, 0.13, 0);
    put(body, fitting, fx, by, top);
    const spout = new THREE.CylinderGeometry(0.011, 0.011, 0.16, 16);
    spout.rotateZ(Math.PI / 2);
    spout.translate(-0.08, 0, 0);
    put(spout, fitting, fx, by, top + 0.24 / 0.3048);
    const lever = new THREE.BoxGeometry(0.012, 0.012, 0.08);
    lever.translate(0, 0, 0.04);
    const lv = put(lever, fitting, fx, by, top + 0.27 / 0.3048);
    lv.rotation.x = -0.3;
    // soap dispenser + tumbler with toothbrushes + rolled towels + small succulent
    const amber = new THREE.MeshPhysicalMaterial({ color: 0x7a4a1e, roughness: 0.1, transmission: 0.3, transparent: true, opacity: 0.9 });
    const disp = new THREE.CylinderGeometry(0.03, 0.03, 0.14, 24); disp.translate(0, 0.07, 0);
    put(disp, amber, 10.15, 17.1, top);
    const pump = new THREE.CylinderGeometry(0.008, 0.012, 0.05, 12); pump.translate(0, 0.165, 0);
    put(pump, blackMetal, 10.15, 17.1, top);
    const tumb = new THREE.CylinderGeometry(0.035, 0.03, 0.1, 24, 1, true); tumb.translate(0, 0.05, 0);
    put(tumb, new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.6, side: THREE.DoubleSide }), 10.15, 17.3, top);
    for (const [c, a] of [[0x3a7ca5, 0.15], [0xe2e2e2, -0.18]]) {
      const tb = new THREE.CylinderGeometry(0.005, 0.005, 0.18, 8); tb.translate(0, 0.09, 0);
      const t = put(tb, new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }), 10.15, 17.3, top + 0.02);
      t.rotation.z = a;
    }
    const towelMat = new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 1 });
    for (const [yy, hh] of [[19.65, 0], [19.93, 0], [19.79, 0.22]]) {
      const tg = new THREE.CylinderGeometry(0.05, 0.05, m(0.8), 24);
      tg.rotateZ(Math.PI / 2);
      put(tg, towelMat, 9.55, yy, top + 0.16 + hh);
    }
    const succ = ctx.fit(await ctx.model('assets/ph/potted_plant_04/potted_plant_04_1k.gltf'), { h: 0.55 });
    ctx.place(succ, { x: 10.15, y: 20.2, h: top, face: 'W' });

    // mirror on the E wall over the basin, with warm backlight halo
    const my0 = 17.6, my1 = 19.6, mh0 = 4.1, mh1 = 6.6;
    // backlight: glowing strip behind the mirror edge + soft wash on the tiles around it
    const halo = rb(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe6c4, emissiveIntensity: 3.0 }), cx1 - 0.05, my0 - 0.09, cx1 - 0.03, my1 + 0.09, mh0 - 0.09, mh1 + 0.09, 0.02);
    halo.castShadow = false;
    const washTex = canvasTex(256, 256, (g, W, H) => {
      const gr = g.createRadialGradient(W / 2, H / 2, W * 0.28, W / 2, H / 2, W / 2);
      gr.addColorStop(0, 'rgba(255,226,180,0.75)'); gr.addColorStop(1, 'rgba(255,226,180,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    });
    const wash = put(new THREE.PlaneGeometry(m(my1 - my0 + 1.0), m(mh1 - mh0 + 1.0)), new THREE.MeshBasicMaterial({ map: washTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }), cx1 - 0.005, (my0 + my1) / 2, (mh0 + mh1) / 2 - 0.5);
    wash.rotation.y = -Math.PI / 2;
    wash.castShadow = false;
    rb(blackMetal, cx1 - 0.09, my0 + 0.12, cx1 - 0.05, my1 - 0.12, mh0 + 0.12, mh1 - 0.12, 0.004);
    const mirror = new Reflector(new THREE.PlaneGeometry(m(my1 - my0), m(mh1 - mh0)), {
      textureWidth: 768, textureHeight: 900, color: 0xd0d0d0, clipBias: 0.003,
    });
    mirror.position.copy(ctx.v3(cx1 - 0.095, (my0 + my1) / 2, (mh0 + mh1) / 2));
    mirror.rotation.y = -Math.PI / 2;
    group.add(mirror);
  }

  // ---- wall-hung WC on the N wall, centred x≈4.6, facing S
  {
    const wx = 4.6, wy = T.y1 + tt;
    const g = new THREE.Group();
    // bowl: oval lathe
    const bp = [[0.0, 0.0], [0.1, 0.0], [0.15, 0.04], [0.175, 0.1], [0.185, 0.15], [0.18, 0.155], [0.0, 0.155]];
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(bp.map(([r, h]) => new THREE.Vector2(r, h)), 48), ceramic);
    bowl.scale.set(1, 1, 1.3);
    bowl.position.set(0, 0.255, 0.31);
    g.add(bowl);
    const back = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.25, 0.22, 4, 0.05), ceramic);
    back.position.set(0, 0.3, 0.11);
    g.add(back);
    // seat + closed lid (soft white)
    const seatMat = new THREE.MeshPhysicalMaterial({ color: 0xfafaf8, roughness: 0.2, clearcoat: 0.6 });
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.183, 0.183, 0.02, 48), seatMat);
    seat.scale.set(1, 1, 1.3); seat.position.set(0, 0.42, 0.31); g.add(seat);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.18, 48, 12, 0, Math.PI * 2, 0, Math.PI / 2), seatMat);
    lid.scale.set(1, 0.08, 1.3); lid.position.set(0, 0.43, 0.31); g.add(lid);
    for (const s of [-1, 1]) {
      const hg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 16), fitting);
      hg.rotation.z = Math.PI / 2; hg.position.set(s * 0.09, 0.44, 0.1); g.add(hg);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    g.position.copy(ctx.v3(wx, wy, 0));
    group.add(g);
    // flush plate
    rb(whitePlastic, wx - 0.4, wy, wx + 0.4, wy + 0.04, 3.05, 3.55, 0.006, 3);
    rb(fitting, wx - 0.33, wy + 0.04, wx - 0.02, wy + 0.05, 3.12, 3.48, 0.004, 2);
    rb(fitting, wx + 0.02, wy + 0.04, wx + 0.33, wy + 0.05, 3.12, 3.48, 0.004, 2);
    ctx.collide({ x1: wx - 0.65, y1: T.y1, x2: wx + 0.65, y2: T.y1 + 1.85 });
    // health faucet (hand spray) to the W of the WC, and a paper holder to the E
    rb(fitting, 3.6, wy, 3.72, wy + 0.08, 1.9, 2.0, 0.01, 2);
    const hose = new THREE.TorusGeometry(0.06, 0.006, 8, 32, Math.PI * 1.4);
    const hs = put(hose, fitting, 3.66, wy + 0.06, 1.55);
    hs.rotation.y = Math.PI / 2; hs.rotation.x = 0.3;
    const spray = new THREE.CylinderGeometry(0.016, 0.02, 0.13, 16);
    const sp = put(spray, fitting, 3.66, wy + 0.13, 1.98);
    sp.rotation.x = 0.4;
    const roll = new THREE.CylinderGeometry(0.055, 0.055, 0.1, 24);
    roll.rotateZ(Math.PI / 2);
    put(roll, new THREE.MeshStandardMaterial({ color: 0xfbfbf8, roughness: 0.95 }), 5.65, wy + 0.24, 2.35);
    rb(fitting, 5.48, wy, 5.82, wy + 0.05, 2.55, 2.62, 0.008, 2);
  }

  // ---- shower at the W end (x 0.5–3.2) under the ventilator: fixed glass screen, ceiling rain head, wall mixer, linear drain
  {
    const sx = 3.2;
    const gpane = new THREE.Mesh(new THREE.BoxGeometry(m(0.03), m(6.6), m(2.9)), clearGlass);
    // green-grey visible glass edges (free vertical edge + top edge)
    rb(glassEdge, sx - 0.016, T.y1 + tt + 2.885, sx + 0.016, T.y1 + tt + 2.9, 0.1, 6.68, 0.002, 1);
    rb(glassEdge, sx - 0.016, T.y1 + tt + 0.06, sx + 0.016, T.y1 + tt + 2.9, 6.665, 6.68, 0.002, 1);
    gpane.position.copy(ctx.v3(sx, T.y1 + tt + 1.45, 0.08 + 3.3));
    gpane.renderOrder = 2;
    group.add(gpane);
    rb(fitting, sx - 0.04, T.y1 + tt, sx + 0.04, T.y1 + tt + 0.06, 0.05, 6.68, 0.006, 2);      // wall profile
    rb(fitting, sx - 0.035, T.y1 + tt, sx + 0.035, T.y1 + tt + 2.9, 0.0, 0.08, 0.004, 2);       // floor channel
    const bar = new THREE.CylinderGeometry(0.009, 0.009, m(2.7), 12);
    bar.rotateZ(Math.PI / 2);
    put(bar, fitting, sx - 1.35, T.y1 + tt + 2.85, 6.55);                                           // stabiliser bar to W wall
    rb(L.steel, 0.75, 20.1, 3.0, 20.25, 0.0, 0.012, 0.002, 1);                                       // linear drain
    // rain shower from the ceiling
    const arm = new THREE.CylinderGeometry(0.011, 0.011, m(2.4), 12);
    arm.translate(0, -m(1.2), 0);
    const a = put(arm, fitting, 1.8, 18.6, 10);
    a.userData.hideInTop = true;
    const head = rb(fitting, 1.8 - 0.42, 18.6 - 0.42, 1.8 + 0.42, 18.6 + 0.42, 7.55, 7.6, 0.01, 2);
    head.userData.hideInTop = true;
    // thermostatic mixer + hand shower on the W wall below the ventilator
    rb(fitting, T.x1 + tt, 19.6, T.x1 + tt + 0.05, 20.15, 3.4, 3.95, 0.02, 3);
    for (const hz of [3.55, 3.8]) {
      const kn = new THREE.CylinderGeometry(0.02, 0.02, 0.03, 20);
      kn.rotateZ(Math.PI / 2);
      put(kn, fitting, T.x1 + tt + 0.08, 19.88, hz);
    }
    const rail = new THREE.CylinderGeometry(0.01, 0.01, m(2.2), 12);
    put(rail, fitting, T.x1 + tt + 0.08, 19.88, 5.0);
    const hsh = new THREE.CylinderGeometry(0.035, 0.016, 0.24, 20);
    const h = put(hsh, fitting, T.x1 + tt + 0.12, 19.88, 5.6);
    h.rotation.z = 0.35;
    // a folded towel on a bar on the S wall, between WC and shower
    {
      const wy = T.y2 - tt, by2 = wy - 0.22, bh = 4.5;
      const barG = new THREE.CylinderGeometry(m(0.035), m(0.035), m(2.0), 16);
      barG.rotateZ(Math.PI / 2);
      put(barG, fitting, 4.5, by2, bh);
      for (const px of [3.6, 5.4]) {
        const post = new THREE.CylinderGeometry(m(0.04), m(0.04), m(0.22), 12);
        post.rotateX(Math.PI / 2);
        put(post, fitting, px, wy - 0.11, bh);
        rb(fitting, px - 0.07, wy - 0.02, px + 0.07, wy, bh - 0.07, bh + 0.07, 0.01, 2);
      }
      // towel folded in thirds and hung over the bar: front + back panels joined by a soft roll over the bar
      const terry = ctx.pbr('rough_linen', { size: 0.1, noMap: true, color: 0x9c6a52, roughness: 1, normalScale: 2.5, ao: false });
      const tw0 = 3.7, tw1 = 5.3;
      rb(terry, tw0, by2 - 0.085, tw1, by2 - 0.035, 2.0, bh, 0.012, 3);        // back panel (wall side)
      rb(terry, tw0, by2 + 0.035, tw1, by2 + 0.085, 2.3, bh, 0.012, 3);        // front panel, slightly shorter
      const roll = new THREE.CylinderGeometry(m(0.085), m(0.085), m(tw1 - tw0), 20, 1, false, 0, Math.PI);
      roll.rotateZ(Math.PI / 2);
      const rm = put(roll, terry, (tw0 + tw1) / 2, by2, bh);
      for (const hh of [3.55, 3.62]) rb(new THREE.MeshStandardMaterial({ color: 0xe8d9c4, roughness: 1 }), tw0 + 0.02, by2 + 0.084, tw1 - 0.02, by2 + 0.09, hh - 0.9, hh - 0.87, 0.002, 1);  // woven border band
    }
    ctx.collide({ x1: T.x1, y1: T.y1, x2: sx + 0.05, y2: T.y1 + 3.0 });
  }
  // bath mat on the dry side of the glass partition, in front of the vanity
  rb(ctx.pbr('rough_linen', { size: 0.12, noMap: true, color: 0xcabda8, roughness: 1, normalScale: 2.2, ao: false }), 7.55, 17.9, 8.85, 19.4, 0.0, 0.06, 0.025, 4);
  // bath mat outside the shower
  rb(ctx.pbr('rough_linen', { size: 0.12, noMap: true, color: 0xcabda8, roughness: 1, normalScale: 2.2, ao: false }), 3.45, 18.95, 5.25, 20.05, 0.0, 0.07, 0.025, 4);

  // ================================================================= BALCONY
  for (const [x, y] of [[1.2, 36.1], [10.7, 36.1]]) {
    const p = ctx.fit(await ctx.model('assets/ph/potted_plant_01/potted_plant_01_1k.gltf'), { w: 1.8, d: 1.8, h: 3.0 });
    ctx.place(p, { x, y, h: -0.13, face: x < 5 ? 'E' : 'W' });
    ctx.collide({ x1: x - 0.8, y1: y - 0.8, x2: x + 0.8, y2: y + 0.8 });
  }
}
