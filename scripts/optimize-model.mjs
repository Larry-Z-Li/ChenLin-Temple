// Makes a heavy single-mesh .glb (e.g. from Meshy) light enough for the web, using only what's already installed:
// meshoptimizer (with three.js) to simplify the mesh, and macOS's `sips` to shrink the textures. Positions, normals and
// texture coordinates are stored as small integers (KHR_mesh_quantization, which three.js reads).
//   node scripts/optimize-model.mjs in.glb out.glb [triangles=150000] [baseColourSize=2048] [otherTextureSize=1024]
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';

const [, , inPath, outPath, triArg = '150000', baseArg = '2048', otherArg = '1024'] = process.argv;
if (!inPath || !outPath) throw new Error('usage: node scripts/optimize-model.mjs in.glb out.glb [triangles] [baseColourSize] [otherTextureSize]');
const targetTris = +triArg;

// ---------- read the .glb ----------
const glb = readFileSync(inPath);
const jsonLen = glb.readUInt32LE(12), json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8, bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLen));
const view = (i) => { const v = json.bufferViews[i]; return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength); };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function readAccessor(i) {
  const a = json.accessors[i], v = json.bufferViews[a.bufferView], n = SIZE[a.type], src = view(a.bufferView), off = a.byteOffset ?? 0;
  const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
  const stride = v.byteStride ?? n * T.BYTES_PER_ELEMENT, out = new (a.componentType === 5126 ? Float32Array : Uint32Array)(a.count * n);
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const get = { 5126: (o) => dv.getFloat32(o, true), 5125: (o) => dv.getUint32(o, true), 5123: (o) => dv.getUint16(o, true), 5121: (o) => dv.getUint8(o) }[a.componentType];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = get(off + k * stride + c * T.BYTES_PER_ELEMENT);
  return out;
}

// ---------- simplify each primitive ----------
await MeshoptSimplifier.ready;
const outViews = [], outAccessors = [];
const chunks = [];
let length = 0;
const push = (buf, target) => { // a new bufferView, 4-byte aligned
  const pad = (4 - (length % 4)) % 4;
  if (pad) chunks.push(Buffer.alloc(pad)), (length += pad);
  outViews.push({ buffer: 0, byteOffset: length, byteLength: buf.byteLength, ...(target ? { target } : {}) });
  chunks.push(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
  length += buf.byteLength;
  return outViews.length - 1;
};
for (const mesh of json.meshes) for (const prim of mesh.primitives) {
  const pos = readAccessor(prim.attributes.POSITION), nor = prim.attributes.NORMAL !== undefined ? readAccessor(prim.attributes.NORMAL) : null;
  const uv = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(prim.attributes.TEXCOORD_0) : null;
  const vcount = pos.length / 3, idx = prim.indices !== undefined ? Uint32Array.from(readAccessor(prim.indices)) : Uint32Array.from({ length: vcount }, (_, i) => i);
  const before = idx.length / 3;
  let [simple, err] = MeshoptSimplifier.simplify(idx, pos, 3, Math.min(idx.length, targetTris * 3), 0.01, ['LockBorder']);
  if (simple.length / 3 > targetTris * 1.5) [simple, err] = MeshoptSimplifier.simplify(idx, pos, 3, targetTris * 3, 0.01); // (seams held it back: let them move a little)
  // keep only the vertices still used
  const remap = new Int32Array(vcount).fill(-1);
  let used = 0;
  for (const i of simple) if (remap[i] < 0) remap[i] = used++;
  const newIdx = new Uint32Array(simple.length);
  for (let k = 0; k < simple.length; k++) newIdx[k] = remap[simple[k]];
  // quantise: positions to int16 in their box (node scaled back up), normals to int8, uvs to uint16
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < vcount; v++) if (remap[v] >= 0) for (let c = 0; c < 3; c++) (lo[c] = Math.min(lo[c], pos[v * 3 + c])), (hi[c] = Math.max(hi[c], pos[v * 3 + c]));
  const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2, mid = lo.map((l, c) => (l + hi[c]) / 2);
  const qp = new Int16Array(used * 4), qn = nor ? new Int8Array(used * 4) : null;
  let uvLo = [0, 0], uvHi = [1, 1];
  if (uv) { uvLo = [Infinity, Infinity]; uvHi = [-Infinity, -Infinity]; for (let v = 0; v < vcount; v++) if (remap[v] >= 0) for (let c = 0; c < 2; c++) (uvLo[c] = Math.min(uvLo[c], uv[v * 2 + c])), (uvHi[c] = Math.max(uvHi[c], uv[v * 2 + c])); }
  const fitsUv = uvLo[0] >= 0 && uvLo[1] >= 0 && uvHi[0] <= 1 && uvHi[1] <= 1, qt = uv ? (fitsUv ? new Uint16Array(used * 2) : new Float32Array(used * 2)) : null;
  for (let v = 0; v < vcount; v++) {
    const o = remap[v];
    if (o < 0) continue;
    for (let c = 0; c < 3; c++) qp[o * 4 + c] = Math.round(((pos[v * 3 + c] - mid[c]) / ext) * 32767);
    if (qn) for (let c = 0; c < 3; c++) qn[o * 4 + c] = Math.round(Math.max(-1, Math.min(1, nor[v * 3 + c])) * 127);
    if (qt) for (let c = 0; c < 2; c++) qt[o * 2 + c] = fitsUv ? Math.round(uv[v * 2 + c] * 65535) : uv[v * 2 + c];
  }
  const acc = (bufferView, componentType, count, type, extra = {}) => (outAccessors.push({ bufferView, componentType, count, type, ...extra }), outAccessors.length - 1);
  const qlo = [0, 1, 2].map((c) => Math.floor(((lo[c] - mid[c]) / ext) * 32767)), qhi = [0, 1, 2].map((c) => Math.ceil(((hi[c] - mid[c]) / ext) * 32767));
  prim.attributes = { POSITION: acc(push(qp, 34962), 5122, used, 'VEC3', { min: qlo, max: qhi }) };
  outViews[outViews.length - 1].byteStride = 8;
  if (qn) { prim.attributes.NORMAL = acc(push(qn, 34962), 5120, used, 'VEC3', { normalized: true }); outViews[outViews.length - 1].byteStride = 4; }
  if (qt) prim.attributes.TEXCOORD_0 = acc(push(qt, 34962), fitsUv ? 5123 : 5126, used, 'VEC2', fitsUv ? { normalized: true } : {});
  prim.indices = acc(push(used < 65536 ? Uint16Array.from(newIdx) : newIdx, 34963), used < 65536 ? 5123 : 5125, newIdx.length, 'SCALAR');
  // undo the quantisation on the node(s) holding this mesh
  const mi = json.meshes.indexOf(mesh);
  for (const node of [...json.nodes]) if (node.mesh === mi) { // (on a child of its own, under whatever transform the node has)
    delete node.mesh;
    json.nodes.push({ name: (node.name ?? 'mesh') + '-q', mesh: mi, translation: mid, scale: [ext / 32767, ext / 32767, ext / 32767] });
    (node.children ??= []).push(json.nodes.length - 1);
  }
  console.log(`  triangles ${before} → ${newIdx.length / 3} (error ${err.toFixed(4)}), vertices ${vcount} → ${used}`);
}

// ---------- shrink the textures ----------
const tmp = mkdtempSync(join(tmpdir(), 'optmodel-'));
const baseImages = new Set(json.materials.map((m) => m.pbrMetallicRoughness?.baseColorTexture?.index).filter((i) => i !== undefined).map((t) => json.textures[t].source));
for (const [i, img] of (json.images ?? []).entries()) {
  // (a PNG becomes a JPEG unless a material needs its transparency: PNGs of painted textures barely compress)
  const opaque = json.materials.every((m) => !m.alphaMode || m.alphaMode === 'OPAQUE');
  const ext = img.mimeType === 'image/png' && !opaque ? 'png' : 'jpg', src = join(tmp, `in${i}.${img.mimeType === 'image/png' ? 'png' : 'jpg'}`), dst = join(tmp, `out${i}.jpg`);
  if (ext === 'jpg') img.mimeType = 'image/jpeg';
  writeFileSync(src, view(img.bufferView));
  const size = baseImages.has(i) ? +baseArg : +otherArg;
  execFileSync('sips', ['-Z', String(size), '-s', 'format', ext === 'png' ? 'png' : 'jpeg', ...(ext === 'png' ? [] : ['-s', 'formatOptions', '82']), src, '--out', ext === 'png' ? dst.replace('.jpg', '.png') : dst], { stdio: 'ignore' });
  const data = readFileSync(ext === 'png' ? dst.replace('.jpg', '.png') : dst);
  img.bufferView = push(new Uint8Array(data));
  console.log(`  image ${i}: ${(data.byteLength / 1024).toFixed(0)} KB at ${size}px`);
}
rmSync(tmp, { recursive: true });

// ---------- write it back out ----------
json.bufferViews = outViews;
json.accessors = outAccessors;
json.buffers = [{ byteLength: length }];
json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'KHR_mesh_quantization'])];
json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), 'KHR_mesh_quantization'])];
const jsonBuf = Buffer.from(JSON.stringify(json)), jpad = (4 - (jsonBuf.length % 4)) % 4, bpad = (4 - (length % 4)) % 4;
const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
const total = 12 + 8 + jsonBuf.length + jpad + 8 + length + bpad;
header.writeUInt32LE(0x46546c67, 0), header.writeUInt32LE(2, 4), header.writeUInt32LE(total, 8);
jh.writeUInt32LE(jsonBuf.length + jpad, 0), jh.writeUInt32LE(0x4e4f534a, 4);
bh.writeUInt32LE(length + bpad, 0), bh.writeUInt32LE(0x004e4942, 4);
writeFileSync(outPath, Buffer.concat([header, jh, jsonBuf, Buffer.alloc(jpad, 0x20), bh, ...chunks, Buffer.alloc(bpad)]));
console.log(`wrote ${outPath}: ${(total / 1024 / 1024).toFixed(1)} MB (was ${(glb.length / 1024 / 1024).toFixed(1)} MB)`);
