# KOA Second Opinion: website (Claude Code briefing)

Personal portfolio site by Hovig Melkonyants (Biomedical Engineering, UTS). It runs the locked MATLAB knee-OA
models **in the browser** and presents the project results. Live: https://koa-second-opinion-380491b2.base44.app
Hosting/backend: Base44 app `6aeae7497e27e764380491b2` (see `base44/`). Stack: Vite + React 18, plain CSS, ONNX Runtime Web (wasm).

## Commands
- `npm install` · `npm run dev` (local preview, port 5173) · `npm run build` (outputs `dist/`)
- Publish: `npx base44 login` (once) then `npm run build && npx base44 site deploy -y`
- Data tables: `npx base44 entities push -y` (Review = public read/create; ContactMessage = public create, owner-only read)
- Base44 site upload limit is **50 MB**: never put model files in `public/`.

## Architecture
- `src/App.jsx`: front page (`#/`): Hero, Pipeline + native `Overview` diagram, KL scale, Results (3-group CM + `CM5` 5-grade CM),
  Verification, `Gallery` (FIGS list → `public/figs/*.webp`), Limits, CTA, Reviews, Connect, Footer. Set `LINKEDIN` const to show the LinkedIn button.
  Routing: only `#/app` switches view; section nav uses `scrollIntoView` (do not reintroduce hash links for sections: they caused a double-click bug).
- `src/Workstation.jsx`: full-screen app (`#/app`), a port of MATLAB `KOA_App.m`: blind-first, KL buttons, Compare with AI,
  agreement banner, probability bars, summaries (word-for-word port of `KOA_Explain.m` templateText), quick summary (.txt), detailed report (printable HTML).
- `src/engine.js`: downloads 6 fp16 ONNX backbones + `heads.json` from Base44 storage (`URLS`), caches them (Cache API), runs the pipeline.
- `src/koa-core.js`: MATLAB-parity maths: `clahe` (bit-identical to adapthisteq ClipLimit 0.02), `imresizeBicubic`, `toGrey` (rgb2gray),
  `headProbs` (GAP + fc + softmax), `gradCam7` (softmax-gradient Grad-CAM on res5b_relu, bicubic upsample), `decide` (KL0-1 margin 0.10 + pre-declared flags), `imageChecks`, `JET`.
- `src/base44Client.js`: SDK client for reviews/contact.

## Pipeline (must stay identical to MATLAB KOA_Predict)
CLAHE → 224×224 → grey to 3 channels → Model 1 (3 seeds × image + mirror, 6 softmax averaged) → subtract 0.10 from KL0-1 → argmax.
Model 4B (ordinal, same TTA) → argmax KL0-4. Flags: max P3 < 0.60; 4B group ≠ M1 group; raw mean < 30 or > 225 or SD < 20.
ONNX models are cut at `res5b_relu` (input `data` [N,3,224,224], 0-255 floats; normalisation is inside the graph); fc weights are in heads.json.

## Verification: re-run after ANY change to koa-core.js or engine.js
- `python verify.py`: ONNX + heads vs MATLAB reference JSONs in `..` (WEB_EXPORT). Expect max prob diff ~1e-6, CAM corr ≥ 0.999.
- `node run.mjs [testDir]`: full kneeKL224 test set (1,656). Must give **74.94%** 3-group, **58.88%** 5-grade, 86.65% within one,
  CM [[820,108,7],[193,212,42],[24,41,209]], 27.2% flagged / 81.7% unflagged correct. Needs `npm i -D onnxruntime-node pngjs`.
- Models in `..` are full precision; `fp16.py` makes the half-precision copies the site uses (≤ 0.16 pt probability shift).

## Figures
- `make_dark.py <ADV_STU_B>`: dark copy of `AT3 Report Figures/_source/make_at3_figures.py`, writes `./dark/`. Never edit the original script.
- `train_curves.py`: Train_R18/R50/R101/EffB0 from MATLAB TrainLogs + R18 history CSVs. `gcfigs.py` + `five.mjs`/`run.mjs`: Grad-CAM supp figures.
- Convert PNG → `public/figs/<name>.webp` (max 1800 px wide). Style: dark (#0d1b36 figure bg), teal #14b8a6 primary, no white backgrounds.

## Ground rules (project)
- Never write to, move or retrain the locked Model 1 checkpoints in `C:\Users\hovm3\Desktop\ADV_STU_B` (MD5-verified); dataset folders are read-only.
- Report only numbers recomputed from saved predictions. Keep "research prototype, not a medical device" wording on every page and in reports.
- Don't publish patient data; sample X-rays are held-out OAI kneeKL224 test knees (credit Chen 2018, Mendeley Data).
