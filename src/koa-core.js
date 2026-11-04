// koa-core.js — browser/Node port of the KOA_Predict preprocessing, decision rules and Grad-CAM.
// Every function mirrors the MATLAB code it replaces; each was checked against MATLAB reference outputs.

// ---------- MATLAB adapthisteq(I, 'ClipLimit', 0.02) for uint8 greyscale: 8x8 tiles, 256 bins, uniform ----------
export function clahe(img, w, h, normClip = 0.02, nT = 8, nBins = 256) {
  // symmetric padding so the size divides by the tile count (adapthisteq pads pre/post)
  const padR = (h % nT) ? (Math.floor(h / nT) + 1) * nT - h : 0;
  const padC = (w % nT) ? (Math.floor(w / nT) + 1) * nT - w : 0;
  const pr0 = Math.floor(padR / 2), pc0 = Math.floor(padC / 2);
  const H = h + padR, W = w + padC;
  const sym = (i, n) => { // MATLAB 'symmetric' index (0-based)
    const p = 2 * n; i = ((i % p) + p) % p; return i < n ? i : p - 1 - i;
  };
  const I = new Uint8Array(H * W);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++)
    I[r * W + c] = img[sym(r - pr0, h) * w + sym(c - pc0, w)];
  const tR = H / nT, tC = W / nT, nPix = tR * tC;
  const minClip = Math.ceil(nPix / nBins);
  const clip = minClip + Math.round(normClip * (nPix - minClip));
  // tile mappings -> uint8 LUTs (grayxform quantises the [0,1] mapping to uint8)
  const luts = [];
  for (let tr = 0; tr < nT; tr++) for (let tc = 0; tc < nT; tc++) {
    const hist = new Float64Array(nBins);
    for (let r = tr * tR; r < (tr + 1) * tR; r++) for (let c = tc * tC; c < (tc + 1) * tC; c++) hist[I[r * W + c]]++;
    clipHist(hist, clip, nBins);
    const lut = new Uint8Array(256); let s = 0;
    for (let k = 0; k < nBins; k++) { s += hist[k]; lut[k] = Math.round(Math.min(s / nPix, 1) * 255); }
    luts.push(lut);
  }
  // bilinear interpolation between tile mappings (makeClaheImage)
  const out = new Uint8Array(H * W);
  let r0 = 0;
  for (let k = 0; k <= nT; k++) {
    const nr = (k === 0 || k === nT) ? tR / 2 : tR;
    const mr = k === 0 ? [0, 0] : k === nT ? [nT - 1, nT - 1] : [k - 1, k];
    let c0 = 0;
    for (let l = 0; l <= nT; l++) {
      const nc = (l === 0 || l === nT) ? tC / 2 : tC;
      const mc = l === 0 ? [0, 0] : l === nT ? [nT - 1, nT - 1] : [l - 1, l];
      const ul = luts[mr[0] * nT + mc[0]], ur = luts[mr[0] * nT + mc[1]];
      const bl = luts[mr[1] * nT + mc[0]], br = luts[mr[1] * nT + mc[1]];
      const nf = nr * nc;
      for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
        const v = I[(r0 + i) * W + c0 + j];
        const val = ((nr - i) * ((nc - j) * ul[v] + j * ur[v]) + i * ((nc - j) * bl[v] + j * br[v])) / nf;
        out[(r0 + i) * W + c0 + j] = Math.min(255, Math.round(val));
      }
      c0 += nc;
    }
    r0 += nr;
  }
  // remove padding
  const res = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) res[r * w + c] = out[(r + pr0) * W + c + pc0];
  return res;
}

function clipHist(hist, clip, nBins) {
  let excess = 0;
  for (let k = 0; k < nBins; k++) excess += Math.max(hist[k] - clip, 0);
  const avgInc = Math.floor(excess / nBins), upper = clip - avgInc;
  for (let k = 0; k < nBins; k++) {
    if (hist[k] > clip) hist[k] = clip;
    else if (hist[k] > upper) { excess -= clip - hist[k]; hist[k] = clip; }
    else { excess -= avgInc; hist[k] += avgInc; }
  }
  let k = 0;
  while (excess > 0) {
    const step = Math.max(Math.floor(nBins / excess), 1);
    for (let m = k; m < nBins; m += step) {
      if (hist[m] < clip) { hist[m]++; excess--; if (excess === 0) break; }
    }
    k++; if (k >= nBins) k = 0;
  }
}

// ---------- MATLAB imresize(..., 'bicubic') incl. antialiasing when shrinking ----------
function cubic(x) {
  const a = Math.abs(x), a2 = a * a, a3 = a2 * a;
  return a <= 1 ? 1.5 * a3 - 2.5 * a2 + 1 : a <= 2 ? -0.5 * a3 + 2.5 * a2 - 4 * a + 2 : 0;
}
function contributions(inLen, outLen) {
  const scale = outLen / inLen, aa = scale < 1;
  const kw = aa ? 4 / scale : 4;
  const W = [], Ix = [];
  for (let o = 1; o <= outLen; o++) {
    const u = o / scale + 0.5 * (1 - 1 / scale);
    const left = Math.floor(u - kw / 2), P = Math.ceil(kw) + 2;
    const ws = [], is = []; let sum = 0;
    for (let p = 0; p < P; p++) {
      const idx = left + p;
      const wt = aa ? scale * cubic(scale * (u - idx)) : cubic(u - idx);
      ws.push(wt); is.push(Math.min(Math.max(idx, 1), inLen) - 1); sum += wt;
    }
    W.push(ws.map(v => v / sum)); Ix.push(is);
  }
  return { W, Ix };
}
export function imresizeBicubic(src, w, h, ow, oh, roundUint8 = true) {
  const cy = contributions(h, oh), cx = contributions(w, ow);
  // MATLAB resizes the dimension with the smaller scale first
  const rowsFirst = (oh / h) <= (ow / w);
  const pass = (data, dw, dh, alongRows, c) => {
    const nw = alongRows ? dw : c.W.length, nh = alongRows ? c.W.length : dh;
    const out = new Float64Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const o = alongRows ? y : x, ws = c.W[o], is = c.Ix[o]; let s = 0;
      for (let p = 0; p < ws.length; p++) s += ws[p] * (alongRows ? data[is[p] * dw + x] : data[y * dw + is[p]]);
      out[y * nw + x] = roundUint8 ? Math.min(255, Math.max(0, Math.round(s))) : s;
    }
    return { out, nw, nh };
  };
  let d = { out: src, nw: w, nh: h };
  if (rowsFirst) { d = pass(d.out, d.nw, d.nh, true, cy); d = pass(d.out, d.nw, d.nh, false, cx); }
  else { d = pass(d.out, d.nw, d.nh, false, cx); d = pass(d.out, d.nw, d.nh, true, cy); }
  return roundUint8 ? Uint8Array.from(d.out) : d.out;
}

// ---------- RGBA -> grey exactly like rgb2gray + im2uint8 ----------
export function toGrey(rgba, w, h) {
  const g = new Uint8Array(w * h); let colourDiff = 0;
  for (let i = 0; i < w * h; i++) {
    const r = rgba[4 * i], gg = rgba[4 * i + 1], b = rgba[4 * i + 2];
    g[i] = Math.round(0.298936021293775 * r + 0.587043074451121 * gg + 0.114020904255103 * b);
    colourDiff += Math.abs(r - gg) + Math.abs(gg - b);
  }
  return { g, colour: colourDiff / (w * h) > 5 };
}

// ---------- KOA_Predict pipeline pieces ----------
export function preprocess(grey, w, h) {
  let g = clahe(grey, w, h, 0.02);
  const resized = !(w === 224 && h === 224);
  if (resized) g = imresizeBicubic(g, w, h, 224, 224);
  return { g, resized };
}
export function toTensor(g, mirror = false) {
  const x = new Float32Array(3 * 224 * 224);
  for (let r = 0; r < 224; r++) for (let c = 0; c < 224; c++) {
    const v = g[r * 224 + (mirror ? 223 - c : c)];
    x[r * 224 + c] = v; x[50176 + r * 224 + c] = v; x[100352 + r * 224 + c] = v;
  }
  return x;
}
// res5b_relu (512x7x7) -> global average pool -> fc -> softmax
export function headProbs(A, head) {
  const K = head.W.length, pooled = new Float64Array(512);
  for (let k = 0; k < 512; k++) { let s = 0; for (let p = 0; p < 49; p++) s += A[k * 49 + p]; pooled[k] = s / 49; }
  const z = head.W.map((row, c) => row.reduce((s, wv, k) => s + wv * pooled[k], head.b[c]));
  const m = Math.max(...z), e = z.map(v => Math.exp(v - m)), S = e.reduce((a, b) => a + b, 0);
  return { y: e.map(v => v / S), K };
}
// Grad-CAM on the softmax score of class c (what MATLAB gradCAM computes), 7x7 map before upsampling
export function gradCam7(A, head, y, c) {
  const K = head.W.length, alpha = new Float64Array(512);
  for (let k = 0; k < 512; k++) { let s = 0; for (let j = 0; j < K; j++) s += y[j] * head.W[j][k]; alpha[k] = y[c] * (head.W[c][k] - s); }
  const cam = new Float64Array(49);
  for (let p = 0; p < 49; p++) { let s = 0; for (let k = 0; k < 512; k++) s += alpha[k] * A[k * 49 + p]; cam[p] = Math.max(s, 0); }
  return cam;
}
export function upsampleCam(cam7) { return imresizeBicubic(cam7, 7, 7, 224, 224, false); }
export function rescale01(a) {
  let mn = Infinity, mx = -Infinity; for (const v of a) { if (v < mn) mn = v; if (v > mx) mx = v; }
  return Float64Array.from(a, v => (v - mn) / ((mx - mn) || 1));
}

// ---------- KOA_ImageChecks (input gate) + KOA_Predict pre-declared review flags ----------
export function imageChecks(grey, w, h, colour) {
  const issues = []; let outside = false;
  const aspect = Math.max(w, h) / Math.min(w, h);
  if (colour) { issues.push('Colour image, not a greyscale radiograph'); outside = true; }
  if (aspect > 1.15) { issues.push(`Not square (${w}×${h}): cropping differs from the training images`); outside = true; }
  else if (!(w === 224 && h === 224)) issues.push(`Resized from ${w}×${h} to 224×224 (training images were 224×224)`);
  let clipped = 0, s = 0, s2 = 0;
  for (const v of grey) { if (v <= 2 || v >= 253) clipped++; s += v; s2 += v * v; }
  const n = grey.length, mean = s / n, sd = Math.sqrt((s2 - n * mean * mean) / (n - 1));
  if (clipped / n > 0.098) issues.push(`Exposure clipped (${Math.round(100 * clipped / n)}% of pixels black/white)`);
  const g224 = (w === 224 && h === 224) ? grey : imresizeBicubic(grey, w, h, 224, 224, false);
  let ls = 0, ls2 = 0; const at = (r, c) => g224[Math.min(Math.max(r, 0), 223) * 224 + Math.min(Math.max(c, 0), 223)];
  for (let r = 0; r < 224; r++) for (let c = 0; c < 224; c++) {
    const L = at(r - 1, c) + at(r + 1, c) + at(r, c - 1) + at(r, c + 1) - 4 * at(r, c); ls += L; ls2 += L * L;
  }
  const lapVar = ls2 / 50176 - (ls / 50176) ** 2;
  if (lapVar < 7.25) issues.push('Low detail / possibly blurred');
  return { level: outside ? 'OUTSIDE' : issues.length ? 'CAUTION' : 'OK', issues, mean, sd };
}

export const GROUPS = ['No / doubtful OA (KL 0–1)', 'Minimal OA (KL 2)', 'Moderate–severe OA (KL 3–4)'];
export const GROUP_SHORT = ['KL 0–1', 'KL 2', 'KL 3–4'];
export const KL_NAMES = ['KL 0 · none', 'KL 1 · doubtful', 'KL 2 · minimal', 'KL 3 · moderate', 'KL 4 · severe'];
export const GROUP_OF_KL = [0, 0, 1, 2, 2];

export function decide(P3, P5, mean, sd) {
  const adj = P3.slice(); adj[0] -= 0.10;
  const grp = adj.indexOf(Math.max(...adj));
  const kl = P5.indexOf(Math.max(...P5));
  const flags = [];
  if (Math.max(...P3) < 0.60) flags.push('Low confidence (top 3-group probability below 60%)');
  if (GROUP_OF_KL[kl] !== grp) flags.push('Models disagree (5-grade result falls in a different group)');
  if (mean < 30 || mean > 225 || sd < 20) flags.push('Check image quality (exposure / contrast outside the expected range)');
  return { grp, kl, flags };
}

// jet(256) colormap, identical to MATLAB
export const JET = (() => {
  const n = 256, m = n / 4, out = [];
  const u = []; for (let i = 1; i <= m; i++) u.push(i / m); for (let i = 0; i < m - 1; i++) u.push(1); for (let i = m; i >= 1; i--) u.push(i / m);
  const J = Array.from({ length: n }, () => [0, 0, 0]);
  const g0 = Math.ceil(m / 2);
  u.forEach((v, i) => {
    const g = g0 + i + 1, r = g + m, b = g - m;
    if (r >= 1 && r <= n) J[r - 1][0] = v; if (g >= 1 && g <= n) J[g - 1][1] = v; if (b >= 1 && b <= n) J[b - 1][2] = v;
  });
  return J.map(c => c.map(v => Math.round(v * 255)));
})();
