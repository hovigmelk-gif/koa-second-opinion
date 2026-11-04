import { useEffect, useRef, useState } from 'react';
import { loadModels, decodeImage, analyse, renderLayers } from './engine.js';
import { GROUPS, GROUP_SHORT, KL_NAMES } from './koa-core.js';
import { supabase } from './supabaseClient.js';
import Workstation from './Workstation.jsx';

// Set your LinkedIn profile URL here to show the "Connect on LinkedIn" button
const LINKEDIN = '';
const go = id => e => { e?.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); };

const SAMPLES = [
  { file: 'KL0_9003175L.png', label: 'KL 0', note: 'No OA' },
  { file: 'KL1_9001400L.png', label: 'KL 1', note: 'Doubtful' },
  { file: 'KL2_9003316R.png', label: 'KL 2', note: 'Minimal' },
  { file: 'KL3_9011053L.png', label: 'KL 3', note: 'Moderate' },
  { file: 'KL4_9012867R.png', label: 'KL 4', note: 'Severe' },
];
const pct = (v, d = 1) => `${(100 * v).toFixed(d)}%`;

export default function App() {
  const [route, setRoute] = useState(() => (location.hash === '#/app' ? 'app' : 'home'));
  const [load, setLoad] = useState({ p: 0, ready: false, err: '' });
  useEffect(() => {
    const on = () => {   // only the #/app hash switches views; section links scroll without touching the hash
      const next = location.hash === '#/app' ? 'app' : 'home';
      setRoute(prev => { if (prev !== next) window.scrollTo(0, 0); return next; });
    };
    addEventListener('hashchange', on); return () => removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {   // models start downloading on the front page, so the app is ready when opened
    loadModels(p => setLoad(l => ({ ...l, p })))
      .then(() => setLoad({ p: 1, ready: true, err: '' }))
      .catch(e => setLoad({ p: 0, ready: false, err: e.message }));
  }, []);
  if (route === 'app') return <AppView load={load} />;
  return (
    <>
      <Header />
      <main>
        <Hero load={load} />
        <Pipeline />
        <KLScale />
        <Results />
        <Verification />
        <Gallery />
        <Limits />
        <CtaBand load={load} />
        <Reviews />
        <Connect />
      </main>
      <Footer />
    </>
  );
}

function Header() {
  return (
    <header className="top">
      <div className="wrap top-in">
        <a href="#/" className="brand" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><span className="dot" />KOA Second Opinion</a>
        <nav>
          <a href="#how" onClick={go('how')}>How it works</a><a href="#results" onClick={go('results')}>Results</a>
          <a href="#figures" onClick={go('figures')}>Figures</a><a href="#reviews" onClick={go('reviews')}>Reviews</a><a href="#connect" onClick={go('connect')}>Connect</a>
          <a className="navcta" href="#/app">Launch app →</a>
        </nav>
      </div>
    </header>
  );
}

function AppView({ load }) {
  return (
    <div className="appview">
      <div className="appbar">
        <a href="#/" className="back">← Back to project</a>
        <span className="brand"><span className="dot" />KOA Second Opinion</span>
        <span className="tag">Research prototype · not for clinical use</span>
      </div>
      <Workstation load={load} />
    </div>
  );
}

function Hero({ load }) {
  return (
    <section className="hero wrap">
      <p className="pill">Research prototype · Biomedical Engineering, UTS</p>
      <h1>Grading knee osteoarthritis from a single X-ray, <em>entirely in your browser.</em></h1>
      <p className="lede">
        A clinician-first second opinion: a three-seed ResNet-18 ensemble reads a knee radiograph, places it in one of
        three Kellgren–Lawrence severity groups, estimates the full KL grade, shows where it looked, and flags the cases a
        clinician should look at twice. The X-ray never leaves your device.
      </p>
      <div className="cta">
        <a className="btn primary big" href="#/app">Launch the app →</a>
        <a className="btn ghost big" href="#results" onClick={go('results')}>See the results</a>
        <span className="cta-note">{load.ready ? 'Models loaded · ready' : load.err ? 'Model download failed, refresh to retry' : `Preparing models · ${Math.round(load.p * 100)}%`}</span>
      </div>
      <div className="stats">
        <Stat n="74.9%" l="3-group accuracy" s="1,656 held-out test knees" />
        <Stat n="0.730" l="Quadratic weighted κ" s="agreement with reference grades" />
        <Stat n="86.7%" l="KL grade within one" s="5-grade ordinal model" />
        <Stat n="3.7%" l="Calibration error" s="expected calibration error" />
      </div>
    </section>
  );
}
const Stat = ({ n, l, s }) => <div className="stat"><b>{n}</b><span>{l}</span><small>{s}</small></div>;

function Demo({ load }) {
  const [img, setImg] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(0);
  const [res, setRes] = useState(null);
  const [view, setView] = useState('cam');
  const [read, setRead] = useState('');
  const cv = useRef(null), layers = useRef(null), fileIn = useRef(null);

  useEffect(() => {
    const c = cv.current; if (!c) return; const cx = c.getContext('2d');
    if (res && layers.current) cx.putImageData(view === 'cam' ? layers.current.over : layers.current.base, 0, 0);
    else if (img) {
      const t = new OffscreenCanvas(img.w, img.h); t.getContext('2d').putImageData(new ImageData(img.rgba, img.w, img.h), 0, 0);
      cx.clearRect(0, 0, 224, 224); cx.drawImage(t, 0, 0, 224, 224);
    } else cx.clearRect(0, 0, 224, 224);
  }, [img, res, view]);

  async function pick(blob, label) {
    try { setImg(await decodeImage(blob)); setName(label); setRes(null); setRead(''); }
    catch { alert('That file could not be read as an image. Use PNG or JPEG.'); }
  }
  async function run() {
    setBusy(0.01); await new Promise(r => setTimeout(r, 30));
    const r = await analyse(img, p => setBusy(Math.max(0.01, p)));
    layers.current = renderLayers(r.g, r.cam); setRes(r); setView('cam'); setBusy(0);
  }

  return (
    <section className="demo">
      <div className="wrap">

        {!load.ready && (
          <div className="loader">
            {load.err ? <span className="err">Model download failed: {load.err}. Refresh to retry.</span> : <>
              <span>Downloading the six trained networks ({Math.round(135 * load.p)} of 135 MB) · cached after the first visit</span>
              <div className="bar"><i style={{ width: pct(load.p, 0) }} /></div></>}
          </div>
        )}

        <div className="console">
          <aside className="col input">
            <h3>1 · Radiograph</h3>
            <button className="drop" onClick={() => fileIn.current.click()}
              onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) pick(f, f.name); }}>
              <strong>Choose or drop an anonymised knee X-ray</strong>
              <span>PNG or JPEG · processed on this device only</span>
            </button>
            <input ref={fileIn} type="file" accept="image/png,image/jpeg" hidden onChange={e => { const f = e.target.files[0]; if (f) pick(f, f.name); e.target.value = ''; }} />
            <p className="mini">Or a held-out test knee (OAI, never seen in training):</p>
            <div className="samples">
              {SAMPLES.map(s => (
                <button key={s.file} className={name === s.file ? 'on' : ''}
                  onClick={async () => pick(await (await fetch(`/samples/${s.file}`)).blob(), s.file)}>
                  <img src={`/samples/${s.file}`} alt={`${s.label} test knee`} title={s.note} /><b>{s.label}</b>
                </button>))}
            </div>
            <div className="fname">{name || 'No file selected'}</div>
            <button className="btn primary block" disabled={!img || !load.ready || busy > 0} onClick={run}>
              {busy > 0 ? `Analysing… ${Math.round(busy * 100)}%` : !load.ready ? 'Loading models…' : 'Analyse image'}
            </button>
            <label className="read">Your KL read (optional)
              <select value={read} onChange={e => setRead(e.target.value)}>
                <option value="">Not recorded</option>
                {KL_NAMES.map((k, i) => <option key={k} value={i}>{k}</option>)}
              </select>
            </label>
          </aside>

          <div className="col viewer">
            <div className="vhead">
              <h3>2 · Image review</h3>
              <div className="seg">
                <button className={view === 'base' ? 'on' : ''} disabled={!res} onClick={() => setView('base')}>CLAHE X-ray</button>
                <button className={view === 'cam' ? 'on' : ''} disabled={!res} onClick={() => setView('cam')}>Grad-CAM overlay</button>
              </div>
            </div>
            <div className="stage">
              <canvas ref={cv} width="224" height="224" />
              {!img && <span className="ph">The radiograph appears here</span>}
            </div>
            <div className="legend"><span>Lower influence</span><i /><span>Higher influence</span></div>
            <p className="mini">Grad-CAM shows the regions that most influenced the 3-group decision (average of the three seeds, layer res5b_relu). It does not mark disease boundaries.</p>
          </div>

          <aside className="col out">
            <h3>3 · AI second opinion</h3>
            {!res ? <p className="wait">Awaiting analysis</p> : <Result r={res} read={read} />}
          </aside>
        </div>
      </div>
    </section>
  );
}

function Result({ r, read }) {
  const review = r.flags.length > 0 || r.checks.level !== 'OK';
  const readGroup = read === '' ? null : [0, 0, 1, 2, 2][+read];
  return (
    <div className="result">
      <div className={`verdict g${r.grp}`}>
        <small>Predicted severity group</small>
        <b>{GROUPS[r.grp]}</b>
        <span>{pct(r.P3[r.grp])} ensemble probability</span>
      </div>
      <Bars title="3-group probabilities · Model 1 + flip TTA" labels={GROUP_SHORT} vals={r.P3} hi={r.grp} />
      <Bars title="KL grade · Model 4B ordinal + flip TTA" labels={KL_NAMES} vals={r.P5} hi={r.kl} alt />
      {readGroup !== null && (
        <p className={`agree ${readGroup === r.grp ? 'yes' : 'no'}`}>
          {readGroup === r.grp ? 'Matches your read at group level.' : `Differs from your read (${GROUP_SHORT[readGroup]}). Worth a second look.`}
        </p>)}
      <div className={`flags ${review ? 'warn' : 'ok'}`}>
        <b>{review ? 'Review recommended' : 'No review flags'}</b>
        {[...r.flags, ...r.checks.issues].map(f => <span key={f}>• {f}</span>)}
        {r.checks.level === 'OUTSIDE' && <span>• This image differs from the training data: the AI result is not reliable.</span>}
      </div>
      <p className="mini">12 network passes in {(r.ms / 1000).toFixed(1)} s on this device.</p>
    </div>
  );
}

function Bars({ title, labels, vals, hi, alt }) {
  return (
    <div className="bars">
      <small>{title}</small>
      {labels.map((l, i) => (
        <div key={l} className={`brow ${i === hi ? 'hi' : ''} ${alt ? 'alt' : ''}`}>
          <span>{l}</span><div><i style={{ width: pct(vals[i]) }} /></div><em>{pct(vals[i])}</em>
        </div>))}
    </div>
  );
}

function Pipeline() {
  const steps = [
    ['Contrast', 'CLAHE (clip limit 0.02, 8 × 8 tiles) evens out exposure across the joint, exactly as at training time.'],
    ['Standardise', 'Resize to 224 × 224 and copy the grey image into three channels for ResNet-18.'],
    ['Ensemble + TTA', 'Three independently trained seeds (42, 7, 123) each read the image and its mirror; the six softmax outputs are averaged.'],
    ['Decide', 'Subtract 0.10 from the KL 0–1 probability, then take the highest group, a rule fixed on validation data to rescue under-called KL 2 knees.'],
    ['Grade', 'A second ResNet-18 trained with an ordinal loss estimates KL 0–4, penalising far-off grades more than near misses.'],
    ['Explain + flag', 'Grad-CAM shows where Model 1 looked; pre-declared rules flag low confidence (< 60%), model disagreement and poor image quality.'],
  ];
  return (
    <section id="how" className="wrap sec">
      <div className="sec-head"><p className="eyebrow">How it works</p><h2>From radiograph to second opinion in six steps</h2></div>
      <Overview />
      <ol className="steps">{steps.map(([t, d], i) => <li key={t}><b><em>{i + 1}</em>{t}</b><p>{d}</p></li>)}</ol>
      <p className="note">Trained with two-stage transfer learning (head, then all layers), class weights of 1/√n and light augmentation (±10° rotation, ±5 px shift), on the official kneeKL224 split: 5,778 training, 826 validation and 1,656 test knees with no patient overlap. Every model choice was made on validation data; the test set was used once per model.</p>
    </section>
  );
}

function Results() {
  const cm = [[820, 108, 7], [193, 212, 42], [24, 41, 209]];
  const models = [
    ['5-class ResNet-18 baseline', 55.50, 'reference'],
    ['Model 3 · ResNet-101', 74.15, '42.6 M parameters'],
    ['Model 1 · ResNet-18', 74.03, '11.2 M parameters'],
    ['Model 2 · ResNet-50', 72.83, '23.5 M parameters'],
    ['Model 5 · EfficientNet-B0', 70.23, 'same protocol'],
  ];
  return (
    <section id="results" className="results">
      <div className="wrap sec">
        <div className="sec-head"><p className="eyebrow">Results</p><h2>Held-out test performance (n = 1,656)</h2></div>
        <div className="grid2">
          <div className="card">
            <h3>Final 3-group model · confusion matrix</h3>
            <table className="cm">
              <thead><tr><th>True ↓ / Pred →</th>{GROUP_SHORT.map(g => <th key={g}>{g}</th>)}<th>Recall</th></tr></thead>
              <tbody>{cm.map((row, i) => {
                const tot = row.reduce((a, b) => a + b, 0);
                return <tr key={i}><th>{GROUP_SHORT[i]}</th>{row.map((v, j) =>
                  <td key={j} style={{ '--a': v / tot }} className={i === j ? 'd' : ''}>{v}</td>)}<td className="rc">{pct(row[i] / tot)}</td></tr>;
              })}</tbody>
            </table>
            <p className="mini">Accuracy 74.94% (95% CI 72.71–77.12), balanced accuracy 70.47%, macro F1 71.40, QWK 0.730. KL 2 is the hardest group: the boundary with KL 0–1 is uncertain even between expert readers.</p>
          </div>
          <div className="card">
            <h3>Why ResNet-18? Bigger was not better</h3>
            <div className="mbars">{models.map(([n, v, s]) => (
              <div key={n} className={n.startsWith('Model 1') ? 'hi' : ''}><span>{n}<small>{s}</small></span>
                <div><i style={{ width: `${v}%` }} /></div><em>{v.toFixed(2)}%</em></div>))}
            </div>
            <p className="mini">Single-pass test accuracy before flip TTA. ResNet-50 and ResNet-101 were not significantly better (McNemar p = 0.22 and 0.95) but were 2–4× slower and overfit more. EfficientNet-B0 was significantly worse (p = 0.001).</p>
          </div>
        </div>
        <CM5 />
        <div className="kpis">
          <div><b>58.9%</b><span>exact KL grade (Model 4B)</span></div>
          <div><b>0.711</b><span>QWK, 5-grade</span></div>
          <div><b>27.2%</b><span>of knees flagged for review</span></div>
          <div><b>81.7%</b><span>correct among unflagged knees</span></div>
        </div>
      </div>
    </section>
  );
}

function Verification() {
  const rows = [
    ['9003175L', 'KL 0', 'KL 0–1', 97.59, 97.57, 'KL 0'],
    ['9001400L', 'KL 1', 'KL 0–1', 85.25, 85.14, 'KL 0'],
    ['9003316R', 'KL 2', 'KL 2', 58.22, 58.38, 'KL 2'],
    ['9011053L', 'KL 3', 'KL 3–4', 96.91, 96.94, 'KL 3'],
    ['9012867R', 'KL 4', 'KL 3–4', 98.52, 98.52, 'KL 4'],
  ];
  return (
    <section className="wrap sec">
      <div className="sec-head"><p className="eyebrow">Verification</p><h2>The browser gives the same answers as the MATLAB app</h2>
        <p>The trained MATLAB networks were exported to ONNX, cut at the last convolutional block; pooling, the classifier, the decision rule and Grad-CAM are re-implemented here and checked against MATLAB on reference knees.</p></div>
      <div className="card tablewrap">
        <table className="ver">
          <thead><tr><th>Test knee</th><th>Reference</th><th>3-group (both)</th><th>MATLAB</th><th>Browser</th><th>KL grade (both)</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3].toFixed(2)}%</td><td>{r[4].toFixed(2)}%</td><td>{r[5]}</td></tr>)}</tbody>
        </table>
        <div className="fullcheck"><b>Full test set, all 1,656 knees:</b> the browser pipeline reproduces the MATLAB results exactly: 74.94% 3-group accuracy with the identical confusion matrix, 58.88% exact KL grade, 86.65% within one grade, and the same review flags (27.2% flagged, 81.7% correct when unflagged).</div>
        <p className="mini">CLAHE output is bit-identical to MATLAB adapthisteq; Grad-CAM maps correlate at r = 0.9999. The full-test-set check used full-precision weights; the live site stores them at half precision to halve the download, which moved probabilities by at most 0.16 percentage points on the reference knees.</p>
      </div>
    </section>
  );
}

function Limits() {
  return (
    <section id="limits" className="wrap sec limits">
      <div className="sec-head"><p className="eyebrow">Limits</p><h2>What this is, and what it is not</h2></div>
      <ul>
        <li><b>Not a medical device.</b> A research prototype for decision support; the reading clinician makes the diagnosis.</li>
        <li><b>One dataset.</b> Trained and tested on Osteoarthritis Initiative radiographs (kneeKL224). Other scanners, crops or photos are outside what it has seen, and the input checks will say so.</li>
        <li><b>KL 2 is often under-called.</b> Recall is 47% for minimal OA; about 8% of test labels near the KL 0–2 boundary are themselves doubtful.</li>
        <li><b>KL 1 is the weakest grade</b> in the 5-grade model (19% recall), which is why the 3-group result is the main output.</li>
      </ul>
    </section>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <p><b>Hovig Melkonyants</b> · Biomedical Engineering, University of Technology Sydney. Model development and optimisation for the Group 16 knee-OA project, Advanced Biomedical Engineering Studio B (2026).</p>
        <p className="mini">Data: Chen P. (2018), Knee Osteoarthritis Severity Grading Dataset, Mendeley Data, from the Osteoarthritis Initiative; sample images are held-out test knees. Models: MATLAB Deep Learning Toolbox, served with ONNX Runtime Web. Research prototype only; not for clinical use.</p>
      </div>
    </footer>
  );
}

function KLScale() {
  const kl = [
    ['KL 0', 'None', 'No radiographic features of osteoarthritis.', 'KL 0–1'],
    ['KL 1', 'Doubtful', 'Possible osteophytic lipping; doubtful joint-space narrowing.', 'KL 0–1'],
    ['KL 2', 'Minimal', 'Definite osteophytes; possible joint-space narrowing.', 'KL 2'],
    ['KL 3', 'Moderate', 'Multiple osteophytes, definite narrowing, some sclerosis.', 'KL 3–4'],
    ['KL 4', 'Severe', 'Large osteophytes, marked narrowing, severe sclerosis, bone deformity.', 'KL 3–4'],
  ];
  return (
    <section className="wrap sec">
      <div className="sec-head"><p className="eyebrow">The Kellgren–Lawrence scale</p><h2>Five grades, three clinical groups</h2>
        <p>The main output groups the five KL grades the way treatment decisions do; the 5-grade model gives the finer estimate.</p></div>
      <div className="klgrid">{kl.map(([g, n, d, grp], i) => (
        <div key={g} className={`kl k${i}`}><i /><b>{g}</b><span>{n}</span><p>{d}</p><small>Group {grp}</small></div>))}</div>
    </section>
  );
}

function CtaBand({ load }) {
  return (
    <section className="wrap"><div className="ctaband">
      <h2>Have a knee X-ray ready?</h2>
      <p>Run the real trained ensemble in your browser and see the grade, the Grad-CAM map and the review flags.</p>
      <a className="btn primary big" href="#/app">Launch the app →</a>
      <small>{load.ready ? 'Models loaded · ready' : `Preparing models · ${Math.round(load.p * 100)}%`}</small>
    </div></section>
  );
}

const Stars = ({ n, size = 16, onPick }) => (
  <span className="stars" style={{ fontSize: size }}>{[1, 2, 3, 4, 5].map(i => (
    <button type="button" key={i} className={i <= n ? 'on' : ''} disabled={!onPick} onClick={() => onPick?.(i)} aria-label={`${i} star${i > 1 ? 's' : ''}`}>★</button>))}</span>
);

function Reviews() {
  const [list, setList] = useState([]);
  const [f, setF] = useState({ name: '', role: '', rating: 0, comment: '' });
  const [st, setSt] = useState('');
  useEffect(() => { supabase.from('reviews').select('id,created_at,name,role,rating,comment').order('created_at', { ascending: false }).limit(60).then(({ data }) => data && setList(data)); }, []);
  const avg = list.length ? list.reduce((a, r) => a + (r.rating || 0), 0) / list.length : 0;
  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim() || !f.comment.trim() || !f.rating) { setSt('Please add your name, a star rating and a comment.'); return; }
    setSt('sending');
    try {
      const { data: r, error } = await supabase.from('reviews').insert({ name: f.name.trim().slice(0, 80), role: f.role.trim().slice(0, 100) || null, rating: f.rating, comment: f.comment.trim().slice(0, 1000) }).select().single();
      if (error) throw error;
      setList(l => [r, ...l]); setF({ name: '', role: '', rating: 0, comment: '' }); setSt('Thank you, your review is posted.');
    } catch { setSt('Sorry, that did not send. Please try again.'); }
  }
  return (
    <section id="reviews" className="wrap sec">
      <div className="sec-head"><p className="eyebrow">Reviews</p><h2>What people think</h2>
        <p>Tried the app? Clinicians, engineers and students: your feedback helps shape the next version.</p></div>
      <div className="grid2">
        <form className="card form" onSubmit={submit}>
          <h3>Leave a review</h3>
          <label>Your rating<Stars n={f.rating} size={26} onPick={rating => setF({ ...f, rating })} /></label>
          <label>Name<input value={f.name} maxLength={80} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Your name" /></label>
          <label>Role or organisation <em>(optional)</em><input value={f.role} maxLength={100} onChange={e => setF({ ...f, role: e.target.value })} placeholder="e.g. Physiotherapist, UTS student" /></label>
          <label>Comment<textarea rows={4} value={f.comment} maxLength={1000} onChange={e => setF({ ...f, comment: e.target.value })} placeholder="What worked, what would you change?" /></label>
          <button className="btn primary" disabled={st === 'sending'}>{st === 'sending' ? 'Posting…' : 'Post review'}</button>
          {st && st !== 'sending' && <p className="formnote">{st}</p>}
          <p className="mini">Reviews are public. Please don't include patient information.</p>
        </form>
        <div className="revlist">
          {list.length > 0 && <div className="avg"><b>{avg.toFixed(1)}</b><Stars n={Math.round(avg)} /><span>{list.length} review{list.length > 1 ? 's' : ''}</span></div>}
          {list.length === 0 && <div className="card empty">No reviews yet. Be the first.</div>}
          {list.map(r => (
            <div key={r.id} className="card rev">
              <div className="revhead"><b>{r.name}</b><Stars n={r.rating} size={14} /></div>
              {r.role && <small>{r.role}</small>}
              <p>{r.comment}</p>
            </div>))}
        </div>
      </div>
    </section>
  );
}

function Connect() {
  const [f, setF] = useState({ name: '', email: '', message: '' });
  const [st, setSt] = useState('');
  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim() || !/^\S+@\S+\.\S+$/.test(f.email) || !f.message.trim()) { setSt('Please add your name, a valid email and a message.'); return; }
    setSt('sending');
    try { const { error } = await supabase.from('contact_messages').insert({ name: f.name.trim().slice(0, 80), email: f.email.trim(), message: f.message.trim().slice(0, 2000) }); if (error) throw error; setF({ name: '', email: '', message: '' }); setSt('Thanks, your message has been sent. I\'ll get back to you.'); }
    catch { setSt('Sorry, that did not send. Please try again.'); }
  }
  return (
    <section id="connect" className="wrap sec">
      <div className="grid2 connect">
        <div>
          <p className="eyebrow">Connect</p>
          <h2>Let's talk</h2>
          <p className="lede sm">I'm a biomedical engineering student at UTS working on machine learning for medical imaging, with a focus on bionics and the lower limb. Open to research collaborations, internships and graduate roles.</p>
          {LINKEDIN && <a className="btn linkedin" href={LINKEDIN} target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/></svg>Connect on LinkedIn</a>}
        </div>
        <form className="card form" onSubmit={submit}>
          <h3>Send me a message</h3>
          <label>Name<input value={f.name} maxLength={80} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label>Email<input type="email" value={f.email} maxLength={120} onChange={e => setF({ ...f, email: e.target.value })} /></label>
          <label>Message<textarea rows={5} value={f.message} maxLength={2000} onChange={e => setF({ ...f, message: e.target.value })} /></label>
          <button className="btn primary" disabled={st === 'sending'}>{st === 'sending' ? 'Sending…' : 'Send message'}</button>
          {st && st !== 'sending' && <p className="formnote">{st}</p>}
          <p className="mini">Messages go privately to me; they are not published.</p>
        </form>
      </div>
    </section>
  );
}

function CM5() {
  const cm = [[557, 49, 31, 1, 1], [191, 55, 48, 2, 0], [157, 71, 192, 26, 1], [14, 13, 47, 130, 19], [0, 0, 1, 9, 41]];
  const lab = ['KL 0', 'KL 1', 'KL 2', 'KL 3', 'KL 4'];
  const colTot = lab.map((_, j) => cm.reduce((a, r) => a + r[j], 0));
  return (
    <div className="card cm5card">
      <div className="cm5head">
        <div><h3>5-grade model (Model 4B, ordinal loss) · confusion matrix</h3>
          <p className="mini">Rows are the reference KL grade, columns the prediction. Shading = share of that row. Most errors land one grade away, which is what the ordinal loss is designed for.</p></div>
        <div className="cm5stats"><span><b>58.9%</b>exact</span><span><b>86.7%</b>within one</span><span><b>0.711</b>QWK</span><span><b>0.555</b>MAE</span></div>
      </div>
      <div className="tablewrap"><table className="cm cm5">
        <thead><tr><th>True ↓ / Pred →</th>{lab.map(g => <th key={g}>{g}</th>)}<th>Recall</th></tr></thead>
        <tbody>{cm.map((row, i) => {
          const tot = row.reduce((a, b) => a + b, 0);
          return <tr key={i}><th>{lab[i]} <small>n={tot}</small></th>{row.map((v, j) =>
            <td key={j} style={{ '--a': v / tot }} className={`${i === j ? 'd' : ''} ${Math.abs(i - j) === 1 ? 'n1' : ''}`} title={`${v} of ${tot} (${(100 * v / tot).toFixed(1)}%)`}>{v}</td>)}
            <td className="rc">{(100 * row[i] / tot).toFixed(1)}%</td></tr>;
        })}
        <tr className="prec"><th>Precision</th>{cm.map((r, j) => <td key={j}>{(100 * cm[j][j] / colTot[j]).toFixed(1)}%</td>)}<td /></tr></tbody>
      </table></div>
      <p className="mini">KL 1 ("doubtful") is the hardest grade: 191 of 296 KL 1 knees are read as KL 0, the boundary where expert readers also disagree most. Collapsed to three groups, this model reaches 75.06%, matching the dedicated 3-group pipeline.</p>
    </div>
  );
}

const FIGS = [
  ['Data', 'Fig01_dataset_class_distribution', 'Dataset: knees per KL grade in the official split, and the class weights used in training'],
  ['Comparison', 'Fig02_threegroup_model_comparison_CI', 'Every backbone under the identical protocol: accuracy with 95% CI, balanced accuracy, macro F1'],
  ['Errors', 'Fig03_CM_ResNet18_50_101', 'Confusion matrices for ResNet-18, -50 and -101 ensembles: the KL 2 → KL 0–1 error dominates at every depth'],
  ['Errors', 'Fig04_CM_final_3group', 'Final 3-group pipeline confusion matrix (ensemble + flip TTA + 0.10 margin)'],
  ['Errors', 'Fig05_perclass_final_3group', 'Final 3-group pipeline: recall, precision, F1 and specificity per class'],
  ['Comparison', 'Fig06_EfficientNetB0_fair_test', 'ResNet-18 vs EfficientNet-B0 under the same three-seed protocol (−3.8 points, p = 0.001)'],
  ['Comparison', 'Fig07_paired_comparisons_forest', 'Paired accuracy differences on the same 1,656 knees with 95% CI and McNemar p'],
  ['Training', 'Train_R18', 'ResNet-18 (Model 1, final): training and validation curves for seeds 42, 7 and 123, with the kept networks'],
  ['Training', 'Train_R50', 'ResNet-50 (Model 2): training and validation curves, three seeds'],
  ['Training', 'Train_R101', 'ResNet-101 (Model 3): training and validation curves, three seeds'],
  ['Training', 'Train_EffB0', 'EfficientNet-B0 (Model 5): training and validation curves, three seeds'],
  ['Comparison', 'Fig09_efficiency_size_speed_overfitting', 'Cost of depth: accuracy vs parameters, CPU time per network and train–validation gap'],
  ['5-grade', 'Fig10_task_framing_5grade_vs_3group', 'Five-grade exact accuracy vs three-group accuracy on the same test set'],
  ['5-grade', 'Fig11_CM_M4B_5grade', 'Model 4B five-grade confusion matrix: 191 of 296 KL 1 knees predicted KL 0'],
  ['5-grade', 'Fig12_pergrade_recall_5grade', 'Five-grade recall by true KL grade: cross-entropy, ordinal (final) and exploratory EfficientNet-B0'],
  ['Errors', 'Fig13_error_analysis_final_3group', 'Error anatomy of the final pipeline: error types and true vs predicted counts'],
  ['Reliability', 'Fig14_calibration_ECE_reliability', 'Calibration: expected calibration error and reliability curves for each ensemble'],
  ['Reliability', 'Fig15_review_flags', 'Review flags: the union flags 27.2% of knees and captures 46.7% of errors'],
  ['Training', 'Fig16_validation_candidate_selection', 'Candidate pipelines scored on validation only with a pre-declared rule; the winner was tested once'],
  ['Training', 'Fig17_seed_variability', 'Single seeds vs the three-seed ensemble: why ensembling helps'],
  ['5-grade', 'Fig18_CM_EfficientNetB0_exploratory_5grade', 'Exploratory single-seed EfficientNet-B0 five-grade matrix (simpler protocol, not directly comparable)'],
  ['Comparison', 'Fig19_binary_vs_literature', 'Matched binary task (KL 0–1 vs KL 2–4) compared with a published ResNet result'],
  ['Explainability', 'Fig20_GradCAM_audit', 'Quantitative Grad-CAM audit: attention in the joint band vs chance, and confidence drop when hot regions are hidden'],
  ['5-grade', 'Fig21_M4B_recall_precision_by_grade', 'Model 4B recall and precision by grade'],
  ['Errors', 'Fig22_final_3group_by_original_KL', 'Final 3-group predictions broken down by the original five-grade label'],
  ['Explainability', 'Supp_X01_GradCAM_overlays', 'Grad-CAM on one held-out test knee per KL grade: original, CLAHE and overlay, regenerated by the browser pipeline'],
  ['Explainability', 'Supp_X02_GradCAM_mean_by_grade', 'Mean Grad-CAM map by true KL grade over all 1,656 test knees'],
];
const CATS = ['All', 'Errors', '5-grade', 'Comparison', 'Reliability', 'Explainability', 'Training', 'Data'];

function Gallery() {
  const [cat, setCat] = useState('All');
  const [open, setOpen] = useState(-1);
  const shown = FIGS.map((f, i) => [...f, i]).filter(f => cat === 'All' || f[0] === cat);
  useEffect(() => {
    if (open < 0) return;
    const k = e => {
      if (e.key === 'Escape') setOpen(-1);
      const idx = shown.findIndex(f => f[3] === open);
      if (e.key === 'ArrowRight') setOpen(shown[(idx + 1) % shown.length][3]);
      if (e.key === 'ArrowLeft') setOpen(shown[(idx - 1 + shown.length) % shown.length][3]);
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [open, cat]);
  return (
    <section id="figures" className="wrap sec">
      <div className="sec-head"><p className="eyebrow">Figures</p><h2>The full evaluation, figure by figure</h2>
        <p>All figures from the project report, generated from the saved test predictions. Click any figure to enlarge; use the arrow keys to browse.</p></div>
      <div className="chips">{CATS.map(c => <button key={c} className={c === cat ? 'on' : ''} onClick={() => setCat(c)}>{c}{c !== 'All' && <small>{FIGS.filter(f => f[0] === c).length}</small>}</button>)}</div>
      <div className="gallery">{shown.map(([c, f, cap, i]) => (
        <button key={f} className="fig" onClick={() => setOpen(i)}>
          <span className={`paper `}><img src={`/figs/${f}.webp`} alt={cap} loading="lazy" /></span>
          <span className="figcap"><em>{c}</em>{cap}</span>
        </button>))}</div>
      {open >= 0 && (
        <div className="lightbox" onClick={() => setOpen(-1)}>
          <figure onClick={e => e.stopPropagation()}>
            <img src={`/figs/${FIGS[open][1]}.webp`} alt={FIGS[open][2]} />
            <figcaption><em>{FIGS[open][0]}</em>{FIGS[open][2]}</figcaption>
          </figure>
          <button className="lbclose" aria-label="Close">×</button>
        </div>)}
    </section>
  );
}

function Overview() {
  return (
    <div className="ov">
      <div className="ovcol c1"><h4><em>1</em>Data</h4>
        <div className="ovdata"><img src="/samples/KL4_9012867R.png" alt="" /><div><b>OAI kneeKL224</b><span>8,260 X-rays<br />224 × 224 px<br />5 KL grades</span></div></div>
        <small>Split &amp; preprocessing</small>
        <div className="ovsplit"><i style={{ flex: 5778 }} /><i style={{ flex: 826 }} /><i style={{ flex: 1656 }} /></div>
        <p className="ovnote">Train 5,778 · Val 826 · Test 1,656</p>
        <div className="ovpills"><span>CLAHE contrast</span><span>Grey → 3 channels</span><span>Aug ±10°, ±5 px</span></div>
      </div>
      <div className="ovarrow">→</div>
      <div className="ovcol c2"><h4><em>2</em>Model</h4>
        <div className="ovres"><b>ResNet-18</b> <span>ImageNet-pretrained</span>
          <div className="blocks">{[['Res 1', 64], ['Res 2', 128], ['Res 3', 256], ['Res 4', 512]].map(([n, c]) => <div key={n}><b>{n}</b><span>{c} ch</span></div>)}</div>
          <p>Skip connections bypass each block</p></div>
        <small>Classifier head</small>
        <div className="ovhead"><span>Avg pool</span><span>FC layer</span><span>Softmax</span></div>
        <p className="ovnote">Outputs 5 KL grades or 3 groups</p>
        <small>Also compared, same split and protocol</small>
        <div className="ovpills ghost"><span>ResNet-50</span><span>ResNet-101</span><span>EfficientNet-B0</span></div>
      </div>
      <div className="ovarrow">→</div>
      <div className="ovcol c3"><h4><em>3</em>Train &amp; evaluate</h4>
        <div className="ovtrain"><b>Training</b><span>Adam optimiser · class-weighted loss · gradient clipping · early stopping · 3 random seeds</span></div>
        <small>Held-out test · n = 1,656</small>
        <div className="ovmet">{['Acc', 'Bal. acc', 'F1', 'Sens', 'Spec', 'QWK'].map(m => <span key={m}>{m}</span>)}</div>
        <small>Imbalance fix · KL0 : KL4 = 13.2 : 1</small>
        <div className="ovgrp"><span>KL0–1</span><span>KL2</span><span>KL3–4</span></div>
      </div>
      <div className="ovarrow">→</div>
      <div className="ovcol c4"><h4><em>4</em>Output</h4>
        <div className="ovcam" />
        <small>KL grade output</small>
        <div className="ovkl">{[0, 1, 2, 3, 4].map(k => <span key={k} className={k === 4 ? 'on' : ''}>KL{k}</span>)}</div>
        <p className="ovnote warm">Example: KL4 · severe</p>
        <div className="ovapp"><b>Web app</b><span>Clinician grades first, then AI grade + flags</span></div>
      </div>
      <div className="ovloop"><b>Feedback loop</b> Loss → Adam optimiser → weight update, every batch · KL1/KL2 errors → class weights or 3 groups → retrain, re-test</div>
    </div>
  );
}
