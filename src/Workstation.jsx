// Workstation.jsx: full-width browser version of KOA_App (MATLAB): blind-first reading, compare with AI,
// summaries (KOA_Explain templates), structured findings and a printable report.
import { useEffect, useRef, useState } from 'react';
import { decodeImage, analyse, renderLayers } from './engine.js';
import { GROUP_SHORT } from './koa-core.js';

const SAMPLES = [
  { file: 'KL0_9003175L.png', kl: 0 }, { file: 'KL1_9001400L.png', kl: 1 }, { file: 'KL2_9003316R.png', kl: 2 },
  { file: 'KL3_9011053L.png', kl: 3 }, { file: 'KL4_9012867R.png', kl: 4 },
];
const KL_SHORT = ['KL0 Healthy', 'KL1 Doubtful', 'KL2 Minimal', 'KL3 Moderate', 'KL4 Severe'];
const NM = ['no radiographic OA', 'doubtful OA', 'minimal OA', 'moderate OA', 'severe OA'];
const CRIT = ['no radiographic features of OA', 'doubtful joint space narrowing and possible osteophytic lipping',
  'definite osteophytes and possible joint space narrowing',
  'multiple moderate osteophytes, definite joint space narrowing, some sclerosis and possible bone-end deformity',
  'large osteophytes, marked joint space narrowing, severe sclerosis and definite bone-end deformity'];
const PLAIN = ['no signs of osteoarthritis', 'possible very early signs of osteoarthritis', 'mild osteoarthritis', 'moderate osteoarthritis', 'severe osteoarthritis'];
const SENS = [87, 19, 43, 58, 80];   // Model 4B test sensitivity per grade
const KL_REF = ['no radiographic features of OA', 'doubtful narrowing, possible osteophytic lipping', 'definite osteophytes, possible narrowing',
  'moderate osteophytes, definite narrowing, some sclerosis, possible deformity', 'large osteophytes, marked narrowing, severe sclerosis, definite deformity'];
const GROUP_LONG = ['No/doubtful OA (KL0-1)', 'Minimal OA (KL2)', 'Moderate-severe OA (KL3-4)'];
const FINDINGS = [
  ['view', 'View', ['PA', 'AP', 'other'], 'Projection. The AI was trained on OAI frontal (PA fixed-flexion) views.'],
  ['wb', 'Weight-bearing', ['yes', 'no'], 'Standing films show true joint-space narrowing; lying-down films can underestimate it.'],
  ['symp', 'Symptomatic knee', ['this knee', 'other knee', 'both'], 'Which knee has symptoms.'],
  ['jsnm', 'JSN medial (0–3)', ['0', '1', '2', '3'], 'Joint-space narrowing, medial compartment (OARSI). 3 = bone-on-bone.'],
  ['jsnl', 'JSN lateral (0–3)', ['0', '1', '2', '3'], 'Joint-space narrowing, lateral compartment (OARSI).'],
  ['ostm', 'Osteophytes medial (0–3)', ['0', '1', '2', '3'], 'Marginal osteophytes, medial (OARSI; femoral + tibial combined).'],
  ['ostl', 'Osteophytes lateral (0–3)', ['0', '1', '2', '3'], 'Marginal osteophytes, lateral.'],
  ['scl', 'Sclerosis', ['none', 'mild', 'moderate', 'severe'], 'Subchondral sclerosis. Part of KL grades 3–4.'],
  ['cyst', 'Subchondral cysts', ['absent', 'present'], 'Lucencies in the bone beneath the cartilage.'],
  ['def', 'Bone-end deformity', ['absent', 'present'], 'Possible in KL3, definite in KL4.'],
  ['align', 'Alignment', ['varus', 'neutral', 'valgus'], 'Best judged on a long-leg film or examination.'],
  ['pain', 'Pain (0–10)', Array.from({ length: 11 }, (_, i) => String(i)), 'Numeric rating scale, e.g. average over the last week.'],
  ['dur', 'Symptom duration', ['< 3 months', '3–12 months', '> 1 year'], 'How long symptoms have been present.'],
  ['stiff', 'Morning stiffness', ['none', '< 30 min', '≥ 30 min'], '≥ 30 minutes may suggest inflammatory arthritis.'],
  ['func', 'Function limited', ['no', 'walking', 'stairs', 'walking + stairs'], 'Everyday activities the knee limits.'],
];
const DISC_C = 'Research prototype, not a medical device. Decision support only; the clinician makes the diagnosis. Validated only on OAI kneeKL224.';
const DISC_P = 'This is not a diagnosis. Please discuss your results with your doctor.';

function sideOf(name) { const m = /([LR])\.(png|jpe?g)$/i.exec(name || ''); return m ? (m[1].toUpperCase() === 'L' ? 'Left knee' : 'Right knee') : ''; }

// KOA_Explain.m templateText, ported word for word
function summaries(r, side, cg) {
  const k = r.kl, p5 = r.P5.map(v => Math.round(100 * v));
  const ord = [0, 1, 2, 3, 4].sort((a, b) => r.P5[b] - r.P5[a]);
  const sd = side || 'knee';
  let c = `AI second opinion (${sd}): KL${k}, ${NM[k]} (probability ${p5[k]}%). Next most likely: KL${ord[1]} (${p5[ord[1]]}%). ` +
    `Severity-group model: ${GROUP_LONG[r.grp]}, confidence ${Math.round(100 * Math.max(...r.P3))}%. KL${k} is defined by ${CRIT[k]}. ` +
    `On 1656 test knees this model identified KL${k} correctly in ${SENS[k]}% of cases (all grades: 58.9% exact, 86.7% within one grade).`;
  const fl = [];
  if (Math.max(...r.P3) < 0.6) fl.push('low confidence (the grade is uncertain)');
  if ([0, 0, 1, 2, 2][k] !== r.grp) fl.push('the two AI models disagree on the severity group');
  if (r.checks.mean < 30 || r.checks.mean > 225 || r.checks.sd < 20) fl.push('image exposure or contrast is unusual');
  c += fl.length ? ` Review flags: ${fl.join('; ')}. Treat this opinion with extra caution.` : ' No review flags (unflagged test knees: 81.7% correct for the severity group).';
  if (cg !== null) {
    const d = Math.abs(cg - k);
    if (d === 0) c += ` Your grade (KL${cg}) agrees with the AI.`;
    else if (d === 1) { const lo = Math.min(cg, k), hi = Math.max(cg, k); c += ` Your grade (KL${cg}) differs from the AI by one grade. One-grade differences are common between expert readers; the KL${lo}/KL${hi} boundary depends on ${CRIT[lo]} versus ${CRIT[hi]}.`; }
    else c += ` Your grade (KL${cg}) differs from the AI by ${d} grades. This is a larger disagreement than usual; a second look at osteophytes and joint space width is suggested before finalising.`;
  }
  const pt = `A computer program looked at the X-ray of your ${sd.toLowerCase()} and its best estimate is ${PLAIN[k]} (grade ${k} on a 0 to 4 scale). ` +
    'Programs like this are right about the exact grade a little over half the time, and usually within one grade, so this is only a second opinion for your doctor. ' +
    'Your doctor looks at the X-ray, your symptoms and your examination, and will explain what it means for you.';
  return { clin: `${c}\n\n${DISC_C}`, pat: `${pt}\n\n${DISC_P}` };
}

function agreement(cg, k) {
  if (cg === null) return { cls: 'none', text: 'Record your grade to see agreement.' };
  const d = Math.abs(cg - k);
  if (d === 0) return { cls: 'ok', text: `AGREES with your grade (KL${cg}).` };
  if (d === 1) return { cls: 'one', text: `One grade apart (you KL${cg}, AI KL${k}): common between readers; check the boundary features.` };
  return { cls: 'far', text: `${d} grades apart (you KL${cg}, AI KL${k}): a second look is suggested.` };
}

const toDataURL = (imgData) => { const c = document.createElement('canvas'); c.width = 224; c.height = 224; c.getContext('2d').putImageData(imgData, 0, 0); return c.toDataURL('image/png'); };
const esc = s => String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
function download(name, text, type = 'text/plain') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function Workstation({ load }) {
  const [img, setImg] = useState(null), [name, setName] = useState(''), [refKL, setRefKL] = useState(null);
  const [res, setRes] = useState(null), [busy, setBusy] = useState(0);
  const [blind, setBlind] = useState(true), [cg, setCg] = useState(null), [revealed, setRevealed] = useState(false);
  const [note, setNote] = useState(''), [view, setView] = useState('clahe'), [alpha, setAlpha] = useState(0.4);
  const [tab, setTab] = useState('clin'), [texts, setTexts] = useState({ clin: '', pat: '' }), [edited, setEdited] = useState(false);
  const [fd, setFd] = useState({}), [imp, setImp] = useState('');
  const cv = useRef(null), layers = useRef(null), fileIn = useRef(null);
  const side = sideOf(name);
  const showAI = res && (!blind || revealed);

  // draw: original / CLAHE / CLAHE + Grad-CAM at the chosen opacity (KOA_App overlay slider)
  useEffect(() => {
    const c = cv.current; if (!c) return; const cx = c.getContext('2d'); cx.clearRect(0, 0, 224, 224);
    if (!img) return;
    if (view === 'raw' || !res) {
      const t = document.createElement('canvas'); t.width = img.w; t.height = img.h; t.getContext('2d').putImageData(new ImageData(img.rgba, img.w, img.h), 0, 0);
      cx.drawImage(t, 0, 0, 224, 224); return;
    }
    const L = layers.current; if (!L) return;
    if (view === 'clahe' || !showAI) { cx.putImageData(L.base, 0, 0); return; }
    const out = new ImageData(224, 224);
    for (let i = 0; i < 50176 * 4; i += 4) {
      for (let ch = 0; ch < 3; ch++) out.data[i + ch] = (1 - alpha) * L.base.data[i + ch] + alpha * L.heat.data[i + ch];
      out.data[i + 3] = 255;
    }
    cx.putImageData(out, 0, 0);
  }, [img, res, view, alpha, showAI]);

  useEffect(() => { if (showAI) { setTexts(summaries(res, side, cg)); setEdited(false); } }, [showAI, res, cg]);

  async function open(blob, label, kl = null) {
    try {
      const im = await decodeImage(blob);
      setImg(im); setName(label); setRefKL(kl); setRes(null); setCg(null); setRevealed(false); setNote(''); setFd({}); setImp(''); setTab('clin');
      setView('clahe'); setBusy(0.01);
      await new Promise(r => setTimeout(r, 30));
      const r = await analyse(im, p => setBusy(Math.max(0.01, p)));
      const L = renderLayers(r.g, r.cam); layers.current = L; setRes(r); setBusy(0);
      setView(blind ? 'clahe' : 'cam');
    } catch (e) { setBusy(0); alert('That file could not be analysed. Use a PNG or JPEG knee X-ray.'); }
  }
  const random = async () => { const s = SAMPLES[Math.floor(Math.random() * SAMPLES.length)]; open(await (await fetch(`/samples/${s.file}`)).blob(), s.file, s.kl); };
  const compare = () => { setRevealed(true); setView('cam'); };

  function quickSummary() {
    const t = [`KOA second opinion: quick summary`, `File: ${name}${side ? '  (' + side + ')' : ''}`, `Generated: ${new Date().toLocaleString()}`, '',
      `Clinician grade: ${cg === null ? 'not recorded' : 'KL' + cg}`, note ? `Clinician note: ${note}` : null, '',
      `AI KL grade (Model 4B): KL${res.kl} (${(100 * res.P5[res.kl]).toFixed(0)}%)`, `AI severity group (Model 1): ${GROUP_LONG[res.grp]} (${(100 * Math.max(...res.P3)).toFixed(0)}%)`,
      `Review: ${res.flags.length ? res.flags.join('; ') : 'no review flags'}`, '', `CLINICIAN SUMMARY${edited ? ' (edited by clinician)' : ''}`, texts.clin, '', 'PATIENT SUMMARY', texts.pat].filter(x => x !== null).join('\n');
    download(`KOA_QuickSummary_${name.replace(/\.[^.]+$/, '')}.txt`, t);
  }

  function detailedReport() {
    const L = layers.current; const heat = (() => { const o = new ImageData(224, 224); for (let i = 0; i < 50176 * 4; i += 4) { for (let ch = 0; ch < 3; ch++) o.data[i + ch] = 0.6 * L.base.data[i + ch] + 0.4 * L.heat.data[i + ch]; o.data[i + 3] = 255; } return o; })();
    const bars = (labels, vals, hi, mark) => labels.map((l, i) => `<tr><td>${l}</td><td><div class="b"><i style="width:${(100 * vals[i]).toFixed(1)}%;background:${i === hi ? '#0f766e' : '#cbd5e1'};${i === mark ? 'outline:2px solid #ea580c;outline-offset:1px' : ''}"></i></div></td><td>${(100 * vals[i]).toFixed(1)}%</td></tr>`).join('');
    const fRows = FINDINGS.filter(([k]) => fd[k]).map(([k, l]) => `<tr><td>${l}</td><td>${esc(fd[k])}</td></tr>`).join('');
    const ag = agreement(cg, res.kl);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>KOA report ${esc(name)}</title><style>
      body{font:13px/1.5 'Segoe UI',Arial,sans-serif;color:#0f172a;margin:28px;max-width:900px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:22px 0 8px;border-bottom:1px solid #cbd5e1;padding-bottom:4px}
      .sub{color:#475569}.imgs{display:flex;gap:16px;margin-top:14px}.imgs figure{margin:0;text-align:center;font-size:11px;color:#475569}.imgs img{width:260px;height:260px;image-rendering:auto}
      table{border-collapse:collapse;width:100%}td{padding:3px 6px;vertical-align:middle}.b{background:#f1f5f9;height:10px;border-radius:5px;width:100%}.b i{display:block;height:10px;border-radius:5px}
      .verdict{display:flex;gap:30px;margin-top:10px}.verdict div{border:1px solid #cbd5e1;border-radius:8px;padding:10px 14px}.verdict b{font-size:17px;display:block}
      .ag{padding:8px 12px;border-radius:6px;margin-top:10px}.ok{background:#dcfce7}.one{background:#fef3c7}.far{background:#fee2e2}.none{background:#f1f5f9}
      pre{white-space:pre-wrap;font:inherit;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px}.disc{margin-top:24px;font-size:11px;color:#64748b;border-top:1px solid #cbd5e1;padding-top:8px}
      @media print{body{margin:12mm}button{display:none}}</style></head><body>
      <button onclick="print()" style="float:right;padding:8px 14px">Print / save as PDF</button>
      <h1>Knee OA second opinion: detailed report</h1><div class="sub">${esc(name)}${side ? ' · ' + side : ''} · ${new Date().toLocaleString()} · research prototype, not a medical device</div>
      <div class="imgs"><figure><img src="${toDataURL(L.base)}"><figcaption>Radiograph (CLAHE contrast-enhanced)</figcaption></figure>
      <figure><img src="${toDataURL(heat)}"><figcaption>Grad-CAM: regions that most influenced the 3-group decision</figcaption></figure></div>
      <h2>Result</h2><div class="verdict"><div>AI KL grade (Model 4B)<b>KL${res.kl} · ${NM[res.kl]}</b>${(100 * res.P5[res.kl]).toFixed(0)}% probability</div>
      <div>Severity group (Model 1)<b>${GROUP_LONG[res.grp]}</b>${(100 * Math.max(...res.P3)).toFixed(0)}% confidence</div>
      <div>Clinician grade<b>${cg === null ? 'not recorded' : 'KL' + cg}</b>${note ? esc(note) : '&nbsp;'}</div></div>
      <div class="ag ${ag.cls}">${ag.text}</div>
      <h2>Probabilities</h2><table>${bars(KL_SHORT, res.P5, res.kl, cg)}</table><br><table>${bars(GROUP_SHORT, res.P3, res.grp, -1)}</table>
      <h2>Review</h2><div>${res.flags.length ? 'REVIEW RECOMMENDED: ' + res.flags.join('; ') : 'No review flags (unflagged test knees: 81.7% correct for the severity group).'}${res.checks.issues.length ? '<br>Image checks: ' + res.checks.issues.join('; ') : ''}</div>
      <h2>Clinician summary${edited ? ' (edited by clinician)' : ''}</h2><pre>${esc(texts.clin)}</pre>
      <h2>Patient summary</h2><pre>${esc(texts.pat)}</pre>
      ${fRows || imp ? `<h2>Findings &amp; context (clinician-entered)</h2><table>${fRows}</table>${imp ? `<p><b>Final impression:</b> ${esc(imp)}</p>` : ''}` : ''}
      <h2>Model card</h2><div>3-group: ResNet-18, 3 seeds + flip TTA, KL0-1 margin 0.10 · test 74.94% (95% CI 72.71–77.12), QWK 0.730, ECE 3.7%.<br>
      KL grade: ResNet-18 with ordinal loss, 3 seeds + flip TTA · 58.9% exact, 86.7% within one grade, QWK 0.711. Per-grade sensitivity KL0–4: 87 / 19 / 43 / 58 / 80%.<br>
      Trained and tested on OAI kneeKL224 (1,656 test knees). Computed in the browser; the image was not uploaded.</div>
      <div class="disc">${DISC_C}</div></body></html>`;
    const w = window.open('', '_blank'); if (!w) { download(`KOA_Report_${name.replace(/\.[^.]+$/, '')}.html`, html, 'text/html'); return; }
    w.document.write(html); w.document.close();
  }

  const ag = res ? agreement(cg, res.kl) : null;
  return (
    <div className="ws">
      <div className="wsbar">
        <button className="tb primary" onClick={() => fileIn.current.click()} disabled={!load.ready}>Open knee X-ray…</button>
        <button className="tb" onClick={random} disabled={!load.ready}>Random test X-ray</button>
        <input ref={fileIn} type="file" accept="image/png,image/jpeg" hidden onChange={e => { const f = e.target.files[0]; if (f) open(f, f.name); e.target.value = ''; }} />
        <span className="sep" />
        <button className="tb" onClick={quickSummary} disabled={!showAI}>Save quick summary</button>
        <button className="tb" onClick={detailedReport} disabled={!showAI}>Save detailed report</button>
        <span className="sep" />
        <label className="tog" title="Hide the AI opinion until you have recorded your own grade (avoids anchoring)">
          <input type="checkbox" checked={blind} onChange={e => { setBlind(e.target.checked); if (!e.target.checked) setRevealed(true); }} />Blind first</label>
        <span className="wsstatus">{!load.ready ? `Loading models… ${Math.round(load.p * 100)}%` : busy > 0 ? `Analysing… ${Math.round(busy * 100)}%` : res ? `Analysed in ${(res.ms / 1000).toFixed(1)} s on this device` : 'Ready. Open an X-ray or pick a test knee.'}</span>
      </div>

      <div className="wsgrid">
        {/* Radiograph */}
        <section className="pane">
          <header>Radiograph{name ? ` · ${name}` : ''}{side ? `  ${side}` : ''}</header>
          <div className="stage big" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && load.ready) open(f, f.name); }}>
            <canvas ref={cv} width="224" height="224" />
            {!img && <span className="ph">Drop an anonymised knee X-ray here<br /><small>PNG or JPEG · processed on this device only</small></span>}
          </div>
          <div className="viewrow">
            <select value={view} onChange={e => setView(e.target.value)} disabled={!res}>
              <option value="raw">X-ray (original)</option><option value="clahe">X-ray (contrast-enhanced)</option>
              <option value="cam" disabled={!showAI}>Grad-CAM overlay</option>
            </select>
            <label className={`slider ${view !== 'cam' || !showAI ? 'off' : ''}`}>Overlay<input type="range" min="0" max="1" step="0.05" value={alpha} onChange={e => setAlpha(+e.target.value)} disabled={view !== 'cam' || !showAI} /></label>
          </div>
          <div className="legend"><span>Lower influence</span><i /><span>Higher influence</span></div>
          <div className="samplestrip"><span>Test knees:</span>{SAMPLES.map(s => (
            <button key={s.file} className={name === s.file ? 'on' : ''} disabled={!load.ready} onClick={async () => open(await (await fetch(`/samples/${s.file}`)).blob(), s.file, s.kl)}>
              <img src={`/samples/${s.file}`} alt="" />KL{s.kl}</button>))}</div>
        </section>

        {/* Your read */}
        <section className="pane read">
          <header>Your read</header>
          <b className="lbl">Your KL grade:</b>
          <div className="klbtns">{KL_SHORT.map((k, i) => <button key={k} className={cg === i ? 'on' : ''} disabled={!res} onClick={() => setCg(cg === i ? null : i)}>{k}</button>)}</div>
          <b className="lbl">Note (optional):</b>
          <textarea rows={4} value={note} onChange={e => setNote(e.target.value)} disabled={!res} />
          <button className="compare" disabled={!res || (blind && revealed) || (blind && cg === null)} onClick={compare}>
            {!res ? 'Compare with AI' : !blind || revealed ? 'AI opinion shown' : cg === null ? 'Record your grade first' : 'Compare with AI'}</button>
          <div className="klref"><b>KL reference (Kellgren–Lawrence)</b>{KL_REF.map((t, i) => <p key={i}><em>{i}</em>{t}</p>)}</div>
        </section>

        {/* AI second opinion */}
        <section className="pane ai">
          <header>AI second opinion</header>
          {!res ? <p className="wait">{busy > 0 ? 'Analysing…' : 'Awaiting an X-ray'}</p>
            : !showAI ? <div className="hidden-ai"><b>AI opinion hidden</b><p>Blind first is on: record your KL grade, then press <i>Compare with AI</i>. This avoids anchoring on the AI.</p></div>
              : <>
                <div className="headline"><b>{KL_SHORT[res.kl]}</b><span>({(100 * res.P5[res.kl]).toFixed(0)}%)</span></div>
                <div className={`agree2 ${ag.cls}`}>{ag.text}</div>
                <div className="chart">
                  <small>{cg !== null ? <>Teal = AI grade <span className="sw" /> orange outline = your grade</> : 'KL-grade probabilities (Model 4B ordinal + flip TTA)'}</small>
                  {KL_SHORT.map((k, i) => (
                    <div key={k} className={`crow ${i === res.kl ? 'hi' : ''}`}><span>{k}</span>
                      <div><i className={cg === i ? 'mine' : ''} style={{ width: `${100 * res.P5[i]}%` }} /></div><em>{(100 * res.P5[i]).toFixed(0)}%</em></div>))}
                </div>
                <div className={`info ${res.flags.length || res.checks.level !== 'OK' ? 'warn' : ''}`}>
                  <p>Severity group (3-group model): <b>{GROUP_LONG[res.grp]}</b>, confidence {(100 * Math.max(...res.P3)).toFixed(0)}%. {res.flags.length ? `Review flags: ${res.flags.join('; ')}.` : 'No review flags.'}</p>
                  <p>Test-set reliability: grade {res.kl} detected in {SENS[res.kl]}% of cases; 58.9% exact / 86.7% within one grade overall.</p>
                  {res.checks.level !== 'OK' && <p>Image check ({res.checks.level}): {res.checks.issues.join('; ')}</p>}
                  {refKL !== null && <p>Dataset reference label (demonstration only): KL{refKL}</p>}
                </div>
                <div className="tabs">{[['clin', 'Clinician summary'], ['pat', 'Patient summary']].map(([k, l]) =>
                  <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
                {tab !== 'find' ? <>
                  <textarea className="sumtext" value={texts[tab]} onChange={e => { setTexts({ ...texts, [tab]: e.target.value }); setEdited(true); }} />
                  <p className="mini">You can edit this text; the edited version is saved in the report (marked "edited by clinician").</p></>
                  : <div className="findings">
                    <p className="mini">All fields optional; empty fields are left out of the report. Hover a field for an explanation.</p>
                    <div className="fgrid">{FINDINGS.map(([k, l, opts, tip]) => (
                      <label key={k} title={tip}>{l}<select value={fd[k] || ''} onChange={e => setFd({ ...fd, [k]: e.target.value })}>
                        <option value="">—</option>{opts.map(o => <option key={o}>{o}</option>)}</select></label>))}</div>
                    <label className="impl">Final impression<textarea rows={2} value={imp} onChange={e => setImp(e.target.value)} /></label>
                  </div>}
              </>}
        </section>
      </div>
      <div className="wsfoot">Research prototype, not a medical device. Decision support only: the clinician makes the diagnosis. Validated only on the OAI kneeKL224 test set (1,656 knees).</div>
    </div>
  );
}
