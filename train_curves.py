import re, csv, glob, numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
exec(open('make_dark.py').read().split("G3 = ")[0].split("B = sys.argv")[0])  # imports only
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':9,'axes.spines.top':False,'axes.spines.right':False,'axes.titlesize':10,'axes.titleweight':'bold','axes.titlelocation':'left',
 'axes.edgecolor':'#3b5585','axes.labelcolor':'#c9d4e5','xtick.color':'#b3c0d4','ytick.color':'#b3c0d4','figure.facecolor':'#0d1b36','axes.facecolor':'#0d1b36','text.color':'#e6edf7','axes.titlecolor':'#ffffff','legend.labelcolor':'#c9d4e5'})
COL = {'42': '#14b8a6', '7': '#60a5fa', '123': '#f59e0b'}
def parse_log(files):
    runs = {}; seed = None; stageB = False
    for f in files:
        for line in open(f, encoding='utf-8', errors='ignore'):
            m = re.search(r'===== Model \d+ seed (\d+)', line)
            if m: seed = m.group(1); stageB = False; continue
            if '[Stage B]' in line and 'done' not in line: stageB = True; runs[seed] = dict(it=[], ta=[], tl=[], vit=[], va=[], vl=[]); continue
            if '[Stage B] done' in line: stageB = False; continue
            if stageB and line.startswith('|'):
                c = [x.strip() for x in line.strip().strip('|').split('|')]
                if len(c) >= 7 and c[1].isdigit():
                    R = runs[seed]; it = int(c[1]); R['it'].append(it)
                    R['ta'].append(float(c[3].rstrip('%'))); R['tl'].append(float(c[5]))
                    if c[4]: R['vit'].append(it); R['va'].append(float(c[4].rstrip('%'))); R['vl'].append(float(c[6]))
    return runs
def r18():
    H = {'42': 'baseline_filename_no_seed_history.csv', '7': 'seed7_history.csv', '123': 'seed123_history.csv'}; runs = {}
    base = 'B/90_ARCHIVE_ResNet18_DevHistory/Final MODEL1_RESNET18_HANDOFF/KOA_Claude_Code_handoff/koa_claude_package/extracted/'
    for s, f in H.items():
        rows = list(csv.DictReader(open(base + f))); R = dict(it=[], ta=[], tl=[], vit=[], va=[], vl=[])
        for r in rows:
            it = int(r['iteration']); R['it'].append(it); R['ta'].append(float(r['TrainingAccuracy'])); R['tl'].append(float(r['TrainingLoss']))
            if r['ValidationAccuracy'] not in ('', 'NaN', 'nan'): R['vit'].append(it); R['va'].append(float(r['ValidationAccuracy'])); R['vl'].append(float(r['ValidationLoss']))
        runs[s] = R
    return runs
def sm(x, k=20): x = np.asarray(x, float); return np.convolve(x, np.ones(k) / k, mode='valid') if len(x) > k else x
def fig(runs, name, title, k):
    f, ax = plt.subplots(1, 2, figsize=(11, 3.6))
    for s in ['42', '7', '123']:
        if s not in runs: continue
        R = runs[s]; c = COL[s]; it = np.array(R['it'])
        ax[0].plot(it[k - 1:], sm(R['ta'], k), color=c, lw=.8, alpha=.3); ax[0].plot(R['vit'], R['va'], color=c, lw=1.8, label=f'Seed {s}')
        ax[1].plot(it[k - 1:], sm(R['tl'], k), color=c, lw=.8, alpha=.3); ax[1].plot(R['vit'], R['vl'], color=c, lw=1.8, label=f'Seed {s}')
        b = int(np.argmin(R['vl'])); ax[1].plot(R['vit'][b], R['vl'][b], 'o', color=c, ms=7, mec='white'); ax[0].plot(R['vit'][b], R['va'][b], 'o', color=c, ms=7, mec='white')
    ax[0].set_title('A  Accuracy (%)'); ax[1].set_title('B  Loss'); [a.set_xlabel('Iteration (Stage B, all layers)') for a in ax]
    ax[0].legend(frameon=False, fontsize=8, loc='lower right'); f.suptitle(title, x=.01, ha='left', fontweight='bold', fontsize=11, color='white')
    f.text(.01, -.04, 'Thin: training (moving mean)   Bold: validation   Dot: kept best-validation-loss network', fontsize=8, color='#8fa0bb')
    f.tight_layout(); f.savefig(f'dark/{name}.png', dpi=220, bbox_inches='tight', facecolor='#0d1b36'); plt.close(f)
    print(name, {s: (len(r['it']), len(r['vit']), r['vit'][int(np.argmin(r['vl']))]) for s, r in runs.items()})
fig(r18(), 'Train_R18', 'ResNet-18 (Model 1, final): training curves, three seeds', 50)
fig(parse_log(['B/MODEL2_RESNET50/run_logs/TrainLog_M2_20260926_175604.txt']), 'Train_R50', 'ResNet-50 (Model 2): training curves, three seeds', 5)
fig(parse_log(['B/MODEL3_RESNET101/run_logs/TrainLog_M3_20260926_233326.txt']), 'Train_R101', 'ResNet-101 (Model 3): training curves, three seeds', 5)
fig(parse_log(sorted(glob.glob('B/MODEL5_EFFICIENTNETB0/run_logs/TrainLog_M5_*.txt'))), 'Train_EffB0', 'EfficientNet-B0 (Model 5): training curves, three seeds', 5)
