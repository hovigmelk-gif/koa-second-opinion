import * as ort from 'onnxruntime-node'; import fs from 'fs'; import { PNG } from 'pngjs';
import { preprocess, toTensor, headProbs, gradCam7, upsampleCam, rescale01, decide } from './src/koa-core.js';
const T = process.argv[2] || 'C:/Users/hovm3/Downloads/56rmx5bjcr-1/extracted_data/KneeXrayData/ClsKLData/kneeKL224/test';
const D = '..', H = JSON.parse(fs.readFileSync(`${D}/heads.json`)), S = ['seed42', 'seed7', 'seed123'];
const M1 = await Promise.all(S.map(s => ort.InferenceSession.create(`${D}/M1_${s}.onnx`)));
const run = async (s, x) => (await s.run({ data: new ort.Tensor('float32', x, [1, 3, 224, 224]) })).res5b_relu.data;
const files = ['0/9003175L.png', '1/9001400L.png', '2/9003316R.png', '3/9011053L.png', '4/9012867R.png'], out = [];
for (const f of files) {
  const p = PNG.sync.read(fs.readFileSync(T + '/' + f)); const g0 = new Uint8Array(p.width * p.height);
  for (let i = 0; i < g0.length; i++) g0[i] = p.data[4 * i];
  const { g } = preprocess(g0, p.width, p.height); const X = toTensor(g), XF = toTensor(g, true); const P3 = [0, 0, 0], A = [], Y = [];
  for (let i = 0; i < 3; i++) { const a = await run(M1[i], X), b = await run(M1[i], XF), ya = headProbs(a, H['M1_' + S[i]]).y, yb = headProbs(b, H['M1_' + S[i]]).y; A.push(a); Y.push(ya); ya.forEach((v, k) => P3[k] += (v + yb[k]) / 6); }
  const adj = P3.slice(); adj[0] -= 0.1; const grp = adj.indexOf(Math.max(...adj));
  let cam = new Float64Array(50176); for (let i = 0; i < 3; i++) upsampleCam(gradCam7(A[i], H['M1_' + S[i]], Y[i], grp)).forEach((v, k) => cam[k] += v);
  out.push({ f, raw: Array.from(g0), clahe: Array.from(g), cam: Array.from(rescale01(cam), v => +v.toFixed(4)), P3, grp });
}
fs.writeFileSync('five.json', JSON.stringify(out)); console.log('five done');
