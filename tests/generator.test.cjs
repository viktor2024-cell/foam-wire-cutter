const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
// Exercise the production generator without DOM stubs or a second implementation.
const source=html.slice(html.indexOf('const Gen ='),html.indexOf('//  Вкладки и экран генератора'))
 .replace(/return \{ buildProgram,.*?CONFIG, previewGeometry, previewPair, identityRotation, rotateModel \};/,
  match=>match.replace(' };', ', Model, sampleFace, Program, startBlock, endBlock };'));
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

test('kil2 retains diagnostic STEP edges when safe generation is not established',{skip:!process.env.KIL_STEP},()=>{
 const step=fs.readFileSync(process.env.KIL_STEP,'utf8');
 const preview=gen.previewGeometry(step,gen.identityRotation(),1,.6);
 assert.equal(preview.diagnosticOnly,true);
 assert.ok(preview.edgeLines.length>0);
 assert.match(preview.previewError,/Грань #790/);
 assert.throws(()=>gen.buildProgram(step,'kil2.stp',options({stock:[250,250,50],tolerance:.6})),/Грань #790/);
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

test('pair checkbox controls Create G-code, not only the stock preview',()=>{
 // Exercise the actual UI mode dispatch and event handlers with minimal DOM stubs.
 const clickHandlers=new Map();
 const nodes=Object.fromEntries(['gnGo','gnMirror','gnPair','gnStockPair','gnDone','gnOut','gnStatus']
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
});
test('pair G-code explicitly contains two profiles and a two-piece mode header',()=>{
 const r=build(options({pair:true,stock:[50,140,89]}));
 assert.match(r.program,/CUT MODE=PAIR PIECES=2/);
 assert.equal((r.program.match(/PROFILE [12]\/2:/g)||[]).length,2);
 assert.ok(r.program.indexOf('PROFILE 1/2: UPPER')<r.program.indexOf('PROFILE 2/2: LOWER'));
 assert.equal((r.program.match(/corner entry, upper first/g)||[]).length,2);
 assert.match(build().program,/CUT MODE=SINGLE PIECES=1/);
 assert.equal((build().program.match(/PROFILE [12]\/2:/g)||[]).length,0);
});
test('pair uses one central web and two kerf-aware outer margins',()=>{
 const small=options({pair:true,stock:[50,140,89]});
 const r=build(small);
 assert.match(r.program,/pair: upper reflected over gap/);
 assert.doesNotMatch(r.program,/GAP ENTRY/); // synthetic profile has no holes
 assert.equal(r.secondary,0);
 assert.equal((r.program.match(/corner entry, upper first/g)||[]).length,2);
 assert.ok(r.points>500);
 const p=sim.parseGcode(r.program),machine={...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false};
 const check=sim.analyse(p,machine);
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(check.warns));
 assert.throws(()=>build(options({pair:true,stock:[50,140,88]})),/Пара не помещается.*89\.0/);
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
  document:{getElementById:()=>({checked:false})},
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
 assert.throws(()=>build({sideEntry:true,trim:true}),/Боковой вход/);
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
 assert.ok(+match[1]>90 && +match[1]<95);
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
 const points=moves.map(coords),start=points[0],closed=points[count-1];
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
