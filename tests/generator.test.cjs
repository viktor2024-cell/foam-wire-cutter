const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
// Exercise the production generator without DOM stubs or a second implementation.
const source=html.slice(html.indexOf('const Gen ='),html.indexOf('//  Вкладки и экран генератора'))
 .replace('return { buildProgram, CONFIG, previewGeometry, previewPair, identityRotation, rotateModel };','return { buildProgram, CONFIG, previewGeometry, previewPair, identityRotation, rotateModel, Model, sampleFace, Program, startBlock, endBlock };');
const gen=vm.runInNewContext(source+';Gen');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/split-profile.stp'),'utf8');
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
test('pair checkbox controls Create G-code, not only the stock preview',()=>{
 // Exercise the actual UI mode dispatch and event handlers with minimal DOM stubs.
 const clickHandlers=new Map();
 const nodes=Object.fromEntries(['gnGo','gnMirror','gnPair','gnStockPair','gnDone','gnOut','gnStatus']
  .map(id=>[id,{checked:false,hidden:false,textContent:'',addEventListener(type,fn){clickHandlers.set(id+':'+type,fn);}}]));
 const get=id=>nodes[id],modes=[];
 // Use only the production dispatch wiring; do not silently substitute another implementation.
 const ui=html.slice(html.indexOf('// The pair checkbox is a real machining mode'),html.indexOf('$("gnToCut").addEventListener'));
 vm.runInNewContext(ui,{ $:get,generate:mode=>modes.push(mode),generatorPreview:{rebuild(){}},
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
test('split coedges yield the complete trimmed rectangular profile',()=>{
 const m=new gen.Model(fixture), b=m.build();
 assert.equal(b.axis,1);assert.equal(b.planeA,-25);assert.equal(b.planeB,25);
 const r=build();assert.ok(Math.abs(r.part.x1-r.part.x0-100)<.001);assert.ok(Math.abs(r.part.z1-r.part.z0-40)<.001);
 assert.equal(r.holes,0);assert.ok(r.points>100);
});
test('no trimming: no B90, stock metadata agrees with simulator X=W Y=L',()=>{
 const r=build();assert.doesNotMatch(r.program,/TRIM BLOCK|Rotation 90|B90/);
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
 assert.doesNotMatch(r.program,/TRIM BLOCK|B90/);
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
 assert.doesNotMatch(r.program,/TRIM BLOCK|B90/);
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

function checkProfileOverlap(program, expectedDirection = -1, requireRise = true) {
 const lines=program.split(/\r?\n/),i=lines.findIndex(line=>line.includes('corner entry, upper first'));
 assert.ok(i>=0);
 const count=+lines[i].match(/PROFILE: (\d+) points/)[1];
 const moves=lines.slice(i+1).filter(line=>/^G01 /.test(line));
 const coords=line=>Object.fromEntries([...line.matchAll(/([XYZA])(-?\d+(?:\.\d+)?)/g)].map(m=>[m[1],+m[2]]));
 const points=moves.map(coords),start=points[0],closed=points[count-1];
 for(const axis of ['X','Y','Z','A']) assert.ok(Math.abs(start[axis]-closed[axis])<.03,'contour returns to entry '+axis);
 const exit=points[count],outside=points[count+1];
 assert.ok(Math.abs(exit.X-start.X)<.03 && Math.abs(exit.Z-start.Z)<.03);
 assert.ok(Math.abs(exit.Y-start.Y-5*expectedDirection)<.03 && Math.abs(exit.A-start.A-5*expectedDirection)<.03,'exit crosses entry by 5 mm');
 assert.ok(Math.abs(outside.Y-exit.Y)<.03 && Math.abs(outside.A-exit.A)<.03,'horizontal exit');
 const upper=points.slice(1,Math.min(count,35)).map(p=>(p.Y+p.A)/2);
 if(requireRise) assert.ok(Math.max(...upper)>(start.Y+start.A)/2+2,'first contour branch goes upwards');
}
test('outer profile crosses its entry by 5 mm down without retracing',()=>{
 checkProfileOverlap(build({trim:false}).program);
});
test('external F2: upper branch first and exit crosses entry by 5 mm',{skip:!process.env.F2_STEP},()=>{
 const text=fs.readFileSync(process.env.F2_STEP,'utf8');
 const r=gen.buildProgram(text,'F2.stp',options({stock:[50,325,240],bottomZ:0,clearance:10,trim:false}));
 checkProfileOverlap(r.program);
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
