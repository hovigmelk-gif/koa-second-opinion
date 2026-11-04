import * as ort from 'onnxruntime-node'; import fs from 'fs'; import { PNG } from 'pngjs';
import { preprocess, toTensor, headProbs, gradCam7, upsampleCam, rescale01, decide } from './src/koa-core.js';
const T = process.argv[2] || 'C:/Users/hovm3/Downloads/56rmx5bjcr-1/extracted_data/KneeXrayData/ClsKLData/kneeKL224/test';
const D = '..', H = JSON.parse(fs.readFileSync(`${D}/heads.json`)), S = ['seed42', 'seed7', 'seed123'];
const M1 = await Promise.all(S.map(s => ort.InferenceSession.create(`${D}/M1_${s}.onnx`))), M4 = await Promise.all(S.map(s => ort.InferenceSession.create(`${D}/M4B_${s}.onnx`)));
const run = async (s, x) => (await s.run({ data: new ort.Tensor('float32', x, [1, 3, 224, 224]) })).res5b_relu.data;
const camSum = Array.from({ length: 5 }, () => new Float64Array(50176)), camN = [0, 0, 0, 0, 0], rows = [];
for (let kl = 0; kl < 5; kl++) for (const f of fs.readdirSync(`${T}/${kl}`).sort()) {
  const p = PNG.sync.read(fs.readFileSync(`${T}/${kl}/${f}`)); const g0 = new Uint8Array(p.width * p.height);
  for (let i = 0; i < g0.length; i++) g0[i] = Math.round(0.298936021293775 * p.data[4 * i] + 0.587043074451121 * p.data[4 * i + 1] + 0.114020904255103 * p.data[4 * i + 2]);
  let s1 = 0, s2 = 0; for (const v of g0) { s1 += v; s2 += v * v; } const n = g0.length, mean = s1 / n, sd = Math.sqrt((s2 - n * mean * mean) / (n - 1));
  const { g } = preprocess(g0, p.width, p.height); const X = toTensor(g), XF = toTensor(g, true);
  const P3 = [0, 0, 0], P5 = [0, 0, 0, 0, 0], A = [], Y = [];
  for (let i = 0; i < 3; i++) {
    const a = await run(M1[i], X), b = await run(M1[i], XF), ya = headProbs(a, H['M1_' + S[i]]).y, yb = headProbs(b, H['M1_' + S[i]]).y;
    A.push(a); Y.push(ya); ya.forEach((v, k) => P3[k] += (v + yb[k]) / 6);
    const c = await run(M4[i], X), d = await run(M4[i], XF), yc = headProbs(c, H['M4B_' + S[i]]).y, yd = headProbs(d, H['M4B_' + S[i]]).y;
    yc.forEach((v, k) => P5[k] += (v + yd[k]) / 6);
  }
  const dec = decide(P3, P5, mean, sd);
  let cam = new Float64Array(50176); for (let i = 0; i < 3; i++) upsampleCam(gradCam7(A[i], H['M1_' + S[i]], Y[i], dec.grp)).forEach((v, k) => cam[k] += v);
  cam = rescale01(cam); cam.forEach((v, k) => camSum[kl][k] += v); camN[kl]++;
  rows.push([f, kl, dec.grp, dec.kl, ...P3.map(v => v.toFixed(6)), ...P5.map(v => v.toFixed(6)), dec.flags.length ? 1 : 0].join(','));
  if (rows.length % 200 === 0) console.log(rows.length);
}
fs.writeFileSync('preds.csv', 'File,TrueKL,Group,KL5,P0,P1,P2,Q0,Q1,Q2,Q3,Q4,Review\n' + rows.join('\n'));
fs.writeFileSync('meancam.json', JSON.stringify(camSum.map((c, k) => Array.from(c, v => +(v / camN[k]).toFixed(4)))));
console.log('done', rows.length);
