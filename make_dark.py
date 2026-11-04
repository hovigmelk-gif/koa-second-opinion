# Recreates the AT3 report figure set from saved per-image test predictions + verified records.
# Run: python3 make_at3_figures.py   (paths relative to the ADV_STU_B folder)
import os, sys, csv, shutil, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
B = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/mnt/ADV_STU_B')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dark')
os.makedirs(OUT, exist_ok=True)
FP = os.path.join(B, 'FINAL_PACKAGE_TEAMS_CONDENSED')
P = dict(
 M1=f'{FP}/2_Model1_ResNet18_3group_FINAL/Step17_TTA_Ensemble/outputs/Step17_A_M1_locked_TestPredictions.csv',
 TTA=f'{FP}/2_Model1_ResNet18_3group_FINAL/Step17_TTA_Ensemble/outputs/Step17_B_M1_TTA_TestPredictions.csv',
 M2=f'{FP}/3_ResNet50_ResNet101/Model2_ResNet50_Results/poster_figures_Model2_Final/Model2_Final_TestPredictions.csv',
 M3=f'{FP}/3_ResNet50_ResNet101/Model3_ResNet101_Results/poster_figures_Model3_Final/Model3_Final_TestPredictions.csv',
 M5=f'{B}/MODEL5_EFFICIENTNETB0/poster_figures_Model5_Final/Model5_Final_TestPredictions.csv',
 M4B=f'{B}/MODEL4B_RESNET18_5CLASS_ORDINAL/poster_figures_Model4B_Final/Model4B_Final_TestPredictions.csv')
HD = f'{B}/90_ARCHIVE_ResNet18_DevHistory/Final MODEL1_RESNET18_HANDOFF/KOA_Claude_Code_handoff/koa_claude_package/extracted'
HIST = {'Seed 42': f'{HD}/baseline_filename_no_seed_history.csv', 'Seed 7': f'{HD}/seed7_history.csv', 'Seed 123': f'{HD}/seed123_history.csv'}

plt.rcParams.update({'font.family':'DejaVu Sans','font.size':9,'axes.spines.top':False,'axes.spines.right':False,
 'axes.titlesize':10,'axes.titleweight':'bold','axes.titlelocation':'left','savefig.dpi':300,'savefig.bbox':'tight',
 'axes.edgecolor':'#3b5585','axes.labelcolor':'#c9d4e5','xtick.color':'#b3c0d4','ytick.color':'#b3c0d4',
 'figure.facecolor':'#0d1b36','axes.facecolor':'#0d1b36','text.color':'#e6edf7','axes.titlecolor':'#ffffff',
 'legend.labelcolor':'#c9d4e5','grid.color':'#23385f','savefig.dpi':220})
NAVY, BLUE, LBLUE, GREY, DGREY, ORANGE, INK = '#14b8a6', '#60a5fa', '#a5f3fc', '#55657f', '#8fa0bb', '#f59e0b', '#e6edf7'
from matplotlib.colors import LinearSegmentedColormap
DARKCM = LinearSegmentedColormap.from_list('darkteal', ['#122648', '#155e75', '#14b8a6', '#5eead4'])
G3 = ['KL0–1', 'KL2', 'KL3–4']; G5 = ['KL0', 'KL1', 'KL2', 'KL3', 'KL4']
made = []
def save(fig, name, cap):
    fig.savefig(os.path.join(OUT, name + '.png'), facecolor='#0d1b36'); plt.close(fig); made.append((name, cap))

def load(path, K):
    with open(path, newline='') as f: rows = list(csv.DictReader(f))
    y = np.array([int(r['TrueIdx']) for r in rows]); p = np.array([int(r['PredIdx']) for r in rows])
    pr = np.array([[float(r[f'P{k}']) for k in range(K)] for r in rows])
    orig = np.array([int(r['OrigKL']) for r in rows])
    pid = np.array([r['File'].replace('/', '\\').split('\\')[-1][:-5] for r in rows])
    return y, p, pr, orig, pid

def met(y, p, K):
    C = np.zeros((K, K), int)
    for a, b in zip(y, p): C[a, b] += 1
    n = C.sum(); tp = np.diag(C); rec = tp / C.sum(1); pre = tp / C.sum(0); f1 = 2 * pre * rec / (pre + rec)
    spec = np.array([(n - C[i].sum() - C[:, i].sum() + C[i, i]) / (n - C[i].sum()) for i in range(K)])
    i, j = np.indices(C.shape); W = (i - j) ** 2 / (K - 1) ** 2; E = np.outer(C.sum(1), C.sum(0)) / n
    return dict(C=C, acc=tp.sum() / n * 100, bal=rec.mean() * 100, f1=np.nanmean(f1) * 100, rec=rec * 100, pre=pre * 100,
                f1c=f1 * 100, spec=spec * 100, qwk=1 - (W * C).sum() / (W * E).sum(), within1=(np.abs(y - p) <= 1).mean() * 100)

def ece(pr, y, nb=15):
    conf = pr.max(1); ok = pr.argmax(1) == y; e = 0; pts = []
    edges = np.linspace(0, 1, nb + 1)
    for a, b in zip(edges[:-1], edges[1:]):
        m = (conf > a) & (conf <= b)
        if m.sum():
            e += m.mean() * abs(ok[m].mean() - conf[m].mean())
            if m.sum() >= 10: pts.append((conf[m].mean(), ok[m].mean(), m.sum()))
    return e * 100, np.array(pts)

def boot_ci(y, p, pid, nb=2000, seed=42):
    rng = np.random.default_rng(seed); ups = np.unique(pid); idx = {u: np.where(pid == u)[0] for u in ups}; ok = (y == p)
    accs = []
    for _ in range(nb):
        s = rng.choice(ups, len(ups), replace=True); ii = np.concatenate([idx[u] for u in s]); accs.append(ok[ii].mean() * 100)
    return np.percentile(accs, [2.5, 97.5])

def cmplot(ax, C, labels, title, outline=None, fs=9):
    R = C / C.sum(1, keepdims=True)
    ax.imshow(R, cmap=DARKCM, vmin=0, vmax=1)
    for i in range(C.shape[0]):
        for j in range(C.shape[1]):
            ax.text(j, i, f'{C[i, j]}\n{R[i, j] * 100:.0f}%', ha='center', va='center', fontsize=fs,
                    color='#071122' if R[i, j] > 0.62 else INK, fontweight='bold' if i == j else 'normal')
    ax.set_xticks(range(len(labels))); ax.set_xticklabels(labels); ax.set_yticks(range(len(labels))); ax.set_yticklabels(labels)
    ax.set_xlabel('Predicted grade'); ax.set_ylabel('True grade'); ax.set_title(title, fontsize=9.5)
    for s in ax.spines.values(): s.set_visible(False)
    ax.tick_params(length=0)
    if outline: ax.add_patch(Rectangle((outline[1] - .5, outline[0] - .5), 1, 1, fill=False, ec=ORANGE, lw=2.5))

def barlabels(ax, bars, fmt='{:.1f}', fs=7.5, dy=1):
    for b in bars: ax.text(b.get_x() + b.get_width() / 2, b.get_height() + dy, fmt.format(b.get_height()), ha='center', va='bottom', fontsize=fs, color=INK)

# ---------- load + verify ----------
D = {}
for k, K in [('M1', 3), ('TTA', 3), ('M2', 3), ('M3', 3), ('M5', 3), ('M4B', 5)]:
    y, p, pr, orig, pid = load(P[k], K); D[k] = dict(y=y, p=p, pr=pr, orig=orig, pid=pid, m=met(y, p, K), ece=ece(pr, y))
EXP = {'M1': 74.03, 'TTA': 74.94, 'M2': 72.83, 'M3': 74.15, 'M5': 70.23, 'M4B': 58.88}
print('VERIFY  model  acc(computed) expected  bal  qwk  ECE15')
for k in D:
    m = D[k]['m']; print(f'  {k:4s} {m["acc"]:.2f} {EXP[k]:.2f}  {m["bal"]:.2f}  {m["qwk"]:.3f}  {D[k]["ece"][0]:.2f}')
    assert abs(m['acc'] - EXP[k]) < 0.01, k
m5ci = boot_ci(D['M5']['y'], D['M5']['p'], D['M5']['pid']); print('M5 patient-cluster CI', m5ci)

# ---------- Fig01 dataset ----------
split = {'Train': [2286, 1046, 1516, 757, 173], 'Validation': [328, 153, 212, 106, 27], 'Test': [639, 296, 447, 223, 51]}
fig, ax = plt.subplots(1, 2, figsize=(7, 2.8), gridspec_kw=dict(width_ratios=[1.5, 1]))
bot = np.zeros(5)
for (s, v), c in zip(split.items(), [NAVY, BLUE, LBLUE]):
    ax[0].bar(G5, v, bottom=bot, color=c, label=s, width=.65); bot += v
for i, t in enumerate(bot): ax[0].text(i, t + 40, f'{int(t):,}', ha='center', fontsize=8)
ax[0].set_ylabel('Radiographs'); ax[0].set_ylim(0, 3700); ax[0].legend(frameon=False, fontsize=8)
ax[0].set_title('A  8,260 knees (KL0 : KL4 = 13 : 1)')
w = [0.632, 1.171, 1.196]; bb = ax[1].bar(['KL0–1\nn = 3,332', 'KL2\nn = 1,516', 'KL3–4\nn = 930'], w, color=[GREY, NAVY, GREY], width=.6)
barlabels(ax[1], bb, '{:.3f}', dy=.02); ax[1].set_ylim(0, 1.4); ax[1].set_ylabel('Loss weight')
ax[1].set_title('B  Loss weights, 1/√n, KL2 × 1.25')
save(fig, 'Fig01_dataset_class_distribution', 'Knee radiographs per KL grade in the official kneeKL224 split (A) and three-group loss weights, inverse square root of training frequency with a 1.25 KL2 boost (B).')

# ---------- Fig02 headline dot plot (content pack chart 1) ----------
rows = [('ResNet-18 + flip TTA (final)', 'TTA', (72.71, 77.12)), ('ResNet-18 (M1)', 'M1', (71.74, 76.27)), ('ResNet-101 (M3)', 'M3', (72.04, 76.33)),
        ('ResNet-50 (M2)', 'M2', (70.47, 75.06)), ('EfficientNet-B0 (M5)', 'M5', tuple(m5ci))]
fig, ax = plt.subplots(figsize=(7, 3.0))
for i, (lab, k, ci) in enumerate(rows):
    m = D[k]['m']; c = BLUE if k == 'TTA' else DGREY; yy = -i
    ax.plot(ci, [yy, yy], color=c, lw=2, alpha=.6)
    ax.plot(m['acc'], yy, 'o', color=c, ms=8, zorder=3); ax.plot(m['bal'], yy, 'o', mfc='#0d1b36', mec=c, mew=2, ms=7, zorder=3)
    ax.plot(m['f1'], yy, 'D', color=c, ms=5, alpha=.8, zorder=3)
    ax.text(m['acc'] - .25, yy + .28, f'{m["acc"]:.2f}', ha='right', fontsize=8, color=INK)
    ax.text(80.6, yy, f'QWK {m["qwk"]:.3f}', va='center', fontsize=8, color=INK)
ax.axvline(75, color=ORANGE, ls='--', lw=1.2); ax.text(75.1, .55, 'S2 target 75%', color=ORANGE, fontsize=8)
ax.set_yticks([-i for i in range(5)]); ax.set_yticklabels([r[0] for r in rows]); ax.set_xlim(60, 80); ax.set_ylim(-4.6, .8)
ax.set_xlabel('Three-group test performance (%), n = 1,656')
ax.plot([], [], 'o', color=DGREY, label='Accuracy (patient-cluster 95% CI)'); ax.plot([], [], 'o', mfc='#0d1b36', mec=DGREY, mew=2, label='Balanced accuracy'); ax.plot([], [], 'D', color=DGREY, label='Macro F1')
ax.legend(frameon=False, fontsize=7.5, loc='lower left', ncol=3, bbox_to_anchor=(0, -.42))
ax.set_title('No backbone beats ResNet-18; the final pipeline is one image short of 75%')
save(fig, 'Fig02_threegroup_model_comparison_CI', 'Three-group test accuracy with patient-cluster 95% CI, balanced accuracy and macro F1 for every backbone under the identical protocol (EfficientNet-B0 CI computed here, 2,000 patient resamples). Dashed line: S2 target. [Content-pack chart 1]')

# ---------- Fig03 three-depth CMs ----------
fig, ax = plt.subplots(1, 3, figsize=(7.2, 2.7))
for a, (k, lab) in zip(ax, [('M1', 'ResNet-18'), ('M2', 'ResNet-50'), ('M3', 'ResNet-101')]):
    cmplot(a, D[k]['m']['C'], G3, f'{lab} · {D[k]["m"]["acc"]:.2f}%', outline=(1, 0), fs=8)
for a in ax[1:]: a.set_ylabel('')
fig.tight_layout()
save(fig, 'Fig03_CM_ResNet18_50_101', 'Three-group test confusion matrices (counts, row %) for ResNet-18, -50 and -101 three-seed ensembles. Outlined: true KL2 predicted as KL0–1, the largest error at every depth.')

# ---------- Fig04 final CM ----------
fig, ax = plt.subplots(figsize=(3.6, 3.2))
cmplot(ax, D['TTA']['m']['C'], G3, f'Final pipeline · {D["TTA"]["m"]["acc"]:.2f}% (bal. {D["TTA"]["m"]["bal"]:.2f}%)', outline=(1, 0))
save(fig, 'Fig04_CM_final_3group', 'Test confusion matrix of the final three-group pipeline (Model 1 three-seed ensemble + flip TTA, 0.10 KL0–1 margin). Outlined: 193 KL2 knees predicted KL0–1.')

# ---------- Fig05 per-class final ----------
m = D['TTA']['m']; x = np.arange(3); wd = .2
fig, ax = plt.subplots(figsize=(7, 2.8))
for i, (key, lab, c) in enumerate([('rec', 'Recall', NAVY), ('pre', 'Precision', BLUE), ('f1c', 'F1', LBLUE), ('spec', 'Specificity', GREY)]):
    bb = ax.bar(x + (i - 1.5) * wd, m[key], wd, color=c, label=lab); barlabels(ax, bb, '{:.1f}', fs=7)
ax.set_xticks(x); ax.set_xticklabels([f'{g}\n(n = {n})' for g, n in zip(G3, [935, 447, 274])]); ax.set_ylim(0, 110); ax.set_ylabel('%')
ax.legend(frameon=False, ncol=4, fontsize=8, loc='upper center', bbox_to_anchor=(.5, 1.02)); ax.set_title('KL2 is the bottleneck: 47.4% recall vs 87.7% (KL0–1) and 76.3% (KL3–4)', pad=16)
save(fig, 'Fig05_perclass_final_3group', 'Per-class test recall, precision, F1 and specificity of the final three-group pipeline.')

# ---------- Fig06 EfficientNet fair test ----------
a1, a5 = D['M1']['m'], D['M5']['m']
labs = ['Accuracy', 'Balanced\naccuracy', 'Macro F1', 'KL2\nrecall', 'KL3–4\nrecall']
v1 = [a1['acc'], a1['bal'], a1['f1'], a1['rec'][1], a1['rec'][2]]; v5 = [a5['acc'], a5['bal'], a5['f1'], a5['rec'][1], a5['rec'][2]]
fig, ax = plt.subplots(1, 2, figsize=(7.2, 2.9), gridspec_kw=dict(width_ratios=[1.6, 1]))
x = np.arange(5); b1 = ax[0].bar(x - .19, v1, .38, color=NAVY, label='ResNet-18 (M1)'); b5 = ax[0].bar(x + .19, v5, .38, color=ORANGE, label='EfficientNet-B0 (M5)')
barlabels(ax[0], b1, '{:.1f}', fs=7); barlabels(ax[0], b5, '{:.1f}', fs=7)
ax[0].set_xticks(x); ax[0].set_xticklabels(labs); ax[0].set_ylim(0, 112); ax[0].set_ylabel('Test %'); ax[0].legend(frameon=False, fontsize=7.5, loc='upper center', ncol=2)
ax[0].set_title('A  Same protocol: −3.8 pts (p = 0.001)')
cmplot(ax[1], a5['C'], G3, 'B  EfficientNet-B0 confusion', outline=(2, 1), fs=8)
fig.tight_layout()
save(fig, 'Fig06_EfficientNetB0_fair_test', 'ResNet-18 (Model 1) vs EfficientNet-B0 (Model 5) under the identical three-seed protocol: test metrics (A) and EfficientNet-B0 confusion matrix (B); outlined: 94 severe knees called KL2. Paired difference −3.8 pts (95% CI −6.1 to −1.5), McNemar p = 0.001.')

# ---------- Fig07 forest ----------
comp = [('Final (M1 + TTA) − M1', .91, -.30, 2.05, .17, '3 groups'), ('ResNet-50 − ResNet-18', -1.21, -2.96, .72, .22, '3 groups'),
        ('ResNet-101 − ResNet-18', .12, -1.81, 2.05, .95, '3 groups'), ('ResNet-101 − ResNet-50', 1.33, -.48, 3.14, .18, '3 groups'),
        ('EfficientNet-B0 − ResNet-18', -3.80, -6.10, -1.54, .001, '3 groups'), ('EffNet-B0 + TTA − ResNet-18 + TTA', -3.44, -5.46, -1.27, .0015, '3 groups'),
        ('M4 (CE) − 5-class reference', 3.02, 1.09, 4.89, .0022, '5 grades'), ('M4B ordinal − M4 (CE)', .36, -.60, 1.39, .57, '5 grades'),
        ('M4C CORAL − M4B ordinal', -4.23, -6.46, -1.99, .0002, '5 grades')]
fig, ax = plt.subplots(figsize=(7, 3.6))
for i, (lab, d, lo, hi, p, t) in enumerate(comp):
    yy = -i; sig = lo > 0 or hi < 0; c = ORANGE if sig else DGREY
    ax.plot([lo, hi], [yy, yy], color=c, lw=2); ax.plot(d, yy, 'o', color=c, ms=7)
    ax.text(6.9, yy, f'{d:+.2f}  p = {p:g}', va='center', fontsize=7.8, color=INK)
ax.axvline(0, color=INK, lw=.8); ax.axhline(-5.5, color=GREY, lw=.6, ls=':')
ax.set_yticks([-i for i in range(len(comp))]); ax.set_yticklabels([c[0] for c in comp]); ax.set_xlim(-7.5, 6.5)
ax.text(-7.4, .55, 'Three groups', fontsize=8, color=DGREY); ax.text(-7.4, -5.85, 'Five grades', fontsize=8, color=DGREY)
ax.set_xlabel('Accuracy difference, points (paired patient-cluster bootstrap 95% CI)'); ax.set_ylim(-8.6, .9)
ax.set_title('Only EfficientNet-B0 and CORAL differ significantly (orange)')
save(fig, 'Fig07_paired_comparisons_forest', 'Paired accuracy differences on the same 1,656 test knees with 95% CI and exact McNemar p. Orange: CI excludes zero.')

# ---------- Fig08 training curves ----------
fig, ax = plt.subplots(1, 2, figsize=(7.2, 2.9)); cols = {'Seed 42': '#117A65', 'Seed 7': ORANGE, 'Seed 123': '#7D3C98'}
for s, f in HIST.items():
    with open(f, newline='') as fh: R = list(csv.DictReader(fh))
    it = np.array([float(r['iteration']) for r in R]); ta = np.array([float(r['TrainingAccuracy']) for r in R]); tl = np.array([float(r['TrainingLoss']) for r in R])
    vi = [k for k, r in enumerate(R) if r['ValidationAccuracy'] not in ('', 'NaN', 'nan')]
    va = np.array([float(R[k]['ValidationAccuracy']) for k in vi]); vl = np.array([float(R[k]['ValidationLoss']) for k in vi]); vit = it[vi]
    sm = lambda v: np.convolve(v, np.ones(50) / 50, mode='valid')
    ax[0].plot(it[49:], sm(ta), color=cols[s], lw=.8, alpha=.35); ax[0].plot(vit, va, color=cols[s], lw=1.6, label=s)
    ax[1].plot(it[49:], sm(tl), color=cols[s], lw=.8, alpha=.35); ax[1].plot(vit, vl, color=cols[s], lw=1.6, label=s)
    kb = int(np.argmin(vl)); ax[1].plot(vit[kb], vl[kb], 'o', color=cols[s], ms=6, mec='white'); ax[0].plot(vit[kb], va[kb], 'o', color=cols[s], ms=6, mec='white')
ax[0].set_ylabel('Accuracy (%)'); ax[1].set_ylabel('Loss'); [a.set_xlabel('Stage B iteration (1 epoch ≈ 361)') for a in ax]
ax[0].set_title('A  Accuracy (thin = train, bold = validation)'); ax[1].set_title('B  Loss (dot = kept network)'); ax[1].legend(frameon=False, fontsize=7.5)
fig.tight_layout()
save(fig, 'Fig08_M1_training_curves_3seeds', 'Model 1 Stage B training (thin, 50-iteration mean) and validation (bold) curves for seeds 42, 7 and 123; dots mark the kept best-validation-loss networks (iterations 1,200, 930, 1,310). Each run stopped 350 iterations after its minimum.')

# ---------- Fig09 efficiency ----------
fig, ax = plt.subplots(1, 3, figsize=(7.2, 2.6))
pts = [('ResNet-18', 11.18, 74.03, NAVY), ('ResNet-50', 23.54, 72.83, GREY), ('ResNet-101', 42.56, 74.15, DGREY), ('EfficientNet-B0', 4.0, 70.23, ORANGE)]
for n, pm, a, c in pts: ax[0].scatter(pm, a, s=60, color=c, zorder=3); ax[0].annotate(n, (pm, a), textcoords='offset points', xytext=(5, 5), fontsize=7.5)
ax[0].set_xlabel('Parameters (M)'); ax[0].set_ylabel('3-group test accuracy (%)'); ax[0].set_ylim(68, 77); ax[0].set_xlim(0, 50); ax[0].set_title('A  Accuracy vs size')
nm = ['R18', 'R50', 'R101']; bb = ax[1].bar(nm, [8.4, 17.2, 31.6], color=[NAVY, GREY, DGREY], width=.6); barlabels(ax[1], bb, '{:.1f}', dy=.5)
ax[1].set_ylabel('CPU ms / image / network'); ax[1].set_ylim(0, 37); ax[1].set_title('B  Inference time')
bb = ax[2].bar(nm, [3.6, 7.2, 7.5], color=[NAVY, GREY, DGREY], width=.6); barlabels(ax[2], bb, '+{:.1f}', dy=.15)
ax[2].set_ylabel('Train − val accuracy (pts)'); ax[2].set_ylim(0, 9); ax[2].set_title('C  Overfitting gap')
fig.tight_layout()
save(fig, 'Fig09_efficiency_size_speed_overfitting', 'Cost of depth: accuracy vs parameters (A), CPU inference time per network, batch 32 (B), and train–validation accuracy gap at the kept network (C). Final pipeline = 6 network passes ≈ 50 ms per knee.')

# ---------- Fig10 task framing ----------
labs = ['5-class\nreference', 'M4\nCE', 'M4B\nordinal', 'M4C\nCORAL', 'M1', 'M1 + TTA\n(final)', 'M4B\ncollapsed']
acc = [55.50, 58.51, D['M4B']['m']['acc'], 54.65, 74.03, 74.94, 75.06]; bal = [52.97, 56.65, D['M4B']['m']['bal'], 53.78, 69.47, 70.47, 68.90]
fig, ax = plt.subplots(figsize=(7, 2.9)); x = np.arange(7)
ba = ax.bar(x - .19, acc, .38, color=[NAVY] * 4 + [BLUE] * 3, label='Accuracy'); bb = ax.bar(x + .19, bal, .38, color=[LBLUE] * 7, label='Balanced accuracy')
barlabels(ax, ba, '{:.1f}', fs=7); barlabels(ax, bb, '{:.1f}', fs=7)
ax.axvline(3.5, color=GREY, ls=':'); ax.text(1.5, 92, 'Five grades (KL0–4)', ha='center', fontsize=8.5, color=DGREY); ax.text(5, 92, 'Three groups', ha='center', fontsize=8.5, color=DGREY)
ax.set_xticks(x); ax.set_xticklabels(labs, fontsize=8); ax.set_ylim(0, 100); ax.set_ylabel('Test %'); ax.legend(frameon=False, fontsize=7.5, loc='upper left', bbox_to_anchor=(0, .92))
ax.set_title('Task framing, not the network, moves accuracy from ~59% to ~75%')
save(fig, 'Fig10_task_framing_5grade_vs_3group', 'Five-grade exact accuracy vs three-group accuracy on the same test set; Model 4B collapsed to three groups (75.06%) matches the three-group pipeline.')

# ---------- Fig11 M4B CM ----------
fig, ax = plt.subplots(figsize=(4.4, 3.8))
cmplot(ax, D['M4B']['m']['C'], G5, f'Model 4B ordinal + TTA · {D["M4B"]["m"]["acc"]:.2f}% · within-1 {D["M4B"]["m"]["within1"]:.1f}%', outline=(1, 0), fs=8)
save(fig, 'Fig11_CM_M4B_5grade', 'Five-grade test confusion matrix of Model 4B (ordinal loss, three seeds, flip TTA). Outlined: 191 of 296 KL1 knees predicted KL0.')

# ---------- Fig12 per-grade recall ----------
fig, ax = plt.subplots(figsize=(7, 2.8)); x = np.arange(5)
series = [('M4 cross-entropy', [90.0, 12.5, 41.2, 59.2, 80.4], GREY), ('M4B ordinal (final)', list(D['M4B']['m']['rec']), NAVY), ('EfficientNet-B0 exploratory*', [74.0, 24.7, 57.5, 73.5, 72.5], ORANGE)]
for i, (lab, v, c) in enumerate(series):
    bb = ax.bar(x + (i - 1) * .26, v, .26, color=c, label=lab); barlabels(ax, bb, '{:.0f}', fs=7)
ax.set_xticks(x); ax.set_xticklabels([f'{g}\n(n = {n})' for g, n in zip(G5, [639, 296, 447, 223, 51])]); ax.set_ylim(0, 105); ax.set_ylabel('Recall (%)')
ax.legend(frameon=False, fontsize=7.5, ncol=3, loc='upper center'); ax.set_title('KL1 is the weakest grade for every five-grade model', pad=14)
ax.text(4.5, -24, '*one seed, different protocol', ha='right', fontsize=7, color=DGREY)
save(fig, 'Fig12_pergrade_recall_5grade', 'Five-grade test recall by true KL grade for Model 4 (cross-entropy), Model 4B (ordinal, final) and the exploratory EfficientNet-B0 baseline.')

# ---------- Fig13 errors ----------
C = D['TTA']['m']['C']; err = [((i, j), C[i, j]) for i in range(3) for j in range(3) if i != j]; err.sort(key=lambda t: t[1])
fig, ax = plt.subplots(1, 2, figsize=(7.2, 2.7), gridspec_kw=dict(width_ratios=[1.5, 1]))
labs = [f'{G3[i]} → {G3[j]}' for (i, j), _ in err]; vals = [v for _, v in err]
cl = [ORANGE if abs(i - j) == 2 else (NAVY if (i, j) == (1, 0) else GREY) for (i, j), _ in err]
bb = ax[0].barh(labs, vals, color=cl)
for b, v in zip(bb, vals): ax[0].text(v + 3, b.get_y() + b.get_height() / 2, f'{v} ({v / C.sum() * 100 if False else v / (C.sum() - np.trace(C)) * 100:.0f}%)', va='center', fontsize=7.5)
ax[0].set_xlabel('Knees (of 415 errors)'); ax[0].set_xlim(0, 240); ax[0].set_title('A  92.5% of errors adjacent (orange = 2 off)')
x = np.arange(3); bt = ax[1].bar(x - .19, C.sum(1), .38, color=GREY, label='True'); bp = ax[1].bar(x + .19, C.sum(0), .38, color=NAVY, label='Predicted')
barlabels(ax[1], bt, '{:.0f}', fs=7, dy=8); barlabels(ax[1], bp, '{:.0f}', fs=7, dy=8)
ax[1].set_xticks(x); ax[1].set_xticklabels(G3); ax[1].set_ylim(0, 1200); ax[1].legend(frameon=False, fontsize=7.5); ax[1].set_title('B  Drift to KL0–1 (+102)')
fig.tight_layout()
save(fig, 'Fig13_error_analysis_final_3group', 'Error anatomy of the final three-group pipeline: error types (A) and true vs predicted counts per group (B).')

# ---------- Fig14 calibration ----------
ece_rows = [('M1', D['M1']['ece'][0]), ('Final', D['TTA']['ece'][0]), ('ResNet-50', D['M2']['ece'][0]), ('ResNet-101', D['M3']['ece'][0]),
            ('EffNet-B0', D['M5']['ece'][0]), ('M4', 2.39), ('M4B', D['M4B']['ece'][0]), ('M4C', 9.77)]
fig, ax = plt.subplots(1, 2, figsize=(7.2, 2.9), gridspec_kw=dict(width_ratios=[1.3, 1]))
cl = [NAVY, BLUE, GREY, DGREY, ORANGE, GREY, NAVY, DGREY]
bb = ax[0].bar([r[0] for r in ece_rows], [r[1] for r in ece_rows], color=cl, width=.65); barlabels(ax[0], bb, '{:.1f}', fs=7, dy=.15)
ax[0].set_ylabel('Top-label ECE, 15 bins (%)'); ax[0].set_ylim(0, 11); ax[0].tick_params(axis='x', labelsize=7.5, rotation=30); ax[0].set_title('A  Ensembles are calibrated within 2–5%')
ax[1].plot([0, 1], [0, 1], color=GREY, ls='--', lw=1)
for k, lab, c in [('TTA', 'Final 3-group', BLUE), ('M4B', 'M4B 5-grade', NAVY), ('M5', 'EfficientNet-B0', ORANGE)]:
    pts = D[k]['ece'][1]; ax[1].plot(pts[:, 0], pts[:, 1], 'o-', color=c, ms=4, lw=1.4, label=f'{lab} ({D[k]["ece"][0]:.1f}%)')
ax[1].set_xlabel('Mean confidence'); ax[1].set_ylabel('Observed accuracy'); ax[1].set_xlim(.3, 1); ax[1].set_ylim(.2, 1.02); ax[1].legend(frameon=False, fontsize=7)
ax[1].set_title('B  Reliability (bins with ≥ 10 knees)'); fig.tight_layout()
save(fig, 'Fig14_calibration_ECE_reliability', 'Calibration of the ensembles: top-label expected calibration error (A; recomputed from saved test probabilities; M4 and M4C from records) and reliability curves (B). EfficientNet-B0 (Model 5) ECE is newly computed here.')

# ---------- Fig15 review flags (content pack chart 3) ----------
fl = [('Any flag (27.2% flagged)', 56.9, 81.7, 1), ('Confidence < 0.60 (21.9%)', 53.3, 81.0, 0), ('3-group vs 5-grade disagree (8.0%)', 43.6, 77.7, 0), ('Exposure check (6.1%)', 72.3, 75.1, 0)]
fig, ax = plt.subplots(figsize=(7, 2.6))
for i, (lab, f, u, acc_) in enumerate(fl):
    yy = -i; c = BLUE if acc_ else DGREY
    ax.plot([f, u], [yy, yy], color=GREY, lw=2); ax.plot(f, yy, 'o', mfc='#0d1b36', mec=c, mew=2, ms=8); ax.plot(u, yy, 'o', color=c, ms=8)
    ax.text(f, yy - .33, f'{f:.1f}', ha='center', fontsize=7.5, color=DGREY); ax.text(u + .6, yy + .18, f'{u:.1f}', ha='left', fontsize=7.5, color=INK)
ax.axvline(74.94, color=ORANGE, ls='--', lw=1); ax.text(74.5, .55, 'all knees 74.94%', ha='right', fontsize=7.5, color=ORANGE)
ax.set_yticks([-i for i in range(4)]); ax.set_yticklabels([r[0] for r in fl]); ax.set_xlim(40, 90); ax.set_ylim(-3.6, .8)
ax.set_xlabel('Three-group test accuracy (%): hollow = flagged, filled = not flagged')
ax.set_title('Flags route 27.2% of knees to review; the rest are 81.7% correct')
save(fig, 'Fig15_review_flags', 'Accuracy of flagged vs unflagged test knees for each pre-declared review flag in KOA_App; the union flags 27.2% of knees and captures 46.7% of errors. [Content-pack chart 3]')

# ---------- Fig16 validation candidates ----------
cand = [('A  M1', 75.18, 69.41, .709), ('B  M1 + TTA (locked)', 76.03, 70.62, .716), ('C  M1 + M3', 74.21, 69.12, .694), ('D  M1 + M3 + TTA', 75.54, 69.79, .717)]
fig, ax = plt.subplots(figsize=(7, 2.3))
for i, (lab, a, b, q) in enumerate(cand):
    yy = -i; c = BLUE if i == 1 else DGREY
    ax.plot([b, a], [yy, yy], color=GREY, lw=1.5); ax.plot(a, yy, 'o', color=c, ms=8); ax.plot(b, yy, 'o', mfc='#0d1b36', mec=c, mew=2, ms=7)
    ax.text(a + .25, yy, f'{a:.2f}', va='center', fontsize=7.5); ax.text(78.2, yy, f'QWK {q:.3f}', va='center', fontsize=7.5)
ax.set_yticks([-i for i in range(4)]); ax.set_yticklabels([c[0] for c in cand]); ax.set_xlim(68, 80); ax.set_ylim(-3.5, .5)
ax.set_xlabel('Validation % (filled = accuracy, hollow = balanced), n = 826')
ax.set_title('Flip TTA selected on validation before testing; adding ResNet-101 did not help')
save(fig, 'Fig16_validation_candidate_selection', 'Step 17 candidate pipelines scored on the validation set only, with a rule declared before running; candidate B was locked and tested once.')

# ---------- Fig17 seed variability ----------
sd = [('ResNet-50', [67.23, 66.53, 66.91], 67.30), ('ResNet-101', [61.87, 68.01, 68.98], 69.54), ('EfficientNet-B0', [65.71, 64.32, 63.57], 64.69)]
fig, ax = plt.subplots(figsize=(7, 2.4))
for i, (lab, s, e) in enumerate(sd):
    yy = -i; ax.plot(s, [yy] * 3, 'o', color=GREY, ms=7); ax.plot(e, yy, 'D', color=NAVY, ms=8)
    ax.text(max(s + [e]) + .4, yy, f'SD {np.std(s, ddof=1):.2f}', va='center', fontsize=7.5)
ax.axvline(69.47, color=ORANGE, ls='--', lw=1); ax.text(69.6, .45, 'ResNet-18 ensemble 69.47', fontsize=7.5, color=ORANGE)
ax.set_yticks([0, -1, -2]); ax.set_yticklabels([s[0] for s in sd]); ax.set_xlim(60, 73); ax.set_ylim(-2.6, .8)
ax.plot([], [], 'o', color=GREY, label='single seed (42 / 7 / 123)'); ax.plot([], [], 'D', color=NAVY, label='3-seed ensemble'); ax.legend(frameon=False, fontsize=7.5, loc='upper left')
ax.set_xlabel('Three-group test balanced accuracy (%)'); ax.set_title('Single seeds vary by up to 7 points; ensembling removes the outlier')
save(fig, 'Fig17_seed_variability', 'Per-seed vs ensemble test balanced accuracy for ResNet-50, ResNet-101 and EfficientNet-B0 (per-seed Model 1 test results were not saved).')

# ---------- Fig18 EffNet exploratory CM ----------
CE = np.array([[473, 117, 47, 2, 0], [133, 73, 86, 4, 0], [80, 79, 257, 30, 1], [2, 14, 38, 164, 5], [0, 0, 3, 11, 37]])
fig, ax = plt.subplots(figsize=(4.4, 3.8)); cmplot(ax, CE, G5, 'EfficientNet-B0 exploratory (1 seed) · 60.63%', fs=8)
save(fig, 'Fig18_CM_EfficientNetB0_exploratory_5grade', 'Five-grade test confusion matrix of the exploratory single-seed EfficientNet-B0 (no CLAHE or augmentation, unweighted loss, final-epoch network); not statistically comparable with the ResNet ensembles.')

# ---------- Fig19 binary vs literature ----------
bi = [('ResNet-18 (M1)', 79.29), ('ResNet-50 (M2)', 78.50), ('ResNet-101 (M3)', 79.41), ('M4B collapsed', 79.59), ('Final (M1 + TTA)', 79.95)]
fig, ax = plt.subplots(figsize=(7, 2.2))
for i, (lab, v) in enumerate(bi):
    c = BLUE if 'Final' in lab else DGREY; ax.plot(v, -i, 'o', color=c, ms=8); ax.text(v + .1, -i + .22, f'{v:.2f}', fontsize=7.5)
ax.axvline(79.7, color=ORANGE, ls='--', lw=1); ax.text(79.72, .45, 'Mohammed et al. (2023) 79.7%', fontsize=7.5, color=ORANGE)
ax.set_yticks([-i for i in range(5)]); ax.set_yticklabels([b[0] for b in bi]); ax.set_xlim(77, 82); ax.set_ylim(-4.5, .8)
ax.set_xlabel('Binary accuracy, KL0–1 vs KL2–4 (%)'); ax.set_title('On the matched binary task our models match the literature')
save(fig, 'Fig19_binary_vs_literature', 'Accuracy on the matched binary task (KL0–1 vs KL2–4) compared with the ResNet result of Mohammed et al. (2023); their "three-class" result excludes KL0–1 and is not comparable.')

# ---------- Fig20 Grad-CAM audit ----------
fig, ax = plt.subplots(1, 2, figsize=(7.2, 2.6))
bb = ax[0].bar(['Model 1\njoint', 'Model 4B\njoint', 'Chance\njoint', 'Model 1\nborder', 'Chance\nborder'], [.415, .402, .249, .204, .354], color=[NAVY, NAVY, GREY, BLUE, GREY], width=.6)
barlabels(ax[0], bb, '{:.3f}', fs=7, dy=.008); ax[0].set_ylim(0, .5); ax[0].set_ylabel('Share of Grad-CAM mass'); ax[0].set_title('A  1.6× chance in the joint band')
bb = ax[1].bar(['10 hottest', '10 random', '10 coolest'], [.414, .290, -.005], color=[NAVY, GREY, LBLUE], width=.6)
for b, v in zip(bb, [.414, .290, -.005]): ax[1].text(b.get_x() + b.get_width() / 2, max(v, 0) + .01, f'{v:.3f}', ha='center', fontsize=7.5)
ax[1].axhline(0, color=INK, lw=.8); ax[1].set_ylim(-.05, .5); ax[1].set_ylabel('Drop in predicted-class probability'); ax[1].set_title('B  Faithfulness: hiding 7×7 cells')
fig.tight_layout()
save(fig, 'Fig20_GradCAM_audit', 'Quantitative Grad-CAM audit on the test set (layer res5b_relu, three-seed mean): attention inside the joint band and on the image border vs chance (A) and confidence drop when the ten hottest, random or coolest cells are hidden (B; p < 1e-77).')

# ---------- Fig21 M4B recall vs precision (content pack chart 2) ----------
m = D['M4B']['m']; fig, ax = plt.subplots(figsize=(7, 2.7)); yy = -np.arange(5)
bb = ax.barh(yy, m['rec'], color=[NAVY if i == 1 else GREY for i in range(5)], height=.55)
for i in range(5):
    ax.plot([m['pre'][i]] * 2, [yy[i] - .35, yy[i] + .35], color=INK, lw=2.5)
    ax.text(103, yy[i], f'{m["rec"][i]:.1f} / {m["pre"][i]:.1f}', va='center', fontsize=7.8)
ax.text(103, .55, 'recall / precision', fontsize=7.5, color=DGREY)
ax.set_yticks(yy); ax.set_yticklabels([f'{g} (n = {n})' for g, n in zip(G5, [639, 296, 447, 223, 51])]); ax.set_xlim(0, 100); ax.set_ylim(-4.6, .9)
ax.set_xlabel('Five-grade test recall (bars) and precision (dark tick), %'); ax.set_title(f'KL1 is the weak grade: Model 4B finds {m["rec"][1]:.1f}% of KL1 knees')
save(fig, 'Fig21_M4B_recall_precision_by_grade', 'Model 4B five-grade recall (bars) and precision (ticks) by true grade. [Content-pack chart 2]')

# ---------- Fig22 final pipeline by original KL grade ----------
y5, p3 = D['TTA']['orig'], D['TTA']['p']
fig, ax = plt.subplots(figsize=(7, 2.6)); left = np.zeros(5)
for g, c in zip(range(3), ['#117A65', ORANGE, '#7D3C98']):
    v = np.array([(p3[y5 == k] == g).mean() * 100 for k in range(5)])
    ax.barh(G5[::-1], v[::-1], left=left[::-1], color=c, label=f'predicted {G3[g]}', height=.6)
    for k in range(5):
        if v[k] >= 6: ax.text(left[k] + v[k] / 2, 4 - k, f'{v[k]:.0f}%', ha='center', va='center', fontsize=7.5, color='white')
    left += v
ax.set_xlim(0, 100); ax.set_xlabel('% of true-grade knees'); ax.legend(frameon=False, fontsize=7.5, ncol=3, loc='upper center', bbox_to_anchor=(.5, 1.18))
ax.set_title('KL1 and KL2 split across groups; KL0 and KL4 are almost always right', pad=22)
save(fig, 'Fig22_final_3group_by_original_KL', 'Final three-group predictions broken down by the original five-grade KL label (test set).')


print('made', len(made))
