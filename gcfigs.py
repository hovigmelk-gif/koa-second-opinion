import json, numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':9,'figure.facecolor':'#0d1b36','axes.facecolor':'#0d1b36','text.color':'#e6edf7','axes.titlecolor':'#ffffff'})
G3 = ['KL0–1', 'KL2', 'KL3–4']; jet = plt.get_cmap('jet')
def overlay(g, c): b = np.repeat(np.asarray(g, float).reshape(224, 224)[..., None] / 255, 3, 2); return 0.6 * b + 0.4 * jet(np.asarray(c).reshape(224, 224))[..., :3]
F = json.load(open('five.json'))
f, ax = plt.subplots(3, 5, figsize=(12, 7.6))
for j, d in enumerate(F):
    ax[0, j].imshow(np.array(d['raw']).reshape(224, 224), cmap='gray'); ax[1, j].imshow(np.array(d['clahe']).reshape(224, 224), cmap='gray'); ax[2, j].imshow(overlay(d['clahe'], d['cam']))
    ax[0, j].set_title(f'True KL{j}  ·  {d["f"].split("/")[1][:-4]}', fontsize=10, fontweight='bold')
    ax[2, j].set_xlabel(f'Pred {G3[d["grp"]]}  ({max(d["P3"]) * 100:.0f}%)', color='#5eead4', fontsize=10)
    for i in range(3): ax[i, j].set_xticks([]); ax[i, j].set_yticks([]); [s.set_visible(False) for s in ax[i, j].spines.values()]
for i, t in enumerate(['Original', 'CLAHE', 'Grad-CAM overlay']): ax[i, 0].set_ylabel(t, fontsize=10.5, color='#c9d4e5')
f.suptitle('Grad-CAM on held-out test knees (Model 1 three-seed ensemble, layer res5b_relu)', x=.01, ha='left', fontweight='bold', fontsize=12)
f.tight_layout(); f.savefig('dark/Supp_X01_GradCAM_overlays.png', dpi=200, facecolor='#0d1b36'); plt.close(f)
M = json.load(open('meancam.json')); N = [639, 296, 447, 223, 51]
mean_img = np.array(F[0]['clahe']).reshape(224, 224)  # anatomical reference: one KL0 knee
f, ax = plt.subplots(1, 5, figsize=(12, 3.1))
for k in range(5):
    m = np.array(M[k]).reshape(224, 224); ax[k].imshow(mean_img, cmap='gray', alpha=1); im = ax[k].imshow(m, cmap='jet', alpha=.55, vmin=0, vmax=1)
    ax[k].set_title(f'KL{k}  (n = {N[k]})', fontweight='bold'); ax[k].axis('off')
cb = f.colorbar(im, ax=ax, fraction=.015, pad=.01); cb.ax.tick_params(colors='#b3c0d4'); cb.outline.set_visible(False)
f.suptitle('Mean Grad-CAM by true KL grade, all 1,656 test knees (shown over a reference knee)', x=.01, ha='left', fontweight='bold', fontsize=12)
f.savefig('dark/Supp_X02_GradCAM_mean_by_grade.png', dpi=200, facecolor='#0d1b36', bbox_inches='tight'); plt.close(f); print('figs ok')
