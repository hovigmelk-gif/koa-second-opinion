# KOA Second Opinion (website)

Live (Netlify): NETLIFY_URL  ·  Old Base44 copy: https://koa-second-opinion-380491b2.base44.app

Browser version of KOA_Predict / KOA_App: Model 1 (3-seed ResNet-18, flip TTA, KL0-1 margin 0.10),
Model 4B (ordinal, 5-grade), Grad-CAM (softmax gradient, res5b_relu) and the pre-declared review flags.

- src/koa-core.js        CLAHE (bit-identical to adapthisteq), imresize bicubic, heads, Grad-CAM, rules, image checks
- src/engine.js          loads the 6 fp16 ONNX backbones + heads.json from /models/ (public/models), runs the pipeline (ONNX Runtime Web)
- src/App.jsx            front page (#/) and full-screen app (#/app)
- src/supabaseClient.js  reviews + contact messages (Supabase; tables and RLS in supabase/migrations/)
- Models: exported by STEP16_CLINICIAN_OUTPUT\KOA_ExportWeb.m to ADV_STU_B\WEB_EXPORT; fp16.py stores weights at
  half precision (max probability change 0.16 percentage points; same decisions on the 5 reference knees).
  Regenerate: `python fp16.py ../M1_seed42.onnx public/models/M1_seed42.onnx` (for all 6) and copy `../heads.json` to public/models/.
- Figures: `python figs.py "<ADV_STU_B>/AT3 Report Figures/Web_DarkTheme"` writes public/figs/*.webp for the FIGS list in App.jsx.

## Deploy option 1: Netlify + Supabase (main)
1. Supabase: run `supabase/migrations/*.sql` once (dashboard SQL editor, or `supabase db push`).
2. Local dev: copy `.env.example` to `.env` and fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (Project Settings > API).
3. Netlify: the same two variables under Site configuration > Environment variables (baked in at build time).
4. `npm install` -> `npx netlify login` (once) -> `npx netlify deploy --build --prod`

Contact messages: Supabase dashboard > Table Editor > contact_messages (the site can only insert, never read them).

## Deploy option 2: Base44 (legacy)
The Base44 version is git tag `base44-version` (Base44 SDK for data, models on media.base44.com). Base44's site limit is
50 MB, so do not deploy main there (it ships 135 MB of models in public/).

    git worktree add ../koa-base44 base44-version
    cd ../koa-base44 && npm install && npx base44 login && npm run build && npx base44 site deploy -y
