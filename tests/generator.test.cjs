const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
// Exercise the production generator without DOM stubs or a second implementation.
const source=html.slice(html.indexOf('const Gen ='),html.indexOf('//  Вкладки и экран генератора'))
 .replace(/return \{ buildProgram,.*?CONFIG, previewGeometry, previewPair, identityRotation, rotateModel \};/,
  match=>match.replace(' };', ', Model, sampleFace, Program, startBlock, endBlock, profileBlock };'));
const gen=vm.runInNewContext(source+';Gen');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/split-profile.stp'),'utf8').replace(/\r\n/g,'\n');
// Construct a genuine two-direction ruled STEP topology: the main sheet
// is spanned along Y, while a curved bore runs from X=-50 to X=+50.
// Both bore-end edges belong to the planar end faces.
function transverseFixture(yShift=0,twist=0) {
 const yz=[[-5,20],[-5,35],[5,35],[5,20],[5,5],[-5,5],[-5,20]];
 const left=[],right=[];let extra='';
 yz.forEach(([y,z],k)=>{
  left.push('#'+(100+k));right.push('#'+(110+k));
  extra+='#'+(100+k)+" = CARTESIAN_POINT('',(-50.,"+y+'.,'+z+".));\n";
  const y2=y+yShift+(k===3?twist:0);
  extra+='#'+(110+k)+" = CARTESIAN_POINT('',(50.,"+y2+'.,'+z+".));\n";
 });
 extra+=
 `#120 = VERTEX_POINT('',#100);
#121 = VERTEX_POINT('',#110);
#122 = EDGE_CURVE('',#120,#120,$,.T.);
#123 = EDGE_CURVE('',#121,#121,$,.T.);
#124 = EDGE_CURVE('',#120,#121,$,.T.);
#125 = ORIENTED_EDGE('',*,*,#122,.T.);
#126 = ORIENTED_EDGE('',*,*,#123,.T.);
#127 = ORIENTED_EDGE('',*,*,#124,.T.);
#128 = EDGE_LOOP('',(#125));
#129 = FACE_BOUND('',#128,.T.);
#130 = EDGE_LOOP('',(#126));
#131 = FACE_BOUND('',#130,.T.);
#132 = EDGE_LOOP('',(#125,#127,#126));
#133 = FACE_OUTER_BOUND('',#132,.T.);
#134 = B_SPLINE_SURFACE_WITH_KNOTS('',1,3,((${left.join(',')}),(${right.join(',')})),.UNSPECIFIED.,.F.,.F.,.F.,(2,2),(4,3,4),(0.,1.),(0.,0.5,1.),.UNSPECIFIED.);
#135 = ADVANCED_FACE('',(#133),#134,.T.);
`;
 return fixture.replace("#28 = ADVANCED_FACE('',(#26),#27,.T.);","#28 = ADVANCED_FACE('',(#26,#129),#27,.T.);")
  .replace("#48 = ADVANCED_FACE('',(#46),#47,.T.);","#48 = ADVANCED_FACE('',(#46,#131),#47,.T.);")
  .replace('ENDSEC;\nEND-ISO',extra+'ENDSEC;\nEND-ISO');
}
// Split one annular cross-contour into two open ruled STEP faces sharing
// longitudinal coedges. The resulting contour must be reconstructed as a
// closed chain of BOTH faces, not mistaken for two independent holes.
function twoFaceTransverseFixture() {
 let step=transverseFixture();
 const swap=(a,b)=>{assert.ok(step.includes(a),a);step=step.replace(a,b);};
 swap("#122 = EDGE_CURVE('',#120,#120,$,.T.);","#122 = EDGE_CURVE('',#120,#150,$,.T.);");
 swap("#123 = EDGE_CURVE('',#121,#121,$,.T.);","#123 = EDGE_CURVE('',#121,#151,$,.T.);");
 swap("#128 = EDGE_LOOP('',(#125));","#128 = EDGE_LOOP('',(#125,#155));");
 swap("#130 = EDGE_LOOP('',(#126));","#130 = EDGE_LOOP('',(#126,#156));");
 swap("#132 = EDGE_LOOP('',(#125,#127,#126));","#132 = EDGE_LOOP('',(#125,#127,#126,#157));");
 swap("#134 = B_SPLINE_SURFACE_WITH_KNOTS('',1,3,((#100,#101,#102,#103,#104,#105,#106),(#110,#111,#112,#113,#114,#115,#116)),.UNSPECIFIED.,.F.,.F.,.F.,(2,2),(4,3,4),(0.,1.),(0.,0.5,1.),.UNSPECIFIED.);",
 "#134 = B_SPLINE_SURFACE_WITH_KNOTS('',1,3,((#100,#101,#102,#103),(#110,#111,#112,#113)),.UNSPECIFIED.,.F.,.F.,.F.,(2,2),(4,4),(0.,1.),(0.,1.),.UNSPECIFIED.);");
 const more=`#150 = VERTEX_POINT('',#103);
#151 = VERTEX_POINT('',#113);
#152 = EDGE_CURVE('',#150,#120,$,.T.);
#153 = EDGE_CURVE('',#151,#121,$,.T.);
#154 = EDGE_CURVE('',#150,#151,$,.T.);
#155 = ORIENTED_EDGE('',*,*,#152,.T.);
#156 = ORIENTED_EDGE('',*,*,#153,.T.);
#157 = ORIENTED_EDGE('',*,*,#154,.T.);
#158 = EDGE_LOOP('',(#155,#157,#156,#127));
#159 = FACE_OUTER_BOUND('',#158,.T.);
#160 = B_SPLINE_SURFACE_WITH_KNOTS('',1,3,((#103,#104,#105,#106),(#113,#114,#115,#116)),.UNSPECIFIED.,.F.,.F.,.F.,(2,2),(4,4),(0.,1.),(0.,1.),.UNSPECIFIED.);
#161 = ADVANCED_FACE('',(#159),#160,.T.);
`;
 return step.replace('ENDSEC;\nEND-ISO',more+'ENDSEC;\nEND-ISO');
}
const options=(extra={})=>({stock:[50,140,60],bottomZ:10,kerf:1,feed:7,minS:500,maxS:1000,clearance:20,retract:30,leadMargin:5,trim:false,side:1,powerComp:true,...extra});
const build=(o={})=>gen.buildProgram(fixture,'synthetic.stp',options(o));
// A swept wing can have a slightly oblique Y generator while its STEP end
// caps remain exactly at two Y planes. Old axis-count heuristics chose X and
// tried to cut a main skin as a transverse bore (#255 in external W1).
test('swept wing keeps the real end-cap span even with oblique generators',()=>{
 const swept=fixture.replace(/(CARTESIAN_POINT\('',\()\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)(\)\))/g,
  (_,prefix,x,y,z,suffix)=>prefix+(+x*2.3+(+y)*.04)+','+(+y*6)+','+(+z)+suffix);
 const m=new gen.Model(swept),shape=m.build();
 assert.equal(shape.axis,1);
 assert.equal(shape.planeA,-150);assert.equal(shape.planeB,150);
 assert.equal(shape.outer.length,4);assert.equal(shape.secondaryContours.length,0);
 const r=gen.buildProgram(swept,'swept.stp',options({stock:[300,250,60]}));
 assert.equal(r.secondary,0);
 assert.doesNotMatch(r.program,/SECONDARY CUT/);
});
test('strongly swept ruled faces retain their end-cap axis',()=>{
 const swept=fixture.replace(/(CARTESIAN_POINT\('',\()\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)(\)\))/g,
  (_,prefix,x,y,z,suffix)=>prefix+(+x*2.3+(+y)*1.8)+','+(+y*6)+','+(+z)+suffix);
 const shape=new gen.Model(swept).build();
 assert.equal(shape.axis,1);
 assert.equal(shape.outer.length,4);
});

test('oblique vertical STEP faces produce advisory rotation candidates',()=>{
 const angle=Math.PI/6,c=Math.cos(angle),q=Math.sin(angle);
 const rotated=fixture.replace(/(CARTESIAN_POINT\('',\()\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)(\)\))/g,
  (_,prefix,x,y,z,suffix)=>prefix+(x*c-y*q)+','+(x*q+y*c)+','+z+suffix);
 const m=new gen.Model(rotated),faces=m.verticalBevels();
 assert.ok(faces.length>=2);
 for(const face of faces){
   assert.ok(Math.abs(face.normal[2])<1e-6);
   assert.ok(face.angle>=0&&face.angle<180);
   const t=face.angle*Math.PI/180;
   assert.ok(Math.abs(Math.sin(t)*face.normal[0]+Math.cos(t)*face.normal[1])<1e-6);
 }
});

// A small solid with flat and oblique root caps and six ruled side faces.
// It is generated in the test so no private CAD file is needed in CI.
function slopedCapFixture(withHole=false,mergeSides=false){
 let id=1,lines=[],edges=new Map();
 const add=(type,args)=>{const ref='#'+id++;lines.push(ref+' = '+type+"('',"+args+');');return ref;};
 const point=p=>add('CARTESIAN_POINT','('+p.join(',')+')');
 const coords=[[-40,0,-10],[0,0,-10],[40,12,-10],[40,12,10],[0,0,10],[-40,0,10]];
 const pts=coords.concat(coords.map(([x,y,z])=>[x,60,z])).map(point);
 const vertices=pts.map(p=>add('VERTEX_POINT',p));
 const edge=(a,b)=>{
   const key=[a,b].sort((x,y)=>x-y).join(':');if(edges.has(key))return edges.get(key);
   const c=add('B_SPLINE_CURVE_WITH_KNOTS','1,('+pts[a]+','+pts[b]+'),.UNSPECIFIED.,.F.,.F.,(2,2),(0.,1.),.UNSPECIFIED.');
   const e=add('EDGE_CURVE',vertices[a]+','+vertices[b]+','+c+',.T.');edges.set(key,e);return e;
 };
 const face=(nodes,grid,extraBounds=[],rows=null)=>{
   const es=nodes.map((a,i)=>edge(a,nodes[(i+1)%nodes.length]));
   const loop=add('EDGE_LOOP','('+es.map(e=>add('ORIENTED_EDGE','*,*,'+e+',.T.')).join(',')+')');
   const bound=add('FACE_OUTER_BOUND',loop+',.T.');
   const gridText=rows ? '('+rows.map(pair=>'('+pair.map(i=>pts[i]).join(',')+')').join(',')+')'
     : '(('+pts[grid[0]]+','+pts[grid[1]]+'),('+pts[grid[2]]+','+pts[grid[3]]+'))';
   const uMult=rows?'(2,1,2)':'(2,2)',uKnots=rows?'(0.,0.5,1.)':'(0.,1.)';
   const surface=add('B_SPLINE_SURFACE_WITH_KNOTS','1,1,'+gridText+',.UNSPECIFIED.,.F.,.F.,.F.,'+uMult+',(2,2),'+uKnots+',(0.,1.),.UNSPECIFIED.');
   return add('ADVANCED_FACE','('+[bound,...extraBounds].join(',')+'),'+surface+',.T.');
 };
 const faces=[];
 if(mergeSides){
   faces.push(face([0,1,2,8,7,6],null,[],[[0,6],[1,7],[2,8]]));
   faces.push(face([2,3,9,8],[2,8,3,9]));
   faces.push(face([3,4,5,11,10,9],null,[],[[3,9],[4,10],[5,11]]));
   faces.push(face([5,0,6,11],[5,11,0,6]));
 } else for(let i=0;i<6;i++){const j=(i+1)%6;faces.push(face([i,j,j+6,i+6],[i,i+6,j,j+6]));}
 let rootInner=[],tipInner=[],holeFace=null;
 if(withHole){
   const profile=[[3,0],[3,1.7],[1.7,3],[0,3],[-1.7,3],[-3,1.7],[-3,0],[-3,-1.7],[-1.7,-3],[0,-3],[1.7,-3],[3,-1.7],[3,0]];
   const rings=[0,60].map(y=>profile.map(([x,z])=>point([x-20,y,z])));
   const curves=rings.map(r=>add('B_SPLINE_CURVE_WITH_KNOTS','3,('+r.join(',')+'),.UNSPECIFIED.,.T.,.F.,(4,3,3,3,4),(0.,0.25,0.5,0.75,1.),.UNSPECIFIED.'));
   const verts=rings.map(r=>add('VERTEX_POINT',r[0]));
   const closed=curves.map((c,k)=>add('EDGE_CURVE',verts[k]+','+verts[k]+','+c+',.T.'));
   const seam=add('EDGE_CURVE',verts.join(',')+',$,.T.');
   const bound=(ids,type)=>{
     const loop=add('EDGE_LOOP','('+ids.map(e=>add('ORIENTED_EDGE','*,*,'+e+',.T.')).join(',')+')');
     return add(type,loop+',.T.');
   };
   rootInner=[bound([closed[0]],'FACE_BOUND')];tipInner=[bound([closed[1]],'FACE_BOUND')];
   const hb=bound([closed[0],seam,closed[1],seam],'FACE_OUTER_BOUND');
   const surface=add('B_SPLINE_SURFACE_WITH_KNOTS','1,3,(('+rings[0].join(',')+'),('+rings[1].join(',')+')),.UNSPECIFIED.,.F.,.T.,.F.,(2,2),(4,3,3,3,4),(0.,1.),(0.,0.25,0.5,0.75,1.),.UNSPECIFIED.');
   holeFace=add('ADVANCED_FACE','('+hb+'),'+surface+',.T.');
 }
 faces.push(face([0,1,4,5],[0,5,1,4],rootInner));
 faces.push(face([1,2,3,4],[1,4,2,3]));
 faces.push(face([6,7,8,9,10,11],[6,11,8,9],tipInner));
 if(holeFace)faces.push(holeFace);
 const shell=add('CLOSED_SHELL','('+faces.join(',')+')');add('MANIFOLD_SOLID_BREP',shell);
 return 'ISO-10303-21;\nDATA;\n'+lines.join('\n')+'\nENDSEC;\nEND-ISO-10303-21;';
}
test('rotation projection is informational; clearance at cutting angle is checked separately',()=>{
 const angle=66.07,length=235,width=290,offset=[0,0,0],end=angle*Math.PI/180;
 const final=(length*Math.abs(Math.cos(end))+width*Math.abs(Math.sin(end)))/2;
 assert.ok(final<184,'the final orientation alone looks safe');
 assert.ok(gen.stockRotationEnvelope(length,width,offset,angle)>184,'the projection exceeds the tower spacing during the parked turn');
 for(const shift of [[0,0,0],[-10,5,0],[15,-20,0]])for(const turn of [-90,30,66.07,90]){
   let dense=0;
   for(let i=0;i<=20000;i++){
     const t=turn*Math.PI/180*i/20000;
     for(const x of [-1,1])for(const y of [-1,1])
       dense=Math.max(dense,Math.abs((shift[0]+x*length/2)*Math.cos(t)-(shift[1]+y*width/2)*Math.sin(t)));
   }
   assert.ok(Math.abs(gen.stockRotationEnvelope(length,width,shift,turn)-dense)<.0001);
 }
});

test('upper apex avoids an overhanging side corner; failed approach re-selects a lateral corner',()=>{
 const left=[[10,5],[15,15],[-10,15],[-10,0],[10,0]],right=[[30,5],[5,15],[-10,15],[-10,0],[30,0]];
 const contour=left.map((p,i)=>{
   const j=(i+1)%left.length,at=(a,b,u)=>[a[0]+u*(b[0]-a[0]),0,a[1]+u*(b[1]-a[1])];
   return [{A:u=>at(p,left[j],u),B:u=>at(right[i],right[j],u),t0:0,t1:1},true];
 });
 const layout={machine:p=>[p[1],p[0],p[2]],towers:(a,b)=>[[a[0],a[2]],[b[0],b[2]]]};
 const notes=[],program=new gen.Program(gen.CONFIG,false,5);
 // The crown lies above a side corner. An exposed chord-end corner
 // allows a COMPLETE upper-before-lower cut from above.
 const [top]=gen.profileBlock(40,program,contour,layout,1,0,notes,1,80,5,.01,1,false,0,true);
 assert.match(top,/top corner entry, upper first/);
 assert.match(top,/UPPER-FIRST CHECK: both wire ends agree/);
 assert.match(top,/ENTRY FROM ABOVE; EXIT THROUGH THE SAME SLIT/);
 // With insufficient vertical clearance the rejected apex is NOT a valid
 // side-entry target: the actual side-facing corner must be selected again.
 const fallbackNotes=[];
 const [fallback]=gen.profileBlock(10,new gen.Program(gen.CONFIG,false,5),contour,layout,
   1,0,fallbackNotes,1,80,5,.01,1,false,0,true);
 assert.doesNotMatch(fallback,/ENTRY FROM ABOVE/);
 assert.match(fallback,/corner entry, upper first/);
 assert.doesNotMatch(fallback,/top apex entry/);
 assert.ok(fallbackNotes.some(note=>note.includes('боковой угол выбран заново')));
});

test('upper-first G-code cuts the upper skin before the lower on both towers',()=>{
 // STAB-like profiles on distinct end caps: different chords and heights.
 // Read the actual four axes and verify both independently at each station.
 const left=[[12,15],[-12,15],[-12,1],[12,1]];
 const right=[[9,13],[-9,13],[-9,2],[9,2]];
 const contour=left.map((a,i)=>{
   const b=left[(i+1)%left.length],c=right[i],d=right[(i+1)%right.length];
   const point=(p,q,u)=>[p[0]+(q[0]-p[0])*u,0,p[1]+(q[1]-p[1])*u];
   return [{A:u=>point(a,b,u),B:u=>point(c,d,u),t0:0,t1:1},true];
 });
 const layout={machine:p=>[p[1],p[0],p[2]],towers:(a,b)=>[[a[0],a[2]],[b[0],b[2]]]};
 const [g]=gen.profileBlock(35,new gen.Program(gen.CONFIG,false,5),contour,layout,
   1,0,[],1,40,5,.01,1,false,0,true);
 assert.match(g,/ENTRY FROM ABOVE/);
 const cuts=g.split(/\r?\n/).filter(line=>/^G01 X/.test(line))
   .map(line=>Object.fromEntries([...line.matchAll(/([XYZA])(-?\d+(?:\.\d+)?)/g)]
     .map(m=>[m[1],+m[2]])));
 for(const chord of [-6,0,6]){
   for(const [horizontal,height] of [['X','Y'],['Z','A']]){
     const crossing=[];
     for(let i=1;i<cuts.length;i++){
       const a=cuts[i-1],b=cuts[i];
       if((a[horizontal]-chord)*(b[horizontal]-chord)>0||
         Math.abs(a[horizontal]-b[horizontal])<1e-6)continue;
       const t=(chord-a[horizontal])/(b[horizontal]-a[horizontal]);
       if(t < -1e-5 || t > 1+1e-5)continue;
       const hit=a[height]+t*(b[height]-a[height]);
       // Exact vertex at a station belongs to two neighboring G01 lines.
       if(!crossing.length||Math.abs(hit-crossing.at(-1))>.02)crossing.push(hit);
     }
     assert.ok(crossing.length>=2,'both skins cross '+horizontal+' chord '+chord);
     assert.ok(crossing[0]>crossing[1]+10,
       'upper skin must precede lower at '+horizontal+' chord '+chord);
   }
 }
});

test('thin tapered stab nose still cuts upper before lower regardless of STEP face order',()=>{
 // In the first 40 mm the two nose branches differ by less than .05 mm.
 // The legacy algorithm blindly chose forward, cutting the lower skin first.
 const root=[[150,30],[75,29.96],[-150,0],[-150,29],[75,29.99]];
 const tip=[[135,28],[65,27.96],[-135,1],[-135,27],[65,27.99]];
 const reverse=points=>[points[0],...points.slice(1).reverse()];
 const layout={machine:p=>[p[1],p[0],p[2]],
   towers:(a,b)=>[[a[0],a[2]],[b[0],b[2]]]};
 const crossings=(g,axis,height,station)=>{
   const positions=g.split(/\r?\n/).filter(s=>/^G01 X/.test(s))
     .map(s=>Object.fromEntries([...s.matchAll(/([XYZA])(-?\d+(?:\.\d+)?)/g)]
       .map(m=>[m[1],+m[2]])));
   const hits=[];
   for(let i=1;i<positions.length;i++){
     const a=positions[i-1],b=positions[i],dx=b[axis]-a[axis];
     if(Math.abs(dx)<1e-7)continue;
     const t=(station-a[axis])/dx;
     if(t < -1e-7 || t > 1+1e-7)continue;
     const value=a[height]+t*(b[height]-a[height]);
     if(!hits.length||Math.abs(value-hits.at(-1))>.02)hits.push(value);
   }
   return hits;
 };
 for(const flip of [false,true]){
   const a=flip?reverse(root):root,b=flip?reverse(tip):tip;
   const contour=a.map((p,i)=>{
     const q=a[(i+1)%a.length],r=b[i],s=b[(i+1)%b.length];
     const interpolate=(u,v,t)=>[u[0]+t*(v[0]-u[0]),0,u[1]+t*(v[1]-u[1])];
     return [{A:t=>interpolate(p,q,t),B:t=>interpolate(r,s,t),t0:0,t1:1},true];
   });
   const notes=[];
   const [code]=gen.profileBlock(55,new gen.Program(gen.CONFIG,false,5),
     contour,layout,1,0,notes,1,340,5,.01,1,false,0,true);
   assert.match(code,/ENTRY FROM ABOVE/);
   for(const [axis,height] of [['X','Y'],['Z','A']]){
     for(const station of [0,-50]){
       const hits=crossings(code,axis,height,station);
       assert.ok(hits.length>=2,'both skins sampled for '+axis+' at '+station);
       assert.ok(hits[0]>hits[1]+5,
         'upper skin first at '+axis+' '+station+' reversed STEP='+flip);
     }
   }
   assert.ok(!notes.some(s=>s.includes('не подтверждён')),
     'strong chord separation should disambiguate both rails');
 }
});

test('mid-chord crown relocates the top entry to a chord-end corner',()=>{
 // An airfoil crown at x=0 divides the upper skin into two arcs. A
 // single closed traverse cannot cover both arcs before touching the bottom.
 const root=[[12,5],[0,16],[-12,5],[-12,1],[12,1]];
 const tip=[[9,4],[0,14],[-9,4],[-9,2],[9,2]];
 const contour=root.map((p,i)=>{
   const q=root[(i+1)%root.length],r=tip[i],s=tip[(i+1)%tip.length];
   const interpolate=(u,v,t)=>[u[0]+(v[0]-u[0])*t,0,u[1]+(v[1]-u[1])*t];
   return [{A:t=>interpolate(p,q,t),B:t=>interpolate(r,s,t),t0:0,t1:1},true];
 });
 const layout={machine:p=>[p[1],p[0],p[2]],towers:(a,b)=>[[a[0],a[2]],[b[0],b[2]]]};
 const notes=[];
 const [code]=gen.profileBlock(35,new gen.Program(gen.CONFIG,false,5),contour,
   layout,1,0,notes,1,340,5,.01,1,false,0,true);
 assert.match(code,/top corner entry, upper first/);
 assert.match(code,/UPPER-FIRST CHECK: both wire ends agree/);
 assert.match(code,/ENTRY FROM ABOVE/);
 assert.ok(!notes.some(n=>n.includes('не подтверждён')));
 const cuts=code.split(/\r?\n/).filter(line=>/^G01 X/.test(line))
   .map(line=>Object.fromEntries([...line.matchAll(/([XYZA])(-?\d+(?:\.\d+)?)/g)]
     .map(m=>[m[1],+m[2]])));
 for(const [axis,height] of [['X','Y'],['Z','A']]){
   const hits=[];
   for(let i=1;i<cuts.length;i++){
     const a=cuts[i-1],b=cuts[i],dx=b[axis]-a[axis];
     if(Math.abs(dx)<1e-7)continue;
     const t=(0-a[axis])/dx;
     if(t< -1e-7||t>1+1e-7)continue;
     const h=a[height]+t*(b[height]-a[height]);
     if(!hits.length||Math.abs(h-hits.at(-1))>.02)hits.push(h);
   }
   assert.ok(hits.length>=2&&hits[0]>hits[1]+5,
     'top must precede bottom at the middle chord on '+axis);
 }
});

test('twisted end caps warn about conflicting upper-first directions',()=>{
 // At the tip the upper/lower edge correspondence is reversed. No
 // direction of travel can be upper-first on both end sections.
 const root=[[12,15],[-12,15],[-12,1],[12,1]];
 const tip=[[9,2],[-9,2],[-9,13],[9,13]];
 const contour=root.map((p,i)=>{
   const q=root[(i+1)%root.length],r=tip[i],s=tip[(i+1)%tip.length];
   const interpolate=(u,v,t)=>[u[0]+(v[0]-u[0])*t,0,u[1]+(v[1]-u[1])*t];
   return [{A:t=>interpolate(p,q,t),B:t=>interpolate(r,s,t),t0:0,t1:1},true];
 });
 const layout={machine:p=>[p[1],p[0],p[2]],towers:(a,b)=>[[a[0],a[2]],[b[0],b[2]]]};
 const notes=[];
 gen.profileBlock(35,new gen.Program(gen.CONFIG,false,5),contour,
   layout,1,0,notes,1,340,5,.01,1,false,0,true);
 assert.ok(notes.some(n=>n.includes('противоположный порядок')),
   'upper-first on both towers cannot be certified for twisted rails');
});

test('sloped end contour and final trim are generated from synthetic topology',()=>{
 const step=slopedCapFixture(),m=new gen.Model(step,gen.identityRotation(),1,.1);
 const shape=m.slopedEndContour();assert.equal(shape.contour.length,6);
 const o=options({stock:[70,100,50],bottomZ:10,trim:true,trimAngle:90,retract:5});
 const result=gen.buildProgram(step,'synthetic-bevel.stp',o),program=result.program;
 assert.ok(program.indexOf('*** TRIM BLOCK')<program.indexOf('*** PROFILE:'));
 assert.ok(program.indexOf('*** PROFILE:')<program.indexOf('*** FINAL BEVEL'));
 assert.ok(result.warnings.some(w=>w.includes('деталь закреплена')));
 assert.throws(()=>gen.buildProgram(step,'synthetic-bevel.stp',{...o,cutOrder:'B0_B90'}),/торцевание B90/);
 const parsed=sim.parseGcode(program),report=sim.analyse(parsed,{...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(report.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(report.warns));
 const moved=gen.buildProgram(step,'synthetic-bevel.stp',{...o,offset:[-5,5,5]});
 const bevelMove=p=>{
   const block=p.split('*** FINAL BEVEL')[1],angle=+block.match(/B=(-?[\d.]+)/)[1];
   const cut=block.split(/\r?\n/).find(line=>/^G01 /.test(line));
   return {angle,x:+cut.match(/X(-?[\d.]+)/)[1],z:+cut.match(/Y(-?[\d.]+)/)[1]};
 };
 const base=bevelMove(program),shifted=bevelMove(moved.program),radians=base.angle*Math.PI/180;
 assert.ok(Math.abs((shifted.x-base.x)-(-5*Math.sin(radians)+5*Math.cos(radians)))<.03);
 assert.ok(Math.abs((shifted.z-base.z)-5)<.02);
 const reversed=gen.buildProgram(step,'synthetic-bevel.stp',{...o,offset:[-5,5,5],invB:true});
 const trimStart=p=>{
   const block=p.split('*** TRIM BLOCK')[1];
   return +block.split(/\r?\n/).find(l=>/^G01 /.test(l)).match(/X(-?[\d.]+)/)[1];
 };
 assert.ok(Math.abs(trimStart(reversed.program)-trimStart(moved.program)-10)<.03,'B90 trim follows inverted table direction and stock offset');
 const bevelFace=m.verticalBevels().find(b=>shape.rootFaces.includes(b.face));
 const yc=(shape.planeA+shape.planeB)/2,xc=(result.part.x0+result.part.x1)/2;
 const values=shape.contour.flatMap(([face])=>Array.from({length:17},(_,i)=>[face.A(i/16),face.B(i/16)]).flat());
 const signed=p=>(p[0]-bevelFace.point[0])*bevelFace.normal[0]+(p[1]-bevelFace.point[1])*bevelFace.normal[1];
 const low=Math.min(...values.map(signed)),high=Math.max(...values.map(signed)),kept=high>.02?1:-1;
 assert.ok(!(low<-.02&&high>.02));
 for(const [r,inverted] of [[moved,false],[reversed,true]]){
   const bm=bevelMove(r.program),angle=bm.angle*Math.PI/180*(inverted?-1:1),c=Math.cos(angle),sn=Math.sin(angle);
   for(const wireX of [-185,185]){
     const localX=wireX*c+bm.x*sn,localY=-wireX*sn+bm.x*c;
     const d=signed([localY+xc-5,yc-localX-5,0]);
     assert.ok(Math.abs(d+kept*o.kerf/2)<.03,'shifted bevel is on the correct STEP plane and waste side');
   }
 }
 const placed=gen.autoPlace(step,'synthetic-bevel.stp',{...o,grounded:true,keepHeight:true,preferNegativeX:true});
 assert.ok(placed.offset[0]<=-5&&placed.offset.every(v=>v%5===0));
 const invertedPlacement=gen.autoPlace(step,'synthetic-bevel.stp',{...o,invB:true,grounded:true,keepHeight:true,preferNegativeX:true});
 assert.ok(invertedPlacement.offset[0]<=-5);
 assert.match(invertedPlacement.program.split('*** FINAL BEVEL')[1],/B-/);
 for(const [candidate,invB] of [[moved.program,false],[reversed.program,true],[placed.program,false],[invertedPlacement.program,true]]){
   const p=sim.parseGcode(candidate),check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB,laser:false});
   assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
 }
 const lifted=gen.groundPlacement(step,'synthetic-bevel.stp',o,{...placed,offset:[placed.offset[0],placed.offset[1],5],displacement:5});
 const grounded=gen.buildProgram(step,'synthetic-bevel.stp',{...o,stock:lifted.stock,offset:lifted.offset,modelZOffset:lifted.modelZOffset});
 assert.match(grounded.program,/FINAL BEVEL/);
 assert.throws(()=>gen.autoPlace(step,'synthetic-bevel.stp',{...o,bottomZ:0,grounded:true}),/не ниже 5 мм/);
});

test('sloped end with an internal bore cuts its top slit before the main contour',()=>{
 const step=slopedCapFixture(true),model=new gen.Model(step),shape=model.slopedEndContour();
 assert.equal(shape.holes.length,1);assert.equal(shape.contour.length,6);
 const r=gen.buildProgram(step,'sloped-bore.stp',options({stock:[70,100,50],trim:true,trimAngle:90,retract:5}));
 const p=r.program,trim=p.indexOf('*** TRIM BLOCK'),hole=p.indexOf('*** HOLE:'),profile=p.indexOf('*** PROFILE:'),bevel=p.indexOf('*** FINAL BEVEL');
 assert.ok(trim>=0&&hole>trim&&profile>hole&&bevel>profile);
 assert.ok(r.warnings.some(w=>w.includes('прорезью сверху')));
 const optionsBase=options({stock:[70,100,50],trim:true,trimAngle:90,retract:5});
 const raised=gen.buildProgram(step,'sloped-bore.stp',{...optionsBase,offset:[-5,0,5]});
 const grounded=gen.groundPlacement(step,'sloped-bore.stp',optionsBase,{offset:[-5,0,5],rotation:gen.identityRotation(),displacement:5});
 const onTable=gen.buildProgram(step,'sloped-bore.stp',{...optionsBase,stock:grounded.stock,offset:grounded.offset,modelZOffset:grounded.modelZOffset});
 const cuts=program=>program.slice(program.indexOf('*** HOLE:'),program.indexOf('*** FINAL BEVEL')).split(/\r?\n/).filter(line=>/^G01 /.test(line));
 assert.deepEqual(cuts(raised.program),cuts(onTable.program),'hole and profile stay fixed when the stock is grounded');
 const parsed=sim.parseGcode(p),check=sim.analyse(parsed,{...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
});

test('an unmatched hole boundary cannot become a safe sloped-end contour',()=>{
 const step=slopedCapFixture(true,true),bounds=[...step.matchAll(/(#\d+) = FACE_BOUND/g)].map(m=>m[1]);
 assert.equal(bounds.length,2);
 const broken=step.replace(','+bounds[1]+')',')');assert.notEqual(broken,step);
 assert.throws(()=>new gen.Model(broken).slopedEndContour(),/сопоставить отверстия/);
 assert.throws(()=>gen.buildProgram(broken,'broken-bore.stp',options({stock:[70,100,50],trim:true,retract:5})));
});

test('a side face spanning two root caps is reconstructed with a bore',()=>{
 const step=slopedCapFixture(true,true),shape=new gen.Model(step).slopedEndContour();
 assert.equal(shape.contour.length,4);assert.equal(shape.holes.length,1);
 const splitFaces=shape.contour.map(([f])=>f).filter(f=>Array.isArray(f.capFaces[0])&&f.capFaces[0].length===2);
 assert.equal(splitFaces.length,2);
 for(const face of splitFaces)assert.ok(face.breaks.some(u=>Math.abs(face.A(u)[0])<.001&&Math.abs(face.A(u)[1])<.001),'root cap change is a mandatory section');
 const r=gen.buildProgram(step,'split-cap-bore.stp',options({stock:[70,100,50],trim:true,trimAngle:90,retract:5}));
 assert.equal(r.holes,1);
 assert.ok(r.program.indexOf('*** HOLE:')<r.program.indexOf('*** PROFILE:'));
 assert.ok(r.program.indexOf('*** PROFILE:')<r.program.indexOf('*** FINAL BEVEL'));
 const p=sim.parseGcode(r.program),check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
});

test('kil2 joins all main faces across their different end planes',{skip:!process.env.KIL_STEP},()=>{
 const step=fs.readFileSync(process.env.KIL_STEP,'utf8');
 const model=new gen.Model(step,gen.identityRotation(),1,.6);
 const found=model.slopedEndContour();
 assert.equal(found.safeForGcode,false);assert.equal(found.contour.length,7);
 assert.equal(found.axis,1);assert.equal(found.tipFace,862);
 assert.ok(found.maxDeviation<.6);
 const specs=[[381,1254,862],[790,1235,862],[895,1254,862],[913,1235,862],[1201,1254,862],[1271,1254,862],[1283,1235,862]];
 const faces=specs.map(args=>model.ruledPatchBetweenCaps(...args));
 assert.ok(faces.every(f=>f.maxDeviation<.6));
 const face=faces.find(f=>f.source===790);assert.ok(face.maxDeviation>.1);
 assert.ok(face.breaks.length>10,'preserves narrow spline sections as mandatory sampling stops');
 const points=gen.sampleFace(face,0,1,.01,1);
 for(const u of face.breaks){
   const a=face.A(u),b=face.B(u);
   assert.ok(points.some(pair=>Math.hypot(...pair[0].map((v,i)=>v-a[i]))<1e-7&&Math.hypot(...pair[1].map((v,i)=>v-b[i]))<1e-7));
 }
 const chain=gen.Model.chain(faces),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 for(let i=0;i<chain.length;i++){
   const [f,forward]=chain[i],[g,nextForward]=chain[(i+1)%chain.length];
   const end=forward?f.t1:f.t0,start=nextForward?g.t0:g.t1;
   assert.ok(distance(f.A(end),g.A(start))<.01,'root joins');
   assert.ok(distance(f.B(end),g.B(start))<.01,'tip joins');
 }
 const strict=new gen.Model(step,gen.identityRotation(),1,.1);
 assert.throws(()=>strict.ruledPatchBetweenCaps(790,1235,862),/отклонение струны/);
 assert.throws(()=>model.build(),/Грань #790/,'a matched contour does not by itself enable incomplete G-code');
});

test('kil2 shows its full diagnostic faces at the selected tolerance',{skip:!process.env.KIL_STEP},()=>{
 const step=fs.readFileSync(process.env.KIL_STEP,'utf8');
 const preview=gen.previewGeometry(step,gen.identityRotation(),1,.6);
 assert.equal(preview.diagnosticOnly,false);assert.equal(preview.slopedPreview,true);
 const bevel=new gen.Model(step).verticalBevels().find(face=>face.face===1235);
 assert.ok(bevel,'the root bevel is identified from its plane and boundary');
 assert.ok(Math.abs(bevel.angle-66.07)<.1,`unexpected bevel angle: ${bevel.angle}`);
 assert.equal(preview.diagnosticFaces.length,10);
 assert.ok(preview.diagnosticFaces[1].patch,'curved rudder uses a surface patch');
 const patch=preview.diagnosticFaces[1].patch;
 assert.equal(patch.length,33);assert.ok(patch.every(row=>row.length===33));
 assert.ok(preview.size[1]>280);
 const three=require('../lib/three.min.js');
 for(const boundary of preview.diagnosticFaces){
   const n=[0,0,0];
   boundary.forEach((a,i)=>{const b=boundary[(i+1)%boundary.length];n[0]+=(a[1]-b[1])*(a[2]+b[2]);n[1]+=(a[2]-b[2])*(a[0]+b[0]);n[2]+=(a[0]-b[0])*(a[1]+b[1]);});
   const axis=n.reduce((best,v,i)=>Math.abs(v)>Math.abs(n[best])?i:best,0),axes=[0,1,2].filter(k=>k!==axis);
   assert.ok(three.ShapeUtils.triangulateShape(boundary.map(p=>new three.Vector2(p[axes[0]],p[axes[1]])),[]).length>0);
 }
 assert.equal(preview.previewError,null);
 assert.throws(()=>gen.buildProgram(step,'kil2.stp',options({stock:[230,285,55],tolerance:.1})),/отклонение струны/);
});

test('kil2 G-code trims, cuts the main contour, then removes the bevel',{skip:!process.env.KIL_STEP},()=>{
 const step=fs.readFileSync(process.env.KIL_STEP,'utf8');
 const o=options({stock:[230,285,55],tolerance:.6,trim:true,trimAngle:90,retract:5});
 const result=gen.buildProgram(step,'kil2.stp',o),program=result.program;
 const trim=program.indexOf('*** TRIM BLOCK'),profile=program.indexOf('*** PROFILE:'),bevel=program.indexOf('*** FINAL BEVEL');
 assert.ok(trim>=0&&profile>trim&&bevel>profile);
 assert.match(program.slice(bevel),/B66\.07/);
 const profileBlock=program.slice(profile,bevel);
 assert.match(profileBlock,/ENTRY FROM ABOVE; EXIT THROUGH THE SAME SLIT/);
 const moves=profileBlock.split(/\r?\n/).filter(line=>/^G0[01] /.test(line));
 const read=line=>Object.fromEntries([...line.matchAll(/([XYZA])(-?[\d.]+)/g)].map(m=>[m[1],+m[2]]));
 const first=read(moves[0]),entry=read(moves.find(line=>/^G01 /.test(line))),exit=read(moves.at(-1));
 for(const k of ['X','Z']){
   assert.ok(Math.abs(first[k]-entry[k])<.02,'vertical entry is aligned to the chosen corner');
   assert.ok(Math.abs(exit[k]-entry[k])<.02,'exit uses the same slit');
 }
 assert.ok(first.Y>entry.Y&&first.A>entry.A,'entry descends from above');
 // Compare the final wire plane against the STEP bevel in the simulator's
 // coordinate convention, independently of the generator's angle formula.
 const model=new gen.Model(step,gen.identityRotation(),1,.6),face=model.verticalBevels().find(f=>f.face===1235);
 const [,y0,y1]=model.spanAxis(),yc=(y0+y1)/2,xc=(result.part.x0+result.part.x1)/2;
 const verifyPlane=(r,inverted)=>{
   const block=r.program.split('*** FINAL BEVEL')[1],command=+block.match(/B=(-?[\d.]+)/)[1];
   const line=block.split(/\r?\n/).find(l=>/^G01 /.test(l));
   const chord=+line.match(/X(-?[\d.]+)/)[1],angle=command*Math.PI/180*(inverted?-1:1);
   const c=Math.cos(angle),sn=Math.sin(angle),distances=[];
   for(const wireX of [-185,185]){
     const localX=wireX*c+chord*sn,localY=-wireX*sn+chord*c;
     const x=localY+xc,y=yc-localX;
     distances.push((x-face.point[0])*face.normal[0]+(y-face.point[1])*face.normal[1]);
   }
   assert.ok(Math.abs(distances[0]-distances[1])<.03,'wire is parallel to the actual STEP bevel');
   assert.ok(distances.every(d=>Math.abs(d-.5)<.03),'kerf is on the waste side of the STEP plane');
 };
 verifyPlane(result,false);
 const inverse=gen.buildProgram(step,'kil2.stp',{...o,invB:true});
 assert.match(inverse.program.split('*** FINAL BEVEL')[1],/B-66\.07/);
 verifyPlane(inverse,true);
 const reverseParsed=sim.parseGcode(inverse.program),reverseReport=sim.analyse(reverseParsed,{...reverseParsed.stock,FW:370,HT:490,VT:250,angle:45,invB:true,laser:false});
 assert.equal(reverseReport.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(reverseReport.warns));
 assert.ok(result.warnings.some(w=>w.includes('Допуск поверхности 0.60')));
 assert.equal(result.smoothSurface,null,'a single-sweep model cannot depict a final bevel');
 const parsed=sim.parseGcode(program),report=sim.analyse(parsed,{...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(report.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(report.warns));
 assert.throws(()=>gen.buildProgram(step,'kil2.stp',options({...o,stock:[250,320,55]})),/не помещается между башнями/);
 const wider=gen.buildProgram(step,'kil2.stp',options({...o,stock:[235,290,55]}));
 assert.match(wider.program,/FINAL BEVEL/,'parked rotation can exceed the tower span without side walls');
 const shifted=gen.buildProgram(step,'kil2.stp',options({...o,offset:[-5,0,5]}));
 assert.match(shifted.program,/FINAL BEVEL/);
 assert.match(shifted.program,/ENTRY FROM ABOVE; EXIT THROUGH THE SAME SLIT/);
 const shiftedParsed=sim.parseGcode(shifted.program),shiftedCheck=sim.analyse(shiftedParsed,{...shiftedParsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(shiftedCheck.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(shiftedCheck.warns));
});

// Synthetic solid with a single closed outer skin and one seam vertex per cap.
function closedSkinFixture() {
 let id=1,lines=[];
 const add=(type,args)=>{const ref='#'+id++;lines.push(ref+' = '+type+"('',"+args+');');return ref;};
 const point=p=>add('CARTESIAN_POINT','('+p.join(',')+')');
 const profile=[[30,0],[30,5],[15,10],[0,10],[-15,10],[-30,5],[-30,0],[-30,-5],[-15,-10],[0,-10],[15,-10],[30,-5],[30,0]];
 // Deliberately place the STEP seam at the top, away from either entry side.
 profile.pop();profile.push(...profile.splice(0,3));profile.push(profile[0]);
 const rows=[0,1].map(end=>profile.map(([x,z])=>point([x+end*60,end*100,z+20])));
 const curves=rows.map(row=>add('B_SPLINE_CURVE_WITH_KNOTS','3,('+row.join(',')+'),.UNSPECIFIED.,.T.,.F.,(4,3,3,3,4),(0.,0.25,0.5,0.75,1.),.UNSPECIFIED.'));
 const vertices=rows.map(row=>add('VERTEX_POINT',row[0]));
 const edges=curves.map((c,k)=>add('EDGE_CURVE',vertices[k]+','+vertices[k]+','+c+',.T.'));
 const seam=add('EDGE_CURVE',vertices.join(',')+',$,.T.');
 const bound=ids=>add('FACE_OUTER_BOUND',add('EDGE_LOOP','('+ids.map(e=>add('ORIENTED_EDGE','*,*,'+e+',.T.')).join(',')+')')+',.T.');
 const skin=add('B_SPLINE_SURFACE_WITH_KNOTS','3,1,('+rows[0].map((v,i)=>'('+v+','+rows[1][i]+')').join(',')+'),.UNSPECIFIED.,.T.,.F.,.F.,(4,3,3,3,4),(2,2),(0.,0.25,0.5,0.75,1.),(0.,1.),.UNSPECIFIED.');
 const faces=[add('ADVANCED_FACE','('+bound([edges[0],seam,edges[1],seam])+'),'+skin+',.T.')];
 for(let k=0;k<2;k++){
   const grid=[[-40,0],[-40,40],[100,0],[100,40]].map(([x,z])=>point([x,k*100,z]));
   const cap=add('B_SPLINE_SURFACE_WITH_KNOTS','1,1,(('+grid.slice(0,2).join(',')+'),('+grid.slice(2).join(',')+')),.UNSPECIFIED.,.F.,.F.,.F.,(2,2),(2,2),(0.,1.),(0.,1.),.UNSPECIFIED.');
   faces.push(add('ADVANCED_FACE','('+bound([edges[k]])+'),'+cap+',.T.'));
 }
 add('MANIFOLD_SOLID_BREP',add('CLOSED_SHELL','('+faces.join(',')+')'));
 return 'ISO-10303-21;\nDATA;\n'+lines.join('\n')+'\nENDSEC;\nEND-ISO-10303-21;';
}
test('closed exterior uses cap topology and exact boundary splines despite swept generators',()=>{
 const text=closedSkinFixture(),m=new gen.Model(text),shape=m.build();
 assert.equal(shape.axis,1);assert.equal(shape.outer.length,1);assert.equal(shape.holes.length,0);
 assert.equal(gen.previewGeometry(text).diagnosticOnly,false);
 for(const side of [-1,1]){
   const r=gen.buildProgram(text,'closed.stp',options({stock:[110,140,60],side}));
   assert.match(r.program,/PROFILE/);assert.doesNotMatch(r.program,/HOLE:/);
   const block=r.program.slice(r.program.indexOf('; *** PROFILE:'));
   const count=+block.match(/PROFILE: (\d+)/)[1];
   const moves=block.split(/\r?\n/).filter(line=>/^G01 /.test(line)).slice(0,count);
   const xs=moves.map(line=>+line.match(/X(-?[\d.]+)/)[1]);
   const extreme=side>0?Math.max(...xs):Math.min(...xs);
   assert.ok(Math.abs(xs[0]-extreme)<.02,'entry is on the selected extreme, not the STEP seam');
 }
 const raw=m.facesRaw[0],surface=m.surface(raw.surf),face=shape.outer[0][0];
 for(let i=0;i<=100;i++)for(const f of [0,.25,.5,.75,1]){
   const t=i/100,a=face.A(t),b=face.B(t),p=surface.at(t,f);
   assert.ok(Math.hypot(...p.map((v,k)=>v-a[k]-f*(b[k]-a[k])))<1e-6);
 }
});
test('closed exterior rejects internal bounds, missing solids and mismatched curve controls',()=>{
 const text=closedSkinFixture();
 assert.equal(new gen.Model(text.replaceAll('FACE_OUTER_BOUND','FACE_BOUND')).closedExterior(),null);
 assert.equal(new gen.Model(text.replace('MANIFOLD_SOLID_BREP','OPEN_SOLID')).closedExterior(),null);
 const m=new gen.Model(text),edge=m.facesRaw[1].edgeIds[0],curve=m.get(m.entities.get(edge).args[3]);
 curve.args[2]=curve.args[2].slice().reverse();
 assert.equal(m.closedExterior(),null);
});
test('external kil3 builds an exterior profile and safe G-code',{skip:!process.env.KIL3_STEP},()=>{
 const text=fs.readFileSync(process.env.KIL3_STEP,'utf8'),m=new gen.Model(text),shape=m.build();
 assert.equal(shape.axis,1);assert.equal(shape.holes.length,0);assert.equal(shape.secondaryContours.length,0);
 const preview=gen.previewGeometry(text);
 assert.equal(preview.diagnosticOnly,false);assert.ok(preview.size[1]>280);
 assert.ok(preview.closedShell);
 const three=require('../lib/three.min.js'),axes=[0,1,2].filter(k=>k!==preview.closedShell.capAxis);
 for(const end of [0,1]){
   const points=preview.closedShell.rail.slice(0,-1).map(pair=>new three.Vector2(pair[end][axes[0]],pair[end][axes[1]]));
   assert.ok(three.ShapeUtils.triangulateShape(points,[]).length>0);
 }
 for(const side of [-1,1]){
   const r=gen.buildProgram(text,'kil3.stp',options({stock:[250,320,60],side}));
   assert.match(r.program,/PROFILE/);assert.doesNotMatch(r.program,/HOLE:|SECONDARY CUT/);
   const p=sim.parseGcode(r.program),check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
   assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
 }
});

test('W11 joins a split end, cuts the top slit and bore, profile, then bevel',{skip:!process.env.W11_STEP},()=>{
 const step=fs.readFileSync(process.env.W11_STEP,'utf8'),m=new gen.Model(step,gen.identityRotation(),1,.1),shape=m.slopedEndContour();
 assert.equal(shape.axis,1);assert.equal(shape.contour.length,3);assert.equal(shape.holes.length,1);
 for(const id of [487,566]){
   const face=shape.contour.find(([f])=>f.source===id)[0];
   assert.ok(face.breaks.some(u=>Math.abs(face.A(u)[0]-172.914)<.02&&Math.abs(face.A(u)[1])<.02),'actual cap transition is retained');
 }
 assert.ok(shape.maxDeviation<.01,'the ruled main surfaces match their STEP faces');
 const preview=gen.previewGeometry(step,gen.identityRotation(),1,.1);
 assert.equal(preview.slopedPreview,true);assert.equal(preview.diagnosticOnly,false);
 assert.equal(preview.rails.length-preview.outerCount,1,'the bore remains visible in the model view');
 const o=options({stock:[310,250,50],bottomZ:10,tolerance:.1,trim:true,trimAngle:90,retract:5});
 const r=gen.buildProgram(step,'W11.stp',o),p=r.program;
 assert.ok(gen.stockRotationEnvelope(310,250,[0,0,0],90)>185,'the blank may project past tower spacing during the parked turn');
 assert.ok(gen.stockAlongWireAtAngle(310,250,[0,0,0],preview.slopedBevelAngle)<184,'it fits at the bevel cut');
 const trim=p.indexOf('*** TRIM BLOCK'),hole=p.indexOf('*** HOLE:'),profile=p.indexOf('*** PROFILE:'),bevel=p.indexOf('*** FINAL BEVEL');
 assert.ok(trim>=0&&hole>trim&&profile>hole&&bevel>profile,'facing, hole with slit, profile, bevel');
 assert.equal(r.holes,1);assert.ok(r.warnings.some(w=>w.includes('прорезью сверху')));
 const count=+p.slice(hole).match(/HOLE: (\d+) points/)[1];
 const lines=p.slice(hole,profile).split(/\r?\n/).filter(line=>/^G01 /.test(line));
 const coord=line=>Object.fromEntries([...line.matchAll(/([XYZA])(-?[\d.]+)/g)].map(m=>[m[1],+m[2]]));
 const start=coord(lines[0]),finish=coord(lines[count-1]);
 for(const axis of ['X','Y','Z','A'])assert.ok(Math.abs(start[axis]-finish[axis])<.03,'bore closes before returning through its slit');
 const face=m.verticalBevels().find(x=>x.face===146),yc=(shape.planeA+shape.planeB)/2,xc=(r.part.x0+r.part.x1)/2;
 const body=[...m.edges.values()].flat().map(q=>q.reduce((sum,v,i)=>sum+(v-face.point[i])*face.normal[i],0));
 const kept=Math.max(...body)>.02?1:-1;
 const verifyBevel=(program,offset,inverted)=>{
   const block=program.slice(program.indexOf('*** FINAL BEVEL')),command=+block.match(/B=(-?[\d.]+)/)[1];
   const cut=+block.split(/\r?\n/).find(line=>/^G01 /.test(line)).match(/X(-?[\d.]+)/)[1];
   const t=command*Math.PI/180*(inverted?-1:1),c=Math.cos(t),sn=Math.sin(t);
   for(const x of [-185,185]){
     const localX=x*c+cut*sn,localY=-x*sn+cut*c,point=[localY+xc-offset[1],yc-localX+offset[0],0];
     const d=point.reduce((sum,v,i)=>sum+(v-face.point[i])*face.normal[i],0);
     assert.ok(Math.abs(d+kept*o.kerf/2)<.03,'bevel follows the STEP plane on the waste side');
   }
 };
 verifyBevel(p,[0,0,0],false);
 const inverted=gen.buildProgram(step,'W11.stp',{...o,invB:true});
 verifyBevel(inverted.program,[0,0,0],true);
 const ip=sim.parseGcode(inverted.program),ic=sim.analyse(ip,{...ip.stock,FW:370,HT:490,VT:250,angle:45,invB:true,laser:false});
 assert.equal(ic.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(ic.warns));
 const parsed=sim.parseGcode(p),check=sim.analyse(parsed,{...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
 const placed=gen.autoPlace(step,'W11.stp',{...o,grounded:true,keepHeight:true,preferNegativeX:true});
 assert.ok(placed.offset[0]<=-5&&placed.offset.every(v=>v%5===0));
 verifyBevel(placed.program,placed.offset,false);
 const placedParsed=sim.parseGcode(placed.program),placedCheck=sim.analyse(placedParsed,{...placedParsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(placedCheck.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(placedCheck.warns));
});

test('W11 automatic stock preserves allowances with parked turning',{skip:!process.env.W11_STEP},async()=>{
 const text=fs.readFileSync(process.env.W11_STEP,'utf8'),geometry=gen.previewGeometry(text,gen.identityRotation(),1,.1);
 const source=fs.readFileSync(path.join(__dirname,'../generator-view.js'),'utf8');
 const begin=source.indexOf('  async function autoStockOptions('),end=source.indexOf("  document.getElementById('gnStockFromModel').addEventListener",begin);
 const state={Gen:{...gen,previewGeometry:()=>({...geometry,diagnosticOnly:true})},stepFile:{text},
  modelRotation:gen.identityRotation(),modelOffset:[0,0,0],geometry,machine:gen.CONFIG,
  document:{getElementById:id=>({checked:id==='gnTrim'})},
  n:id=>({gnScale:100,gnKerf:1,gnZ:10,gnClear:20,gnLead:5,gnTolerance:.1,gnTrimAngle:90})[id],setTimeout};
 const candidates=await vm.runInNewContext(source.slice(begin,end)+';autoStockOptions()',state);
 assert.ok(candidates.length);const best=candidates[0];
 assert.deepEqual([best.length,best.width,best.height],[310,250,50]);
 assert.ok(best.length>=geometry.size[0]+10-1e-6&&best.width>=geometry.size[1]+20-1e-6);
 assert.ok(gen.stockAlongWireAtAngle(best.length,best.width,[0,0,0],geometry.slopedBevelAngle)<=(gen.CONFIG.FieldWidth-2)/2);
});

test('pair checkbox controls Create G-code, not only the stock preview',()=>{
 // Exercise the actual UI mode dispatch and event handlers with minimal DOM stubs.
 const clickHandlers=new Map();
 const nodes=Object.fromEntries(['gnGo','gnMirror','gnPair','gnStockPair','gnTopEntry','gnSideEntry','gnDone','gnOut','gnStatus']
  .map(id=>[id,{checked:false,hidden:false,textContent:'',addEventListener(type,fn){clickHandlers.set(id+':'+type,fn);}}]));
 const get=id=>nodes[id],modes=[];
 // Use only the production dispatch wiring; do not silently substitute another implementation.
 const ui=html.slice(html.indexOf('// The pair checkbox is a real machining mode'),html.indexOf('$("gnToCut").addEventListener'));
 vm.runInNewContext(ui,{ $:get,generatorMode:'auto',generate:mode=>modes.push(mode),generatorPreview:{rebuild(){}},
   showTab(){},saveProgram(){},});
 get('gnStockPair').checked=true;
 clickHandlers.get('gnStockPair:change')();
 assert.match(get('gnGo').textContent,/ПАРА.*2 детали/);
 clickHandlers.get('gnGo:click')();
 assert.equal(modes.at(-1),'pair');
 get('gnStockPair').checked=false;
 clickHandlers.get('gnStockPair:change')();
 clickHandlers.get('gnGo:click')();
 assert.equal(modes.at(-1),'normal');
 clickHandlers.get('gnPair:click')();
 assert.equal(modes.at(-1),'pair');
 assert.equal(get('gnStockPair').checked,true);
 get('gnTopEntry').checked=true;
 get('gnSideEntry').checked=true;
 clickHandlers.get('gnTopEntry:change')();
 assert.equal(get('gnSideEntry').checked,false,'top and side entries are mutually exclusive');
 get('gnSideEntry').checked=true;
 clickHandlers.get('gnSideEntry:change')();
 assert.equal(get('gnTopEntry').checked,false,'side entry clears top entry');
});
test('pair G-code explicitly contains two profiles and a two-piece mode header',()=>{
 const r=build(options({pair:true,stock:[50,140,93]}));
 assert.match(r.program,/CUT MODE=PAIR PIECES=2/);
 assert.equal((r.program.match(/PROFILE [12]\/2:/g)||[]).length,2);
 assert.ok(r.program.indexOf('PROFILE 1/2: UPPER')<r.program.indexOf('PROFILE 2/2: LOWER'));
 assert.equal((r.program.match(/corner entry, upper first/g)||[]).length,2);
 assert.match(build().program,/CUT MODE=SINGLE PIECES=1/);
 assert.equal((build().program.match(/PROFILE [12]\/2:/g)||[]).length,0);
});
test('pair uses one central web and a fixed upper margin',()=>{
 const small=options({pair:true,stock:[50,140,93]});
 const r=build(small);
 assert.match(r.program,/pair: upper reflected over gap/);
 assert.doesNotMatch(r.program,/GAP ENTRY/); // synthetic profile has no holes
 assert.equal(r.secondary,0);
 assert.equal((r.program.match(/corner entry, upper first/g)||[]).length,2);
 assert.ok(r.points>500);
 const p=sim.parseGcode(r.program),machine={...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false};
 const check=sim.analyse(p,machine);
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
 assert.throws(()=>build(options({pair:true,stock:[50,140,92]})),/Пара не помещается.*93\.0/);
});
test('external W1: mirror pair at 65 mm stock height is machinable',{skip:!process.env.W1_STEP},()=>{
 const text=fs.readFileSync(process.env.W1_STEP,'utf8');
 const o=options({pair:true,stock:[300,230,65]});
 const r=gen.buildProgram(text,'W1.stp',o);
 assert.equal(r.secondary,0);
 assert.match(r.program,/GAP ENTRY/);
 assert.ok(r.points>1000);
 const p=sim.parseGcode(r.program);
 const check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
});
test('external W1: no false transverse operation from STEP end caps',{skip:!process.env.W1_STEP},()=>{
 const text=fs.readFileSync(process.env.W1_STEP,'utf8');
 const m=new gen.Model(text),shape=m.build();
 assert.equal(shape.axis,1);assert.equal(shape.planeA,0);assert.equal(shape.planeB,300);
 assert.equal(shape.outer.length,3);assert.equal(shape.holes.length,1);
 assert.equal(shape.secondaryContours.length,0);
 const r=gen.buildProgram(text,'W1.stp',options({stock:[300,230,40]}));
 const p=sim.parseGcode(r.program);
 const check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
 assert.doesNotMatch(r.program,/SECONDARY CUT/);
});
test('auto stock takes standard sheet thickness along wire, not vertical Z',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../generator-view.js'),'utf8');
 const begin=source.indexOf('  async function autoStockOptions(');
 const end=source.indexOf("  document.getElementById('gnStockFromModel').addEventListener",begin);
 assert.ok(begin>0&&end>begin);
 const text=fs.readFileSync(path.join(__dirname,'fixtures/wireframe-profile.stp'),'utf8');
 const state={
  Gen:gen,stepFile:{text},modelRotation:gen.identityRotation(),modelOffset:[0,0,0],
  geometry:gen.previewGeometry(text),machine:gen.CONFIG,
  document:{getElementById:id=>({checked:id==='gnTrim'})},
  n:id=>({gnScale:100,gnKerf:1,gnZ:10,gnClear:20,gnLead:5,gnTolerance:.6})[id],setTimeout
 };
 const seenTolerances=[];
 state.Gen={...gen,previewGeometry:(...args)=>{seenTolerances.push(args[3]);return gen.previewGeometry(...args)}};
 const options=await vm.runInNewContext(source.slice(begin,end)+';autoStockOptions()',state);
 assert.ok(seenTolerances.length>0 && seenTolerances.every(v=>v===.6),'candidate orientations use selected STEP tolerance');
 assert.ok(options.length);
 const best=options[0];
 assert.equal(best.length,50);
 assert.equal(best.turn,0);
 assert.equal(best.standard,true);
 assert.ok(best.height+1e-7>=state.geometry.size[2]+20); // geometrically required allowance
 assert.ok(best.width>best.length);
 state.geometry={...state.geometry,diagnosticOnly:true};
 state.Gen={...state.Gen,previewGeometry:(...args)=>({...gen.previewGeometry(...args),diagnosticOnly:true})};
 const unavailable=await vm.runInNewContext(source.slice(begin,end)+';autoStockOptions()',state);
 assert.equal(unavailable.length,0);
});
test('auto stock retains the preferred clearance whenever reduced allowances suffice',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../generator-view.js'),'utf8');
 const begin=source.indexOf('  async function autoStockOptions(');
 const end=source.indexOf("  document.getElementById('gnStockFromModel').addEventListener",begin);
 const geometry={axis:1,diagnosticOnly:false,secondaryCount:1,size:[50,301.2,219],slopedPreview:false};
 const state={Gen:{...gen,previewGeometry:()=>geometry},stepFile:{text:'fixture'},
  modelRotation:gen.identityRotation(),modelOffset:[0,0,0],geometry,machine:gen.CONFIG,
  document:{getElementById:()=>({checked:false})},
  n:id=>({gnScale:100,gnKerf:1,gnZ:10,gnClear:15,gnLead:5,gnTolerance:.1})[id],setTimeout};
 const choices=await vm.runInNewContext(source.slice(begin,end)+';autoStockOptions()',state);
 assert.ok(choices.length);
 assert.equal(choices[0].height,225);
 assert.equal(choices[0].clearance,15);
});
test('F2 auto stock reduces allowances and clearance when the default setup exceeds vertical travel',{skip:!process.env.F2_AUTO_STEP},async()=>{
 const step=fs.readFileSync(process.env.F2_AUTO_STEP,'latin1');
 const source=fs.readFileSync(path.join(__dirname,'../generator-view.js'),'utf8');
 const begin=source.indexOf('  async function autoStockOptions(');
 const end=source.indexOf("  document.getElementById('gnStockFromModel').addEventListener",begin);
 let trimEnabled=true;
 const state={Gen:gen,stepFile:{text:step},modelRotation:gen.identityRotation(),modelOffset:[0,0,0],
  geometry:gen.previewGeometry(step),machine:gen.CONFIG,
  document:{getElementById:id=>({checked:id==='gnTrim'&&trimEnabled})},
  n:id=>({gnScale:100,gnKerf:1,gnZ:10,gnClear:20,gnLead:5,gnTolerance:.1})[id],setTimeout};
 const choices=await vm.runInNewContext(source.slice(begin,end)+';autoStockOptions()',state);
 assert.ok(choices.length,'auto stock should find a setup for F2');
 const best=choices[0];
 assert.equal(best.clearance,5);
 assert.equal(best.height,235);
 assert.equal(best.length,100);
 const config=options({stock:[best.length,best.width,best.height],bottomZ:10,clearance:best.clearance,
  rotation:best.rotation,trim:true,trimAngle:90,cutOrder:'B90_B0',frameMarks:true,powerComp:false});
 const result=gen.buildProgram(step,'F2.stp',config);
 const parsed=sim.parseGcode(result.program);
 const report=sim.analyse(parsed,{...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(report.warns.filter(warning=>warning.level==='crit').length,0,JSON.stringify(report.warns));
 trimEnabled=false;
 const withoutTrim=await vm.runInNewContext(source.slice(begin,end)+';autoStockOptions()',state);
 assert.equal(withoutTrim[0].length,50);
 const noTrim=gen.buildProgram(step,'F2.stp',{...config,stock:[50,withoutTrim[0].width,withoutTrim[0].height],trim:false});
 assert.ok(noTrim.warnings.some(warning=>warning.includes('Разметка габарита')));
});
test('kil2 automatic stock and placement include the rotated bevel',{skip:!process.env.KIL_STEP},async()=>{
 const text=fs.readFileSync(process.env.KIL_STEP,'utf8'),geometry=gen.previewGeometry(text,gen.identityRotation(),1,.6);
 assert.equal(geometry.slopedPreview,true);assert.ok(Number.isFinite(geometry.slopedBevelAngle));
 const source=fs.readFileSync(path.join(__dirname,'../generator-view.js'),'utf8');
 const begin=source.indexOf('  async function autoStockOptions('),end=source.indexOf("  document.getElementById('gnStockFromModel').addEventListener",begin);
 const state={Gen:{...gen,previewGeometry:()=>({...geometry,diagnosticOnly:true})},
  stepFile:{text},modelRotation:gen.identityRotation(),modelOffset:[0,0,0],geometry,machine:gen.CONFIG,
  document:{getElementById:id=>({checked:id==='gnTrim'})},
  n:id=>({gnScale:100,gnKerf:1,gnZ:10,gnClear:20,gnLead:5,gnTolerance:.6,gnTrimAngle:90})[id],setTimeout};
 const choices=await vm.runInNewContext(source.slice(begin,end)+';autoStockOptions()',state);
 assert.ok(choices.length,'a stock size fits the actual bevel angle');
 const best=choices[0],rad=geometry.slopedBevelAngle*Math.PI/180;
 assert.ok(best.width>=geometry.size[1]+1-1e-5);
 assert.ok(best.length>=geometry.size[0]+1-1e-5);
 assert.ok(gen.stockAlongWireAtAngle(best.length,best.width,[0,0,0],geometry.slopedBevelAngle)<=(gen.CONFIG.FieldWidth-2)/2+1e-6);
 assert.ok(best.width<Math.ceil((geometry.size[1]+20)/5)*5,'reduce excess foam only as required for the rotation');
 const o=options({stock:[best.length,best.width,best.height],bottomZ:10,tolerance:.6,trim:true,trimAngle:90,retract:5,
   grounded:true,keepHeight:true,preferNegativeX:true});
 const placement=gen.autoPlace(text,'kil2.stp',o);
 assert.ok(placement.offset[0]<=-5&&placement.offset.every(v=>v%5===0));
 const [x,y,z]=placement.offset;
 const span=gen.stockAlongWireAtAngle(best.length,best.width,[x,y,z],geometry.slopedBevelAngle);
 assert.ok(span<=(gen.CONFIG.FieldWidth-2)/2+1e-6,'shifted stock fits between towers at the cutting angle');
 const grounded=gen.groundPlacement(text,'kil2.stp',o,placement);
 assert.deepEqual(Array.from(grounded.stock),o.stock);assert.equal(z,0);
 const parsed=sim.parseGcode(placement.program),report=sim.analyse(parsed,{...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(report.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(report.warns));
 assert.ok(parsed.moves.every(m=>Math.min(m.to.Y,m.to.A)>=5-1e-6),'5 mm vertical travel reserve');
});

test('wireframe U-arch uses one safe waste corridor to both openings',()=>{
 const step=fs.readFileSync(path.join(__dirname,'fixtures/wireframe-two-holes.stp'),'utf8');
 const opts=options({stock:[50,165,165],bottomZ:10,clearance:20,trim:false});
 const result=gen.buildProgram(step,'wireframe-two-holes.stp',opts);
 assert.match(result.program,/WIREFRAME ROUTE PLANNER: 2 HOLES/);
 assert.equal((result.program.match(/FROM VERIFIED WASTE ROUTE/g)||[]).length,2);
 assert.doesNotMatch(result.program,/WIREFRAME HOLE VIA EXPLICIT STEP SLIT/);
 assert.equal(result.holes,2);
 const p=sim.parseGcode(result.program);
 const check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns.filter(w=>w.level==='crit')));
});
test('safe entry adapts to rotation around wire axis on multi-hole profiles',()=>{
 const stock=[50,165,165];
 for(const file of ['wireframe-two-holes.stp','wireframe-three-holes.stp']){
  const text=fs.readFileSync(path.join(__dirname,'fixtures',file),'utf8');
  for(const [angle,side] of [[-1,'LEFT'],[0,'BOTTOM'],[1,'RIGHT']]){
   const rotation=angle===0?gen.identityRotation():gen.rotateModel(gen.identityRotation(),0,angle);
   const result=gen.buildProgram(text,file,options({stock,bottomZ:10,clearance:20,
     rotation,trim:false}));
   assert.match(result.program,new RegExp('SAFE ENTRY SIDE: '+side));
   const p=sim.parseGcode(result.program);
   const check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
   assert.equal(check.warns.filter(w=>w.level==='crit').length,0,
    file+' X rotation '+angle+': '+JSON.stringify(check.warns.filter(w=>w.level==='crit')));
  }
 }
});
test('external curves STEP: negative X rotation uses a safe lateral entry',
 {skip:!process.env.CURVES_STEP},()=>{
 const text=fs.readFileSync(process.env.CURVES_STEP,'utf8');
 const rotation=gen.rotateModel(gen.identityRotation(),0,-1);
 const result=gen.buildProgram(text,'curves.stp',
   options({stock:[50,165,165],bottomZ:10,clearance:20,rotation,trim:false}));
 assert.match(result.program,/SAFE ENTRY SIDE: LEFT/);
 const p=sim.parseGcode(result.program);
 const check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,
   JSON.stringify(check.warns.filter(w=>w.level==='crit')));
});
test('route planner handles 3 openings with independent STEP access chains',()=>{
 const step=fs.readFileSync(path.join(__dirname,'fixtures/wireframe-three-holes.stp'),'utf8');
 const built=new gen.Model(step).build();
 assert.equal(built.holes.length,3);
 assert.ok(built.holes.some(h=>h.entry.length===3)); // nontrivial access topology
 const result=gen.buildProgram(step,'wireframe-three-holes.stp',
  options({stock:[50,165,165],bottomZ:10,clearance:20,trim:false}));
 assert.match(result.program,/WIREFRAME ROUTE PLANNER: 3 HOLES/);
 assert.equal((result.program.match(/FROM VERIFIED WASTE ROUTE/g)||[]).length,3);
 assert.doesNotMatch(result.program,/WIREFRAME HOLE VIA EXPLICIT STEP SLIT/);
 const order=result.program.match(/WASTE PATH ORDER: ([^\r\n]+)/);
 assert.ok(order);
 assert.equal(new Set(order[1].match(/\d+/g)).size,3);
 const p=sim.parseGcode(result.program);
 const check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns.filter(w=>w.level==='crit')));
});
test('external curves STEP: internal corridor must pass stock simulator',{skip:!process.env.CURVES_STEP},()=>{
 const step=fs.readFileSync(process.env.CURVES_STEP,'utf8');
 const result=gen.buildProgram(step,'curves.stp',options({stock:[50,165,165],bottomZ:10,clearance:20,trim:false}));
 assert.match(result.program,/WIREFRAME ROUTE PLANNER: 2 HOLES/);
 assert.equal(result.holes,2);
 const p=sim.parseGcode(result.program);
 const check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns.filter(w=>w.level==='crit')));
});
test('curve-only STEP reconstructs matched end sections and emits G-code safely',()=>{
 const text=fs.readFileSync(path.join(__dirname,'fixtures/wireframe-profile.stp'),'utf8');
 const m=new gen.Model(text),built=m.build();
 assert.equal(built.wireframe,true);
 assert.equal(built.axis,1);
 assert.equal(built.outer.length,6);
 assert.equal(built.holes.length,1);
 assert.equal(built.holes[0].entry.length,2);
 const opts=options({stock:[50,130,100],bottomZ:10,clearance:20});
 const r=gen.buildProgram(text,'wireframe-profile.stp',opts);
 assert.match(r.program,/STEP GEOMETRY=CURVES_ONLY/);
 assert.match(r.program,/WIREFRAME ROUTE PLANNER: 1 HOLE/);
 assert.equal(r.holes,1);
 const p=sim.parseGcode(r.program);
 const check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns.filter(w=>w.level==='crit')));
 assert.throws(()=>gen.buildProgram(text,'pair.stp',options({pair:true,stock:[50,130,200]})),/пока поддержана одна обычная деталь/);
});
test('external curves STEP: double-hole wireframe safely emits program',{skip:!process.env.CURVES_STEP},()=>{
 const text=fs.readFileSync(process.env.CURVES_STEP,'utf8');
 const m=new gen.Model(text),built=m.build();
 assert.equal(built.axis,1);
 assert.equal(built.outer.length,13);
 assert.equal(built.holes.length,2);
 const r=gen.buildProgram(text,'curves.stp',options({stock:[50,160,175],bottomZ:10,clearance:20}));
 const p=sim.parseGcode(r.program),check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns.filter(w=>w.level==='crit')));
});
test('split coedges yield the complete trimmed rectangular profile',()=>{
 const m=new gen.Model(fixture), b=m.build();
 assert.equal(b.axis,1);assert.equal(b.planeA,-25);assert.equal(b.planeB,25);
 const r=build();assert.ok(Math.abs(r.part.x1-r.part.x0-100)<.001);assert.ok(Math.abs(r.part.z1-r.part.z0-40)<.001);
 assert.equal(r.holes,0);assert.ok(r.points>100);
});
test('no trimming: no B90, stock metadata agrees with simulator X=W Y=L',()=>{
 const r=build();assert.doesNotMatch(r.program,/TRIM BLOCK|Rotation B90|^G00 B90/m);
 assert.match(r.program,/STOCK L=140 W=50 H=60 Z0=10/);
 const angles=[...r.program.matchAll(/^G00 B([\d.-]+)/gm)].map(m=>+m[1]);assert.ok(angles.length);assert.ok(angles.every(a=>a===0));
 // All commanded destination coordinates, including approach, exit and park.
 for(const line of r.program.split('\n').filter(l=>/^G0[01] /.test(l))){
  for(const [,axis,n] of line.matchAll(/([XYZA])(-?[\d.]+)/g)){
   const v=+n;assert.ok(Number.isFinite(v));assert.ok(axis==='X'||axis==='Z'?Math.abs(v)<=245:v>=0&&v<=235,line);
  }
 }
});
test('every Program move is checked, including lead-in and park',()=>{
 assert.throws(()=>build({leadMargin:300}),/Перемещение выходит/);
 assert.throws(()=>build({stock:[50,140,240],bottomZ:0}),/260.*250/);
 const p=new gen.Program(gen.CONFIG,true,5);
 gen.startBlock(gen.CONFIG,p);assert.equal(p.pos.join(','),'240,235,240,235');
 assert.throws(()=>p.travel('move',0,251,0,251),/Перемещение выходит/);
 assert.equal(p.pos.join(','),'240,235,240,235');
 p.travel('cut',20,50,20,50);gen.endBlock(gen.CONFIG,p);assert.equal(p.pos.join(','),'240,235,240,235');
});
test('reject invalid parameters before producing G-code',()=>{
 for(const o of [{stock:[NaN,140,60]},{kerf:-1},{feed:0},{bottomZ:Infinity}]) assert.throws(()=>build(o),/Недопустимые/);
});
test('external F1 regression (file is never committed)',{skip:!process.env.F1_STEP},()=>{
 const text=fs.readFileSync(process.env.F1_STEP,'utf8');const b=new gen.Model(text).build();
 assert.equal(b.axis,1);assert.equal(b.planeA,-25);assert.equal(b.planeB,25);assert.equal(b.outer.length,6);assert.equal(b.holes.length,0);
 const points=b.outer.flatMap(([f])=>gen.sampleFace(f,f.t0,f.t1,.001,.1).flat());
 const range=k=>Math.max(...points.map(p=>p[k]))-Math.min(...points.map(p=>p[k]));
 assert.ok(Math.abs(range(0)-380.64842)<.002);assert.ok(Math.abs(range(2)-221.72579)<.002);
 assert.throws(()=>gen.buildProgram(text,'F1.stp',options({stock:[50,340,230],bottomZ:0})),/380\.6.*не помещается/);
});
const sim=vm.runInNewContext(html.slice(html.indexOf('function parseGcode('),html.indexOf('const css ='))+';({parseGcode,analyse})');
test('production simulator agrees with generated stock and rejects unsafe rapid moves',()=>{
 const p=sim.parseGcode(build().program);
 const s={...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false};
 const check=sim.analyse(p,s);
 // Closing overrun adds one intentional G01 move to the profile.\n assert.equal(p.moves.length,411);assert.ok(p.total>0);assert.ok(check.trail.length>0);
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0);
 const bad=sim.parseGcode('; STOCK L=140 W=50 H=60 Z0=10\nG92 X0 Y100 Z0 A100 B0\nG00 X0 Y20 Z0 A20 F600\n');
 assert.ok(sim.analyse(bad,s).warns.some(w=>w.level==='crit'&&w.text.includes('G0')));
});
test('right-side entry stays outside stock on rapids and needs no overhead height',()=>{
 const r=build({stock:[50,140,240],bottomZ:10,sideEntry:true});
 const p=sim.parseGcode(r.program),s={...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false};
 assert.equal(sim.analyse(p,s).warns.filter(w=>w.level==='crit').length,0);
 assert.doesNotMatch(r.program,/TRIM BLOCK|Rotation B90|^G00 B90/m);
 assert.ok(p.moves.every(m=>Math.max(m.to.Y,m.to.A)<=250));
 // Approach and return are on the right, all rapid destinations outside the stock width.
 assert.ok(p.moves.filter(m=>m.type==='G0').every(m=>m.to.X>70&&m.to.Z>70));
 assert.throws(()=>build({sideEntry:true,side:-1}),/Боковой вход/);
 const noActualTrim=build({sideEntry:true,trim:true});
 assert.doesNotMatch(noActualTrim.program,/TRIM BLOCK/,
   'checked trim must not block right entry when no trim allowance exists');
 assert.throws(()=>build({sideEntry:true,pair:true}),/Боковой вход/);
 assert.throws(()=>build({sideEntry:true,stock:[50,480,60]}),/коридора/);
 assert.throws(()=>build({sideEntry:true,stock:[50,140,250],bottomZ:10}),/Верх заготовки/);
});
test('external F1: 400×240×50, right-side path at B0 fits confirmed machine',{skip:!process.env.F1_STEP},()=>{
 const text=fs.readFileSync(process.env.F1_STEP,'utf8');
 const r=gen.buildProgram(text,'F1.stp',options({stock:[50,400,240],bottomZ:10,sideEntry:true}));
 const p=sim.parseGcode(r.program),s={...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false};
 const check=sim.analyse(p,s);assert.equal(check.warns.filter(w=>w.level==='crit').length,0);
 assert.doesNotMatch(r.program,/TRIM BLOCK|Rotation B90|^G00 B90/m);
 assert.ok(p.moves.every(m=>Math.abs(m.to.X)<=245&&Math.abs(m.to.Z)<=245&&Math.min(m.to.Y,m.to.A)>=0&&Math.max(m.to.Y,m.to.A)<=250));
 assert.ok(p.moves.filter(m=>m.type==='G0').every(m=>m.to.X>=205&&m.to.Z>=205));
 assert.ok(p.moves.filter(m=>m.wire&&m.type==='G1').every(m=>m.to.B===0));
 if(process.env.F1_GCODE_OUT) fs.writeFileSync(process.env.F1_GCODE_OUT,r.program);
 console.log('F1 simulation',JSON.stringify({points:r.points,moves:p.moves.length,seconds:p.total,warnings:check.warns.map(w=>({level:w.level,text:w.text})),generatorWarnings:r.warnings}));
});
test('model quarter turns and scale are shared by preview and G-code',()=>{
 const identity=gen.identityRotation();
 const original=gen.previewGeometry(fixture);
 for(const axis of [0,1,2]) {
  let rotation=identity;
  for(let i=0;i<4;i++) rotation=gen.rotateModel(rotation,axis,1);
  assert.equal(JSON.stringify(rotation),JSON.stringify(identity));
  const reverse=gen.rotateModel(gen.rotateModel(identity,axis,1),axis,-1);
  assert.equal(JSON.stringify(reverse),JSON.stringify(identity));
 }
 const rotation=gen.rotateModel(identity,0,1);
 const preview=gen.previewGeometry(fixture,rotation,.5);
 [25,20,50].forEach((v,k)=>assert.ok(Math.abs(preview.size[k]-v)<.001));
 const result=build({rotation,scale:.5,stock:[50,80,100]});
 assert.ok(Math.abs(result.part.x1-result.part.x0-preview.size[1])<.001);
 assert.ok(Math.abs(result.part.z1-result.part.z0-preview.size[2])<.001);
 assert.notEqual(result.program,build().program);
 assert.equal(original.axis,1);
 for(const axis of [1,2]) {
  const tilted=gen.rotateModel(identity,axis,1);
  assert.notEqual(gen.previewGeometry(fixture,tilted).axis,1);
  assert.throws(()=>build({rotation:tilted}),/Поверните модель/);
 }
 assert.throws(()=>build({scale:0}),/Масштаб/);
 assert.throws(()=>gen.previewGeometry(fixture,identity,NaN),/Масштаб/);
});


test('transverse curved bore is cut at B90 before outer profile, with guarded topology',()=>{
 const text=transverseFixture(),m=new gen.Model(text),shape=m.build();
 assert.equal(shape.axis,1);
 assert.equal(shape.secondaryContours.length,1);
 assert.equal(shape.secondaryContours[0].contour.length,1);
 assert.equal(shape.secondaryContours[0].contour[0][0].closed,true);
 const r=gen.buildProgram(text,'transverse.stp',options({stock:[50,140,60]}));
 assert.equal(r.secondary,1);
 assert.equal(r.holes,1);
 assert.match(r.program,/SECONDARY CUT: STEP faces #135 B=90.000 before outer profile/);
 assert.ok(r.program.indexOf('SECONDARY CUT')<r.program.indexOf('corner entry, upper first'));
 assert.deepEqual([...r.program.matchAll(/^G00 B([-\d.]+)/gm)].map(m=>+m[1]),[0,90,0,0]);
 const simR=sim.parseGcode(r.program);
 const check=sim.analyse(simR,{...simR.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
 assert.throws(()=>gen.buildProgram(text.replace("ADVANCED_FACE('',(#26,#129)","ADVANCED_FACE('',(#26)"),'incomplete.stp',options()),/нужны две граничные/);
 assert.throws(()=>gen.buildProgram(text,'pair.stp',options({pair:true})),/Дополнительные направления/);
 assert.throws(()=>gen.buildProgram(transverseFixture(0,12),'twisted.stp',options()),/образующие|не совпадает/);
});
test('secondary contour joins multiple open ruled faces into one closed cut',()=>{
 const text=twoFaceTransverseFixture(),m=new gen.Model(text),shape=m.build();
 assert.equal(shape.secondaryContours.length,1);
 assert.equal(shape.secondaryContours[0].contour.length,2);
 assert.ok(shape.secondaryContours[0].contour.every(([f])=>!f.closed));
 const r=gen.buildProgram(text,'multi-patch.stp',options());
 assert.equal(r.secondary,1);assert.equal(r.holes,1);
 assert.match(r.program,/SECONDARY CUT: STEP faces #135, #161 B=90\.000/);
 assert.ok(r.program.indexOf('SECONDARY CUT')<r.program.indexOf('corner entry, upper first'));
 const p=sim.parseGcode(r.program),check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
});
test('transverse straight generators support non-right-angle table rotations',()=>{
 const text=transverseFixture(4);
 const r=gen.buildProgram(text,'diagonal.stp',options());
 const match=r.program.match(/SECONDARY CUT:.*B=(\d+\.\d+)/);
 assert.ok(match,r.program);
 const angle=+match[1];assert.ok(angle>85&&angle<90);
 const op=new gen.Model(text).build().secondaryContours[0],rad=angle*Math.PI/180;
 // Inverse-rotate a machine wire to the STEP frame and compare its direction.
 const wire=[-Math.sin(rad),-Math.cos(rad)],cross=wire[0]*op.dir[1]-wire[1]*op.dir[0];
 assert.ok(Math.abs(cross)<.0001,'wire direction matches the ruled face in simulator coordinates');
 const inverse=gen.buildProgram(text,'diagonal-inverted.stp',options({invB:true}));
 const inverseAngle=+inverse.program.match(/SECONDARY CUT:.*B=(-?\d+\.\d+)/)[1];
 assert.ok(Math.abs(inverseAngle+angle)<.001);
 const p=sim.parseGcode(inverse.program),check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:true,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
});
test('sloping secondary end face: intersect actual STEP face, not X constant',()=>{
 let text=transverseFixture();
 for(const [id,x] of [[9,49],[11,51],[13,49],[15,51]]) {
  const re=new RegExp('(#'+id+" = CARTESIAN_POINT\\('',\\()50\\.");
  assert.match(text,re);
  text=text.replace(re,'$1'+x+'.');
 }
 for(let id=110;id<=116;id++) {
  const re=new RegExp('(#'+id+" = CARTESIAN_POINT\\('',\\()50\\.");
  assert.match(text,re);
  text=text.replace(re,'$1'+'52.');
 }
 text=text.replace("#121 = VERTEX_POINT('',#110);",
  "#140 = CARTESIAN_POINT('',(50.,-5.,20.));\n#121 = VERTEX_POINT('',#140);");
 const m=new gen.Model(text),build=m.build();
 assert.equal(build.secondaryContours.length,1);
 const face=build.secondaryContours[0].contour[0][0];
 const xs=[];
 for(let i=0;i<=50;i++)xs.push(face.B(face.t0+(face.t1-face.t0)*i/50)[0]);
 assert.ok(Math.max(...xs)-Math.min(...xs)>.5,'slanted end curve varies in X');
 const r=gen.buildProgram(text,'sloped.stp',options());
 assert.equal(r.secondary,1);
 assert.match(r.program,/SECONDARY CUT:.*B=90\.000/);
 const parsed=sim.parseGcode(r.program),check=sim.analyse(parsed,{...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
});
test('external F2: two-direction path and safe tower motions',{skip:!process.env.F2_STEP},()=>{
 const text=fs.readFileSync(process.env.F2_STEP,'utf8');
 const model=new gen.Model(text),shape=model.build();
 assert.equal(shape.axis,1);
 assert.equal(shape.secondaryContours.length,1);
 const r=gen.buildProgram(text,'F2.stp',options({stock:[50,325,240],bottomZ:0,clearance:10,trim:false}));
 assert.equal(r.secondary,1);
 assert.match(r.program,/SECONDARY CUT:.* B=90\.000/);
 assert.ok(r.program.indexOf('SECONDARY CUT')<r.program.indexOf('corner entry, upper first'));
 const p=sim.parseGcode(r.program),check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
 if(process.env.F2_GCODE_OUT)fs.writeFileSync(process.env.F2_GCODE_OUT,r.program);
});

function checkProfileOverlap(program, expectedDirection = 1, requireRise = true) {
 const lines=program.split(/\r?\n/),i=lines.findIndex(line=>line.includes('corner entry, upper first'));
 assert.ok(i>=0);
 const count=+lines[i].match(/PROFILE: (\d+) points/)[1];
 const moves=lines.slice(i+1).filter(line=>/^G01 /.test(line));
 const coords=line=>Object.fromEntries([...line.matchAll(/([XYZA])(-?\d+(?:\.\d+)?)/g)].map(m=>[m[1],+m[2]]));
 let points=moves.map(coords);
 if(/entry\/exit Z\+5 mm/.test(lines[i])) {
  // The entry mirrors the exit: first G01 runs 5 mm above the corner, then drops onto it.
  const [above,corner]=points;
  assert.ok(Math.abs(above.X-corner.X)<.03 && Math.abs(above.Z-corner.Z)<.03,'drop onto the corner is vertical');
  assert.ok(Math.abs(above.Y-corner.Y-5*expectedDirection)<.03 && Math.abs(above.A-corner.A-5*expectedDirection)<.03,'entry is 5 mm above the corner');
  points=points.slice(1);
 }
 const start=points[0],closed=points[count-1];
 for(const axis of ['X','Y','Z','A']) assert.ok(Math.abs(start[axis]-closed[axis])<.03,'contour returns to entry '+axis);
 const exit=points[count],outside=points[count+(expectedDirection?1:0)];
 if(expectedDirection) {
  assert.ok(Math.abs(exit.X-start.X)<.03 && Math.abs(exit.Z-start.Z)<.03);
  assert.ok(Math.abs(exit.Y-start.Y-5*expectedDirection)<.03 && Math.abs(exit.A-start.A-5*expectedDirection)<.03,'exit crosses entry by 5 mm');
 }
 assert.ok(Math.abs(outside.Y-start.Y-5*expectedDirection)<.03 && Math.abs(outside.A-start.A-5*expectedDirection)<.03,'horizontal exit');
 const approach=coords(lines.slice(i+1).find(line=>/^G00 /.test(line)));
 assert.ok(Math.abs(outside.X-approach.X)<.03 && Math.abs(outside.Z-approach.Z)<.03,'exit reaches the entry corridor');
 const upper=points.slice(1,Math.min(count,35)).map(p=>(p.Y+p.A)/2);
 if(requireRise) assert.ok(Math.max(...upper)>(start.Y+start.A)/2+2,'first contour branch goes upwards');
}
test('outer profile leaves its upper corner 5 mm upwards',()=>{
 checkProfileOverlap(build({trim:false}).program,1,false);
});
test('external F2: upper branch first and exit through entry slit',{skip:!process.env.F2_STEP},()=>{
 const text=fs.readFileSync(process.env.F2_STEP,'utf8');
 const r=gen.buildProgram(text,'F2.stp',options({stock:[50,325,240],bottomZ:0,clearance:10,trim:false}));
 checkProfileOverlap(r.program,0);
 const p=sim.parseGcode(r.program),check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
});

test('pair preview uses the same height and gap as generated toolpaths',()=>{
 const geometry=gen.previewGeometry(fixture), placement=gen.previewPair(geometry,100,10,1);
 const result=build(options({pair:true,stock:[50,140,100],bottomZ:10,kerf:1}));
 assert.ok(placement.minimumHeight<=100);
 assert.ok(placement.zUpper>placement.zLower);
 assert.match(result.program,/PROFILE 1\/2: UPPER MIRRORED PIECE/);
 assert.throws(()=>build(options({pair:true,stock:[50,140,placement.minimumHeight-.1],bottomZ:10,kerf:1})),/Пара не помещается/);
});
test('pair upper body stays 5 mm below stock top for different kerfs and stock heights',()=>{
 const geometry=gen.previewGeometry(fixture);
 const minZ=Math.min(...geometry.sampled.flat().flatMap(pair=>pair.map(point=>point[2])));
 for(const kerf of [0.5,1,2]) for(const height of [100,110]) {
  const bottom=10, placement=gen.previewPair(geometry,height,bottom,kerf);
  const upperBodyTop=placement.zUpper-(minZ-geometry.center[2]);
  assert.ok(Math.abs(bottom+height-upperBodyTop-5)<1e-8);
 }
});


test('pair enters from opposite sides and exits upwards for both pieces',()=>{
 const r=build({pair:true,stock:[50,140,100]});
 const upper=r.program.split('; *** PROFILE 1/2: UPPER MIRRORED PIECE ***')[1].split('; *** PROFILE 2/2: LOWER ORIGINAL PIECE ***')[0];
 const lower=r.program.split('; *** PROFILE 2/2: LOWER ORIGINAL PIECE ***')[1];
 checkProfileOverlap(upper,1,false);checkProfileOverlap(lower,1,false);
 const cuts=section=>section.split(/\r?\n/).filter(l=>/^G01 /.test(l));
 const x=line=>+line.match(/X(-?\d+(?:\.\d+)?)/)[1];
 assert.ok(x(cuts(upper)[0])<0,'upper enters from left');
 assert.ok(x(cuts(lower)[0])>0,'lower enters from right');
 const parsed=sim.parseGcode(r.program), check=sim.analyse(parsed,{...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
});

test('oblique ruled main surface is identified by end-cap topology',()=>{
 const swept=fixture.replace(/(CARTESIAN_POINT\('',\()\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)(\)\))/g,
  (_,prefix,x,y,z,suffix)=>prefix+(+x+(+y)*.12)+','+y+','+z+suffix);
 const m=new gen.Model(swept),shape=m.build();
 assert.equal(shape.axis,1);assert.equal(shape.secondaryContours.length,0);
 assert.doesNotThrow(()=>gen.buildProgram(swept,'oblique.stp',options()));
});
test('external stab2: synchronized STEP sections and kerf-aware simulation',{skip:!process.env.STAB2_STEP},()=>{
 const text=fs.readFileSync(process.env.STAB2_STEP,'utf8');
 const shape=new gen.Model(text).build();
 assert.equal(shape.axis,1);assert.equal(shape.secondaryContours.length,0);
 const faces=shape.outer.map(([face])=>face), synchronized=faces.filter(f=>f.breaks?.length);
 assert.ok(synchronized.length>0,'surface section anchors are present');
 for(const face of synchronized){
  const sampled=gen.sampleFace(face,face.t0,face.t1,.01,1);
  for(const t of face.breaks){
   const a=face.A(t),b=face.B(t);
   assert.ok(sampled.some(pair=>Math.hypot(...a.map((x,i)=>x-pair[0][i]))<1e-6 && Math.hypot(...b.map((x,i)=>x-pair[1][i]))<1e-6),'both rails include each STEP section simultaneously');
  }
 }
 const r=gen.buildProgram(text,'stab2.stp',options({stock:[305,230,50],bottomZ:10,kerf:1,trim:false}));
 const p=sim.parseGcode(r.program),check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
 assert.ok(r.points>100);assert.ok(r.warnings.some(w=>w.includes('не дойдёт до вершины')));
});

test('external F1-1: resolve the closed seam before checking ruled-surface accuracy',{skip:!process.env.F11_STEP},()=>{
 const text=fs.readFileSync(process.env.F11_STEP,'utf8');
 // The actual cross-edge parameters are on a different scale from the
 // surface; the geometry-based seam resolver must reach the accuracy check.
 const preview=gen.previewGeometry(text);
 assert.equal(preview.diagnosticOnly,true);
 assert.match(preview.previewError,/Грань #1807: синхронная струна отклоняется от STEP-поверхности/);
 assert.throws(()=>new gen.Model(text).build(),/Грань #1807: синхронная струна отклоняется от STEP-поверхности/);
});

test('external F1-1: explicit 0.6 mm tolerance, tower travel and simulation',{skip:!process.env.F11_STEP},()=>{
 const text=fs.readFileSync(process.env.F11_STEP,'utf8');
 const rotation=gen.rotateModel(gen.identityRotation(),2,1);
 const o=options({rotation,tolerance:.6,stock:[55,145,135],bottomZ:50,clearance:20,trim:false});
 const geometry=gen.previewGeometry(text,rotation,1,.6);assert.equal(geometry.axis,1);
 const r=gen.buildProgram(text,'F1-1.stp',o);
 assert.match(r.program,/STEP TOLERANCE=0\.600 mm/);
 assert.ok(r.warnings.some(w=>w.includes('Допуск поверхности 0.60')));
 const p=sim.parseGcode(r.program),check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
 assert.ok(p.moves.length>100);assert.ok(p.moves.every(m=>Math.abs(m.to.X)<=245 && Math.abs(m.to.Z)<=245 && Math.min(m.to.Y,m.to.A)>=0 && Math.max(m.to.Y,m.to.A)<=250));
});
test('surface deviation tolerance must be finite and nonnegative',()=>{
 assert.throws(()=>gen.previewGeometry(fixture,gen.identityRotation(),1,-.1),/Допуск/);
 assert.throws(()=>gen.buildProgram(fixture,'invalid.stp',options({tolerance:NaN})),/Допуск/);
});

test('automatic placement returns normally validated G-code with shared stock offset',()=>{
 const opts=options({stock:[80,160,100],bottomZ:10,trim:false,
   rotation:gen.identityRotation(),powerComp:false});
 const placed=gen.autoPlace(fixture,'synthetic.stp',opts);
 assert.equal(placed.offset.length,3);
 assert.ok(placed.offset.every(Number.isFinite));
 assert.ok(placed.offset.every(value=>value%5===0));
 assert.ok(placed.displacement>=0);
 const normal=gen.buildProgram(fixture,'synthetic.stp',{...opts,offset:placed.offset});
 assert.equal(placed.program,normal.program);
 const decoded=sim.parseGcode(placed.program);
 assert.ok(decoded.moves.every(move=>Math.min(move.to.Y,move.to.A)>=5 &&
   Math.max(move.to.Y,move.to.A)<=gen.CONFIG.VerticalTravel-5));
 assert.equal(decoded.stock.OX,placed.offset[0]);
 assert.equal(decoded.stock.OY,placed.offset[1]);
 assert.equal(decoded.stock.OZ,placed.offset[2]);
 const chk=sim.analyse(decoded,{...decoded.stock,FW:370,HT:490,VT:250,
   angle:45,invB:false,laser:false});
 assert.equal(chk.warns.filter(w=>w.level==='crit').length,0);
});

test('F1-1 automatic positioning finds feasible shift on real STEP', {skip:!process.env.F11_STEP},()=>{
 const step=fs.readFileSync(process.env.F11_STEP,'utf8');
 const opts=options({stock:[100,145,135],bottomZ:40,clearance:20,
   tolerance:.6,trim:false,powerComp:false,
   rotation:gen.rotateModel(gen.identityRotation(),2,1)});
 assert.throws(()=>gen.buildProgram(step,'F1-1.stp',{...opts,offset:[0,0,0]}),
   /Перемещение выходит за ход кареток/);
 const result=gen.autoPlace(step,'F1-1.stp',{...opts,grounded:true});
 assert.ok(Math.hypot(...result.offset)>0);
 assert.ok(result.offset.every(value=>value%5===0));
 const preferred=gen.autoPlace(step,'F1-1.stp',{...opts,grounded:true,keepHeight:true,preferNegativeX:true});
 assert.ok(preferred.offset[0]<0);
 assert.equal(preferred.offset[2],0);
 const unchanged=gen.groundPlacement(step,'F1-1.stp',opts,preferred);
 assert.equal(unchanged.stock[2],opts.stock[2]);
 const grounded=gen.groundPlacement(step,'F1-1.stp',opts,result);
 assert.equal(grounded.offset[2],0);
 assert.equal(grounded.stock[2],opts.stock[2]+result.offset[2]);
 assert.equal(grounded.modelZOffset,result.offset[2]/2);
 assert.equal(grounded.stock[2]/2-grounded.modelZOffset,opts.stock[2]/2);
 const groundedResult=gen.buildProgram(step,'F1-1.stp',{...opts,...grounded});
 const originalCut=sim.parseGcode(result.program).moves.filter(move=>move.type==='G1');
 const groundedCut=sim.parseGcode(groundedResult.program).moves.filter(move=>move.type==='G1');
 assert.deepEqual(JSON.parse(JSON.stringify(groundedCut.map(move=>move.to))),JSON.parse(JSON.stringify(originalCut.map(move=>move.to))));
 const groundedProgram=sim.parseGcode(groundedResult.program);
 assert.equal(groundedProgram.stock.Z0,opts.bottomZ);
 assert.equal(groundedProgram.stock.OZ,0);
 assert.equal(groundedProgram.stock.H,grounded.stock[2]);
 const groundedCheck=sim.analyse(groundedProgram,{...groundedProgram.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(groundedCheck.warns.filter(w=>w.level==='crit').length,0);
 assert.throws(()=>gen.groundPlacement(step,'F1-1.stp',opts,{...result,offset:[0,0,-5]}),/отрицательного подъёма/);
 assert.throws(()=>gen.groundPlacement(step,'F1-1.stp',opts,{...result,offset:[0,0,100]}),/пределы станка|хода каретки|высота/i);
 const smooth=gen.buildProgram(step,'F1-1.stp',{...opts,offset:result.offset}).smoothSurface;
 assert.ok(smooth && smooth.towers.length>2);
 assert.equal(smooth.x0,result.offset[0]-opts.stock[0]/2);
 assert.equal(smooth.x1,result.offset[0]+opts.stock[0]/2);
 assert.ok(smooth.towers.flat(2).every(Number.isFinite));
 const three=require('../lib/three.min.js');
 for(const x of [smooth.x0,smooth.x1]){
   const fraction=(x+smooth.fieldWidth/2)/smooth.fieldWidth;
   const boundary=smooth.towers.map(pair=>new three.Vector2(
     pair[0][0]+fraction*(pair[1][0]-pair[0][0]),
     pair[0][1]+fraction*(pair[1][1]-pair[0][1])));
   if(boundary[0].distanceTo(boundary.at(-1))<0.01)boundary.pop();
   assert.ok(three.ShapeUtils.triangulateShape(boundary,[]).length>0);
 }
 const p=sim.parseGcode(result.program),check=sim.analyse(p,{
   ...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.ok(p.moves.every(move=>Math.min(move.to.Y,move.to.A)>=5 &&
   Math.max(move.to.Y,move.to.A)<=gen.CONFIG.VerticalTravel-5));
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,
   JSON.stringify(check.warns.filter(w=>w.level==='crit')));
});

test('automatic placement rejects a stock setup without the vertical travel margin',()=>{
 const opts=options({stock:[80,160,240],bottomZ:0,clearance:10,trim:false,
   rotation:gen.identityRotation(),powerComp:false});
 assert.throws(()=>gen.autoPlace(fixture,'synthetic.stp',opts),
   /Не найдено смещение|фиксированный ход выходит за пределы станка/);
});

test('negative X preference falls back when the stock fills the tower width',()=>{
 const opts=options({stock:[370,160,100],bottomZ:10,trim:false,grounded:true,keepHeight:true,powerComp:false});
 assert.throws(()=>gen.autoPlace(fixture,'synthetic.stp',{...opts,preferNegativeX:true}),/Не найдено|пределы станка/);
 const placement=gen.autoPlace(fixture,'synthetic.stp',opts);
 assert.equal(Math.abs(placement.offset[0]),0);
 assert.equal(placement.offset[2],0);
});

test('model height offset must fit the stock and unsupported pair modes are rejected',()=>{
 assert.throws(()=>build(options({stock:[80,160,100],modelZOffset:100})),/не помещается по высоте/i);
 assert.throws(()=>build(options({stock:[80,160,100],modelZOffset:5,pair:true})),/только для одиночной детали/i);
});

test('stock and model translate together inside machine envelope',()=>{
 const base=build({stock:[80,160,100],bottomZ:10,trim:false}), shifted=build({stock:[80,160,100],bottomZ:10,trim:false,offset:[0,5,5]});
 assert.match(shifted.program,/STOCK\+MODEL OFFSET X=0 Y=5 Z=5 mm/);
 assert.match(shifted.program,/OX=0 OY=5 OZ=5/);
 const contour=r=>sim.parseGcode(r.program.split('corner entry, upper first')[1]).moves.filter(m=>m.type==='G1').slice(0,12);
 const a=contour(base),b=contour(shifted);assert.equal(a.length,b.length);
 for(let i=0;i<a.length;i++)for(const axis of ['X','Y','Z','A'])assert.ok(Math.abs(b[i].to[axis]-a[i].to[axis]-5)<.03,axis);
 // Offset no longer changes model/stock fit; only machine travel can reject it.
 assert.doesNotThrow(()=>build({stock:[80,160,100],offset:[20,0,0],trim:false}));
 assert.throws(()=>build({stock:[80,160,100],offset:[150,0,0],trim:false}),/физические пределы/);
 assert.doesNotThrow(()=>build({stock:[80,160,100],offset:[5,0,0],trim:true}));
 assert.throws(()=>build({stock:[80,160,100],offset:[5,0,0],pair:true,trim:false}),/Смещение пока/);
});

test('external F1-1 offset toward tower fixes travel limits',{skip:!process.env.F11_STEP},()=>{
 const text=fs.readFileSync(process.env.F11_STEP,'utf8'),rotation=gen.rotateModel(gen.identityRotation(),2,1);
 const opts=options({rotation,tolerance:.6,stock:[100,145,135],bottomZ:40,clearance:20,trim:false,powerComp:false});
 assert.throws(()=>gen.buildProgram(text,'F1-1.stp',opts),/ход кареток/);
 const result=gen.buildProgram(text,'F1-1.stp',{...opts,offset:[-25,0,0]});
 assert.match(result.program,/STOCK\+MODEL OFFSET X=-25 Y=0 Z=0/);
 const p=sim.parseGcode(result.program),check=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
});

test('solid STEP keeps separate guide curves and refuses incomplete G-code',()=>{
 const extra=[
  "#900001 = CARTESIAN_POINT('',(0.,0.,0.));",
  "#900002 = CARTESIAN_POINT('',(10.,0.,0.));",
  "#900003 = B_SPLINE_CURVE_WITH_KNOTS ('guide',1,(#900001,#900002),.UNSPECIFIED.,.F.,.F.,(2,2),(0.,1.),.UNSPECIFIED.);",
  "#900004 = GEOMETRIC_CURVE_SET ('guides',(#900003));"
 ].join('\n');
 const idx=fixture.lastIndexOf('ENDSEC;');
 assert.ok(idx>0);
 const solidWithCurves=fixture.slice(0,idx)+extra+'\n'+fixture.slice(idx);
 const model=new gen.Model(solidWithCurves);
 assert.equal(model.wireframe,false);
 const curves=model.auxiliaryCurves();
 assert.equal(curves.length,1);
 assert.equal(curves[0].id,900003);
 assert.equal(curves[0].fixedAxis,1);
 assert.equal(curves[0].closed,false);
 assert.ok(Math.abs(curves[0].points.at(-1)[0]-10)<1e-6);
 const preview=gen.previewGeometry(solidWithCurves);
 assert.equal(preview.auxiliaryCurves.length,1);
 assert.equal(preview.guideAnalysis.count,1);
 assert.equal(preview.guideAnalysis.pairs.length,0);
 assert.equal(preview.guideAnalysis.ambiguous.length,1);
 assert.equal(preview.guideKinematics.operations.length,0);
 assert.equal(preview.guideKinematics.safeForGcode,false);
 assert.throws(()=>gen.buildProgram(solidWithCurves,'solid-guides.stp',options()),
  /вспомогательных кривых.*Станочный G-code для F4 пока запрещён/);
});
test('external F4-1: retains all four design B-splines without unsafe G-code',
 {skip:!process.env.F4_STEP},()=>{
 const step=fs.readFileSync(process.env.F4_STEP,'utf8');
 const m=new gen.Model(step),curves=m.auxiliaryCurves();
 assert.equal(m.wireframe,false);
 assert.equal(curves.length,4);
 assert.deepEqual(Array.from(curves,c=>c.fixedAxis).sort(),[0,0,1,1]);
 const groups=m.guideAnalysis();
 assert.equal(groups.pairs.length,2);
 assert.equal(groups.ambiguous.length,0);
 assert.deepEqual(groups.pairs.map(p=>p.ids),[[544,681],[197,406]]);
 assert.ok(groups.pairs.every(p=>p.span>1));
 const motion=m.guideKinematics(gen.CONFIG.FieldWidth);
 assert.equal(motion.operations.length,2);
 assert.deepEqual(motion.operations.map(p=>p.angle).sort(),[0,90]);
 assert.ok(motion.operations.every(p=>p.samples.length>=128));
 assert.ok(motion.operations.every(p=>p.samples.every(s=>[...s.left,...s.right].every(Number.isFinite))));
 assert.equal(motion.safeForGcode,false);
 assert.equal(motion.origin.length,3);
 assert.ok(motion.operations.every(op=>Math.abs(op.transverseCenter-motion.origin[op.axis===1?0:1])<1e-9));
 assert.throws(()=>gen.buildProgram(step,'F4-1.stp',options()),
  /вспомогательных кривых.*Станочный G-code для F4 пока запрещён/);
});

test('paired planar STEP guides extrapolate to both towers at B0 without releasing G-code',()=>{
 const extra=[
  "#900001 = CARTESIAN_POINT('',(0.,0.,0.));",
  "#900002 = CARTESIAN_POINT('',(10.,0.,0.));",
  "#900003 = CARTESIAN_POINT('',(0.,25.,0.));",
  "#900004 = CARTESIAN_POINT('',(10.,25.,0.));",
  "#900005 = B_SPLINE_CURVE_WITH_KNOTS ('guide',1,(#900001,#900002),.UNSPECIFIED.,.F.,.F.,(2,2),(0.,1.),.UNSPECIFIED.);",
  "#900006 = B_SPLINE_CURVE_WITH_KNOTS ('guide',1,(#900003,#900004),.UNSPECIFIED.,.F.,.F.,(2,2),(0.,1.),.UNSPECIFIED.);",
  "#900007 = GEOMETRIC_CURVE_SET ('guides',(#900005,#900006));"
 ].join('\n');
 const idx=fixture.lastIndexOf('ENDSEC;');
 const step=fixture.slice(0,idx)+extra+'\n'+fixture.slice(idx);
 const m=new gen.Model(step),motion=m.guideKinematics(370);
 assert.equal(motion.operations.length,1);
 const op=motion.operations[0];
 assert.equal(op.angle,0);
 assert.equal(op.samples.length,129);
 assert.equal(op.fitsHorizontalTravel,true);
 assert.equal(op.fitsVerticalTravel,true);
 assert.ok(op.requiredVerticalTravel>=0);
 assert.ok(op.samples.every(p=>Math.abs(p.left[0]-p.right[0])<1e-7));
 assert.ok(op.samples.every(p=>Math.abs(p.left[1]-p.right[1])<1e-7));
 assert.equal(motion.safeForGcode,false);
});

test('external F4-11 ambiguous BREP must still preview model edges and selectable curves',
 {skip:!process.env.F4_11_STEP},()=>{
 const step=fs.readFileSync(process.env.F4_11_STEP,'utf8');
 const g=gen.previewGeometry(step);
 assert.match(g.previewError,/Углы грани.*не соединены боковым ребром/);
 assert.ok(g.edgeLines.length>0,'BREP edge skeleton must remain visible');
 assert.deepEqual(Array.from(g.auxiliaryCurves,c=>c.id),[197,337,544,681,694,707]);
 assert.ok(g.size.every(v=>Number.isFinite(v)&&v>0));
 assert.equal(g.diagnosticOnly,true);
 const motion=gen.manualGuideDiagnostics(step,[[197,544],[337,681]],{
  stock:[100,300,180],bottomZ:5,samples:128
 });
 assert.equal(motion.operations.length,2);
 assert.deepEqual(Array.from(motion.operations,x=>x.angle),[0,90]);
 assert.ok(motion.operations.every(x=>x.samples.length===129));
 assert.ok(motion.operations.every(x=>x.samples.every(p=>
  [...p.left,...p.right].every(Number.isFinite))));
 assert.equal(motion.operations[0].correspondence.reverse,false);
 assert.equal(motion.operations[0].correspondence.shift,0);
 assert.equal(motion.operations[0].correspondence.shapeRms,0);
 assert.ok(motion.operations[1].correspondence.shapeRms>=0);
 const last=motion.operations[1].samples.at(-1),first=motion.operations[1].samples[0];
 assert.ok(Math.hypot(...first.profileA.map((v,k)=>v-last.profileA[k]))<1e-5);
 assert.ok(Math.hypot(...first.profileB.map((v,k)=>v-last.profileB[k]))<1e-5);

 assert.equal(motion.approvedForGcode,false);
 assert.ok(motion.operations.every(op=>op.entryExit.approvedForGcode===false));
 assert.ok(motion.operations.every(op=>op.entryExit.entry.candidates.length===3));
 assert.ok(motion.operations.every(op=>op.entryExit.exit.candidates.length===3));
 assert.ok(motion.operations.every(op=>op.entryExit.entry.hasClearRapid===false));
 assert.ok(motion.operations.every(op=>op.entryExit.exit.hasClearRapid===false));

 assert.throws(()=>gen.buildProgram(step,'F4-11.stp',options()),/Ручных подтверждённых пар не передано/);
 assert.throws(()=>gen.buildProgram(step,'F4-11.stp',options({
  manualGuidePairs:[[197,544],[337,681]]
 })),/Принято ручных пар: 2.*Станочный G-code для F4 пока запрещён/);
 assert.throws(()=>gen.buildProgram(step,'F4-11.stp',options({
  manualGuidePairs:[[197,544],[544,681]]
 })),/используется повторно/);
 assert.throws(()=>gen.buildProgram(step,'F4-11.stp',options({
  manualGuidePairs:[[197,337]]
 })),/геометрически несовместима/);
});


test('manual guide kinematics returns left/right tower samples but never releases machine code',()=>{
 const extra=[
  "#910001 = CARTESIAN_POINT('',(0.,-30.,10.));",
  "#910002 = CARTESIAN_POINT('',(15.,-30.,20.));",
  "#910003 = CARTESIAN_POINT('',(0.,30.,10.));",
  "#910004 = CARTESIAN_POINT('',(15.,30.,20.));",
  "#910005 = B_SPLINE_CURVE_WITH_KNOTS ('guide',1,(#910001,#910002),.UNSPECIFIED.,.F.,.F.,(2,2),(0.,1.),.UNSPECIFIED.);",
  "#910006 = B_SPLINE_CURVE_WITH_KNOTS ('guide',1,(#910003,#910004),.UNSPECIFIED.,.F.,.F.,(2,2),(0.,1.),.UNSPECIFIED.);",
  "#910007 = GEOMETRIC_CURVE_SET ('guides',(#910005,#910006));"
 ].join('\n');
 const idx=fixture.lastIndexOf('ENDSEC;');
 const step=fixture.slice(0,idx)+extra+'\n'+fixture.slice(idx);
 const path=gen.manualGuideDiagnostics(step,[[910005,910006]],{
  stock:[100,200,70],bottomZ:10,clearance:15,samples:32
 });
 assert.equal(path.schema,'foam-wire-f4-diagnostic-motion-v1');
 assert.equal(path.approvedForGcode,false);
 assert.equal(path.operations.length,1);
 const op=path.operations[0];
 assert.equal(op.angle,0);assert.equal(op.samples.length,33);
 const reverse=gen.manualGuideDiagnostics(step,[[910005,910006]],{
  stock:[100,200,70],bottomZ:10,clearance:15,samples:32,
  guideStarts:{'910005:910006':1}
 });
 assert.equal(reverse.operations[0].startU,1);
 assert.equal(reverse.operations[0].reverseA,true);
 assert.deepEqual(JSON.parse(JSON.stringify(reverse.operations[0].samples[0].profileA)),
  JSON.parse(JSON.stringify(op.samples.at(-1).profileA)));
 assert.ok(op.samples.every(p=>[...p.left,...p.right].every(Number.isFinite)));
 assert.ok(op.samples.every(p=>Math.abs(p.left[0]-p.right[0])<1e-6));
 assert.equal(op.approvedForGcode,false);
 assert.throws(()=>gen.manualGuideDiagnostics(step,[[910005,910005]]),/повторное назначение/);
 assert.throws(()=>gen.buildProgram(step,'guides.stp',options({
  manualGuidePairs:[[910005,910006]]
 })),/Станочный G-code для F4 пока запрещён/);
});


test('guide matcher resolves reversed open profile and shifted closed seam',()=>{
 const mk=(id,points,closed)=>({id,points,closed,fixedAxis:1});
 const openA=mk(1,[[0,0,0],[10,0,4],[13,0,10],[22,0,3]],false);
 const openB=mk(2,[[22,50,3],[13,50,10],[10,50,4],[0,50,0]],false);
 const open=gen.matchGuideCurves(openA,openB);
 assert.equal(open.correspondence.reverse,true);
 assert.equal(open.correspondence.shift,0);
 assert.ok(open.correspondence.shapeRms<1e-6);
 const pa=[[0,0,0],[20,0,0],[17,0,8],[1,0,12],[0,0,0]];
 const pb=[[17,50,8],[1,50,12],[0,50,0],[20,50,0],[17,50,8]];
 const closed=gen.matchGuideCurves(mk(3,pa,true),mk(4,pb,true));
 assert.ok(closed.correspondence.shapeRms<1);
 const start=closed.at(mk(4,pb,true),closed.mapB(0));
 const end=closed.at(mk(4,pb,true),closed.mapB(1));
 assert.ok(Math.hypot(...start.map((v,k)=>v-end[k]))<1e-6);
});


test('F4 entry/exit inspection distinguishes clear rapid from sweep through uncut stock',()=>{
 const pt=(x,z)=>({left:[x,z],right:[x,z]});
 const clear=gen.inspectGuideEntryExit([pt(100,80),pt(110,90)],[80,120,10,50],{clearance:15});
 assert.equal(clear.entry.candidates[0].route,'ABOVE_STOCK');
 assert.equal(clear.entry.candidates[0].rapidTravelAllowed,true);
 assert.equal(clear.exit.candidates[0].rapidTravelAllowed,true);
 const buried=gen.inspectGuideEntryExit([pt(100,20),pt(105,25)],[80,120,10,50],{clearance:15});
 assert.equal(buried.entry.hasClearRapid,false);
 assert.equal(buried.exit.hasClearRapid,false);
 assert.ok(buried.entry.candidates.every(c=>c.requiresCuttingLead));
 assert.equal(buried.approvedForGcode,false);
});
test('F4 lead check tests whole angled wire, not just its carriage endpoints',()=>{
 const p=(left,right)=>({left,right});
 // End towers are outside the rectangle, but the wire between them
 // crosses the uncut foam. This must NOT be treated as a safe rapid.
 const path=gen.inspectGuideEntryExit([
  p([50,25],[150,25]),p([51,26],[149,26])
 ],[80,120,10,50],{clearance:10});
 assert.equal(path.entry.candidates[0].intersectsUncutStock,true);
 assert.equal(path.entry.candidates[0].rapidTravelAllowed,false);
});
test('F4 lead checker catches a very thin foam strip between sampled positions',()=>{
 // The wire sweeps horizontally from x=70 to x=130, endpoints remain at
 // z=10 and z=30. Foam is only 0.06 mm wide at x=100: 64 samples miss it.
 const a={left:[70,10],right:[70,30]};
 const b={left:[130,10],right:[130,30]};
 const r=gen.inspectGuideEntryExit([b,b],[100,100.06,15,25],
   {clearance:15});
 // The above-stock lead to x=130 does not cross foam. The independent
 // full-sweep function is exercised by the side candidate from x≈98 to x=130.
 const left=r.entry.candidates.find(c=>c.route==='OUTSIDE_LEFT');
 assert.equal(left.intersectsUncutStock,true);
 assert.equal(left.status,'CUTTING_LEAD_REQUIRED');
 assert.equal(r.approvedForGcode,false);
});
test('F4 entry/exit rejects out-of-range approach positions',()=>{
 const pt=(x,z)=>({left:[x,z],right:[x,z]});
 const r=gen.inspectGuideEntryExit([pt(100,45),pt(100,44)],
   [80,120,10,240],{clearance:30,vertical:250});
 assert.equal(r.entry.candidates[0].status,'OUT_OF_TRAVEL');
 assert.equal(r.entry.candidates[0].withinMachineTravel,false);
 assert.ok(r.entry.candidates.some(c=>c.status==='CUTTING_LEAD_REQUIRED'));
});


test('stock trim B90 and B0 are distinct machine-frame operations',()=>{
 const stock=[90,170,60];
 for(const angle of [90,0]){
  const r=gen.buildProgram(fixture,'split-profile.stp',options({
    stock,trim:true,trimAngle:angle,cutOrder:'B90_B0'
  }));
  assert.match(r.program,new RegExp('TRIM B='+angle+' ENABLED=1'));
  assert.match(r.program,new RegExp('Rotation B'+angle+' for trimming'));
  assert.match(r.program,/TRIM BLOCK/);
  const rotations=[...r.program.matchAll(/^G00 B([-\d.]+)/gm)].map(x=>Number(x[1]));
  if(angle===90)assert.ok(rotations.includes(90));
  else assert.ok(rotations.every(x=>x===0));
 }
 assert.throws(()=>gen.buildProgram(fixture,'test.stp',options({
  stock,trim:true,trimAngle:45
 })),/Угол торцевания/);
 assert.throws(()=>gen.buildProgram(fixture,'test.stp',options({
  stock,trim:true,cutOrder:'WRONG'
 })),/Порядок должен быть/);
});
test('selected B0/B90 order cannot silently reverse solid secondary operations',()=>{
 const step=transverseFixture();
 const stock=[50,140,60];
 const permitted=gen.buildProgram(step,'test.stp',options({
   stock,cutOrder:'B90_B0',trim:false
 }));
 assert.ok(permitted.program.indexOf('SECONDARY CUT')<permitted.program.indexOf('corner entry, upper first'));
 assert.throws(()=>gen.buildProgram(step,'test.stp',options({
   stock,cutOrder:'B0_B90',trim:false
 })),/наружный профиль B0 может освободить деталь/);
});
test('manual F4 planning follows trim-first and selected B0/B90 order without generating machine instructions',{
 skip:!process.env.F4_11_STEP
},()=>{
 const source=fs.readFileSync(process.env.F4_11_STEP,'utf8');
 const pairIds=[[197,544],[337,681]];
 for(const [cutOrder,expected] of [
  ['B0_B90',[0,90]],['B90_B0',[90,0]]
 ]){
  const plan=gen.manualGuideDiagnostics(source,pairIds,{
   stock:[100,300,180],bottomZ:5,clearance:20,kerf:1,
   trim:true,trimAngle:0,cutOrder
  });
  assert.deepEqual(Array.from(plan.operations,o=>o.angle),expected);
  assert.deepEqual(Array.from(plan.plannedSequence,o=>o.angle),[0,...expected]);
  assert.equal(plan.trimOperation.angle,0);
  assert.equal(plan.approvedForGcode,false);
 }
});


test('sequential hot-wire volume sim updates remaining foam and flags unverified protected solid',()=>{
 const points=i=>({profileA:[i,0,20],profileB:[i,50,20],left:[i,20],right:[i,20]});
 const path=[points(10),points(15),points(20),points(25)];
 const empty={entry:{candidates:[]},exit:{candidates:[]}};
 const make=(angle,shift=0)=>({angle,ids:[angle+1,angle+2],samples:path.map(p=>({
  ...p,profileA:p.profileA.map((v,k)=>k===2?v+shift:v),
  profileB:p.profileB.map((v,k)=>k===2?v+shift:v)
 })),entryExit:empty});
 const op1=make(0),op2=make(90,10);
 const sim=gen.simulateSequentialStockRemoval([op1,op2],[20,25,25],[50,40,50],{
  voxelSize:5,kerf:1,bottomZ:0,trimOperation:null
 });
 assert.equal(sim.operations.length,2);
 assert.ok(op1.sequentialStock.removedVoxels>0);
 assert.ok(op2.sequentialStock.removedVoxels>0);
 assert.ok(sim.remainingVoxels<sim.initialVoxels);
 assert.ok(op1.sequentialStock.remainingVoxels>op2.sequentialStock.remainingVoxels);
 assert.equal(sim.approvedForGcode,false);
 assert.equal(sim.protectedSolidIdentified,false);
 assert.ok(op1.sequentialStock.sparseRemainingPoints.length>0);
});
test('F4 sequential simulation accounts for B0 or B90 trimming BEFORE profile cuts',()=>{
 const op={angle:0,ids:[1,2],samples:[
  {profileA:[-8,-20,10],profileB:[-8,20,10]},
  {profileA:[8,-20,10],profileB:[8,20,10]}
 ],entryExit:{entry:{candidates:[]},exit:{candidates:[]}}};
 const mk=()=>JSON.parse(JSON.stringify(op));
 const untrimmed=gen.simulateSequentialStockRemoval([mk()],[0,0,10],[40,40,20],{voxelSize:4,kerf:1});
 const trimmed=gen.simulateSequentialStockRemoval([mk()],[0,0,10],[40,40,20],{
  voxelSize:4,kerf:1,trimOperation:{angle:0,finishedDimension:20,trimAllowance:9}
 });
 assert.equal(untrimmed.trimmedVoxels,0);
 assert.ok(trimmed.trimmedVoxels>0);
 assert.ok(trimmed.remainingVoxels<untrimmed.remainingVoxels);
 assert.equal(trimmed.approvedForGcode,false);
});


test('guide cut start: closed arbitrary phase, open from either endpoint',()=>{
 const mk=(id,points,closed)=>({id,points,closed,fixedAxis:1});
 const openA=mk(1,[[0,0,5],[20,0,15]],false);
 const openB=mk(2,[[20,50,15],[0,50,5]],false);
 const f=gen.resolveGuideStart(openA,openB,0);
 const r=gen.resolveGuideStart(openA,openB,1);
 assert.equal(f.reverseA,false);
 assert.equal(r.reverseA,true);
 assert.equal(r.mapA(0),1);assert.equal(r.mapA(1),0);
 assert.equal(r.mapB(0),0);assert.equal(r.mapB(1),1);
 const closedA=mk(3,[[0,0,0],[25,0,0],[25,0,25],[0,0,25],[0,0,0]],true);
 const closedB=mk(4,[[0,60,0],[25,60,0],[25,60,25],[0,60,25],[0,60,0]],true);
 const c=gen.resolveGuideStart(closedA,closedB,.375);
 assert.equal(c.startU,.375);
 assert.ok(Math.abs(c.mapA(0)-.375)<1e-9);
 assert.ok(Math.abs(c.mapA(1)-.375)<1e-9);
 assert.ok(Math.abs(c.mapB(0)-c.mapB(1))<1e-9);
 assert.throws(()=>gen.resolveGuideStart(closedA,closedB,NaN),/Начало реза/);
});


test('operator-directed F4 outputs actual G-code with two tower coordinates and user start',()=>{
 const extra=[
  "#910001 = CARTESIAN_POINT('',(0.,-30.,10.));",
  "#910002 = CARTESIAN_POINT('',(15.,-30.,20.));",
  "#910003 = CARTESIAN_POINT('',(0.,30.,10.));",
  "#910004 = CARTESIAN_POINT('',(15.,30.,20.));",
  "#910005 = B_SPLINE_CURVE_WITH_KNOTS ('guide',1,(#910001,#910002),.UNSPECIFIED.,.F.,.F.,(2,2),(0.,1.),.UNSPECIFIED.);",
  "#910006 = B_SPLINE_CURVE_WITH_KNOTS ('guide',1,(#910003,#910004),.UNSPECIFIED.,.F.,.F.,(2,2),(0.,1.),.UNSPECIFIED.);",
  "#910007 = GEOMETRIC_CURVE_SET ('guides',(#910005,#910006));"
 ].join('\n');
 const idx=fixture.lastIndexOf('ENDSEC;');
 const step=fixture.slice(0,idx)+extra+'\n'+fixture.slice(idx);
 const base={stock:[100,200,70],bottomZ:10,kerf:1,feed:7,
   minS:500,maxS:1000,clearance:15,retract:20,
   leadMargin:5,rotation:gen.identityRotation(),offset:[0,0,0],
   scale:1,tolerance:.1,trim:false,trimAngle:0,cutOrder:'B0_B90',
   guideStarts:{'910005:910006':1},powerComp:false};
 const p=gen.buildF4Program(step,[[910005,910006]],base);
 assert.match(p.program,/G92 X/);
 assert.match(p.program,/GUIDES #910005\/#910006 START=1.0000/);
 assert.match(p.program,/G00 B0.00/);
 assert.match(p.program,/G01 X[-\d.]+ Y[-\d.]+ Z[-\d.]+ A[-\d.]+/);
 assert.match(p.program,/M03 S500/);
 assert.equal(p.operatorDirected,true);
 assert.ok(p.points>0);
 // Stock and guide profiles are translated in the same machine frame.
 const moved=gen.buildF4Program(step,[[910005,910006]],{...base,offset:[0,7,3]});
 assert.match(moved.program,/STOCK L=200 W=100 H=70 Z0=10 OX=0 OY=7 OZ=3/);
 const parsedStock=sim.parseGcode(moved.program).stock;
 assert.equal(parsedStock.W,base.stock[0]);
 assert.equal(parsedStock.L,base.stock[1]);
 assert.equal(parsedStock.OY,7);
 assert.equal(parsedStock.OZ,3);
 const getCut=r=>sim.parseGcode(r.program).moves.find(m=>m.type==='G1');
 const before=getCut(p),after=getCut(moved);
 assert.ok(before && after);
 for(const [axis,delta] of [['X',7],['Y',3],['Z',7],['A',3]])
   assert.ok(Math.abs(after.to[axis]-before.to[axis]-delta)<.03,
     axis+' failed to follow stock translation');
 assert.throws(()=>gen.buildF4Program(step,[[910005,910006]],{...base,offset:[0,0,-20]}),
   /вертикальный ход/);
 assert.throws(()=>gen.buildF4Program(step,[[910005,910006]],{...base,offset:[0,150,0]}),
   /поперечный ход/);
 // Trimming coordinates must follow the same offset at either table angle.
 for(const [angle,deltaOffset,dy] of [
   [0,[0,7,3],7],
   [90,[5,0,3],5]
 ]){
   const opts={...base,trim:true,trimAngle:angle};
   const t0=gen.buildF4Program(step,[[910005,910006]],opts);
   const t1=gen.buildF4Program(step,[[910005,910006]],{...opts,offset:deltaOffset});
   assert.match(t0.program,new RegExp('TRIM B'+angle));
   const first=r=>sim.parseGcode(r.program).moves.find(m=>m.type==='G1');
   const a=first(t0),b=first(t1);
   assert.ok(a&&b,'expected a trimming cut at B'+angle);
   for(const [axis,delta] of [['X',dy],['Y',3],['Z',dy],['A',3]])
     assert.ok(Math.abs(b.to[axis]-a.to[axis]-delta)<.03,
       'trim B'+angle+' axis '+axis);
 }

 // Invalid motion parameters must be rejected rather than normalized or
 // passed through to the postprocessor.
 for(const invalid of [
   {kerf:0},{kerf:-1},{clearance:-1},{retract:-1},{bottomZ:-1},
   {minS:1000,maxS:500}
 ]){
   assert.throws(()=>gen.buildF4Program(step,[[910005,910006]],{...base,...invalid}),
     /Некорректные параметры F4/,JSON.stringify(invalid));
 }
 const broken=JSON.parse(JSON.stringify(base));
 broken.stock=[1000,200,70];
 assert.throws(()=>gen.buildF4Program(step,[[910005,910006]],broken),
  /выходит за физические ходы|превышает расстояние между башнями|Превышен лимит/);
});

test('external F2 open-bottom slot is cut as U, never diagonally closed',{skip:!process.env.F2_SLOT_STEP},()=>{
 const step=fs.readFileSync(process.env.F2_SLOT_STEP,'utf8');
 const o=options({stock:[50,325,240],bottomZ:0,clearance:10,trim:false,powerComp:false,cutOrder:'B90_B0',trimAngle:90});
 const result=gen.buildProgram(step,'F2-open-slot.stp',o);
 assert.equal(result.secondary,2,'one closed through-hole and one open-bottom slot');
 const g=result.program,mark='*** OPEN BOTTOM SLOT B90: U-PATH, NO CROSSED CLOSING EDGE ***';
 assert.ok(g.includes(mark),'open slot must not be mistaken for a closed ring');
 assert.ok(g.indexOf('*** SECONDARY CUT:')<g.indexOf('*** PROFILE:'),'closed B90 bore must be first');
 assert.ok(g.indexOf('*** PROFILE:')<g.indexOf('*** FINAL OPEN-BOTTOM NOTCH:')&&
   g.indexOf('*** FINAL OPEN-BOTTOM NOTCH:')<g.indexOf(mark),
   'open U-slot must be the final machining pass, after the B0 outer profile');
 const section=g.split(mark)[1].split('*** END BLOCK ***')[0];
 const rows=section.split(/\r?\n/).filter(line=>/^G01 /.test(line));
 const parse=line=>Object.fromEntries([...line.matchAll(/([XYZA])(-?\d+(?:\.\d+)?)/g)].map(m=>[m[1],+m[2]]));
 const points=rows.map(parse);
 assert.equal(points.length,5,'one entry, two walls, a roof, one exit, no closing diagonal');
 assert.ok(points.every(p=>Math.abs(p.X-p.Z)<.02&&Math.abs(p.Y-p.A)<.02),
   'both wire endpoints must follow the same U path');
 const xy=points.map(p=>[p.X,p.Y]);
 assert.ok(Math.abs(xy[0][0]-xy[1][0])<.02 && xy[1][1]>xy[0][1]);
 assert.ok(xy[2][0]>xy[1][0] && Math.abs(xy[2][1]-xy[1][1])<.02);
 assert.ok(xy[3][1]<xy[2][1] && xy[4][0]>xy[3][0]);
 const parsed=sim.parseGcode(g),report=sim.analyse(parsed,
   {...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(report.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(report.warns));
});

test('integrated frontend keeps F4 controls and main stock naming',()=>{
 assert.match(html,/id="gnModeManual"/);
 assert.match(html,/id="gnL" type="number" min="0" step="10"/);
 assert.match(html,/id="gnW" type="number" min="0" step="10"/);
 assert.match(html,/id="gnH" type="number" min="0" step="10"/);
 assert.match(html,/const outputStem=stem\+/);
 assert.match(html,/outputStem\+"_F4_auto.gcode"/);
 // F2's final open groove is deliberately deferred until the main profile.
 assert.match(html,/FINAL OPEN-BOTTOM NOTCH: AFTER B0 OUTER PROFILE/);
});

test('external F2: placement preview renders closed channel and open-bottom groove',{skip:!process.env.F2_SLOT_STEP},()=>{
 const text=fs.readFileSync(process.env.F2_SLOT_STEP,'utf8');
 const preview=gen.previewGeometry(text);
 assert.equal(preview.diagnosticOnly,false,'F2 should not fall back to an empty diagnostic');
 assert.equal(preview.previewError,null);
 assert.equal(preview.openSlotCount,1,'U-shaped notch must be recognized in preview');
 assert.equal(preview.secondaryCount,2,'keep both cross-direction operations');
 assert.ok(preview.rails.length>=11,'render outer shell and closed channel');
 assert.ok(preview.edgeLines.length>=10,'show actual trimmed STEP edges of the open notch');
 assert.ok(preview.rails.every(rail=>rail.length>=2));
 assert.ok(preview.size.every(v=>v>0&&Number.isFinite(v)));
});
test('ordinary STEP preview keeps its ruled rails with no open slot',()=>{
 const preview=gen.previewGeometry(fixture);
 assert.equal(preview.diagnosticOnly,false);
 assert.equal(preview.openSlotCount,0);
 assert.ok(preview.rails.length>=4);
});


test('partitionChains separates external and internal multi-face loops',()=>{
 const edge=(a,b)=>({t0:0,t1:1,
   A:t=>[a[0]+(b[0]-a[0])*t,0,a[1]+(b[1]-a[1])*t],
   B:t=>[a[0]+(b[0]-a[0])*t,50,a[1]+(b[1]-a[1])*t]});
 const square=(x,z,w,h)=>{
   const p=[[x,z],[x+w,z],[x+w,z+h],[x,z+h]];
   return p.map((a,i)=>edge(a,p[(i+1)%4]));
 };
 const components=gen.Model.partitionChains([...square(0,0,100,100),...square(20,20,30,30)]);
 assert.equal(components.length,2);
 assert.equal(components[0].length,4);
 assert.equal(components[1].length,4);
 assert.ok(components.every(c=>c.every(([f,forward])=>forward&&f.t0===0)));
});

test('external F1 multi-face rectangular opening: preview and G-code',{skip:!process.env.F1_MULTIFACE_STEP},()=>{
 // Separate from legacy F1_STEP: F1(1) has five outer faces and a
 // four-face internal rectangular bore, not a single outer loop.
 const step=fs.readFileSync(process.env.F1_MULTIFACE_STEP,'utf8');
 const b=new gen.Model(step).build();
 assert.equal(b.axis,1);
 assert.equal(b.outer.length,5,'five sections of the outer F1 profile');
 assert.equal(b.holes.length,1,'four-face rectangle is an internal hole');
 assert.equal(b.holes[0].length,4);
 const view=gen.previewGeometry(step);
 assert.equal(view.diagnosticOnly,false);
 assert.equal(view.previewError,null);
 assert.equal(view.outerCount,5);
 assert.equal(view.rails.length,9);
 const result=gen.buildProgram(step,'F1(1).stp',
   options({stock:[50,400,240],bottomZ:0,clearance:10,trim:false,powerComp:false}));
 assert.equal(result.holes,1);
 assert.equal(result.secondary,0);
 assert.ok(result.program.indexOf('*** HOLE:')<result.program.indexOf('*** PROFILE:'),
   'internal rectangular opening must be cut before outer profile');
 const parsed=sim.parseGcode(result.program),report=sim.analyse(parsed,
   {...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(report.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(report.warns));
});


test('external F1 rectangular bore: right side in/out even at full machine height',{skip:!process.env.F1_MULTIFACE_STEP},()=>{
 const step=fs.readFileSync(process.env.F1_MULTIFACE_STEP,'utf8');
 const o=options({stock:[50,400,240],bottomZ:10,clearance:10,
   sideEntry:true,side:1,trim:false,powerComp:false});
 const r=gen.buildProgram(step,'F1(1).stp',o),g=r.program;
 const checked=gen.buildProgram(step,'F1(1).stp',{...o,trim:true});
 assert.doesNotMatch(checked.program,/TRIM BLOCK/,'no positive F1 trim allowance');
 assert.match(checked.program,/RIGHT-SIDE HOLE ENTRY/);
 assert.equal(r.holes,1);
 assert.equal(r.secondary,0);
 assert.match(g,/\*\*\* RIGHT-SIDE HOLE ENTRY AND RETURN VIA THE SAME SLIT \*\*\*/);
 assert.ok(g.indexOf('RIGHT-SIDE HOLE ENTRY')<g.indexOf('*** PROFILE:'));
 assert.doesNotMatch(g,/TRIM BLOCK|Rotation B90|^G00 B90/m);
 const section=g.split('RIGHT-SIDE HOLE ENTRY AND RETURN VIA THE SAME SLIT')[1]
   .split('*** PROFILE:')[0];
 const coordinates=line=>Object.fromEntries([...line.matchAll(/([XYZA])(-?\d+(?:\.\d+)?)/g)]
   .map(m=>[m[1],+m[2]]));
 const rapids=section.split(/\r?\n/).filter(line=>/^G00 X/.test(line));
 const cuts=section.split(/\r?\n/).filter(line=>/^G01 X/.test(line));
 assert.equal(rapids.length,1,'approach to the hole from right exterior');
 assert.ok(cuts.length>100);
 const origin=coordinates(rapids[0]),returned=coordinates(cuts.at(-1));
 assert.ok([origin.X,origin.Z,returned.X,returned.Z].every(x=>Math.abs(x-205)<.01));
 assert.ok(Math.abs(origin.Y-returned.Y)<.01 && Math.abs(origin.A-returned.A)<.01,
   'hole exit must retrace the same right-hand slit');
 const parsed=sim.parseGcode(g),report=sim.analyse(parsed,
   {...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(report.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(report.warns));
 assert.ok(parsed.moves.filter(m=>m.type==='G0'&&m.from.B===0&&m.to.B===0)
   .every(m=>Math.min(m.from.X,m.to.X,m.from.Z,m.to.Z)>200),
   'no G00 crosses the 400 mm wide stock even with Z top at 250');
 assert.match(html,/максимум одно отверстие через правую технологическую прорезь/);
});


test('bevel clearance uses projected full stock width at B66',()=>{
 const angle=66.06812522731144;
 const wide=2*gen.stockAlongWireAtAngle(240,300,[0,0,0],angle);
 const fit=2*gen.stockAlongWireAtAngle(240,295,[0,0,0],angle);
 assert.ok(wide>368&&fit<368);
 assert.ok(Math.abs(wide-371.56)<.08);
 assert.ok(Math.abs(fit-366.99)<.08);
});

test('external kil STEP: measured bevel overrun gives feasible stock suggestion',{skip:!process.env.KIL_BEVEL_STEP},()=>{
 const step=fs.readFileSync(process.env.KIL_BEVEL_STEP,'utf8');
 const option=options({stock:[240,300,40],bottomZ:10,clearance:20,
   tolerance:.3,trim:false,sideEntry:false,powerComp:false});
 const view=gen.previewGeometry(step,gen.identityRotation(),1,.3);
 assert.equal(view.diagnosticOnly,false);
 assert.equal(view.slopedPreview,true);
 assert.ok(Math.abs(view.slopedBevelAngle-66.0681)<.05);
 assert.throws(()=>gen.buildProgram(step,'kil.stp',option),
   /B66\.07°.*371\.6 мм.*368\.0 мм.*3\.6 мм.*295 мм/);
 const rightSize={...option,stock:[240,295,40]};
 const result=gen.buildProgram(step,'kil.stp',rightSize);
 assert.match(result.program,/FINAL BEVEL: STEP face/);
 const parsed=sim.parseGcode(result.program),report=sim.analyse(parsed,
   {...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(report.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(report.warns));
});


test('external stab: closed periodic STEP patches stay separate on each cap',{skip:!process.env.STAB_STEP},()=>{
 const text=fs.readFileSync(process.env.STAB_STEP,'utf8');
 const built=new gen.Model(text).build();
 assert.equal(built.axis,1);
 assert.equal(built.outer.length,7,'three disjoint periodic arcs must not be merged');
 assert.equal(built.holes.length,0);
 assert.equal(built.secondaryContours.length,0);
 const preview=gen.previewGeometry(text);
 assert.equal(preview.diagnosticOnly,false);
 assert.equal(preview.previewError,null);
 assert.equal(preview.outerCount,7);
 assert.equal(preview.rails.length,7);
 const o=options({stock:[305,220,40],bottomZ:10,clearance:15,
   kerf:1,trim:false,powerComp:false,tolerance:.1});
 const result=gen.buildProgram(text,'stab.stp',o);
 assert.equal(result.holes,0);
 assert.equal(result.secondary,0);
 assert.match(result.program,/\*\*\* PROFILE:/);
 const parsed=sim.parseGcode(result.program),report=sim.analyse(parsed,
   {...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(report.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(report.warns));
});


test('plain closed STEP profile supports an explicit overhead apex entry',()=>{
 const o=options({stock:[50,140,80],bottomZ:10,clearance:20,topEntry:true,trim:false});
 const result=gen.buildProgram(fixture,'split-profile.stp',o);
 const path=result.program.slice(result.program.indexOf('*** PROFILE:'));
 assert.match(path,/top apex entry/);
 assert.match(path,/ENTRY FROM ABOVE; EXIT THROUGH THE SAME SLIT/);
 assert.doesNotMatch(path,/exit Z\+5 mm/);
 const cutLines=path.split(/\r?\n/),movement=cutLines.filter(s=>/^G0[01] X/.test(s));
 const rapid=movement.find(s=>/^G00 X/.test(s));
 const cutting=movement.filter(s=>/^G01 X/.test(s));
 const xyz=line=>Object.fromEntries([...line.matchAll(/([XYZA])(-?\d+(?:\.\d+)?)/g)]
    .map(m=>[m[1],+m[2]]));
 const start=xyz(rapid),end=xyz(cutting.at(-1)),contact=xyz(cutting[0]);
 for(const k of ['X','Y','Z','A'])assert.ok(Math.abs(start[k]-end[k])<.02,
   'exit should retrace the top entry slit at '+k);
 assert.ok(contact.Y<start.Y&&contact.A<start.A,'first G01 descends from above');
 const side=gen.buildProgram(fixture,'split-profile.stp',{...o,topEntry:false});
 assert.doesNotMatch(side.program,/ENTRY FROM ABOVE/,'side entry remains selectable');
});

test('top-entry UI is independent from side-entry and included in G-code configuration',()=>{
 assert.match(html,/id="gnTopEntry"/);
 assert.match(html,/topEntry: \$\("gnTopEntry"\)\.checked/);
 assert.match(html,/if\(\$\("gnTopEntry"\)\.checked\)\$\("gnSideEntry"\)\.checked=false/);
 assert.match(html,/shape\.secondaryCount===0/);
});

test('external stab: top entry at highest profile point and same-slit exit',
 {skip:!process.env.STAB_STEP},()=>{
 const text=fs.readFileSync(process.env.STAB_STEP,'utf8');
 const o=options({stock:[305,220,40],bottomZ:10,clearance:15,
   kerf:1,trim:false,powerComp:false,topEntry:true});
 const result=gen.buildProgram(text,'stab.stp',o),g=result.program;
 assert.equal(result.holes,0);
 assert.match(g,/\*\*\* PROFILE: .*top corner entry, upper first/,
   'stab must enter at chord-end corner before cutting upper then lower');
 assert.match(g,/ENTRY FROM ABOVE; EXIT THROUGH THE SAME SLIT/);
 assert.match(g,/UPPER-FIRST CHECK: both wire ends agree/,
   'original stab must support one consistent upper-first direction on both wire ends');
 const start=g.indexOf('*** PROFILE:'),end=g.indexOf('*** END BLOCK ***',start);
 const section=g.slice(start,end);
 const all=section.split(/\r?\n/),rapid=all.find(line=>/^G00 X/.test(line)),
   cuts=all.filter(line=>/^G01 X/.test(line));
 assert.ok(cuts.length>600);
 const parse=line=>Object.fromEntries([...line.matchAll(/([XYZA])(-?\d+(?:\.\d+)?)/g)]
   .map(m=>[m[1],+m[2]]));
 const p0=parse(rapid),p1=parse(cuts[0]),pEnd=parse(cuts.at(-1));
 const positions=cuts.map(parse);
 // Independent check on the REAL stab G-code: at three chord stations the
 // first crossing must be on the upper skin on BOTH tower profiles.
 for(const [axis,zAxis] of [['X','Y'],['Z','A']]){
   const values=positions.map(p=>p[axis]),low=Math.min(...values),high=Math.max(...values),
     chord=high-low,entry=positions[0][axis];
   assert.ok(chord>3,'stab chord too small on '+axis);
   assert.ok(Math.min(entry-low,high-entry)<=Math.max(2,.05*chord),
     'stab top entry is inside the chord, so upper-first is not established for '+axis);
   const far=entry-low<high-entry?high:low;
   for(const fraction of [.25,.5,.75]){
     const station=entry+(far-entry)*fraction,heights=[];
     for(let i=1;i<positions.length;i++){
       const a=positions[i-1],b=positions[i],dx=b[axis]-a[axis];
       if(Math.abs(dx)<1e-7)continue;
       const t=(station-a[axis])/dx;
       if(t< -1e-7||t>1+1e-7)continue;
       const h=a[zAxis]+t*(b[zAxis]-a[zAxis]);
       if(!heights.length||Math.abs(h-heights.at(-1))>.02)heights.push(h);
     }
     assert.ok(heights.length>=2,
       'stab missing upper/lower chord crossing at '+axis+' '+fraction);
     assert.ok(heights[0]>heights[1]+.05,
       'stab lower skin was visited before upper on '+axis+' at '+fraction);
   }
 }
 // Every sampled hot-wire position is a straight line between towers.
 // Sweep the full span, not just the root and tip faces: 21 x 39 stations.
 let verifiedStations=0;
 for(let spanIndex=0;spanIndex<=20;spanIndex++){
   const f=spanIndex/20,wireSection=positions.map(p=>({
     x:p.X*(1-f)+p.Z*f,z:p.Y*(1-f)+p.A*f
   }));
   const xs=wireSection.map(p=>p.x),low=Math.min(...xs),high=Math.max(...xs),
     entry=wireSection[0].x,far=entry-low<high-entry?high:low;
   for(let chordIndex=1;chordIndex<=39;chordIndex++){
     const x=entry+(far-entry)*chordIndex/40,heights=[];
     for(let i=1;i<wireSection.length;i++){
       const a=wireSection[i-1],b=wireSection[i],dx=b.x-a.x;
       if(Math.abs(dx)<1e-7)continue;
       const t=(x-a.x)/dx;
       if(t< -1e-7||t>1+1e-7)continue;
       const z=a.z+t*(b.z-a.z);
       if(!heights.length||Math.abs(z-heights.at(-1))>.015)heights.push(z);
     }
     assert.ok(heights.length>=2,
       'stab lacks two boundary passes at span '+f+' / chord '+chordIndex);
     assert.ok(heights[0]>heights[1]+.05,
       'stab lower skin cut before upper at span '+f+' / chord '+chordIndex);
     verifiedStations++;
   }
 }
 assert.equal(verifiedStations,819);
 assert.equal(p0.Y,65);
 assert.equal(p0.A,65);
 assert.ok(p1.Y<p0.Y&&p1.A<p0.A);
 for(const key of ['X','Y','Z','A'])assert.ok(Math.abs(p0[key]-pEnd[key])<.02);
 const p=sim.parseGcode(g),report=sim.analyse(p,
   {...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(report.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(report.warns));
});

// Corner entry on a profile with a V-groove (stab + elevator hinge): the corner is the lip of the groove
// and the skin continues past it. A horizontal lead-in at corner height ran 0.2 mm from that skin
// (closer than half the kerf) and scarred it; the entry now mirrors the exit: in 5 mm above, then down.
test('side entry to a groove lip arrives from above, mirroring the exit',()=>{
 const stab=fs.readFileSync(path.join(__dirname,'fixtures/stab-groove.stp'),'latin1');
 const o=options({stock:[320,240,50],bottomZ:10,clearance:20,kerf:1,trim:false,powerComp:false});
 const program=gen.buildProgram(stab,'stab-groove.stp',o).program;
 const block=program.slice(program.indexOf('*** PROFILE:')).split(/\r?\n/);
 assert.match(block[0],/entry\/exit Z\+5 mm/);
 const xyza=line=>Object.fromEntries([...line.matchAll(/([XYZA])(-?\d+(?:\.\d+)?)/g)].map(m=>[m[1],+m[2]]));
 const cuts=block.filter(s=>/^G01 X/.test(s)).map(xyza);
 const [inward,drop]=cuts,exit=cuts.at(-1),rise=cuts.at(-2);
 // G-code axes: X=left tower Y, Y=left tower Z, Z=right tower Y, A=right tower Z
 assert.ok(Math.abs(inward.Y-drop.Y-5)<.01&&Math.abs(inward.A-drop.A-5)<.01,'drop of 5 mm onto the corner');
 assert.ok(Math.abs(inward.X-drop.X)<.01&&Math.abs(inward.Z-drop.Z)<.01,'drop is vertical');
 assert.ok(Math.abs(rise.Y-drop.Y-5)<.01,'exit rises along the same line');
 assert.ok(Math.abs(exit.Y-inward.Y)<.01&&Math.abs(exit.A-inward.A)<.01,'exit leaves at the entry height');
});

// Frame marks: four 3 mm plunge slits from the stock top outline the part (or both pieces in PAIR mode)
// on the top face, so the stock can be placed on the machine by eye before the real cutting starts.
test('frame marks outline the part with four 3 mm slits before trimming and cutting',()=>{
 const stab=fs.readFileSync(path.join(__dirname,'fixtures/stab-groove.stp'),'latin1');
 const xyza=line=>Object.fromEntries([...line.matchAll(/([XYZA])(-?\d+(?:\.\d+)?)/g)].map(m=>[m[1],+m[2]]));
 const marks=(extra)=>{
  const o=options({stock:[330,240,50],bottomZ:10,clearance:20,kerf:1,trim:true,powerComp:false,...extra});
  const program=gen.buildProgram(stab,'stab-groove.stp',o).program;
  const lines=program.split(/\r?\n/);
  const from=lines.findIndex(l=>l.includes('FRAME MARKS')),back=lines.findIndex(l=>l.includes('Return table to B0 after frame marks')),to=back<0?-1:back+3;
  return {program,block:from<0?null:lines.slice(from,to),from,to,trim:lines.findIndex(l=>l.includes('Rotation B90 for trimming'))};
 };
 assert.equal(marks({}).block,null,'off unless requested');
 const single=marks({frameMarks:true});
 assert.ok(single.from>0&&single.to>single.from,'marks come before trimming');
 const plunges=single.block.filter(l=>/^G01 X/.test(l)).map(xyza);
 assert.equal(plunges.length,8,'4 slits: down and back up');
 const downs=plunges.filter((_,i)=>i%2===0),ups=plunges.filter((_,i)=>i%2===1);
 for(let i=0;i<4;i++){
  assert.ok(Math.abs(downs[i].Y-downs[i].A)<1e-9&&Math.abs(downs[i].X-downs[i].Z)<1e-9,'slit is a plain plunge');
  assert.ok(Math.abs(ups[i].Y-downs[i].Y-2-3)<.01,'3 mm below the stock top (Z=60), returns 2 mm above it');
  assert.ok(Math.abs(downs[i].Y-57)<.01);
 }
 // chord edges at B0, span edges at B90: part 212.924 x 305 with kerf/2 outside on each side
 assert.deepEqual(downs.map(d=>Math.abs(d.X)).map(v=>+v.toFixed(2)),[106.96,106.96,153,153]);
 const order=single.block.filter(l=>/^G00 B/.test(l)||/^G01 X/.test(l));
 assert.deepEqual(order.filter(l=>/^G00 B/.test(l)).map(l=>l.split(' ')[1]),['B90.00','B0.00']);
 assert.ok(single.trim>single.to-1,'trimming still follows the marks');
 const parsed=sim.parseGcode(single.program),report=sim.analyse(parsed,{...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(report.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(report.warns));
 // PAIR: both pieces share one outline, so the same four slits
 const pair=marks({frameMarks:true,pair:true,stock:[330,240,100],trim:false});
 const pairDowns=pair.block.filter(l=>/^G01 X/.test(l)).map(xyza).filter((_,i)=>i%2===0);
 assert.match(pair.block[0],/both pieces/);
 assert.deepEqual(pairDowns.map(d=>Math.abs(d.X)).map(v=>+v.toFixed(2)),[106.96,106.96,153,153]);
 assert.ok(Math.abs(pairDowns[0].Y-(10+100-3))<.01,'depth counted from the top of the taller stock');
});
test('frame marks refuse a stock that cannot turn to B90',()=>{
 const stab=fs.readFileSync(path.join(__dirname,'fixtures/stab-groove.stp'),'latin1');
 assert.throws(()=>gen.buildProgram(stab,'stab-groove.stp',options({stock:[330,365,50],bottomZ:10,trim:false,frameMarks:true})),/Разметка габарита/);
});
test('frame marks use an overhead position even when side-entry parking is below the stock top',()=>{
 const config=options({stock:[50,140,230],bottomZ:10,clearance:5,trim:false,sideEntry:true,frameMarks:true,powerComp:false});
 const result=gen.buildProgram(fixture,'split-profile.stp',config);
 const parsed=sim.parseGcode(result.program);
 const report=sim.analyse(parsed,{...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(report.warns.filter(warning=>warning.level==='crit').length,0,JSON.stringify(report.warns));
 const block=result.program.split('FRAME MARKS')[1];
 assert.match(block,/G00 X[^\n]*Y245\.00[^\n]*A245\.00/);
 assert.throws(()=>gen.buildProgram(fixture,'split-profile.stp',{...config,clearance:11}),/Разметка габарита/);
});

test('stab pair groove leads descend at both corners and clear both retained STEP profiles',()=>{
 const step=fs.readFileSync(path.join(__dirname,'fixtures/stab-groove.stp'),'utf8');
 const shape=new gen.Model(step).build();
 const boundary=shape.outer.flatMap(([face,forward])=>{
  const samples=gen.sampleFace(face,face.t0,face.t1,.001,.5);
  return forward?samples:samples.slice().reverse();
 });
 const geometry=gen.previewGeometry(step);
 const pointDistance=(point,start,end)=>{
  const dx=end[0]-start[0],dz=end[1]-start[1];
  const ratio=Math.max(0,Math.min(1,((point[0]-start[0])*dx+(point[1]-start[1])*dz)/Math.max(1e-18,dx*dx+dz*dz)));
  return Math.hypot(point[0]-start[0]-ratio*dx,point[1]-start[1]-ratio*dz);
 };
 const cross=(start,end,point)=>(end[0]-start[0])*(point[1]-start[1])-(end[1]-start[1])*(point[0]-start[0]);
 const segmentDistance=(start,end,edgeA,edgeB)=>{
  if(cross(start,end,edgeA)*cross(start,end,edgeB)<0&&
     cross(edgeA,edgeB,start)*cross(edgeA,edgeB,end)<0)return 0;
  return Math.min(pointDistance(start,edgeA,edgeB),pointDistance(end,edgeA,edgeB),
   pointDistance(edgeA,start,end),pointDistance(edgeB,start,end));
 };
 for(const height of [52,70]){
  const config=options({stock:[305,220,height],bottomZ:10,clearance:15,kerf:1,
   pair:true,topEntry:false,trim:false,powerComp:false});
  const result=gen.buildProgram(step,'stab.stp',config);
  const placement=gen.previewPair(geometry,height,config.bottomZ,config.kerf);
  const parsed=sim.parseGcode(result.program);
  const markers=parsed.sections.filter(section=>/^PROFILE [12]\/2:/.test(section.text));
  assert.equal(markers.length,2);
  const operations=markers.map((marker,index)=>{
   const moves=parsed.moves.filter(move=>move.line>marker.line&&(index===1||move.line<markers[1].line));
   const cuts=moves.filter(move=>move.type==='G1');
   const [approach,drop]=cuts;
   for(const axis of ['X','Z'])assert.equal(approach.to[axis],drop.to[axis]);
   for(const axis of ['Y','A'])assert.ok(Math.abs(approach.to[axis]-drop.to[axis]-5)<.01);
   for(const axis of ['X','Y','Z','A'])
    assert.equal(cuts.at(-2).to[axis],approach.to[axis],'exit retraces the vertical entry');
   return [...cuts.slice(0,2),...cuts.slice(-2)];
  });
  const clearance=operations.map(()=>[Infinity,Infinity]);
  for(let spanIndex=0;spanIndex<=40;spanIndex++){
   const along=-result.part.span/2+result.part.span*spanIndex/40;
   const towerFraction=(along+gen.CONFIG.FieldWidth/2)/gen.CONFIG.FieldWidth;
   const polygons=[true,false].map(upper=>boundary.map(pair=>{
    const spanA=(upper?1:-1)*(pair[0][1]-(shape.planeA+shape.planeB)/2);
    const spanB=(upper?1:-1)*(pair[1][1]-(shape.planeA+shape.planeB)/2);
    const ratio=(along-spanA)/(spanB-spanA);
    const point=pair[0].map((value,axis)=>value+ratio*(pair[1][axis]-value));
    return [(upper?-1:1)*(point[0]-(result.part.x0+result.part.x1)/2),
     (upper?-1:1)*(point[2]-(result.part.z0+result.part.z1)/2)+(upper?placement.zUpper:placement.zLower)];
   }));
   const wirePoint=position=>[position.X*(1-towerFraction)+position.Z*towerFraction,
    position.Y*(1-towerFraction)+position.A*towerFraction];
   operations.forEach((leads,operation)=>leads.forEach(move=>{
    const start=wirePoint(move.from),end=wirePoint(move.to);
    polygons.forEach((polygon,body)=>{
     for(let index=0;index<polygon.length;index++)
      clearance[operation][body]=Math.min(clearance[operation][body],
       segmentDistance(start,end,polygon[index],polygon[(index+1)%polygon.length]));
    });
   }));
  }
  for(let operation=0;operation<2;operation++){
   assert.ok(clearance[operation][operation]>=config.kerf/2-.02,'lead must stay outside the retained surface, allowing G-code rounding');
   assert.ok(clearance[operation][1-operation]>4,'lead must clear the other retained piece even at near-minimum pair height');
  }
  const report=sim.analyse(parsed,{...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
  assert.equal(report.warns.filter(warning=>warning.level==='crit').length,0,JSON.stringify(report.warns));
 }
});
