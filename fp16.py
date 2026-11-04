import onnx, numpy as np, sys
from onnx import numpy_helper, helper, TensorProto
src,dst=sys.argv[1],sys.argv[2]; m=onnx.load(src); g=m.graph; newinit=[]; casts=[]
for t in g.initializer:
    a=numpy_helper.to_array(t)
    if a.dtype==np.float32 and a.size>=1024:
        h=numpy_helper.from_array(a.astype(np.float16), t.name+'_fp16'); newinit.append(h)
        casts.append(helper.make_node('Cast',[t.name+'_fp16'],[t.name],to=TensorProto.FLOAT))
    else: newinit.append(t)
del g.initializer[:]; g.initializer.extend(newinit)
nodes=list(g.node); del g.node[:]; g.node.extend(casts+nodes)
onnx.checker.check_model(m); onnx.save(m,dst)
