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
// Runs one sample knee through the real models (cached; queued so only one analysis runs at a time)
const sampleCache = {};
let sampleQueue = Promise.resolve();
function runSample(file) {
  if (sampleCache[file]) return sampleCache[file];
  const job = sampleQueue.then(async () => {
    const r = await analyse(await decodeImage(await (await fetch(`/samples/${file}`)).blob()));
    return { ...r, layers: renderLayers(r.g, r.cam) };
  });
  sampleQueue = job.catch(() => {});
  job.catch(() => { delete sampleCache[file]; });
  return (sampleCache[file] = job);
}

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
        <About />
        <Pipeline />
        <KLScale load={load} />
        <Results />
        <Verification load={load} />
        <MatlabVideo />
        <Gallery />
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
          <a href="#about" onClick={go('about')}>About</a><a href="#how" onClick={go('how')}>How it works</a><a href="#results" onClick={go('results')}>Results</a>
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
      <p className="pill">An interactive prototype of AI in biomedical engineering</p>
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
        <Stat n="74.9%" l="3-group accuracy" s="1,656 held-out test knees" t="Of 1,656 test knees the model never saw during training, 74.9% were placed in the correct severity group (KL 0–1, KL 2 or KL 3–4). The 95% confidence interval is 72.7–77.1%." />
        <Stat n="0.730" l="Quadratic weighted κ" s="agreement with reference grades" t="Quadratic weighted kappa measures agreement with the dataset's reference grades, from 0 (no better than chance) to 1 (perfect). It gives partial credit for near misses and penalises far-off answers more; 0.730 is usually described as substantial agreement." />
        <Stat n="86.7%" l="KL grade within one" s="5-grade ordinal model" t="The five-grade model (Model 4B) gets the exact KL grade right for 58.9% of test knees, and 86.7% of its answers are the right grade or one grade either side." />
        <Stat n="3.7%" l="Calibration error" s="expected calibration error" t="How far the model's stated confidence is from how often it is actually right; lower is better. On average its confidence is off by 3.7 percentage points, so a result shown as 80% confident is right roughly 80% of the time." />
      </div>
      <p className="stathint">Hover over or tap a number to see what it means.</p>
    </section>
  );
}
const Stat = ({ n, l, s, t }) => <Tip className="stat below" t={t}><b>{n}</b><span>{l}</span><small>{s}</small></Tip>;

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

const ICONS = {
  contrast: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" /></>,
  resize: <><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M9 15l6-6M11 9h4v4" /></>,
  layers: <><path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" /><path d="M3.5 12l8.5 4.5 8.5-4.5" /><path d="M3.5 16l8.5 4.5 8.5-4.5" /></>,
  scale: <><path d="M12 4v16M6 20h12M5 8h14" /><path d="M5 8l-2.5 6a2.8 2.8 0 0 0 5 0zM19 8l-2.5 6a2.8 2.8 0 0 0 5 0z" /></>,
  bars: <path d="M5 20v-6M10 20V9M15 20v-8M20 20V4M3 20h18" />,
  flag: <path d="M6 21V4h11l-2.5 4L17 12H6" />,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  database: <><ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" /><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" /></>,
  check: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M8 12.5l3 3 5-6" /></>,
  alert: <><path d="M12 3.5L21.5 20h-19z" /><path d="M12 10v4.5M12 17.5v.1" /></>,
  arrow: <><path d="M4 12h15M13 6l6 6-6 6" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5s1.2-5.9 3.7-8.5z" /></>,
  list: <><path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx="4.8" cy="6.5" r="1.1" /><circle cx="4.8" cy="12" r="1.1" /><circle cx="4.8" cy="17.5" r="1.1" /></>,
  grid3: <><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" /><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17" /></>,
  grid5: <><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" /><path d="M3.5 6.9h17M3.5 10.3h17M3.5 13.7h17M3.5 17.1h17M6.9 3.5v17M10.3 3.5v17M13.7 3.5v17M17.1 3.5v17" /></>,
};
const Icon = ({ n }) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[n]}</svg>;
// Row of icon tabs with one panel underneath; items are [icon, title, body]
function IconTabs({ id, label, items, numbered, collapsible }) {
  const [on, setOn] = useState(collapsible ? -1 : 0);
  const pick = i => setOn(collapsible && i === on ? -1 : i);
  return (<>
    <div className="steptabs" role="tablist" aria-label={label}>{items.map(([ic, t], i) => (
      <button key={t} role="tab" id={`${id}-tab${i}`} aria-selected={i === on} aria-controls={`${id}-panel`} className={i === on ? 'on' : ''} onClick={() => pick(i)}>
        <Icon n={ic} /><span>{numbered && <em>{i + 1}</em>}{t}</span>{collapsible && <small className="tabstate">{i === on ? 'Close' : 'Open'}</small>}</button>))}</div>
    {on < 0 ? <p className="tabhint">Click a tab above to open it.</p> : (() => {
      const [icon, title, body, wide] = items[on];
      return <div className={`steppanel ${wide ? 'haswide' : ''}`} id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab${on}`}>
        <div className="stepicon"><Icon n={icon} /></div>
        <div className="stepbody"><h3>{numbered ? `${on + 1}. ` : ''}{title}</h3>{!wide && body}</div>
        {wide && <><div className="stepwide">{wide}</div><div className="stepwide">{body}</div></>}
      </div>;
    })()}
  </>);
}
function Pipeline() {
  const steps = [
    ['contrast', 'Contrast', 'Every X-ray is exposed a little differently. This step evens out the brightness and sharpens local contrast, so bone edges and the joint space look consistent from image to image.', 'CLAHE (clip limit 0.02, 8 × 8 tiles) evens out exposure across the joint, exactly as at training time.'],
    ['resize', 'Standardise', 'The image is resized to the size the network expects, and the grey picture is copied into three colour channels, because the network was originally built for colour photos.', 'Resize to 224 × 224 and copy the grey image into three channels for ResNet-18.'],
    ['layers', 'Ensemble + TTA', 'Instead of trusting a single network, three separately trained copies each look at the X-ray and at its mirror image. Averaging their six answers gives a steadier, more reliable result.', 'Three independently trained seeds (42, 7, 123) each read the image and its mirror; the six softmax outputs are averaged.'],
    ['scale', 'Decide', 'The model tends to call borderline knees healthy. A small fixed adjustment against the KL0–1 group, chosen on validation data before any testing, helps it catch more minimal-OA (KL2) knees.', 'Subtract 0.10 from the KL 0–1 probability, then take the highest group, a rule fixed on validation data to rescue under-called KL 2 knees.'],
    ['bars', 'Grade', 'A second network estimates the exact KL grade from 0 to 4. It was trained so that being one grade off costs less than being several grades off, which keeps its mistakes close to the truth.', 'A second ResNet-18 trained with an ordinal loss estimates KL 0–4, penalising far-off grades more than near misses.'],
    ['flag', 'Explain + flag', 'A heat map shows which parts of the X-ray drove the decision, and automatic checks warn you when the AI is unsure, when the two models disagree or when the image quality is poor.', 'Grad-CAM shows where Model 1 looked; pre-declared rules flag low confidence (< 60%), model disagreement and poor image quality.'],
  ];
  return (
    <section id="how" className="wrap sec">
      <div className="sec-head"><p className="eyebrow">How it works</p><h2>From radiograph to second opinion in six steps</h2>
        <p>Hover over (or tap) any part of the diagram for a plain-language explanation, then click through the six steps below.</p></div>
      <Overview />
      <IconTabs id="steps" label="Pipeline steps" numbered items={steps.map(([ic, t, plain, tech]) =>
        [ic, t, <><p>{plain}</p><p className="tech"><b>Technical detail:</b> {tech}</p></>])} />
      <p className="note">Trained with two-stage transfer learning (head, then all layers), class weights of 1/√n and light augmentation (±10° rotation, ±5 px shift), on the official kneeKL224 split: 5,778 training, 826 validation and 1,656 test knees with no patient overlap. Every model choice was made on validation data; the test set was used once per model.</p>
    </section>
  );
}

function Results() {
  const cm = [[820, 108, 7], [193, 212, 42], [24, 41, 209]];
  const cm5 = [[557, 49, 31, 1, 1], [191, 55, 48, 2, 0], [157, 71, 192, 26, 1], [14, 13, 47, 130, 19], [0, 0, 1, 9, 41]];
  const models = [
    ['5-class ResNet-18 baseline', 55.50, 'reference'],
    ['Model 3 · ResNet-101', 74.15, '42.6 M parameters'],
    ['Model 1 · ResNet-18', 74.03, '11.2 M parameters'],
    ['Model 2 · ResNet-50', 72.83, '23.5 M parameters'],
    ['Model 5 · EfficientNet-B0', 70.23, 'same protocol'],
  ];
  const tabs = [
    ['grid3', '3-group confusion matrix', <>
      <p className="what"><b>What this shows:</b> the final 3-group model's answers for all 1,656 test knees. Each row is a knee's true severity group and each column is the model's answer, so the diagonal holds the correct answers. Healthy or doubtful knees (KL 0–1) are recognised 88% of the time and moderate to severe knees (KL 3–4) 76% of the time, but only 47% of minimal-OA (KL 2) knees are found.</p>
      <InteractiveCM cm={cm} labels={GROUP_SHORT} start={[1, 0]} unitName="group" />
      <p className="mini">Accuracy 74.94% (95% CI 72.71–77.12), balanced accuracy 70.47%, macro F1 71.40, QWK 0.730. 98.1% of answers were correct or one group off: only 31 knees were confused between KL 0–1 and KL 3–4. KL 2 is the hardest group: the boundary with KL 0–1 is uncertain even between expert readers.</p></>],
    ['grid5', '5-grade confusion matrix', <>
      <p className="what"><b>What this shows:</b> the same idea for all five KL grades, from Model 4B, the model behind the KL grade in the app. Exact answers sit on the diagonal; the dashed cells beside it are one grade off. 58.9% of knees get the exact grade and 86.7% are within one grade, because the model was trained so that near misses cost less than far-off answers.</p>
      <div className="cm5stats"><span><b>58.9%</b>exact</span><span><b>86.7%</b>within one</span><span><b>0.711</b>QWK</span><span><b>0.555</b>MAE</span></div>
      <InteractiveCM cm={cm5} labels={['KL 0', 'KL 1', 'KL 2', 'KL 3', 'KL 4']} five start={[1, 0]} unitName="grade" />
      <p className="mini">KL 1 ("doubtful") is the hardest grade: 191 of 296 KL 1 knees are read as KL 0, the boundary where expert readers also disagree most. Collapsed to three groups, this model reaches 75.06%, matching the dedicated 3-group pipeline.</p></>],
    ['bars', 'Why ResNet-18?', <>
      <p className="what"><b>What this shows:</b> test accuracy of each network design, all trained and tested the same way. Deeper networks with up to four times as many parameters were not more accurate, so the smallest and fastest network, ResNet-18, was used for the final model, which also keeps it light enough to run in a browser.</p>
      <div className="mbars">{models.map(([n, v, sub]) => (
        <div key={n} className={n.startsWith('Model 1') ? 'hi' : ''}><span>{n}<small>{sub}</small></span>
          <div><i style={{ width: `${v}%` }} /></div><em>{v.toFixed(2)}%</em></div>))}
      </div>
      <p className="mini">Single-pass test accuracy before flip TTA. ResNet-50 and ResNet-101 were not significantly better (clustered McNemar p = 0.21 and 0.91) but were 2–4× slower and overfit more. EfficientNet-B0 was significantly worse (−3.80 points, p = 0.0015).</p></>],
  ];
  return (
    <section id="results" className="results">
      <div className="wrap sec">
        <div className="sec-head"><p className="eyebrow">Results</p><h2>Held-out test performance (n = 1,656)</h2>
          <p>The headline numbers are below. Open a tab to see the full result, with an explanation of what it shows.</p></div>
        <div className="kpis kpilead">
          <div><b>74.9%</b><span>3-group accuracy (final model)</span></div>
          <div><b>58.9%</b><span>exact KL grade (Model 4B)</span></div>
          <div><b>27.2%</b><span>of knees flagged for review</span></div>
          <div><b>81.7%</b><span>correct among unflagged knees</span></div>
        </div>
        <IconTabs id="results" label="Results" items={tabs} collapsible />
      </div>
    </section>
  );
}

// Screen recording of the original MATLAB app (KOA_App), with clickable chapters
function MatlabVideo() {
  const v = useRef(null);
  const [t, setT] = useState(0);
  const chapters = [
    [0, 'Open a held-out test X-ray'],
    [25, 'Blind first: record your own grade and a note'],
    [60, 'Compare with AI: grade, probabilities and Grad-CAM'],
    [75, 'Clinician and patient summaries'],
    [90, 'Structured radiographic and clinical findings'],
    [250, 'Local vision-language model (beta)'],
    [360, 'Summary engine: local LLM option'],
    [475, 'Save the quick summary (PDF)'],
    [510, 'Save the detailed report (PDF)'],
  ];
  const fmt = x => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;
  const cur = chapters.reduce((a, c, i) => (t >= c[0] ? i : a), 0);
  const jump = x => { const el = v.current; if (!el) return; el.currentTime = x; el.play().catch(() => {}); };
  return (
    <section id="demo" className="wrap sec">
      <div className="sec-head"><p className="eyebrow">Video demonstration</p><h2>The original MATLAB app in action</h2>
        <p>The app on this website is a browser version of KOA_App, the clinician-facing prototype built in MATLAB App Designer. This screen recording walks through one held-out test knee from start to finish, including features that exist only in the MATLAB version: the optional local vision-language and language models and the PDF case reports. Click a chapter to jump to it.</p></div>
      <div className="vidgrid">
        <div className="vidbox">
          <video ref={v} controls preload="metadata" playsInline poster="/video/matlab-app-demo.jpg" onTimeUpdate={e => setT(e.currentTarget.currentTime)}>
            <source src="/video/matlab-app-demo.mp4" type="video/mp4" />
            Your browser cannot play this video.
          </video>
          <p className="mini">Screen recording, 10 min 22 s, no sound. Research prototype · not for clinical use.</p>
          <div className="vidnotes">
            <div><h4>Example case from the report</h4><p>For test knee 9049999R, the 3-group model predicted KL 2 with a score of 75.8% (KL 0–1 19.2%, KL 3–4 5.1%), and the five-grade model also predicted KL 2 (52.4%; KL 1 30.3%, KL 0 14.6%). Both agreed with the clinician grade of KL 2, recorded before the AI result was shown, and the Grad-CAM map centred on the joint line. One case shows how the app works; it says nothing about overall accuracy.</p></div>
            <div><h4>Saving a case</h4><p>Besides the quick and detailed PDF reports, the MATLAB app saves each case as a JSON record and a CSV log, and can remove identifying details from exported reports.</p></div>
          </div>
        </div>
        <ol className="chapters" aria-label="Video chapters">{chapters.map(([x, l], i) => (
          <li key={x}><button className={i === cur && t > 0 ? 'on' : ''} onClick={() => jump(x)}><em>{fmt(x)}</em><span>{l}</span></button></li>))}</ol>
      </div>
    </section>
  );
}
function Verification({ load }) {
  const rows = [
    ['9003175L', 'KL 0', 'KL 0–1', 97.59, 97.57, 'KL 0'],
    ['9001400L', 'KL 1', 'KL 0–1', 85.25, 85.14, 'KL 0'],
    ['9003316R', 'KL 2', 'KL 2', 58.22, 58.38, 'KL 2'],
    ['9011053L', 'KL 3', 'KL 3–4', 96.91, 96.94, 'KL 3'],
    ['9012867R', 'KL 4', 'KL 3–4', 98.52, 98.52, 'KL 4'],
  ];
  const [live, setLive] = useState({});
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    for (const r of rows) {
      try { const res = await runSample(SAMPLES.find(x => x.file.includes(r[0])).file); setLive(l => ({ ...l, [r[0]]: res })); }
      catch { setLive(l => ({ ...l, [r[0]]: 'error' })); }
    }
    setBusy(false);
  }
  const ok = r => { const x = live[r[0]]; return x && x !== 'error' && GROUP_SHORT[x.grp] === r[2] && `KL ${x.kl}` === r[5]; };
  const done = rows.every(r => live[r[0]]);
  const diffs = rows.filter(r => ok(r)).map(r => Math.abs(100 * live[r[0]].P3[GROUP_SHORT.indexOf(r[2])] - r[3]));
  return (
    <section className="wrap sec">
      <div className="sec-head"><p className="eyebrow">Verification</p><h2>The browser gives the same answers as the MATLAB app</h2>
        <p>The models were built in MATLAB, but this website runs them in your browser. Verification checks that the browser version gives the same answers. You do not need MATLAB: its results were computed once, when the project was built, and are saved on this page for comparison. Click through the five steps to see how it was done.</p></div>
      <IconTabs id="verify" label="How the browser version was verified" numbered items={[
        ['target', 'MATLAB reference', <><p>The final models were developed and run in MATLAB on the developer's computer. For five held-out test knees, one per KL grade, MATLAB's exact outputs (probabilities, grades and Grad-CAM maps) were saved. These saved numbers are the MATLAB column in the table below.</p><p className="tech"><b>Technical detail:</b> reference outputs of KOA_Predict exported with KOA_ExportWeb.m.</p></>],
        ['arrow', 'Export to ONNX', <><p>The trained networks were converted to ONNX, an open format that can run almost anywhere, including in a web browser. They were cut after their last convolutional block, so the remaining steps could be rebuilt transparently.</p><p className="tech"><b>Technical detail:</b> six backbones (three seeds each of Model 1 and Model 4B) cut at res5b_relu; classifier weights stored separately in heads.json; weights stored at half precision to halve the download.</p></>],
        ['gear', 'Rebuild in JavaScript', <><p>Everything around the networks was rewritten in JavaScript to behave exactly like the MATLAB code: contrast enhancement, resizing, averaging the three networks and the mirrored image, the classifier, the decision rule, the review flags and Grad-CAM.</p><p className="tech"><b>Technical detail:</b> CLAHE bit-identical to MATLAB adapthisteq (clip limit 0.02, 8 × 8 tiles); bicubic imresize; softmax-gradient Grad-CAM on res5b_relu; 0.10 KL 0–1 margin.</p></>],
        ['check', 'Compare', <><p>The same five knees were run through the browser version and compared with the saved MATLAB numbers: same severity group, same KL grade and nearly identical probabilities. You can repeat this comparison yourself with the button below. Your browser does the computing; MATLAB is not involved.</p><p className="tech"><b>Technical detail:</b> the largest difference is 0.16 percentage points, caused by storing the weights at half precision.</p></>],
        ['bars', 'Full test set', <><p>Finally, the same JavaScript code was run outside the website on all 1,656 test knees. It gave exactly the same accuracy, confusion matrix and review flags as MATLAB.</p><p className="tech"><b>Technical detail:</b> 74.94% three-group accuracy, 58.88% exact KL grade and 86.65% within one grade, using full-precision weights (Node.js with onnxruntime-node).</p></>],
      ]} />
      <div className="card tablewrap verify">
        <div className="verbar">
          <p className="mini">Try it: your browser runs the five reference knees through the models now and compares its answers with the MATLAB values saved on this page. Hover over or tap a column heading to see what it means.</p>
          <button className="btn primary" disabled={!load.ready || busy} onClick={run}>
            {busy ? 'Running on this device…' : !load.ready ? `Loading models · ${Math.round(load.p * 100)}%` : done ? 'Run again' : 'Run the five knees on this device'}</button>
        </div>
        <div className="tbl" data-tipbounds><table className="ver">
          <thead><tr>{[
            ['Test knee', 'The ID of a held-out knee from the OAI kneeKL224 test set (L = left, R = right). None of these knees was used in training.'],
            ['Reference grade', 'The KL grade given to this knee in the dataset by a human reader.'],
            ['3-group result', 'The severity group chosen by Model 1. MATLAB and the browser chose the same group for every knee.'],
            ['MATLAB (saved)', 'The probability Model 1 gave its chosen group when run in MATLAB. It was computed once, on the developer\'s computer, and saved here for comparison.'],
            ['Browser (recorded)', 'The same probability from the browser version, recorded when this website was built.'],
            ['Your device (live)', 'The same probability computed right now by your browser when you press the button. A tick means the group and the KL grade match the MATLAB result.'],
            ['KL grade', 'The KL grade chosen by Model 4B, the five-grade model. MATLAB and the browser chose the same grade for every knee.'],
          ].map(([h, t]) => <th key={h}><Tip className="below" t={t}><span className="thtip">{h}</span></Tip></th>)}</tr></thead>
          <tbody>{rows.map(r => {
            const x = live[r[0]];
            return <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3].toFixed(2)}%</td><td>{r[4].toFixed(2)}%</td>
              <td className={`livecol ${x ? (ok(r) ? 'good' : 'bad') : ''}`}>{!x ? (busy ? '…' : '—') : x === 'error' ? 'error'
                : <>{(100 * x.P3[GROUP_SHORT.indexOf(r[2])]).toFixed(2)}% <span>{ok(r) ? '✓' : `✗ ${GROUP_SHORT[x.grp]}, KL ${x.kl}`}</span></>}</td>
              <td>{r[5]}</td></tr>;
          })}</tbody>
        </table></div>
        {done && <p className={`verresult ${diffs.length === rows.length ? 'good' : 'bad'}`} aria-live="polite">{diffs.length === rows.length
          ? `Your device reproduced the saved MATLAB results for all 5 knees: same severity group and same KL grade, with probabilities within ${Math.max(...diffs).toFixed(2)} percentage points.`
          : `Your device reproduced the saved MATLAB results for ${diffs.length} of 5 knees.`}</p>}
        <div className="fullcheck"><b>Full test set, all 1,656 knees:</b> the browser code, run outside the website, reproduces the MATLAB results exactly: 74.94% 3-group accuracy with the identical confusion matrix, 58.88% exact KL grade, 86.65% within one grade, and the same review flags (27.2% flagged, 81.7% correct when unflagged).</div>
        <p className="mini">CLAHE output is bit-identical to MATLAB adapthisteq; Grad-CAM maps correlate at r = 0.9999. The full-test-set check used full-precision weights; the live site stores them at half precision to halve the download, which moved probabilities by at most 0.16 percentage points on the reference knees.</p>
      </div>
    </section>
  );
}

const REFS = [
  ['GBD 2021 Osteoarthritis Collaborators (2023). Global, regional, and national burden of osteoarthritis, 1990–2020 and projections to 2050. The Lancet Rheumatology, 5(9), e508–e522.', 'https://doi.org/10.1016/S2665-9913(23)00163-7'],
  ['Australian Institute of Health and Welfare (2024). Chronic musculoskeletal conditions: Osteoarthritis.', 'https://www.aihw.gov.au/reports/chronic-musculoskeletal-conditions/musculoskeletal-conditions/contents/osteoarthritis'],
  ['Kellgren, J. H., & Lawrence, J. S. (1957). Radiological assessment of osteo-arthrosis. Annals of the Rheumatic Diseases, 16(4), 494–502.'],
  ['Beyaz, S., Yayli, S. B., & Kılıç, K. (2025). From variability to consistency: Building a Kellgren-Lawrence gonarthrosis dataset. Journal of Orthopaedic Surgery and Research, 20, 922.', 'https://doi.org/10.1186/s13018-025-06057-8'],
  ['Vaattovaara, E., et al. (2025). Kellgren-Lawrence grading of knee osteoarthritis using deep learning: Diagnostic performance with external dataset and comparison with four readers. Osteoarthritis and Cartilage Open, 7(2), 100580.', 'https://doi.org/10.1016/j.ocarto.2025.100580'],
  ['Chen, P., Gao, L., Shi, X., Allen, K., & Yang, L. (2019). Fully automatic knee osteoarthritis severity grading using deep neural networks with a novel ordinal loss. Computerized Medical Imaging and Graphics, 75, 84–92.', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9531250/'],
  ['Mohammed, A. S., Hasanaath, A. A., Latif, G., & Bashar, A. (2023). Knee osteoarthritis detection and severity classification using residual neural networks on preprocessed X-ray images. Diagnostics, 13(8), 1380.', 'https://www.mdpi.com/2075-4418/13/8/1380'],
  ['Chen, P. (2018). Knee osteoarthritis severity grading dataset (Version 1). Mendeley Data.', 'https://doi.org/10.17632/56rmx5bjcr.1'],
  ['Zuiderveld, K. (1994). Contrast limited adaptive histogram equalization. In P. S. Heckbert (Ed.), Graphics Gems IV (pp. 474–485). Academic Press.'],
  ['He, K., Zhang, X., Ren, S., & Sun, J. (2016). Deep residual learning for image recognition. Proc. IEEE CVPR, 770–778.', 'https://arxiv.org/abs/1512.03385'],
  ['Tan, M., & Le, Q. V. (2019). EfficientNet: Rethinking model scaling for convolutional neural networks. Proc. ICML, 6105–6114.', 'https://arxiv.org/abs/1905.11946'],
  ['Selvaraju, R. R., et al. (2017). Grad-CAM: Visual explanations from deep networks via gradient-based localization. Proc. IEEE ICCV, 618–626.', 'https://arxiv.org/abs/1610.02391'],
  ['Durkalski, V. L., Palesch, Y. Y., Lipsitz, S. R., & Rust, P. F. (2003). Analysis of clustered matched-pair data. Statistics in Medicine, 22(15), 2417–2428.', 'https://doi.org/10.1002/sim.1438'],
];
const DATASET_DOI = 'https://doi.org/10.17632/56rmx5bjcr.1';
function Disclaimer() {
  return (
    <div className="disclaimer" role="note">
      <b>Research Prototype · Not for Clinical Use</b>
      <p>This application was developed for academic research and educational demonstration purposes. It uses a convolutional neural network (CNN) to classify knee osteoarthritis severity from X-ray images.</p>
      <p>The model has not been clinically validated or approved as a medical device. Its predictions must not be used for medical diagnosis, treatment decisions or clinical assessment. All results are for demonstration purposes only and should not replace evaluation by a qualified healthcare professional.</p>
    </div>
  );
}
// Figure 1 of the report, redrawn: how the final model was developed, with hover/tap notes
// How the final model was developed: four phases on a timeline, with hover/tap notes
function DevFlow() {
  const Item = ({ ic, l, t }) => <Tip className="dpitem below" t={t}><Icon n={ic} /><span>{l}</span></Tip>;
  const nets = [
    ['ResNet-18', 74.03, '11.2 million parameters, 74.03% three-group test accuracy. The smallest and fastest network, and the one that was kept.'],
    ['ResNet-101', 74.15, '42.6 million parameters, 74.15%. Not significantly better than ResNet-18 (p = 0.91) and about four times as slow.'],
    ['ResNet-50', 72.83, '23.5 million parameters, 72.83%. Not significantly different from ResNet-18 (p = 0.21), about twice as slow, and it overfitted more.'],
    ['EfficientNet-B0', 70.23, '4.0 million parameters, 70.23%. Significantly worse than ResNet-18 under the same protocol (−3.80 points, p = 0.0015).'],
  ];
  const phases = [
    ['Prepare the data', <>
      <Item ic="database" l="8,260 graded knee X-rays" t="8,260 knee X-rays from the Osteoarthritis Initiative (Chen, 2018), graded KL 0–4 and split into 5,778 training, 826 validation and 1,656 test images, with no patient in more than one set." />
      <Item ic="contrast" l="Contrast enhancement and augmentation" t="CLAHE contrast enhancement, images kept at 224 × 224 pixels and the grey image copied into three channels. Training images were also randomly rotated (±10°) and shifted (±5 pixels)." />
    </>],
    ['Pick a network', <>
      <Item ic="grid5" l="5-grade baseline: 55.5%" t="A first ResNet-18 was trained to predict all five KL grades, as a starting point (55.5% test accuracy)." />
      <Tip className="dpchart below" t="Each network was compared on accuracy, balanced accuracy, F1 score, recall, precision, specificity, QWK and confusion matrices, with three random seeds each. ResNet-18 gave the best balance of accuracy, size and speed.">
        <small>Three-group test accuracy, four networks</small>
        {nets.map(([n, v]) => <div key={n} className={n === 'ResNet-18' ? 'pick' : ''}><span>{n}</span><i><b style={{ width: `${(v - 60) * 100 / 16}%` }} /></i><em>{v.toFixed(1)}</em></div>)}
      </Tip>
    </>],
    ['Refine and lock', <>
      <Item ic="scale" l="Tackle class imbalance" t="There are 13 healthy knees for every severe one. Three fixes were tested: class-weighted loss, grouping the five grades into three severity groups (KL 0–1, KL 2, KL 3–4) and balanced sampling." />
      <Item ic="gear" l="Retrain the final models" t="The final models were retrained under a locked protocol: Model 1 for the three groups (three seeds, mirror-image averaging and a 0.10 decision margin) and Model 4B for the five grades (ordinal loss)." />
    </>],
    ['Bring it to the web', <>
      <Item ic="globe" l="Export to ONNX, run in the browser" t="The trained networks were exported to ONNX and the rest of the pipeline rebuilt in JavaScript, so the models run in your browser." />
      <Item ic="check" l="Checked against MATLAB" t="A full-precision version of the browser code reproduced the MATLAB results on all 1,656 test knees. The smaller half-precision models used on this website were also compared with MATLAB on five reference knees (see Verification)." />
    </>],
  ];
  return (<>
    <ol className="devphases">{phases.map(([h, body], i) => (
      <li key={h} className={i === 3 ? 'end' : ''}><div className="dpnode"><em>{i + 1}</em></div><h5>{h}</h5>{body}</li>))}</ol>
    <p className="dfhint">How the final model was developed, in four phases. Hover over or tap an item for details.</p>
  </>);
}
function About() {
  const specs = [
    ['S1', 'Data integrity', 'No patient leakage or duplicates between subsets', 'No patient overlap; no duplicates detected', 'Met'],
    ['S2', 'Three groups', '≥ 75% accuracy', '74.94% (95% CI 72.71–77.12), one image short', 'Narrowly missed'],
    ['S3', 'Architecture', 'Test whether ResNet-50/101 improve on ResNet-18', 'No gain from depth; EfficientNet-B0 −3.80 points', 'Answered'],
    ['S4', 'Five grades', '≥ 60% exact, QWK ≥ 0.72, ≥ 85% within one grade', '58.88% exact, QWK 0.711, 86.7% within one', 'Partly met'],
    ['S5', 'Grad-CAM', 'Attention on the joint above chance, and faithful', '1.6× chance in the joint band; hottest > random > coolest', 'Met'],
    ['S6', 'Clinical tool', 'Clinician-first research prototype', 'Blind-first app; 27.2% of knees routed for review', 'Met (prototype)'],
  ];
  const limits = [
    ['One dataset, single-reader labels', 'All models were trained and tested on the Osteoarthritis Initiative kneeKL224 split, where each image was graded by one reader. Performance on other populations, scanners and imaging protocols is unknown.'],
    ['Early disease is under-called', 'KL 2 recall is 47.4%: 193 KL 2 knees were classified as KL 0–1. In the five-grade model, KL 1 is the weakest grade (18.6% recall).'],
    ['Not clinically validated', 'The application was technically tested, but no clinician reader or usability study was performed, so effects on grading accuracy, time or automation bias are unknown.'],
    ['Explanations are not diagnoses', 'Grad-CAM shows which regions influenced a prediction. It was not compared with expert annotations of osteophytes or joint-space narrowing, so it does not demonstrate clinically correct reasoning.'],
    ['Slightly optimistic estimates', 'The same test set was used across several experiments, so some test results informed later decisions and reported performance may be slightly optimistic.'],
    ['Images outside the training data', 'Other crops, views or photographs differ from the training data; the input checks flag such images, but cannot guarantee a reliable result.'],
  ];
  const topics = [
    ['book', 'Background', <>
      <p>Knee osteoarthritis (KOA) is the progressive degeneration of the knee joint, with loss of articular cartilage and structural changes that cause pain, stiffness, swelling and reduced mobility. Osteoarthritis affected an estimated 595 million people worldwide in 2020 (7.6% of the global population), with the knee the most affected joint (GBD 2021 Osteoarthritis Collaborators, 2023), and around 2.1 million Australians in 2022 (AIHW, 2024).</p>
      <p>Severity is graded on X-rays with the Kellgren–Lawrence (KL) scale from 0 (no features) to 4 (severe) (Kellgren &amp; Lawrence, 1957). Manual grading takes time and expertise, and readers often disagree, especially at the boundary between KL 0, KL 1 and KL 2. In a study of 15,159 radiographs, agreement with expert consensus on the five grades was only slight to fair (Beyaz et al., 2025), and even experienced musculoskeletal readers reach a quadratic weighted kappa of only 0.72–0.77 with each other (Vaattovaara et al., 2025).</p>
      <p>A convolutional neural network (CNN) is a type of AI that learns to recognise patterns in images by passing them through many layers of small filters, building up from simple edges to complex shapes. CNNs can learn radiographic features such as osteophytes and joint-space narrowing directly from X-rays, which may make grading more consistent.</p></>],
    ['target', 'Objectives', <>
      <p>To develop and optimise a CNN that automatically classifies knee osteoarthritis severity from X-ray images according to the Kellgren–Lawrence system, and to present it as a clinician-facing second opinion.</p>
      <p>Six specifications were set in advance, covering data integrity, three-group accuracy, choice of architecture, five-grade accuracy, explainability and a working clinical prototype (see the Results tab).</p></>],
    ['gear', 'Model development', <>
      <p>Models were built in MATLAB with the Deep Learning Toolbox using transfer learning from pretrained networks. Radiographs were contrast-enhanced with CLAHE, kept at 224 × 224 pixels and copied into three channels; training images were augmented with random rotations (±10°) and shifts (±5 pixels).</p>
      <p>Four architectures were compared under an identical protocol: ResNet-18, ResNet-50, ResNet-101 and EfficientNet-B0, each trained with three random seeds and combined into an ensemble. Class imbalance was addressed with class-weighted loss, grouping the five grades into three severity groups and balanced sampling. Candidate pipelines were chosen on validation data only; the final pipeline was then tested once. The trained networks were exported to ONNX so that the same pipeline runs in the browser.</p></>, <DevFlow />],
    ['database', 'Dataset', <>
      <p>The Knee Osteoarthritis Severity Grading Dataset (Chen, 2018) contains 8,260 knee radiographs from the Osteoarthritis Initiative, cropped to the knee at 224 × 224 pixels and labelled KL 0–4. The official kneeKL224 split was used: 5,778 training, 826 validation and 1,656 test images, with no patient in more than one subset.</p>
      <p>The grades are strongly imbalanced (3,253 KL 0 images against 251 KL 4). The main output therefore groups them into three severity categories, KL 0–1, KL 2 and KL 3–4, while a second model estimates the full five-grade KL score.</p></>],
    ['check', 'Results', <>
      <p className="mini lead">Final results on the 1,656 held-out test radiographs (828 patients); 95% confidence interval from a patient-level bootstrap.</p>
      <div className="tablewrap"><table className="ver specs">
        <thead><tr><th>Spec.</th><th>Area</th><th>Target</th><th>Test result</th><th>Status</th></tr></thead>
        <tbody>{specs.map(r => <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td><span className={`status ${r[4].startsWith('Met') || r[4] === 'Answered' ? 'ok' : 'part'}`}>{r[4]}</span></td></tr>)}</tbody>
      </table></div>
      <p className="mini">In short: the compact ResNet-18 matched or outperformed deeper and alternative networks, most errors were between neighbouring grades, and Grad-CAM attention was concentrated on the knee joint. Knees near the KL 1/KL 2 boundary remained the most common source of error.</p>
      <h4 className="subhead">How this compares with published work</h4>
      <p>Studies group the KL grades differently and use different images and splits, so the numbers below are context, not a head-to-head ranking.</p>
      <ul className="litlist">
        <li><b>Chen et al. (2019)</b> reported 69.7% five-grade accuracy (mean absolute error 0.344 grades) with an ordinal loss, on their own split. This project's five-grade model reached 58.88% (error 0.555).</li>
        <li><b>Vaattovaara et al. (2025)</b> reported a five-grade balanced accuracy of 69.3% on an external dataset, comparable to experienced readers, rising to 90.2% for KL 0–1 versus KL 2–4.</li>
        <li><b>Mohammed et al. (2023)</b> reported 79.7% on the yes/no question KL 0–1 versus KL 2–4. On the same question, this project's final pipeline scores 79.95%, level with that result. Their headline 89% “three-class” figure covered only KL 2, KL 3 and KL 4, so it leaves out the hardest boundary.</li>
      </ul></>],
    ['alert', 'Limitations', <ul className="limitlist">{limits.map(([t, d]) => <li key={t}><b>{t}</b>{d}</li>)}</ul>],
    ['arrow', 'Next steps', <ol className="nextsteps">
      <li>A blinded clinician re-read of the 137 suspect test labels, to separate label error from model error at the KL 1/KL 2 boundary.</li>
      <li>External validation on an independent cohort, such as the Multicenter Osteoarthritis Study.</li>
      <li>Technical changes for the minority grades, including higher-resolution joint-centred crops and medical-domain pretraining.</li>
      <li>A clinician reader study of the prototype measuring agreement, grading time and automation bias.</li>
    </ol>],
    ['list', 'References', <>
      <p className="mini lead">Sources cited on this website. The Group 16 coursework report contains the full reference list.</p>
      <ol className="reflist">{REFS.map(([t, u]) => <li key={t}>{t}{u && <> <a href={u} target="_blank" rel="noopener noreferrer">{u.replace('https://', '')}</a></>}</li>)}</ol></>],
  ];
  return (
    <section id="about" className="wrap sec about">
      <div className="sec-head"><p className="eyebrow">About the project</p><h2>Why this project exists, and how it was built</h2>
        <p>This website presents KOA Second Opinion, a browser-based research prototype developed by Hovig Melkonyants. It builds on technical work undertaken within a Group 16 biomedical engineering coursework project; the development roles and project origins are described at the bottom of the page. Choose a topic below to read more.</p></div>
      <IconTabs id="about" label="About the project" items={topics} />
      <Disclaimer />
    </section>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="footgrid">
          <div><b className="footname">Hovig Melkonyants</b><span>Bachelor of Engineering (Honours)</span><span>Major: Biomedical Engineering</span><span>University of Technology Sydney (UTS)</span></div>
          <div><h4>Project</h4><span>KOA Second Opinion: Web-Based Knee Osteoarthritis Grading</span><span>Developed by Hovig Melkonyants</span><span>University of Technology Sydney · 2026</span>
            <small>This research prototype originated within the Group 16 knee osteoarthritis coursework project for Advanced Biomedical Engineering Studio B. Hovig Melkonyants independently implemented and trained the models presented here, conducted the experimental comparisons, optimisation and analysis, and developed the MATLAB prototype and browser-based application.</small></div>
          <div><h4>Technology</h4><span>MATLAB Deep Learning Toolbox</span><span>ONNX Runtime Web</span></div>
          <div><h4>Data attribution</h4><span>Knee Osteoarthritis Severity Grading Dataset · Mendeley Data · Osteoarthritis Initiative</span>
            <small>Chen, P. (2018), <a href={DATASET_DOI} target="_blank" rel="noopener noreferrer">doi:10.17632/56rmx5bjcr.1</a>. Demonstration images are drawn from the held-out test set.</small></div>
        </div>
        <p className="footdisc"><b>Research Prototype · Not for Clinical Use.</b> Academic research prototype only. Not validated or approved for clinical diagnosis or medical use.</p>
      </div>
    </footer>
  );
}

function KLScale({ load }) {
  const kl = [
    ['KL 0', 'None', 'No radiographic features of osteoarthritis.', 'KL 0–1'],
    ['KL 1', 'Doubtful', 'Possible osteophytic lipping; doubtful joint-space narrowing.', 'KL 0–1'],
    ['KL 2', 'Minimal', 'Definite osteophytes; possible joint-space narrowing.', 'KL 2'],
    ['KL 3', 'Moderate', 'Multiple osteophytes, definite narrowing, some sclerosis.', 'KL 3–4'],
    ['KL 4', 'Severe', 'Large osteophytes, marked narrowing, severe sclerosis, bone deformity.', 'KL 3–4'],
  ];
  const [sel, setSel] = useState(-1);
  return (
    <section className="wrap sec">
      <div className="sec-head"><p className="eyebrow">The Kellgren–Lawrence scale</p><h2>Five grades, three clinical groups</h2>
        <p>The main output groups the five KL grades the way treatment decisions do; the 5-grade model gives the finer estimate. Click a grade to see a real held-out test knee at that grade and where the model looked.</p></div>
      <div className="klgrid">{kl.map(([g, n, d, grp], i) => (
        <button key={g} className={`kl k${i} ${sel === i ? 'on' : ''}`} aria-expanded={sel === i} onClick={() => setSel(sel === i ? -1 : i)}>
          <i /><b>{g}</b><span>{n}</span><p>{d}</p><small>Group {grp}</small><em className="klmore">{sel === i ? 'Hide example' : 'Show example X-ray →'}</em></button>))}</div>
      {sel >= 0 && <KLExample key={sel} s={SAMPLES[sel]} desc={kl[sel][2]} load={load} />}
    </section>
  );
}
const VIEW_TEXT = {
  raw: 'The X-ray as stored in the dataset: a 224 × 224 pixel crop of the knee joint.',
  clahe: 'After contrast enhancement (CLAHE), which is what the model actually sees: bone edges and the joint space are easier to make out.',
  cam: 'Grad-CAM heat map of the 3-group model, averaged over its three networks: red marks the regions that most influenced the decision, blue the least. It shows where the model looked, not where the disease is.',
};
function KLExample({ s, desc, load }) {
  const [view, setView] = useState('cam');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const cv = useRef(null), box = useRef(null);
  useEffect(() => { box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, []);
  useEffect(() => {
    if (!load.ready) return;
    let live = true;
    runSample(s.file).then(r => live && setRes(r)).catch(e => live && setErr(e.message));
    return () => { live = false; };
  }, [s.file, load.ready]);
  useEffect(() => {
    if (res && cv.current && view !== 'raw') cv.current.getContext('2d').putImageData(view === 'cam' ? res.layers.over : res.layers.base, 0, 0);
  }, [res, view]);
  const id = s.file.replace(/^KL\d_|\.png$/g, ''), ref = +s.file[2];
  const eff = res ? view : 'raw', shown = eff !== 'raw';
  return (
    <div className="klex card" ref={box}>
      <div className="klimg">
        {shown ? <canvas ref={cv} width="224" height="224" aria-label={`${eff === 'cam' ? 'Grad-CAM overlay' : 'Contrast-enhanced X-ray'} of test knee ${id}`} />
          : <img src={`/samples/${s.file}`} alt={`Held-out test knee ${id}, reference grade ${s.label}`} />}
        {eff === 'cam' && <div className="legend"><span>Lower influence</span><i /><span>Higher influence</span></div>}
      </div>
      <div className="klinfo">
        <h3>{s.label} example · test knee {id} ({id.endsWith('L') ? 'left' : 'right'})</h3>
        <p className="mini">A held-out knee from the OAI kneeKL224 test set, never seen during training. Reference grade {s.label}: {desc.charAt(0).toLowerCase() + desc.slice(1)}</p>
        <div className="seg klseg">{[['raw', 'Original'], ['clahe', 'Contrast-enhanced'], ['cam', 'Grad-CAM']].map(([k, l]) =>
          <button key={k} className={eff === k ? 'on' : ''} disabled={k !== 'raw' && !res} onClick={() => setView(k)}>{l}</button>)}</div>
        <p className="klview">{VIEW_TEXT[eff]}</p>
        {res ? <div className="klres">
          <div><small>3-group model</small><b>{GROUPS[res.grp]}</b><span>{pct(res.P3[res.grp])} probability</span></div>
          <div><small>5-grade model</small><b>KL {res.kl}</b><span>{pct(res.P5[res.kl])} probability · {res.kl === ref ? 'matches the reference' : `reference is KL ${ref}`}</span></div>
        </div> : <p className="mini">{err ? `The model could not run here: ${err}` : load.ready ? 'Running the models on this knee in your browser…' : `The Grad-CAM view appears once the models have loaded (${Math.round(load.p * 100)}%).`}</p>}
        <p className="mini">Computed live in your browser by the same models used in the app. Research prototype, not for clinical use.</p>
      </div>
    </div>
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
          <label>Comment<textarea rows={4} value={f.comment} maxLength={1000} onChange={e => setF({ ...f, comment: e.target.value })} placeholder="What worked? What would you change?" /></label>
          <button className="btn primary" disabled={st === 'sending'}>{st === 'sending' ? 'Posting…' : 'Post review'}</button>
          {st && st !== 'sending' && <p className="formnote">{st}</p>}
          <p className="mini">Reviews are public. Please don't include patient information.</p>
          <p className="mini revdisc"><b>Research Prototype · Not for Clinical Use.</b> Academic research prototype only. Not validated or approved for clinical diagnosis or medical use.</p>
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
          <p className="lede sm">I'm a biomedical engineering student at UTS working on machine learning for medical imaging, with a focus on bionics and lower-limb prosthetics. Open to research collaborations, internships and graduate roles.</p>
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

const WORDS = ['', 'one', 'two', 'three', 'four'];
function InteractiveCM({ cm, labels, five, start, unitName }) {
  const [sel, setSel] = useState(start);
  const [unit, setUnit] = useState('n');
  const colTot = labels.map((_, j) => cm.reduce((a, r) => a + r[j], 0));
  const [i, j] = sel, tot = cm[i].reduce((a, b) => a + b, 0), v = cm[i][j], d = Math.abs(i - j);
  const text = i === j
    ? `Correct: ${v} of the ${tot} knees with reference grade ${labels[i]} were classified as ${labels[i]} (${(100 * v / tot).toFixed(1)}%).`
    : `${v} of the ${tot} knees with reference grade ${labels[i]} (${(100 * v / tot).toFixed(1)}%) were classified as ${labels[j]}, ${WORDS[d]} ${unitName}${d > 1 ? 's' : ''} ${j < i ? 'lower' : 'higher'} than the reference.`;
  return (<>
    <div className="cmbar"><span className="mini">Hover over or tap a cell to explain it.</span>
      <div className="seg">{[['n', 'Counts'], ['p', 'Row %']].map(([k, l]) => <button key={k} className={unit === k ? 'on' : ''} onClick={() => setUnit(k)}>{l}</button>)}</div></div>
    <div className="tablewrap"><table className={`cm cmi ${five ? 'cm5' : ''}`}>
      <thead><tr><th>True ↓ / Pred →</th>{labels.map(g => <th key={g}>{g}</th>)}<th>Recall</th></tr></thead>
      <tbody>{cm.map((row, a) => {
        const t = row.reduce((x, y) => x + y, 0);
        return <tr key={a}><th>{labels[a]}{five && <small>n={t}</small>}</th>{row.map((c, b) =>
          <td key={b} tabIndex={0} style={{ '--a': c / t }} className={`${a === b ? 'd' : ''} ${five && Math.abs(a - b) === 1 ? 'n1' : ''} ${a === i && b === j ? 'sel' : ''}`}
            onMouseEnter={() => setSel([a, b])} onFocus={() => setSel([a, b])} onClick={() => setSel([a, b])}>{unit === 'p' ? `${Math.round(100 * c / t)}%` : c}</td>)}
          <td className="rc">{(100 * row[a] / t).toFixed(1)}%</td></tr>;
      })}
      {five && <tr className="prec"><th>Precision</th>{cm.map((r, b) => <td key={b}>{(100 * cm[b][b] / colTot[b]).toFixed(1)}%</td>)}<td /></tr>}</tbody>
    </table></div>
    <p className={`cmexp ${i === j ? 'ok' : d > 1 ? 'far' : ''}`} aria-live="polite">{text} Of all {colTot[j]} knees classified as {labels[j]}, {(100 * v / colTot[j]).toFixed(1)}% had this reference grade.</p>
  </>);
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

// Plain-language notes shown in the lightbox: [how to read it, what it tells us]. Numbers only from the figures themselves.
const EXPLAIN = {
  Fig01_dataset_class_distribution: [
    'Left: how many knee X-rays there are for each Kellgren–Lawrence (KL) grade, from KL0 (healthy) to KL4 (severe), split into the training set (used to teach the model), the validation set (used to choose settings) and the test set (used once, for the final score). Right: how much weight each severity group was given during training.',
    'The data are very unbalanced: there are 13 healthy (KL0) knees for every severe (KL4) knee. A model trained on this naturally favours the common grades, so the rarer groups were given more weight, with an extra boost for KL2, the hardest group to recognise.'],
  Fig02_threegroup_model_comparison_CI: [
    'Each row is one network design, trained and tested the same way on the same 1,656 test knees. The filled dot is accuracy (the percentage of knees put in the right severity group); its bar is the 95% confidence interval, the range the true value most likely lies in. The hollow circle is balanced accuracy (every group counts equally, however common), the diamond is macro F1 (a combined score of hits and false alarms), and QWK on the right is agreement with the reference grades that gives partial credit for near misses. The dashed line is the project target of 75%.',
    'Bigger networks (ResNet-50 and ResNet-101) and EfficientNet-B0 did not beat the small ResNet-18. The final pipeline reached 74.94%, one knee short of the 75% target. The confidence bars overlap a lot, so most of the differences between the ResNets are within noise.'],
  Fig03_CM_ResNet18_50_101: [
    'A confusion matrix compares the truth with the model’s answer. Rows are the true severity group, columns are what the model predicted, and each square shows the number of knees and the percentage of that row. The diagonal (top-left to bottom-right) holds the correct answers; every other square is a mistake.',
    'All three network depths make the same main mistake (outlined in orange): 40–46% of knees with minimal OA (KL2) are called healthy or doubtful (KL0–1). Making the network deeper does not fix it, which suggests the difficulty lies in how subtle KL2 changes are on an X-ray, not in the size of the network.'],
  Fig04_CM_final_3group: [
    'Confusion matrix of the final pipeline, the one running in the app. Rows are the true severity group, columns are the prediction, and each square shows the count and the percentage of that row. The diagonal is correct.',
    'Healthy or doubtful knees (KL0–1) are recognised 88% of the time and moderate to severe knees (KL3–4) 76% of the time, but minimal OA (KL2) only 47%: 193 KL2 knees (outlined) were called KL0–1. That single error is the main reason the overall score is 74.94% rather than higher.'],
  Fig05_perclass_final_3group: [
    'Four scores for each severity group. Recall: of the knees truly in this group, how many the model found. Precision: of the knees the model put in this group, how many really belong there. F1: a balance of recall and precision. Specificity: of the knees not in this group, how many the model correctly kept out. n is the number of test knees in the group.',
    'KL2 is the bottleneck: the model finds only 47.4% of KL2 knees, against 87.7% for KL0–1 and 76.3% for KL3–4. Specificity is lowest for KL0–1 (69.9%) because uncertain knees tend to be pushed into the healthy group.'],
  Fig06_EfficientNetB0_fair_test: [
    'Left: the same five scores for ResNet-18 (teal) and EfficientNet-B0 (orange), both trained and tested with exactly the same recipe. Right: EfficientNet-B0’s confusion matrix (rows = true group, columns = prediction, diagonal = correct).',
    'EfficientNet-B0 is 3.8 points less accurate overall, and the p-value of 0.001 means a gap that large is very unlikely to be chance. It does find more KL2 knees (55.9% vs 46.8%), but at a cost: 94 moderate to severe knees (outlined) were downgraded to KL2.'],
  Fig07_paired_comparisons_forest: [
    'Each row compares two models on exactly the same test knees. The dot is the difference in accuracy (percentage points) and the bar is its 95% confidence interval. If the bar crosses the vertical zero line, the two models are not reliably different. Orange rows are the comparisons where the difference is real; p is the probability of seeing a gap this large by chance.',
    'Most design choices made no reliable difference, including deeper ResNets and adding the mirror image at test time (+0.91 points, p = 0.17). Only three comparisons are clear: EfficientNet-B0 is worse than ResNet-18, the cross-entropy five-grade model (M4) beats the five-grade reference, and the CORAL ordinal model (M4C) is worse than the final ordinal model (M4B).'],
  Train_R18: [
    'How training progressed over time (iterations, left to right) for three copies of ResNet-18 started from different random seeds. Left: accuracy; right: loss, the error the network is trying to reduce (lower is better). Thin lines are the training images, bold lines the validation images the network never learns from. Dots mark the point where each copy was saved.',
    'Training accuracy keeps rising while validation levels off at about 70%. Past that point the network starts memorising its training images instead of learning patterns that carry over to new knees (overfitting). Each copy was saved at its lowest validation loss, before that happens, and the three saved copies together form Model 1, the final model.'],
  Train_R50: [
    'Same layout as the ResNet-18 curves: three random seeds, accuracy on the left, loss on the right; thin lines are training, bold lines validation, dots the saved networks.',
    'ResNet-50 drives the training loss lower than ResNet-18, but its validation accuracy ends in the same place, at about 70%. The bigger network memorises more without doing better on knees it has not seen.'],
  Train_R101: [
    'Same layout: three random seeds, accuracy left, loss right; thin lines are training, bold lines validation, dots the saved networks.',
    'ResNet-101, the deepest network tested, shows the widest gap between its training curves (noisy, often far above or below) and its flat validation curves. The extra depth adds memorisation, not accuracy on new knees.'],
  Train_EffB0: [
    'Same layout: three random seeds, accuracy left, loss right; thin lines are training, bold lines validation, dots the saved networks.',
    'EfficientNet-B0 trains for much longer (its best points come after roughly 2,000 to 3,600 iterations) and its training and validation curves stay closer together. The curves look healthy, yet its test accuracy was still lower than ResNet-18 (see the EfficientNet-B0 comparison figure).'],
  Fig09_efficiency_size_speed_overfitting: [
    'A: test accuracy against network size, in millions of parameters. B: the time one network needs to analyse one image on an ordinary computer processor. C: how much better each network scores on its training images than on validation images, a simple measure of overfitting.',
    'The smallest network, ResNet-18, is as accurate as ResNet-101 while being about four times smaller, almost four times faster (8.4 vs 31.6 ms) and overfitting half as much. That is why it was chosen, and why the whole pipeline is light enough to run in your browser.'],
  Fig10_task_framing_5grade_vs_3group: [
    'Teal bars are models that predict all five KL grades; blue bars are models that predict the three severity groups. The darker bar of each pair is accuracy, the lighter one balanced accuracy (every grade counts equally).',
    'Five-grade models get 55–59% exactly right, three-group models about 75%. Even the five-grade Model 4B reaches 75.1% once its answers are merged into three groups. The jump comes from the easier question, mainly because the subtle KL0/KL1 boundary disappears, not from a better network.'],
  Fig11_CM_M4B_5grade: [
    'Five-grade confusion matrix of Model 4B, the model behind the KL grade shown in the app. Rows are the true KL grade, columns the prediction. The diagonal is exactly right; squares next to the diagonal are one grade off.',
    'Model 4B gets 58.88% of knees exactly right and 86.7% within one grade. Its weakest spot is KL1, which means only doubtful changes: 191 of 296 KL1 knees (65%, outlined) are called KL0. Almost all other mistakes are one grade off.'],
  Fig12_pergrade_recall_5grade: [
    'Recall for each true KL grade: of the knees truly at that grade, the percentage the model got exactly right. Three five-grade models are shown; n is the number of test knees at each grade.',
    'Every model recognises KL0 and KL4 well and struggles with KL1 (12–25%). The final ordinal model (teal) finds more KL1 and KL2 knees than the cross-entropy model at almost no cost elsewhere. The orange EfficientNet-B0 used one seed and a different recipe, so it is shown for context only.'],
  Fig13_error_analysis_final_3group: [
    'A: every mistake the final pipeline made on the test set, grouped by type (true group → predicted group); orange bars are mistakes two groups away. B: how many knees are truly in each group (grey) compared with how many the model put there (teal).',
    '92.5% of the 415 mistakes are to a neighbouring group; the model rarely confuses healthy with moderate or severe (31 knees). It leans towards the healthy side: it predicts 102 more KL0–1 knees than there really are, mostly taken from KL2.'],
  Fig14_calibration_ECE_reliability: [
    'A: calibration error (ECE) for each model, i.e. how far the confidence it states is from how often it is actually right; lower is better. B: reliability curves. Knees are grouped by the model’s confidence, and each point shows how often the knees in that group were really correct. A perfectly honest model would sit on the dashed diagonal.',
    'The final model is off by only 3.7% on average: when it says 80%, it is right roughly 80% of the time, so the confidence shown in the app can be read roughly at face value. The CORAL model (M4C, 9.8%) is the one poorly calibrated exception.'],
  Fig15_review_flags: [
    'Each row is one of the app’s automatic “review recommended” warnings; the percentage in brackets is how many test knees triggered it. The hollow circle is accuracy on knees that triggered the warning, the filled dot accuracy on knees that did not. The dashed line is the overall accuracy.',
    'The warnings work: knees with any flag are right only 56.9% of the time, while unflagged knees are right 81.7% of the time. Flagging 27.2% of knees for a second look catches 46.7% of all mistakes, so a clinician knows which cases deserve extra attention.'],
  Fig16_validation_candidate_selection: [
    'Four candidate pipelines scored on the validation set (826 knees not used for training or for the final test). The filled dot is accuracy, the hollow circle balanced accuracy, and QWK on the right is agreement with the reference grades with partial credit for near misses.',
    'The winner, B (Model 1 plus the mirror image at test time), was picked by a rule written down before testing and then run on the test set exactly once. This avoids tuning on the test data, a common trap that makes results look better than they are. Adding ResNet-101 (C and D) did not help.'],
  Fig17_seed_variability: [
    'Grey dots: test balanced accuracy of single networks trained from three different random starting points (seeds 42, 7 and 123). Green diamond: the three combined into an ensemble. Dashed line: the ResNet-18 ensemble used in the final model. SD is the spread between the single networks.',
    'The same network trained three times can differ by up to 7 points, as one ResNet-101 run shows. Averaging the three removes such an outlier and gives a steadier result, which is why the final model is a three-seed ensemble. Single-seed ResNet-18 results were not saved, so it appears only as the line.'],
  Fig18_CM_EfficientNetB0_exploratory_5grade: [
    'Five-grade confusion matrix of an early, exploratory EfficientNet-B0. Rows are the true KL grade, columns the prediction; the diagonal is correct.',
    'It scored 60.63% exactly right, but it was a single network trained with a simpler recipe (no contrast enhancement, no augmentation, no class weighting) and kept at its last training step, so it cannot be compared fairly with the final ensembles. It is kept as a reference point from early in the project.'],
  Fig19_binary_vs_literature: [
    'Accuracy on the simpler yes/no question “is there definite osteoarthritis?” (KL0–1 versus KL2–4) for each model. The dashed line is the published ResNet result of Mohammed et al. (2023) on the same question.',
    'On this matched task every model lands between 78.5% and 80%, in line with the published 79.7%; the final pipeline scores 79.95%. So the project matches the literature, and its lower three-group score reflects a harder question, not a weaker model.'],
  Fig20_GradCAM_audit: [
    'Grad-CAM is a heat map of the parts of the X-ray that most influenced the model. A: the share of that heat falling inside the joint space (where osteoarthritis shows) and on the image border, compared with what random placement (“chance”) would give. B: how much the model’s confidence drops when the 10 hottest, 10 random or 10 coolest regions of the heat map are hidden.',
    'The models focus on the joint 1.6 times more than chance and look at the image border less than chance. Hiding the hottest regions lowers confidence more than hiding random ones (0.41 vs 0.29), and hiding the coolest regions does nothing, so the heat maps really point at what the model uses.'],
  Fig21_M4B_recall_precision_by_grade: [
    'For each true KL grade, the bar is recall (the percentage of knees at that grade the model found) and the white tick is precision (of the knees the model called that grade, the percentage that were right). n is the number of test knees at each grade.',
    'KL0, KL3 and KL4 are found most of the time, but only 18.6% of KL1 knees are found, and when the model does answer KL1 it is right only 29.3% of the time. A five-grade answer of KL1 should therefore be read as uncertain.'],
  Fig22_final_3group_by_original_KL: [
    'Each bar is one original KL grade, split by the severity group the final model put those knees in: teal = KL0–1, orange = KL2, purple = KL3–4.',
    'KL0 and KL4 knees almost always land in the right group (92% and 100%). The mistakes come from the borderline grades: 20% of KL1 knees move up to KL2, 43% of KL2 knees move down to KL0–1, and 29% of KL3 knees move down. Obvious cases are handled well; in-between cases cause the errors.'],
  Supp_X01_GradCAM_overlays: [
    'One test knee per KL grade (columns), the same five sample knees as in the app. Top row: the original X-ray. Middle: after contrast enhancement (CLAHE), which is what the model actually sees. Bottom: the Grad-CAM heat map laid over it (red = most influence on the decision, blue = least), with the model’s prediction and confidence underneath.',
    'The model mostly looks at the joint space between the thigh and shin bones, where osteoarthritis changes appear. For the moderate and severe knees the heat concentrates on one side of the joint. These maps were made by the same code that runs in your browser.'],
  Supp_X02_GradCAM_mean_by_grade: [
    'The average Grad-CAM heat map over all 1,656 test knees, shown separately for each true KL grade and drawn over a reference knee. Red = where the model looked most on average; n is the number of knees averaged.',
    'For every grade the attention sits across the joint space, not on bone far from the joint or on the image edges. This supports that the model reads the joint itself rather than shortcuts such as text markers or the image border.'],
};

const CAT_ICON = { Errors: 'alert', '5-grade': 'grid5', Comparison: 'bars', Reliability: 'check', Explainability: 'target', Training: 'gear', Data: 'database' };
// One opened category: a strip of its figures, the chosen one shown large with its explanation
function FigCategory({ cat, onZoom }) {
  const list = FIGS.map((f, i) => [...f, i]).filter(f => f[0] === cat);
  const [k, setK] = useState(0);
  const [, name, cap, i] = list[k], ex = EXPLAIN[name];
  return (<>
    {list.length > 1 && <div className="figpick" role="group" aria-label={`${cat} figures`}>{list.map(([, n, c], j) => (
      <button key={n} className={j === k ? 'on' : ''} aria-pressed={j === k} onClick={() => setK(j)}>
        <img src={`/figs/${n}.webp`} alt="" loading="lazy" /><span>{c}</span></button>))}</div>}
    <figure className="figshow">
      <button className="figzoom" onClick={() => onZoom(i)} aria-label="View this figure full-screen"><img src={`/figs/${name}.webp`} alt={cap} /></button>
      <figcaption>{cap}<small>Click the figure to view it full-screen.</small></figcaption>
    </figure>
    {ex && <div className="lbtext inline">
      <div><h4>How to read it</h4><p>{ex[0]}</p></div>
      <div><h4>What it tells us</h4><p>{ex[1]}</p></div>
    </div>}
  </>);
}
function Gallery() {
  const [open, setOpen] = useState(-1);
  useEffect(() => {
    if (open < 0) return;
    const same = FIGS.map((f, i) => i).filter(i => FIGS[i][0] === FIGS[open][0]);
    const k = e => {
      if (e.key === 'Escape') setOpen(-1);
      const x = same.indexOf(open);
      if (e.key === 'ArrowRight') setOpen(same[(x + 1) % same.length]);
      if (e.key === 'ArrowLeft') setOpen(same[(x - 1 + same.length) % same.length]);
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [open]);
  const tabs = CATS.slice(1).map(c => [CAT_ICON[c], `${c} (${FIGS.filter(f => f[0] === c).length})`, <FigCategory key={c} cat={c} onZoom={setOpen} />]);
  return (
    <section id="figures" className="wrap sec">
      <div className="sec-head"><p className="eyebrow">Figures</p><h2>The full evaluation, figure by figure</h2>
        <p>{FIGS.length} evaluation figures generated by Hovig Melkonyants from the saved model predictions and experimental records. These figures also supported the earlier Group 16 coursework report. Open a category, pick a figure, and read how to read it and what it shows. Click a figure to view it full-screen; use the arrow keys to browse within the category.</p></div>
      <IconTabs id="figs" label="Figure categories" items={tabs} collapsible />
      {open >= 0 && (
        <div className="lightbox" onClick={() => setOpen(-1)}>
          <figure onClick={e => e.stopPropagation()}>
            <img src={`/figs/${FIGS[open][1]}.webp`} alt={FIGS[open][2]} />
            <figcaption><em>{FIGS[open][0]}</em>{FIGS[open][2]}</figcaption>
            {EXPLAIN[FIGS[open][1]] && <div className="lbtext">
              <div><h4>How to read it</h4><p>{EXPLAIN[FIGS[open][1]][0]}</p></div>
              <div><h4>What it tells us</h4><p>{EXPLAIN[FIGS[open][1]][1]}</p></div>
            </div>}
          </figure>
          <button className="lbclose" aria-label="Close">×</button>
        </div>)}
    </section>
  );
}

// Hover (or tap) explanation for one part of the How it works diagram
// Shifts the bubble sideways so it stays inside the viewport (or inside a [data-tipbounds] scroll box) (bubble is up to 290 px or 84% of the screen wide)
const placeTip = e => {
  const r = e.currentTarget.getBoundingClientRect(), w = Math.min(290, innerWidth * 0.84), c = r.left + r.width / 2;
  const b = e.currentTarget.closest('[data-tipbounds]')?.getBoundingClientRect() ?? { left: 0, right: innerWidth };
  const left = Math.min(Math.max(c - w / 2, b.left + 8), b.right - w - 8);
  e.currentTarget.style.setProperty('--tx', `${Math.round(left - (c - w / 2))}px`);
};
const Tip = ({ t, className = '', children }) =>
  <div className={`tip ${className}`} tabIndex={0} data-tip={t} onMouseEnter={placeTip} onFocus={placeTip}>{children}</div>;
function Overview() {
  return (
    <div className="ov">
      <div className="ovcol c1"><Tip t="Step 1 collects the X-rays and prepares them so every image looks consistent before the network sees it."><h4><em>1</em>Data</h4></Tip>
        <Tip t="The dataset: 8,260 knee X-rays from the Osteoarthritis Initiative, each cropped to the knee at 224 × 224 pixels and graded from KL0 (healthy) to KL4 (severe)."><div className="ovdata"><img src="/samples/KL4_9012867R.png" alt="" /><div><b>OAI kneeKL224</b><span>8,260 X-rays<br />224 × 224 px<br />5 KL grades</span></div></div></Tip>
        <Tip t="The images are split three ways: training (the network learns from these), validation (used to choose settings) and test (kept aside and used once, for the final score). No patient appears in more than one set."><small>Split &amp; preprocessing</small>
          <div className="ovsplit"><i style={{ flex: 5778 }} /><i style={{ flex: 826 }} /><i style={{ flex: 1656 }} /></div>
          <p className="ovnote">Train 5,778 · Val 826 · Test 1,656</p></Tip>
        <div className="ovpills">
          <Tip t="CLAHE (contrast-limited adaptive histogram equalisation) boosts contrast region by region, so bone edges and the joint space stand out evenly across the X-ray."><span>CLAHE contrast</span></Tip>
          <Tip t="The network was originally trained on colour photos, so the grey X-ray is copied into the red, green and blue channels it expects."><span>Grey → 3 channels</span></Tip>
          <Tip t="Augmentation: during training each image is randomly rotated by up to 10° and shifted by up to 5 pixels, so the network learns the anatomy rather than one exact position."><span>Aug ±10°, ±5 px</span></Tip>
        </div>
      </div>
      <div className="ovarrow">→</div>
      <div className="ovcol c2"><Tip t="Step 2 is the neural network: it reads the image and outputs a probability for each grade."><h4><em>2</em>Model</h4></Tip>
        <Tip t="ResNet-18 is an 18-layer convolutional neural network. It first learned from millions of everyday photos (ImageNet) and was then fine-tuned on knee X-rays, a technique called transfer learning. Its four stages go from simple patterns such as edges to complex shapes such as bone spurs; 'ch' is the number of pattern detectors in each stage. Skip connections let information jump past each block, which makes deep networks easier to train."><div className="ovres"><b>ResNet-18</b> <span>ImageNet-pretrained</span>
          <div className="blocks">{[['Res 1', 64], ['Res 2', 128], ['Res 3', 256], ['Res 4', 512]].map(([n, c]) => <div key={n}><b>{n}</b><span>{c} ch</span></div>)}</div>
          <p>Skip connections bypass each block</p></div></Tip>
        <small>Classifier head</small>
        <div className="ovhead">
          <Tip t="Average pooling: each of the 512 pattern maps is averaged into one number, summarising the whole image."><span>Avg pool</span></Tip>
          <Tip t="Fully connected layer: weighs those 512 numbers to produce a score for each grade."><span>FC layer</span></Tip>
          <Tip t="Softmax: turns the scores into probabilities that add up to 100%."><span>Softmax</span></Tip>
        </div>
        <p className="ovnote">Outputs 5 KL grades or 3 groups</p>
        <small>Also compared, same split and protocol</small>
        <Tip t="Deeper networks (ResNet-50 and ResNet-101) and EfficientNet-B0 were trained exactly the same way for a fair comparison. None of them beat ResNet-18."><div className="ovpills ghost"><span>ResNet-50</span><span>ResNet-101</span><span>EfficientNet-B0</span></div></Tip>
      </div>
      <div className="ovarrow">→</div>
      <div className="ovcol c3"><Tip t="Step 3 teaches the network, then measures it on knees it has never seen."><h4><em>3</em>Train &amp; evaluate</h4></Tip>
        <Tip t="Adam is the method that nudges the network's weights after every batch of images. Class-weighted loss makes mistakes on rare grades count more. Gradient clipping keeps each update small and stable. Early stopping ends training once validation results stop improving, before the network starts memorising. Three random seeds means three copies were trained and their answers averaged."><div className="ovtrain"><b>Training</b><span>Adam optimiser · class-weighted loss · gradient clipping · early stopping · 3 random seeds</span></div></Tip>
        <small>Held-out test · n = 1,656</small>
        <div className="ovmet">{[
          ['Acc', 'Accuracy: the share of knees given the correct answer.'],
          ['Bal. acc', 'Balanced accuracy: accuracy averaged over the groups, so rare groups count as much as common ones.'],
          ['F1', 'F1 score: a balance of precision (how often a prediction is right) and recall (how many true cases are found).'],
          ['Sens', 'Sensitivity (recall): of the knees truly in a group, how many the model found.'],
          ['Spec', 'Specificity: of the knees not in a group, how many the model correctly kept out.'],
          ['QWK', 'Quadratic weighted kappa: agreement with the reference grades that gives partial credit for near misses and penalises far-off answers more.'],
        ].map(([m, t]) => <Tip key={m} t={t}><span>{m}</span></Tip>)}</div>
        <Tip t="There are 13 times more healthy (KL0) knees than severe (KL4) ones. To stop the network favouring the common grades, rare grades are weighted more, and the five grades are grouped into three: KL0–1, KL2 and KL3–4."><small>Imbalance fix · KL0 : KL4 = 13.2 : 1</small>
          <div className="ovgrp"><span>KL0–1</span><span>KL2</span><span>KL3–4</span></div></Tip>
      </div>
      <div className="ovarrow">→</div>
      <div className="ovcol c4"><Tip t="Step 4 is what you see: a grade, a heat map and any warnings."><h4><em>4</em>Output</h4></Tip>
        <Tip t="Grad-CAM heat map: red marks the parts of the X-ray that most influenced the decision, blue the least. It shows where the model looked, not where the disease is."><div className="ovcam" /></Tip>
        <Tip t="The five-grade model gives a probability for each KL grade; the most likely one is shown as the AI grade."><small>KL grade output</small>
          <div className="ovkl">{[0, 1, 2, 3, 4].map(k => <span key={k} className={k === 4 ? 'on' : ''}>KL{k}</span>)}</div>
          <p className="ovnote warm">Example: KL4 · severe</p></Tip>
        <Tip t="In the web app you record your own grade first (blind-first), so the AI cannot anchor your judgement. Then the AI grade and any review flags are revealed."><div className="ovapp"><b>Web app</b><span>Clinician grades first, then AI grade + flags</span></div></Tip>
      </div>
      <Tip className="ovloop" t="During training, the error (loss) on each batch of images is used to update the weights. When KL1 and KL2 errors stayed high, the class weights or the three-group setup were changed and the model was retrained and re-tested."><b>Feedback loop</b> Loss → Adam optimiser → weight update, every batch · KL1/KL2 errors → class weights or 3 groups → retrain, re-test</Tip>
    </div>
  );
}
