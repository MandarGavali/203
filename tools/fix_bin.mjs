// Renames glTF buffers *.bin -> *.buf and rewrites the .gltf uris.
// Chrome on this machine stalls forever on any URL ending in .bin (something filters that extension), so no .bin is ever served.
//   node tools/fix_bin.mjs [dir=public/assets]
import fs from 'node:fs';
import path from 'node:path';

export function fixDir(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { n += fixDir(p); continue; }
    if (!e.name.endsWith('.gltf')) continue;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    let changed = false;
    for (const b of j.buffers || []) {
      if (b.uri && b.uri.endsWith('.bin')) {
        const from = path.join(dir, decodeURIComponent(b.uri));
        const toUri = b.uri.replace(/\.bin$/, '.buf');
        const to = path.join(dir, decodeURIComponent(toUri));
        if (fs.existsSync(from)) fs.renameSync(from, to);
        b.uri = toUri;
        changed = true;
      }
    }
    if (changed) { fs.writeFileSync(p, JSON.stringify(j)); n++; }
  }
  return n;
}

if (process.argv[1] && process.argv[1].endsWith('fix_bin.mjs')) {
  const dir = process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', 'public', 'assets');
  console.log('fixed', fixDir(dir), 'gltf files');
}
