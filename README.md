# KOA Second Opinion (website)

Live: https://koa-second-opinion-380491b2.base44.app  (Base44 app 6aeae7497e27e764380491b2)

Browser version of KOA_Predict / KOA_App: Model 1 (3-seed ResNet-18, flip TTA, KL0-1 margin 0.10),
Model 4B (ordinal, 5-grade), Grad-CAM (softmax gradient, res5b_relu) and the pre-declared review flags.

- src/koa-core.js   CLAHE (bit-identical to adapthisteq), imresize bicubic, heads, Grad-CAM, rules, image checks
- src/engine.js     loads the 6 ONNX backbones from Base44 file storage, runs the pipeline (ONNX Runtime Web)
- src/App.jsx       front page (#/) and full-screen app (#/app)
- Models: exported by STEP16_CLINICIAN_OUTPUT\KOA_ExportWeb.m to ADV_STU_B\WEB_EXPORT; fp16.py stores weights at
  half precision (max probability change 0.16 percentage points; same decisions on the 5 reference knees).

Update the site:  npm install  ->  npx base44 login  ->  npm run build  ->  npx base44 site deploy -y
