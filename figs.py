# Convert source PNGs to public/figs/<name>.webp (max 1800 px wide, q90, flattened on the site figure bg #0d1b36)
# for every name in the FIGS list of src/App.jsx. Usage: python figs.py "<ADV_STU_B>/AT3 Report Figures/Web_DarkTheme"
import sys, re, pathlib
from PIL import Image
src = pathlib.Path(sys.argv[1]); out = pathlib.Path('public/figs')
block = pathlib.Path('src/App.jsx').read_text(encoding='utf-8').split('const FIGS = [')[1].split('\n];')[0]
names = re.findall(r"\['[^']+', '([^']+)', '", block)
have = {p.stem: p for p in src.glob('*.png')}
# Made elsewhere, never overwrite: Train_* (train_curves.py) and the browser-pipeline Grad-CAM figures (gcfigs.py).
# Web_DarkTheme's Supp_X01/X02 are different MATLAB montages that do not match the site captions.
OWN = {'Supp_X01_GradCAM_overlays', 'Supp_X02_GradCAM_mean_by_grade'}
for n in names:
    if n in OWN: print('kept (gcfigs.py):', n); continue
    if n not in have: print('FIGS entry with no source image:', n); continue
    im = Image.open(have[n]).convert('RGBA')
    bg = Image.new('RGBA', im.size, (13, 27, 54, 255)); bg.alpha_composite(im); im = bg.convert('RGB')
    if im.width > 1800: im = im.resize((1800, round(im.height * 1800 / im.width)), Image.LANCZOS)
    im.save(out / f'{n}.webp', 'WEBP', quality=90, method=6); print('ok', n, im.size)
for n in sorted(set(have) - set(names)): print('Source image with no FIGS entry:', n)
