// engine.js: loads the six exported ResNet-18 backbones and runs the KOA_Predict pipeline in the browser.
import * as ort from 'onnxruntime-web/wasm';
import {
  toGrey, preprocess, toTensor, headProbs, gradCam7, upsampleCam, rescale01, decide, imageChecks, JET,
} from './koa-core.js';

ort.env.wasm.wasmPaths = '/ort/';
ort.env.wasm.numThreads = (self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1);

const SEEDS = ['seed42', 'seed7', 'seed123'];
const FILES = [...SEEDS.map(s => `M1_${s}`), ...SEEDS.map(s => `M4B_${s}`)];
const CACHE = 'koa-models-v2';
try { caches.delete('koa-models-v1'); } catch { /* old Base44-URL cache, ~135 MB */ }
// Models are served with the site from public/models/ (fp16.py output + heads.json)
const URLS = Object.fromEntries([...FILES.map(f => [f, `/models/${f}.onnx`]), ['heads', '/models/heads.json']]);
let state = null;

async function fetchWithProgress(url, onBytes) {
  try {
    const c = await caches.open(CACHE); const hit = await c.match(url);
    if (hit) { const b = await hit.arrayBuffer(); onBytes(b.byteLength, true); return b; }
  } catch { /* Cache API unavailable: fall through to network */ }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download ${url} (${res.status})`);
  const reader = res.body.getReader(); const parts = []; let n = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); n += value.length; onBytes(value.length, false); }
  const buf = new Uint8Array(n); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
  try { const c = await caches.open(CACHE); await c.put(url, new Response(buf.slice().buffer)); } catch { /* ignore */ }
  return buf.buffer;
}

export async function loadModels(onProgress) {
  if (state) return state;
  const TOTAL = 6 * 22443424 + 264056; let got = 0;
  const tick = (b) => { got += b; onProgress?.(Math.min(1, got / TOTAL)); };
  const heads = JSON.parse(new TextDecoder().decode(await fetchWithProgress(URLS.heads, tick)));
  const sessions = {};
  for (const f of FILES) {
    const buf = await fetchWithProgress(URLS[f], tick);
    sessions[f] = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  }
  onProgress?.(1);
  state = { heads, sessions };
  return state;
}

async function features(sess, x) {
  const out = await sess.run({ data: new ort.Tensor('float32', x, [1, 3, 224, 224]) });
  return out.res5b_relu.data;
}

export async function decodeImage(file) {
  const bmp = await createImageBitmap(file);
  const cv = new OffscreenCanvas(bmp.width, bmp.height); const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(bmp, 0, 0);
  const { data } = cx.getImageData(0, 0, bmp.width, bmp.height);
  return { rgba: data, w: bmp.width, h: bmp.height };
}

// Full KOA_Predict path: CLAHE -> 224 -> 3 seeds x (image + mirror) for Model 1 and Model 4B -> rules -> Grad-CAM
export async function analyse(img, onStep) {
  const { heads, sessions } = state;
  const t0 = performance.now();
  const { g: grey, colour } = toGrey(img.rgba, img.w, img.h);
  const checks = imageChecks(grey, img.w, img.h, colour);
  const { g } = preprocess(grey, img.w, img.h);
  const X = toTensor(g), XF = toTensor(g, true);
  const P3 = [0, 0, 0], P5 = [0, 0, 0, 0, 0], A1 = [], Y1 = [], perSeed = [];
  let step = 0; const total = 12;
  for (let i = 0; i < 3; i++) {
    const s = SEEDS[i];
    const a = await features(sessions[`M1_${s}`], X); onStep?.(++step / total);
    const b = await features(sessions[`M1_${s}`], XF); onStep?.(++step / total);
    const ya = headProbs(a, heads[`M1_${s}`]).y, yb = headProbs(b, heads[`M1_${s}`]).y;
    A1.push(a); Y1.push(ya); perSeed.push({ seed: s, orig: ya, mirror: yb });
    ya.forEach((v, k) => { P3[k] += (v + yb[k]) / 6; });
    const c = await features(sessions[`M4B_${s}`], X); onStep?.(++step / total);
    const d = await features(sessions[`M4B_${s}`], XF); onStep?.(++step / total);
    const yc = headProbs(c, heads[`M4B_${s}`]).y, yd = headProbs(d, heads[`M4B_${s}`]).y;
    yc.forEach((v, k) => { P5[k] += (v + yd[k]) / 6; });
  }
  const dec = decide(P3, P5, checks.mean, checks.sd);
  let cam = new Float64Array(50176);
  for (let i = 0; i < 3; i++) upsampleCam(gradCam7(A1[i], heads[`M1_${SEEDS[i]}`], Y1[i], dec.grp)).forEach((v, k) => { cam[k] += v; });
  cam = rescale01(cam);
  return { P3, P5, ...dec, checks, g, cam, perSeed, ms: performance.now() - t0 };
}

// 224x224 RGBA images for the viewer: CLAHE greyscale and the KOA_Predict overlay (0.6 x image + 0.4 x jet)
export function renderLayers(g, cam) {
  const base = new ImageData(224, 224), over = new ImageData(224, 224), heat = new ImageData(224, 224);
  for (let i = 0; i < 50176; i++) {
    const v = g[i], j = JET[Math.min(255, Math.round(cam[i] * 255))];
    base.data.set([v, v, v, 255], 4 * i); heat.data.set([j[0], j[1], j[2], 255], 4 * i);
    over.data.set([0.6 * v + 0.4 * j[0], 0.6 * v + 0.4 * j[1], 0.6 * v + 0.4 * j[2], 255], 4 * i);
  }
  return { base, over, heat };
}
