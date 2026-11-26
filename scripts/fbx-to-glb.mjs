// Turns a huge binary .fbx (e.g. a ZBrush export of tens of millions of polygons) into a light .glb for the game,
// without any outside tools: reads just the meshes out of the file, welds and clusters them down, simplifies with
// meshoptimizer (already installed with three.js), and gives them a gilded material (or their painted colours, if the
// file has them). Then run scripts/optimize-model.mjs on the result as usual.
//   node --max-old-space-size=12000 scripts/fbx-to-glb.mjs in.fbx out.glb [triangles=300000]
//   node scripts/fbx-to-glb.mjs in.fbx --inspect        (just list what's in it)
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { MeshoptSimplifier } from 'meshoptimizer';

const [, , inPath, outPath, triArg = '300000'] = process.argv;
const buf = readFileSync(inPath);
if (buf.toString('latin1', 0, 20) !== 'Kaydara FBX Binary  ') throw new Error('not a binary FBX');
const version = buf.readUInt32LE(23), wide = version >= 7500;

// ---------- the node tree: names, and properties read only when asked for ----------
function readNode(off) {
  const end = wide ? Number(buf.readBigUInt64LE(off)) : buf.readUInt32LE(off);
  const nProps = wide ? Number(buf.readBigUInt64LE(off + 8)) : buf.readUInt32LE(off + 4);
  const propLen = wide ? Number(buf.readBigUInt64LE(off + 16)) : buf.readUInt32LE(off + 8);
  const head = wide ? 24 : 12, nameLen = buf[off + head];
  if (end === 0) return null;
  const name = buf.toString('latin1', off + head + 1, off + head + 1 + nameLen), propStart = off + head + 1 + nameLen;
  return { name, end, nProps, propStart, childStart: propStart + propLen };
}
function children(node) {
  const out = [];
  let o = node.childStart;
  while (o < node.end) { const c = readNode(o); if (!c) break; out.push(c); o = c.end; }
  return out;
}
function props(node) { // each property: its type, and a getter for its value
  const out = [];
  let o = node.propStart;
  for (let i = 0; i < node.nProps; i++) {
    const t = String.fromCharCode(buf[o]);
    o++;
    if ('YCIFDL'.includes(t)) {
      const size = { Y: 2, C: 1, I: 4, F: 4, D: 8, L: 8 }[t], at = o;
      out.push({ t, get: () => ({ Y: () => buf.readInt16LE(at), C: () => buf[at], I: () => buf.readInt32LE(at), F: () => buf.readFloatLE(at), D: () => buf.readDoubleLE(at), L: () => Number(buf.readBigInt64LE(at)) })[t]() });
      o += size;
    } else if ('fdlibc'.includes(t)) {
      const len = buf.readUInt32LE(o), enc = buf.readUInt32LE(o + 4), clen = buf.readUInt32LE(o + 8), at = o + 12;
      const el = { f: 4, d: 8, l: 8, i: 4, b: 1, c: 1 }[t];
      out.push({ t, len, get: () => {
        const raw = enc ? inflateSync(buf.subarray(at, at + clen), { maxOutputLength: len * el + 16 }) : buf.subarray(at, at + len * el);
        const ab = raw.byteOffset % el === 0 && enc ? raw.buffer : raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
        return t === 'd' ? new Float64Array(ab) : t === 'f' ? new Float32Array(ab) : t === 'i' ? new Int32Array(ab) : t === 'l' ? new BigInt64Array(ab) : new Uint8Array(ab);
      } });
      o = at + clen;
    } else if (t === 'S' || t === 'R') {
      const len = buf.readUInt32LE(o), at = o + 4;
      out.push({ t, get: () => (t === 'S' ? buf.toString('utf8', at, at + len) : buf.subarray(at, at + len)) });
      o = at + len;
    } else throw new Error('unknown property type ' + t + ' at ' + o);
  }
  return out;
}
const top = [];
for (let o = 27; o < buf.length - 200;) { const n = readNode(o); if (!n) break; top.push(n); o = n.end; }
const objects = top.find((n) => n.name === 'Objects'), settings = top.find((n) => n.name === 'GlobalSettings');
const geoms = children(objects).filter((n) => n.name === 'Geometry');

if (outPath === '--inspect') {
  console.log('FBX', version, 'top:', top.map((n) => n.name).join(' '));
  if (settings) for (const p of children(children(settings).find((c) => c.name === 'Properties70') ?? { childStart: 0, end: 0 }))
    { const v = props(p); const k = v[0]?.get(); if (/Axis|Scale/.test(k)) console.log('  ', k, v.slice(4).map((x) => x.get())); }
  console.log('objects:', [...new Set(children(objects).map((n) => n.name))].join(' '), '· geometries:', geoms.length);
  for (const g of geoms.slice(0, 12)) {
    const kids = children(g);
    console.log(' geometry', props(g).map((p) => (p.t === 'S' ? JSON.stringify(p.get().replace(/\\0.*$/, '')) : '')).join(' '));
    for (const k of kids) {
      const p = props(k);
      if (p.some((x) => x.len !== undefined)) console.log('   ', k.name, p.filter((x) => x.len !== undefined).map((x) => `${x.t}[${x.len}]`).join(' '));
      else if (k.name.startsWith('LayerElement')) console.log('   ', k.name, children(k).map((c) => c.name + (props(c).find((x) => x.len !== undefined) ? `[${props(c).find((x) => x.len !== undefined).len}]` : '')).join(' '));
    }
  }
  process.exit(0);
}

// ---------- the mesh: welded onto a fine grid, then simplified ----------
const targetTris = +triArg, t0 = Date.now(), log = (m) => console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)}s ${m}`);
const arr = (node, name) => props(children(node).find((c) => c.name === name))[0].get();
let verts = [], polys = [];
for (const g of geoms) { verts.push(arr(g, 'Vertices')); polys.push(arr(g, 'PolygonVertexIndex')); }
log(`read ${geoms.length} mesh(es): ${verts.reduce((a, v) => a + v.length / 3, 0)} vertices`);
// the box round it all, and a grid over it fine enough to keep the carving
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (const v of verts) for (let i = 0; i < v.length; i += 3) for (let c = 0; c < 3; c++) { const x = v[i + c]; if (x < lo[c]) lo[c] = x; if (x > hi[c]) hi[c] = x; }
const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]), G = 1400, cell = ext / G;
const cellId = new Map(), sum = [], count = [];
const tris = [];
let nt = 0;
for (let m = 0; m < verts.length; m++) {
  const v = verts[m], p = polys[m], n = v.length / 3, map = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const ix = Math.min(G, Math.floor((v[i * 3] - lo[0]) / cell)), iy = Math.min(G, Math.floor((v[i * 3 + 1] - lo[1]) / cell)), iz = Math.min(G, Math.floor((v[i * 3 + 2] - lo[2]) / cell));
    const key = ix + (G + 1) * (iy + (G + 1) * iz);
    let id = cellId.get(key);
    if (id === undefined) { id = count.length; cellId.set(key, id); sum.push(0, 0, 0); count.push(0); }
    map[i] = id; sum[id * 3] += v[i * 3]; sum[id * 3 + 1] += v[i * 3 + 1]; sum[id * 3 + 2] += v[i * 3 + 2]; count[id]++;
  }
  verts[m] = null;
  // polygons (the last index of each is stored as -i-1) fanned into triangles, dropping those that collapsed
  let start = 0;
  for (let k = 0; k < p.length; k++) {
    if (p[k] >= 0) continue;
    const a = map[p[start]];
    for (let j = start + 1; j < k; j++) {
      const b = map[p[j]], c = map[j + 1 === k ? -p[k] - 1 : p[j + 1]];
      if (a !== b && b !== c && a !== c) tris.push(a, b, c), nt++;
    }
    start = k + 1;
  }
  polys[m] = null;
}
log(`welded to ${count.length} points, ${nt} triangles`);
const pos = new Float32Array(count.length * 3);
for (let i = 0; i < count.length; i++) for (let c = 0; c < 3; c++) pos[i * 3 + c] = sum[i * 3 + c] / count[i];
await MeshoptSimplifier.ready;
let idx = Uint32Array.from(tris);
tris.length = 0;
const [simple, err] = MeshoptSimplifier.simplify(idx, pos, 3, Math.min(idx.length, targetTris * 3), 0.02);
log(`simplified to ${simple.length / 3} triangles (error ${err.toFixed(4)})`);
// keep the used points; smooth normals, weighted by area
const remap = new Int32Array(count.length).fill(-1);
let used = 0;
for (const i of simple) if (remap[i] < 0) remap[i] = used++;
const P = new Float32Array(used * 3), N = new Float32Array(used * 3), I = new Uint32Array(simple.length);
for (let i = 0; i < count.length; i++) if (remap[i] >= 0) P.set(pos.subarray(i * 3, i * 3 + 3), remap[i] * 3);
for (let k = 0; k < simple.length; k++) I[k] = remap[simple[k]];
for (let k = 0; k < I.length; k += 3) {
  const [a, b, c] = [I[k] * 3, I[k + 1] * 3, I[k + 2] * 3];
  const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  for (const o of [a, b, c]) (N[o] += nx), (N[o + 1] += ny), (N[o + 2] += nz);
}
for (let i = 0; i < used; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; for (let c = 0; c < 3; c++) N[i * 3 + c] /= l; }

// ---------- a .glb: one mesh in gilded bronze ----------
const plo = [0, 1, 2].map((c) => { let m = Infinity; for (let i = c; i < P.length; i += 3) m = Math.min(m, P[i]); return m; });
const phi = [0, 1, 2].map((c) => { let m = -Infinity; for (let i = c; i < P.length; i += 3) m = Math.max(m, P[i]); return m; });
const bin = Buffer.concat([Buffer.from(P.buffer), Buffer.from(N.buffer), Buffer.from(I.buffer)]);
const json = {
  asset: { version: '2.0', generator: 'temple scripts/fbx-to-glb.mjs' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'statue', mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  materials: [{ name: 'gilt', pbrMetallicRoughness: { baseColorFactor: [0.86, 0.64, 0.27, 1], metallicFactor: 0.85, roughnessFactor: 0.38 } }],
  buffers: [{ byteLength: bin.length }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: P.byteLength, target: 34962 }, { buffer: 0, byteOffset: P.byteLength, byteLength: N.byteLength, target: 34962 }, { buffer: 0, byteOffset: P.byteLength + N.byteLength, byteLength: I.byteLength, target: 34963 }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: used, type: 'VEC3', min: plo, max: phi },
    { bufferView: 1, componentType: 5126, count: used, type: 'VEC3' },
    { bufferView: 2, componentType: 5125, count: I.length, type: 'SCALAR' },
  ],
};
const js = Buffer.from(JSON.stringify(json)), jp = (4 - (js.length % 4)) % 4, total = 12 + 8 + js.length + jp + 8 + bin.length;
const h = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
h.writeUInt32LE(0x46546c67, 0), h.writeUInt32LE(2, 4), h.writeUInt32LE(total, 8);
jh.writeUInt32LE(js.length + jp, 0), jh.writeUInt32LE(0x4e4f534a, 4), bh.writeUInt32LE(bin.length, 0), bh.writeUInt32LE(0x004e4942, 4);
writeFileSync(outPath, Buffer.concat([h, jh, js, Buffer.alloc(jp, 0x20), bh, bin]));
log(`wrote ${outPath}: ${(total / 1048576).toFixed(1)} MB, ${I.length / 3} triangles`);
