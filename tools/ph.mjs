// Poly Haven (CC0) fetcher.
//   node tools/ph.mjs list <textures|models|hdris> [category] [search]
//   node tools/ph.mjs get <id> [res=1k]        -> public/assets/ph/<id>/...
// Textures land as diff.jpg / nor.jpg / rough.jpg / ao.jpg (+ arm.jpg, disp.jpg when present).
// Models land as <id>.gltf + its bin + textures (paths preserved). HDRIs as <id>.hdr.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const out = (...p) => path.join(root, 'public', 'assets', 'ph', ...p);
const api = (u) => fetch('https://api.polyhaven.com' + u, { headers: { 'User-Agent': 'house3d-builder' } }).then((r) => {
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.json();
});

async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const r = await fetch(url, { headers: { 'User-Agent': 'house3d-builder' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

const [cmd, a, b, c] = process.argv.slice(2);

if (cmd === 'list') {
  const assets = await api(`/assets?t=${a}${b ? `&c=${encodeURIComponent(b)}` : ''}`);
  for (const [id, v] of Object.entries(assets)) {
    const line = `${id} | ${v.name} | ${(v.categories || []).join(',')} | ${(v.tags || []).slice(0, 8).join(',')}`;
    if (!c || line.toLowerCase().includes(c.toLowerCase())) console.log(line);
  }
} else if (cmd === 'get') {
  const id = a, res = b || '1k';
  const info = await api(`/info/${id}`);
  const files = await api(`/files/${id}`);
  if (info.type === 0) {
    const hdr = files.hdri[res]?.hdr || files.hdri['1k'].hdr;
    await download(hdr.url, out(id, `${id}.hdr`));
  } else if (info.type === 1) {
    const map = { Diffuse: 'diff', nor_gl: 'nor', Rough: 'rough', AO: 'ao', arm: 'arm', Displacement: 'disp' };
    for (const [k, name] of Object.entries(map)) {
      const f = files[k]?.[res]?.jpg || files[k]?.[res]?.png;
      if (f) await download(f.url, out(id, `${name}.${f.url.endsWith('.png') ? 'png' : 'jpg'}`));
    }
  } else {
    const g = files.gltf[res]?.gltf || files.gltf['1k'].gltf;
    await download(g.url, out(id, path.basename(new URL(g.url).pathname)));
    for (const [rel, f] of Object.entries(g.include || {})) await download(f.url, out(id, rel));
    const { fixDir } = await import('./fix_bin.mjs');
    fixDir(out(id)); // .bin -> .buf (Chrome here never finishes .bin URLs)
  }
  console.log('ok', id, '->', out(id));
} else {
  console.log('usage: list <textures|models|hdris> [category] [search] | get <id> [res]');
}
