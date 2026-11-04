const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
// Exercise the production generator without DOM stubs or a second implementation.
const source=html.slice(html.indexOf('const Gen ='),html.indexOf('//  Вкладки и экран генератора'))
 .replace('return { buildProgram, CONFIG, previewGeometry, identityRotation, rotateModel };','return { buildProgram, CONFIG, previewGeometry, identityRotation, rotateModel, Model, sampleFace, Program, startBlock, endBlock };');
const gen=vm.runInNewContext(source+';Gen');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/split-profile.stp'),'utf8');
const options=(extra={})=>({stock:[50,140,60],bottomZ:10,kerf:1,feed:7,minS:500,maxS:1000,clearance:20,retract:30,leadMargin:5,trim:false,side:1,powerComp:true,...extra});
const build=(o={})=>gen.buildProgram(fixture,'synthetic.stp',options(o));
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
 assert.equal(p.moves.length,410);assert.ok(p.total>0);assert.ok(check.trail.length>0);
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
