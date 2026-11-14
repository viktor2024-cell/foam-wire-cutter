const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const src=html.slice(html.indexOf('const Gen ='),html.indexOf('//  Вкладки и экран генератора'))
 .replace('identityRotation, rotateModel };','identityRotation, rotateModel, Model };');
const gen=vm.runInNewContext(src+';Gen');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/split-profile.stp'),'utf8');
const opts={stock:[100,160,100],bottomZ:5,kerf:1,feed:7,minS:500,maxS:1000,
 clearance:15,retract:10,leadMargin:5,trim:true,trimAngle:90,side:1,powerComp:false};

test('mirror flips scene Y across XZ and applies to preview and G-code',()=>{
 const identity=gen.identityRotation(),mirrored=gen.mirrorXZ(identity);
 const original=new gen.Model(fixture,identity), reflected=new gen.Model(fixture,mirrored);
 for(const [id,points] of original.edges){
  const other=reflected.edges.get(id);
  for(let j=0;j<points.length;j++){
   const a=points[j],b=other[j];
   // Model points use STEP coordinates; scene axes are [-STEP Y, STEP X, Z].
   assert.ok(Math.abs(a[0]+b[0])<1e-8 && Math.abs(a[1]-b[1])<1e-8 && Math.abs(a[2]-b[2])<1e-8);
  }
 }
 assert.deepEqual(JSON.parse(JSON.stringify(gen.mirrorXZ(mirrored))),JSON.parse(JSON.stringify(identity)));
 assert.ok(gen.previewGeometry(fixture,mirrored).rails.length);
 assert.match(gen.buildProgram(fixture,'mirror.stp',{...opts,rotation:mirrored}).program,/PROFILE/);
});

test('stock remains at table zero and model starts at chosen height in single and mirror',()=>{
 for(const mirror of [false,true]){
  const r=gen.buildProgram(fixture,'part.stp',{...opts,mirror});
  assert.match(r.program,/STOCK L=160 W=100 H=100 Z0=0 OX=0 OY=0 OZ=0/);
  assert.match(r.program,/MODEL BOTTOM Z=5 mm/);
  const shifted=gen.buildProgram(fixture,'part.stp',{...opts,mirror,offset:[0,0,5]});
  assert.match(shifted.program,/MODEL BOTTOM Z=10 mm/);
  assert.match(shifted.program,/H=100 Z0=0 OX=0 OY=0 OZ=0/);
 }
});

test('pair lower part starts at selected height and upper part ends 5 mm below stock top',()=>{
 const g=gen.previewGeometry(fixture),p=gen.previewPair(g,100,5,1);
 const minimum=Math.min(...g.sampled.flat().flatMap(pair=>pair.map(v=>v[2])));
 assert.ok(Math.abs(p.zLower+(minimum-g.center[2])-5)<1e-6);
 assert.ok(Math.abs(p.zUpper-(minimum-g.center[2])-95)<1e-6);
 const r=gen.buildProgram(fixture,'pair.stp',{...opts,pair:true});
 assert.match(r.program,/STOCK L=160 W=100 H=100 Z0=0/);
 assert.match(r.program,/PROFILE 1\/2/);
});

test('both trimming angles use manually selected height, without moving stock top',()=>{
 for(const trimAngle of [0,90])for(const trimZ of [1,4]){
  const r=gen.buildProgram(fixture,'part.stp',{...opts,trimAngle,trimZ});
  const block=r.program.split('*** TRIM BLOCK')[1].split('Return table to B0')[0];
  const cuts=block.split(/\r?\n/).filter(s=>/^G01 /.test(s));
  assert.ok(cuts.some(s=>new RegExp('Y'+trimZ.toFixed(2)+' .*A'+trimZ.toFixed(2)).test(s)),block.slice(0,300));
  assert.match(block,/Y115\.00 .*A115\.00/);
 }
 assert.throws(()=>gen.buildProgram(fixture,'part.stp',{...opts,trimZ:101}),/Высота торцевания/);
 const zero=gen.buildProgram(fixture,'part.stp',{...opts,trimZ:0});
 assert.ok(zero.warnings.some(w=>w.includes('поверхности стола')));
});

test('manual guides use model bottom while simulator stock starts at zero',()=>{
 const extra=["#910001 = CARTESIAN_POINT('',(0.,-30.,10.));", "#910002 = CARTESIAN_POINT('',(15.,-30.,20.));",
  "#910003 = CARTESIAN_POINT('',(0.,30.,10.));", "#910004 = CARTESIAN_POINT('',(15.,30.,20.));",
  "#910005 = B_SPLINE_CURVE_WITH_KNOTS ('guide',1,(#910001,#910002),.UNSPECIFIED.,.F.,.F.,(2,2),(0.,1.),.UNSPECIFIED.);",
  "#910006 = B_SPLINE_CURVE_WITH_KNOTS ('guide',1,(#910003,#910004),.UNSPECIFIED.,.F.,.F.,(2,2),(0.,1.),.UNSPECIFIED.);",
  "#910007 = GEOMETRIC_CURVE_SET ('guides',(#910005,#910006));"].join('\n');
 const i=fixture.lastIndexOf('ENDSEC;'),step=fixture.slice(0,i)+extra+'\n'+fixture.slice(i);
 const r=gen.buildF4Program(step,[[910005,910006]],{...opts,trimZ:4,offset:[0,0,0]});
 assert.match(r.program,/H=100 Z0=0 OX=0 OY=0 OZ=0/);
 assert.match(r.program,/\*\*\* TRIM B90/);
 assert.match(r.program,/G01 X[^\n]* Y4\.00 Z[^\n]* A4\.00/);
});
