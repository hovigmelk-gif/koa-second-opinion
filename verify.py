import onnxruntime as ort, numpy as np, json, glob, os
from PIL import Image
D='..'; H=json.load(open(f'{D}/heads.json'))
seeds=['seed42','seed7','seed123']
S={m:[ort.InferenceSession(f'{D}/{m}_{s}.onnx') for s in seeds] for m in ['M1','M4B']}
def feats(sess,g):
    x=np.repeat(g[None,None].astype(np.float32),3,1); return sess.run(None,{'data':x})[0][0]
def head(m,s,A):
    h=H[f'{m}_{s}']; z=np.array(h['W'])@A.mean((1,2))+np.array(h['b']); e=np.exp(z-z.max()); return e/e.sum()
for f in sorted(glob.glob(f'{D}/ref_KL?_*[0-9][LR].json')):
    R=json.load(open(f)); tag=f[:-5]; g=np.array(Image.open(tag+'_clahe.png'),dtype=np.float32)
    out={}
    for m in ['M1','M4B']:
        sc=[];P=0
        for i,s in enumerate(seeds):
            a=head(m,s,feats(S[m][i],g)); b=head(m,s,feats(S[m][i],g[:,::-1].copy())); sc+= [a,b]; P=P+(a+b)/6
        out[m]=(P,np.array(sc).T)
    P3,s3=out['M1']; P5,s5=out['M4B']
    adj=P3.copy(); adj[0]-=0.1; grp=int(adj.argmax()); kl=int(P5.argmax())
    d3=np.abs(s3-np.array(R['scores3_perSeedOrigMirror'])).max(); d5=np.abs(s5-np.array(R['scores5_perSeedOrigMirror'])).max()
    # CAM = sum_k w_ck A_k (pre-softmax Grad-CAM for GAP+FC), seed-averaged
    cam=0
    for i,s in enumerate(seeds):
        A=feats(S['M1'][i],g); w=np.array(H[f'M1_{s}']['W'])[grp]; c=np.maximum((w[:,None,None]*A).sum(0),0)
        c=np.array(Image.fromarray(c.astype(np.float32)).resize((224,224),Image.BILINEAR)); cam=cam+c
    cam=(cam-cam.min())/(cam.max()-cam.min()+1e-12)
    ref=np.array(Image.open(tag+'_cam.png'),dtype=float)/255
    r=np.corrcoef(cam.ravel(),ref.ravel())[0,1]
    print(os.path.basename(tag), 'grp',grp,R['group'],'kl',kl,R['kl5'],'P3 %.4f vs %.4f'%(P3[grp],np.array(R['P3'])[grp]),'maxdiff3 %.2e maxdiff5 %.2e camCorr %.3f'%(d3,d5,r))
