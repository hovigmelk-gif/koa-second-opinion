// report.js: printable case reports, ported from KOA_CaseReport.m (STEP16). Loaded only when a report is requested.
// Reference values are the verified test-set numbers hard-coded in KOA_CaseReport.m ref(); nothing is recomputed here.
const REF = {
  C: [[557, 49, 31, 1, 1], [191, 55, 48, 2, 0], [157, 71, 192, 26, 1], [14, 13, 47, 130, 19], [0, 0, 1, 9, 41]],
  rec: [87.2, 18.6, 43.0, 58.3, 80.4], recCI: [[84.4, 89.5], [14.6, 23.4], [38.4, 47.6], [51.7, 64.6], [67.5, 89.0]],
  prec: [60.6, 29.3, 60.2, 77.4, 66.1], precCI: [[57.4, 63.7], [23.2, 36.1], [54.7, 65.4], [70.5, 83.1], [53.7, 76.7]],
  nTrue: [639, 296, 447, 223, 51], nPred: [919, 188, 319, 168, 62], within1: [81.4, 93.1, 90.0, 98.2, 96.8],
  fpTrue: [1, 2, 1, 2, 3], fpPct: [21, 38, 15, 15, 31], recG: [87.7, 47.4, 76.3], precG: [79.1, 58.7, 81.0],
  roiChance: 0.249,
};
const KLN = ['KL0 Healthy', 'KL1 Doubtful', 'KL2 Minimal', 'KL3 Moderate', 'KL4 Severe'];
const GRP = ['KL0-1', 'KL2', 'KL3-4'];
const GROUP_LONG = ['No/doubtful OA (KL0-1)', 'Minimal OA (KL2)', 'Moderate-severe OA (KL3-4)'];
const DISC = 'Research prototype, not a medical device. Decision support only: the clinician makes the diagnosis.';
const RGB = { GREEN: '#1a8c33', AMBER: '#e68c00', RED: '#c72614' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const pct = v => `${Math.round(100 * v)}%`;

// Grad-CAM localisation, same definition as the Step 8 audit (KOA_CaseReport.m analyse), 0-based indices
function attention(g, cam) {
  const H = 224, W = 224, prof = new Float64Array(H);
  for (let r = 0; r < H; r++) { let s = 0; for (let c = 66; c <= 156; c++) s += g[r * W + c]; prof[r] = s / 91; }
  const sig = 9 / 5, sm = prof.map((_, r) => { let s = 0, w = 0; for (let k = -4; k <= 4; k++) { const i = r + k; if (i < 0 || i >= H) continue; const e = Math.exp(-k * k / (2 * sig * sig)); s += e * prof[i]; w += e; } return s / w; });
  let j = 55; for (let r = 55; r <= 167; r++) if (sm[r] < sm[j]) j = r;
  const r0 = Math.max(0, j - 34), r1 = Math.min(H - 1, j + 34), c0 = 21, c1 = 201;
  const inRoi = (r, c) => r >= r0 && r <= r1 && c >= c0 && c <= c1, border = (r, c) => r < 22 || r >= 202 || c < 22 || c >= 202;
  let tot = 1e-12, roi = 0, bord = 0, left = 0, peak = 0;
  for (let i = 0; i < H * W; i++) {
    const r = (i / W) | 0, c = i % W, v = cam[i]; tot += v;
    if (inRoi(r, c)) { roi += v; if (c <= 111) left += v; }
    if (border(r, c)) bord += v;
    if (v > cam[peak]) peak = i;
  }
  const top = Float64Array.from(cam).sort().reverse().subarray(0, 5018).reduce((a, b) => a + b, 0);
  return { box: [c0, r0, c1 - c0 + 1, r1 - r0 + 1], roiMass: roi / tot, borderMass: bord / tot, top10: top / tot,
    leftShare: left / (roi + 1e-12), peak: [peak % W, (peak / W) | 0], peakInROI: inRoi((peak / W) | 0, peak % W), onJoint: roi / tot >= REF.roiChance };
}

export function analyseCase(res, cg) {
  const P5 = res.P5, ord = [0, 1, 2, 3, 4].sort((a, b) => P5[b] - P5[a]);
  const has = p => res.flags.some(f => f.startsWith(p));
  const lowConf = has('Low confidence'), disagree = has('Models disagree'), quality = has('Check image quality');
  const A = { second: ord[1], margin: 100 * (P5[ord[0]] - P5[ord[1]]),
    entropy: -P5.filter(p => p > 0).reduce((s, p) => s + p * Math.log(p), 0) / Math.log(5), att: attention(res.g, res.cam) };
  A.d = cg === null ? NaN : Math.abs(cg - res.kl);
  A.cat = cg === null ? 'No clinician grade recorded' : A.d === 0 ? 'Exact agreement' : A.d === 1 ? 'Adjacent-grade disagreement' : 'Major disagreement (2 or more grades)';
  if (lowConf || disagree) A.cat += ' + AI uncertain';
  if (quality) A.cat += ' + check image quality';
  const red = [], amb = [], Q = res.checks;
  if (A.d >= 2) red.push('major clinician-AI disagreement');
  if (quality) red.push('unusual exposure/contrast');
  if (!A.att.onJoint) red.push('AI attention mostly outside the joint');
  if (Q.level === 'OUTSIDE') red.push('image outside training range: ' + Q.issues.join(', '));
  if (Q.level === 'CAUTION') amb.push('image check: ' + Q.issues.join(', '));
  if (A.d === 1) amb.push('adjacent-grade disagreement');
  if (lowConf) amb.push('low confidence');
  if (disagree) amb.push('the two AI models disagree');
  if (A.margin < 20) amb.push(`small margin between top two grades (${Math.round(A.margin)} points)`);
  A.colour = red.length ? 'RED' : amb.length ? 'AMBER' : 'GREEN';
  A.why = red.length ? [...red, ...amb].join('; ') : amb.length ? amb.join('; ') : 'suitable image, confident prediction, no disagreement';
  A.qual = Q.level !== 'OK' ? `${Q.level} - ${Q.issues.join('; ')}` : quality ? `CHECK exposure (mean ${Math.round(Q.mean)}, SD ${Math.round(Q.sd)})`
    : `passed (mean ${Math.round(Q.mean)}, SD ${Math.round(Q.sd)}; within training range)`;
  return A;
}

const bars = (labels, vals, hi, mark) => `<div class="bars">${labels.map((l, i) =>
  `<span>${l}</span><div class="tr"><i style="width:${(100 * vals[i]).toFixed(1)}%;max-width:calc(100% - 44px)" class="${i === hi ? 'hi' : ''} ${i === mark ? 'mk' : ''}"></i><em>${pct(vals[i])}</em></div>`).join('')}
  <span></span><div class="ax">${[0, 20, 40, 60, 80, 100].map(v => `<b style="left:${v}%">${v}</b>`).join('')}</div></div>`;

const CSS = `*{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}
body{font:12.5px/1.45 'Segoe UI',Arial,sans-serif;color:#0f172a;margin:0;background:#e2e8f0}
.page{background:#fff;width:210mm;min-height:297mm;margin:16px auto;padding:12mm 14mm;position:relative;break-after:page}
.page:last-child{break-after:auto}
header{text-align:center;margin-bottom:10px}header h1{font-size:12.5px;margin:0}header p{margin:2px 0 0;font-size:10.5px;color:#475569}
h2{font-size:13px;margin:14px 0 6px}h3{font-size:12.5px;margin:12px 0 4px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px 24px;align-items:start}
figure{margin:0;text-align:center}figcaption{font-weight:600;font-size:11.5px;margin-bottom:4px}figure img{width:100%;max-width:300px;display:block;margin:auto}
.bars{display:grid;grid-template-columns:auto 1fr;gap:9px 10px;align-items:center;font-size:11.5px;border:1px solid #cbd5e1;padding:12px 12px 22px}
.tr{display:flex;align-items:center;height:20px}.tr i{display:block;height:100%;flex:none;background:#cdd3e0;border:1px solid #8a93a6}.tr i.hi{background:#2659b8;border-color:#1d4690}
.tr i.mk{outline:3px solid #e8780c;outline-offset:-1px}.tr em{font-style:normal;margin-left:6px}
.ax{position:relative;height:1px;border-top:1px solid #94a3b8}.ax b{position:absolute;top:3px;transform:translateX(-50%);font-weight:400;font-size:10px;color:#475569}
.kv p{margin:0}.kv .gap{height:10px}
.rag{color:#fff;font-weight:700;padding:9px 12px;margin-top:14px}
.mono{font:11.5px/1.5 Consolas,'Courier New',monospace;white-space:pre-wrap;margin:0}
.it{font-style:italic}.small{font-size:10.5px;color:#334155}
table.cm{border-collapse:collapse;margin:6px 0}table.cm td,table.cm th{border:1px solid #cbd5e1;padding:4px 8px;text-align:center;font-size:11px}
.sign{margin-top:14px}
.tb{position:fixed;top:10px;right:14px;padding:8px 14px;font:600 13px 'Segoe UI',sans-serif;cursor:pointer}
@media print{body{background:#fff}.page{margin:0;width:auto;min-height:0;padding:0}.tb{display:none}@page{size:A4;margin:12mm}}`;

function head(name, side, title, n, when) {
  return `<header><h1>Knee OA - AI second opinion &nbsp;|&nbsp; ${esc(title)} &nbsp;|&nbsp; ${esc(name)} ${esc(side)} &nbsp;|&nbsp; ${esc(when)}</h1><p>Page ${n} &nbsp;-&nbsp; ${DISC}</p></header>`;
}

// page 1: case summary (this page alone is the quick summary)
function page1(c, A, n) {
  const { res, cg, note, imp, imgs, side, texts, edited, source } = c;
  const noteText = [imp, note].filter(Boolean).join(' ');
  const barsHtml = bars(KLN, res.P5, res.kl, cg);
  return `<section class="page">${head(c.name, side, 'Case summary', n, c.when)}
  <div class="two"><figure><figcaption>Radiograph (contrast-enhanced)</figcaption><img src="${imgs.base}"></figure>
  <figure><figcaption>Where the AI looked (Grad-CAM)</figcaption><img src="${imgs.over}"></figure>
  <div><h3 style="text-align:center;margin-top:0">AI KL-grade probabilities (blue = AI, orange = clinician)</h3>${barsHtml}</div>
  <div class="kv"><p>Knee: ${esc(side || 'not stated')}</p><p>View / calibration: not recorded (PNG, no DICOM header)</p><p>Image check: ${esc(A.qual)}</p><div class="gap"></div>
  <p>Clinician grade:&nbsp; ${cg === null ? 'not recorded' : KLN[cg]}</p><p>AI grade:&nbsp; ${KLN[res.kl]} (${pct(res.P5[res.kl])})</p>
  <p>AI severity group:&nbsp; ${GROUP_LONG[res.grp]} (${pct(Math.max(...res.P3))})</p><p>Agreement:&nbsp; ${A.cat}</p>
  <p>Review flags:&nbsp; ${res.flags.length ? esc(res.flags.join('; ')) : 'none'}</p><div class="gap"></div>
  <p>Clinician impression / note:</p><p>${esc(noteText)}</p>
  <div class="rag" style="background:${RGB[A.colour]}">${A.colour}: ${esc(A.why)}</div></div></div>
  <h3>Summary${edited ? ' (edited by clinician)' : ''}</h3><p class="mono" style="font-family:inherit">${esc(texts.clin)}</p>
  <p class="small">Summary source: ${esc(source)}</p>
  <p class="sign">Clinician sign-off: ..........................................&nbsp;&nbsp;&nbsp; Date: ....................</p></section>`;
}

function findingsPage(c, A, n) {
  const { fd, res, cg, imp } = c, de = fd.deid !== false;
  const row = (l, v) => `${(l + ':').padEnd(24)} ${v}`;
  const rad = [], acq = [], cli = [];
  const pair = (m, l) => `medial ${fd[m] || '-'}   lateral ${fd[l] || '-'}`;
  if (fd.jsnm || fd.jsnl) rad.push(row('Joint-space narrowing (OARSI 0-3)', pair('jsnm', 'jsnl')));
  if (fd.ostm || fd.ostl) rad.push(row('Osteophytes (OARSI 0-3)', pair('ostm', 'ostl')));
  [['scl', 'Subchondral sclerosis'], ['cyst', 'Subchondral cysts'], ['def', 'Bone-end deformity'], ['align', 'Alignment']].forEach(([k, l]) => fd[k] && rad.push(row(l, fd[k])));
  if (!de && fd.date) acq.push(row('Exam date', fd.date));
  if (fd.view) acq.push(row('View', fd.view)); if (fd.wb) acq.push(row('Weight-bearing', fd.wb));
  if (fd.symp) cli.push(row('Symptomatic knee', fd.symp));
  if (!de && +fd.age > 0) cli.push(row('Age', `${fd.age} years`)); if (!de && fd.sex) cli.push(row('Sex', fd.sex));
  if (+fd.height > 0 && +fd.weight > 0) cli.push(row('BMI', `${(fd.weight / (fd.height / 100) ** 2).toFixed(1)} kg/m^2 (height ${fd.height} cm, weight ${fd.weight} kg)`));
  [['pain', 'Pain (0-10)'], ['dur', 'Symptom duration'], ['stiff', 'Morning stiffness'], ['func', 'Function limited']].forEach(([k, l]) => fd[k] && cli.push(row(l, fd[k])));
  const blk = (t, L) => `<h3>${t}</h3><p class="mono">${L.length ? esc(L.join('\n')) : '   not recorded'}</p>`;
  return `<section class="page">${head(c.name, c.side, 'Structured findings and clinical context', n, c.when)}
  ${blk('Radiographic findings (entered by the clinician)', rad)}
  <p class="mono">   Clinician KL grade: ${cg === null ? 'not recorded' : 'KL' + cg}     AI KL grade: KL${res.kl}     Agreement: ${A.cat}</p>
  ${blk('Acquisition', acq)}${blk('Clinical context', cli)}${blk('Final clinician impression', imp ? [imp] : [])}
  <p class="it" style="margin-top:14px">Clinical context supports the overall assessment; it is not evidence that the AI grade is correct.<br>
  BMI and symptoms inform risk and management but do not determine the KL grade. OARSI scores here are clinician-entered, not measured by the software.</p>
  ${de ? '<p>De-identified: exam date, age and sex omitted.</p>' : ''}
  <p class="sign">Clinician sign-off: ..........................................&nbsp;&nbsp;&nbsp; Date: ....................</p></section>`;
}

function evidencePage(c, A, n) {
  const t = A.att, [x, y, w, h] = t.box;
  const svg = `<svg viewBox="0 0 224 224" style="position:absolute;inset:0;width:100%;height:100%"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="6 4"/>
    <text x="${t.peak[0]}" y="${t.peak[1] + 5}" font-size="16" fill="#fff" text-anchor="middle">★</text></svg>`;
  const pc = v => `${Math.round(100 * v)}%`;
  return `<section class="page">${head(c.name, c.side, 'Visual evidence', n, c.when)}
  <div class="two"><figure><figcaption>A&nbsp; Original radiograph (224x224)</figcaption><img src="${c.imgs.raw}"></figure>
  <figure><figcaption>B&nbsp; Contrast-enhanced (CLAHE 0.02, 224x224) - model input</figcaption><img src="${c.imgs.base}"></figure>
  <figure><figcaption>C&nbsp; Grad-CAM overlay</figcaption><img src="${c.imgs.over}"></figure>
  <figure><figcaption>D&nbsp; Unblended map; dashed = joint region (Step 8 rule); star = peak</figcaption><div style="position:relative;max-width:300px;margin:auto"><img src="${c.imgs.heat}">${svg}</div></figure></div>
  <h3>Interpretation of the attention map (this knee)</h3>
  <p>• Share of attention in the joint region: <b>${pc(t.roiMass)}</b> (test-set mean 42%; chance 25%) -&gt; ${t.onJoint ? 'attention is on the tibiofemoral joint region' : 'attention is mostly outside the joint region'}<br>
  • Share on the image border: ${pc(t.borderMass)} (test-set mean 20%; chance 35%)<br>
  • Peak attention inside the joint region: ${t.peakInROI ? 'yes' : 'no'} (73% of test knees)<br>
  • Concentration: the most-attended 10% of the image holds ${pc(t.top10)} of the attention (10% would be completely diffuse)<br>
  • Within the joint region: ${pc(t.leftShare)} image-left / ${pc(1 - t.leftShare)} image-right. Not labelled medial/lateral: view orientation is not verified.</p>
  <p class="it">Grad-CAM shows where the model looked, not proof that its reasoning is correct. Step 8 audit: hiding the most-attended regions changes the prediction more than hiding random regions (faithful maps), and attention shifts to the medial compartment at KL3-4 on average.</p>
  <p><b>Not available in this prototype:</b> joint-space width (no femur/tibia segmentation; absolute JSW unavailable - image calibration not supplied). OARSI narrowing/osteophyte scores are clinician-entered (Findings tab), not measured by the software.</p></section>`;
}

function analyticsPage(c, A, n) {
  const { res, cg } = c, k = res.kl, R = REF;
  return `<section class="page">${head(c.name, c.side, 'AI analytics for this knee', n, c.when)}
  <div class="two"><div><h3 style="text-align:center;margin-top:0">KL-grade probabilities (Model 4B)</h3>${bars(KLN, res.P5, k, cg)}</div>
  <div><h3 style="text-align:center;margin-top:0">Severity-group probabilities (Model 1 + TTA)</h3>${bars(GRP, res.P3, res.grp, -1)}</div>
  <div><h3>Uncertainty</h3><p>Top grade: KL${k} (${pct(res.P5[k])})&nbsp;&nbsp; Second: KL${A.second} (${pct(res.P5[A.second])})<br>
  Margin between top two: ${Math.round(A.margin)} percentage points<br>Normalised entropy: ${A.entropy.toFixed(2)} (0 = certain, 1 = no information)<br>
  Severity-group confidence: ${pct(Math.max(...res.P3))}</p>
  <h3>Clinician vs AI</h3><p>Clinician grade: ${cg === null ? 'not recorded' : 'KL' + cg}<br>Category: ${A.cat}</p>
  <p class="it">A model can be confidently wrong: confidence is one signal, not a guarantee.</p></div>
  <div><h3>Reliability of a KL${k} prediction <span style="font-weight:400">(official test set, n = 1,656)</span></h3>
  <p>Sensitivity (recall) for KL${k}: ${R.rec[k]}% (95% CI ${R.recCI[k][0]}-${R.recCI[k][1]}), ${R.nTrue[k]} knees<br>
  Precision when AI says KL${k}: ${R.prec[k]}% (95% CI ${R.precCI[k][0]}-${R.precCI[k][1]}), ${R.nPred[k]} predictions<br>
  Reference within one grade when AI says KL${k}: ${R.within1[k]}%<br>
  Commonest error: reference was KL${R.fpTrue[k]} (${R.fpPct[k]}% of KL${k} predictions)<br>
  All grades: 58.9% exact, 86.7% within one grade, QWK 0.711<br>
  Severity group ${GRP[res.grp]}: recall ${R.recG[res.grp]}%, precision ${R.precG[res.grp]}%</p>
  <p><b>Validation status:</b> internal held-out test set only (OAI kneeKL224, patient-disjoint split). No external validation.</p></div></div>
  <div class="rag" style="background:${RGB[A.colour]}">Review status: ${A.colour} - ${esc(A.why)}</div>
  <p class="small" style="margin-top:8px"><b>Colour rule</b> (display rule; the three review flags were fixed before testing, the others were added for the report):<br>
  <b style="color:${RGB.GREEN}">GREEN</b> suitable image, confident prediction, no clinician-AI disagreement<br>
  <b style="color:${RGB.AMBER}">AMBER</b> adjacent-grade disagreement, low confidence (&lt;60%), the two AI models disagree, or margin &lt; 20 points<br>
  <b style="color:${RGB.RED}">RED</b> disagreement of 2+ grades, unusual exposure/contrast, attention mostly outside the joint, or image outside the training range<br>
  Image checks (thresholds from the 5,778 training images): clipped exposure or low detail -&gt; AMBER; colour or non-square image -&gt; RED.<br>
  Not detectable by this prototype: implants, unsupported views, out-of-distribution images - the clinician must check these.</p></section>`;
}

function appendix(c, hasFindings, n) {
  const rows = REF.C.map((r, i) => { const t = r.reduce((a, b) => a + b, 0); return `<tr><th>${i}</th>${r.map((v, j) => `<td style="background:rgba(38,89,184,${(v / t).toFixed(2)});color:${v / t > 0.5 ? '#fff' : '#0f172a'}">${v}<br>(${Math.round(100 * v / t)}%)</td>`).join('')}</tr>`; }).join('');
  return `<section class="page">${head(c.name, c.side, 'Appendix - model card (same for every case)', n, c.when)}
  <h3>Models (locked, MD5-verified checkpoints; nothing retrained for this report)</h3>
  <p>• KL grade 0-4: Model 4B - ResNet-18, ordinal-cost loss, ensemble of seeds 42/7/123 + horizontal-flip test-time augmentation.<br>
  • Severity group (KL0-1 | KL2 | KL3-4): Model 1 - ResNet-18, ensemble of 3 seeds + flip TTA, KL0-1 margin 0.10 (Step 17 B).<br>
  • Heat map: Grad-CAM on Model 1 (layer res5b_relu), averaged over 3 seeds; audited for localisation and faithfulness (Step 8).</p>
  <p><b>Data</b>&nbsp; OAI kneeKL224 official split: 5,778 train / 826 validation / 1,656 test knees; patient-disjoint; no duplicate images.<br>
  <b>Input</b>&nbsp; greyscale -&gt; CLAHE (clip limit 0.02) -&gt; 224x224 -&gt; 3 channels. Training: transfer learning (ImageNet), progressive unfreezing, sqrt inverse-frequency class weights, rotation +/-10 deg and shift +/-5 px augmentation; model chosen on validation loss only.</p>
  <h3>Test results - KL grade (Model 4B + TTA)</h3>
  <p>Accuracy 58.9% | balanced accuracy 57.5% | macro precision 58.7% | macro F1 56.7% | QWK 0.711 | MAE 0.555 grades | within one grade 86.7%<br>
  Calibration: ECE 2.1% (probabilities match observed frequencies closely)<br>
  Per grade recall: ${REF.rec.map((v, i) => `KL${i} ${Math.round(v)}%`).join('&nbsp;&nbsp; ')}<br>
  Per grade precision: ${REF.prec.map((v, i) => `KL${i} ${Math.round(v)}%`).join('&nbsp;&nbsp; ')}</p>
  <p><b>Test results - severity group (Model 1 + TTA)</b>&nbsp; accuracy 74.9% (patient-level 95% CI 72.7-77.2) | balanced 70.5% | QWK 0.730 | ECE 3.7%</p>
  <h3>Known limitations</h3>
  <p>• KL1 ("doubtful") is detected poorly (19%); KL2 is often called KL0-1. Reference labels at KL0-KL2 are themselves uncertain (137 test knees, 8.3%, were confidently re-graded by all five models - not confirmed by an expert re-read).<br>
  • Single dataset (OAI); PNG images without acquisition metadata; no external validation; not a medical device (TGA).<br>
  • Not available in this prototype: calibrated joint-space width, automatic OARSI scoring, previous examinations (no longitudinal images).<br>
  • Structured clinician findings: ${hasFindings ? 'included (entered by the clinician, not verified by the software).' : 'none entered for this case - page omitted.'}</p>
  <h3>Confusion matrix, Model 4B + TTA (row %; rows = reference grade, columns = AI grade)</h3>
  <table class="cm"><tr><th></th>${[0, 1, 2, 3, 4].map(i => `<th>AI ${i}</th>`).join('')}</tr>${rows}</table></section>`;
}

// c: { res, cg, note, imp, fd, imgs:{raw,base,over,heat}, name, side, texts, edited, source }, kind: 'quick' | 'detailed'
export function openReport(c, kind) {
  c.when = new Date().toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const A = analyseCase(c.res, c.cg);
  const hasFindings = Object.entries(c.fd).some(([k, v]) => k !== 'deid' && v !== '' && v != null) || !!c.imp;
  let n = 1; const pages = [page1(c, A, n++)];
  if (kind === 'detailed') {
    if (hasFindings) pages.push(findingsPage(c, A, n++));
    pages.push(evidencePage(c, A, n++), analyticsPage(c, A, n++), appendix(c, hasFindings, n++));
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>KOA_Case_${esc(c.name.replace(/\.[^.]+$/, ''))}_${kind === 'quick' ? 'Quick' : 'Detailed'}</title><style>${CSS}</style></head>
  <body><button class="tb" onclick="print()">Print / save as PDF</button>${pages.join('')}</body></html>`;
  return html;
}
