#!/usr/bin/env python3
"""Search monotone paired-wire correspondences in STEP; diagnostic only.

Requires numpy, scipy, cadquery. NEVER creates machine G-code.
Usage: python tools/optimize_step_guides.py F4-1.stp --samples 48
"""
import argparse
import json
from pathlib import Path
import numpy as np
import cadquery as cq
from check_step_guides import entities_of, curve_points, sample_curve

class MeshInside:
    def __init__(self, shape):
        vertices, faces = shape.tessellate(.3, .15)
        v = np.array([[p.x,p.y,p.z] for p in vertices])
        faces = np.asarray(faces,dtype=int)
        a,b,c = v[faces[:,0]],v[faces[:,1]],v[faces[:,2]]
        self.a,self.b,self.c = a,b,c
        self.dy1,self.dz1 = b[:,1]-a[:,1],b[:,2]-a[:,2]
        self.dy2,self.dz2 = c[:,1]-a[:,1],c[:,2]-a[:,2]
        self.den = self.dy1*self.dz2-self.dz1*self.dy2
        self.valid = abs(self.den)>1e-8

    def contains(self, points):
        points = np.asarray(points,dtype=float).reshape(-1,3)
        answers=[]
        for chunk in np.array_split(points,max(1,int(np.ceil(len(points)/384)))):
            dy = chunk[:,None,1]-self.a[None,:,1]
            dz = chunk[:,None,2]-self.a[None,:,2]
            u=np.divide(dy*self.dz2-dz*self.dy2,self.den,where=self.valid,out=np.zeros_like(dy))
            v=np.divide(dz*self.dy1-dy*self.dz1,self.den,where=self.valid,out=np.zeros_like(dy))
            hits_x=self.a[None,:,0]+u*(self.b-self.a)[None,:,0]+v*(self.c-self.a)[None,:,0]
            hits=self.valid[None,:]&(u>1e-8)&(v>1e-8)&(u+v<1-1e-8)&(hits_x>chunk[:,None,0]+1e-6)
            answers.append(np.count_nonzero(hits,axis=1)%2==1)
        return np.concatenate(answers)

def collision_matrix(a,b,mesh):
    t=np.linspace(.12,.88,7)
    p=(a[:,None,None,:]*(1-t)[None,None,:,None]+b[None,:,None,:]*t[None,None,:,None]).reshape(-1,3)
    return mesh.contains(p).reshape(len(a),len(b),len(t)).sum(axis=2)

def monotone_path(cost,closed):
    n=len(cost);size=n+1 if closed else n
    d=np.full((size,size),np.inf);prev=np.zeros((size,size,2),dtype=int)
    d[0,0]=100*cost[0,0]
    for i in range(size):
        for j in range(size):
            if i==j==0:continue
            choices=[]
            if i:choices.append((d[i-1,j]+.75,i-1,j))
            if j:choices.append((d[i,j-1]+.75,i,j-1))
            if i and j:choices.append((d[i-1,j-1],i-1,j-1))
            best=min(choices)
            d[i,j]=best[0]+100*cost[i%n,j%n]+.2*abs(i-j)
            prev[i,j]=best[1:]
    path=[];i=j=size-1
    while True:
        path.append([int(i%n),int(j%n)])
        if i==j==0:break
        i,j=prev[i,j]
    path.reverse()
    return path,int(sum(cost[i,j] for i,j in path)),float(d[-1,-1])

def optimize(step,pairs,n=48):
    entities=entities_of(step.read_text(errors='replace'))
    mesh=MeshInside(cq.importers.importStep(str(step)).val())
    results=[]
    for ids in pairs:
        raw=[curve_points(entities,k) for k in ids]
        closed=[np.linalg.norm(p[0]-p[-1])<.05 for p in raw]
        if closed[0]!=closed[1]:raise ValueError('Incompatible closed/open guides')
        a,b=[sample_curve(p,n,closed[0]) for p in raw]
        candidates=[]
        for reverse in (False,True):
            ref=b[::-1] if reverse else b
            matrix=collision_matrix(a,ref,mesh)
            for shift in range(n if closed[0] else 1):
                path,bad,score=monotone_path(np.roll(matrix,shift,axis=1),closed[0])
                candidates.append((bad,score,reverse,shift,path))
        bad,score,reverse,shift,path=min(candidates,key=lambda v:(v[0],v[1]))
        bp=np.roll(b[::-1] if reverse else b,shift,axis=0)
        aa=np.array([a[i] for i,j in path]);bb=np.array([bp[j] for i,j in path])
        fractions=np.linspace(.05,.95,19)
        points=(aa[:,None,:]*(1-fractions)[None,:,None]+bb[:,None,:]*fractions[None,:,None]).reshape(-1,3)
        results.append({'ids':ids,'reversed':reverse,'shift':shift,'correspondence':path,
            'coarse_inside':bad,'denser_inside':int(mesh.contains(points).sum()),
            'denser_tested':len(points),'certified':False})
    return {'file':str(step),'results':results,'safe_for_gcode':False,
            'note':'Approximate mesh and finite sampling. Does not prove safe cutting or proper stock removal.'}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('step',type=Path)
    p.add_argument('--samples',type=int,default=48)
    p.add_argument('--pairs',nargs='+',default=['197:406','544:681'])
    p.add_argument('--output',type=Path,default=Path('F4_optimized.json'))
    args=p.parse_args()
    if args.samples<8 or args.samples>256:raise ValueError('samples must be 8..256')
    report=optimize(args.step,[list(map(int,s.split(':'))) for s in args.pairs],args.samples)
    args.output.write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf8')
    for v in report['results']:
        print(v['ids'],'inside',v['denser_inside'],'/',v['denser_tested'])
    print('G-code generation remains blocked')
    return 2 if any(v['denser_inside'] for v in report['results']) else 0

if __name__=='__main__':
    raise SystemExit(main())
