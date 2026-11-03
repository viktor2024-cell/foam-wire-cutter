const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
// Exercise the production generator without DOM stubs or a second implementation.
const source=html.slice(html.indexOf('const Gen ='),html.indexOf('//  Вкладки и экран генератора'))
 .replace('return { buildProgram, CONFIG };','return { buildProgram, CONFIG, Model, sampleFace, Program, startBlock, endBlock };');
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
 assert.throws(()=>build({stock:[50,140,230],bottomZ:0}),/250.*235/);
 const p=new gen.Program(gen.CONFIG,true,5);
 gen.startBlock(gen.CONFIG,p);assert.equal(p.pos.join(','),'240,235,240,235');
 assert.throws(()=>p.travel('move',0,236,0,236),/Перемещение выходит/);
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
 const s={...p.stock,FW:374,HT:490,VT:235,angle:45,invB:false,laser:false};
 const check=sim.analyse(p,s);
 assert.equal(p.moves.length,410);assert.ok(p.total>0);assert.ok(check.trail.length>0);
 assert.equal(check.warns.filter(w=>w.level==='crit').length,0);
 const bad=sim.parseGcode('; STOCK L=140 W=50 H=60 Z0=10\nG92 X0 Y100 Z0 A100 B0\nG00 X0 Y20 Z0 A20 F600\n');
 assert.ok(sim.analyse(bad,s).warns.some(w=>w.level==='crit'&&w.text.includes('G0')));
});
