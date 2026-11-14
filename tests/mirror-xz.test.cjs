const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const src=html.slice(html.indexOf('const Gen ='),html.indexOf('//  Вкладки и экран генератора'))
 .replace('identityRotation, rotateModel };','identityRotation, rotateModel, Model };');
const gen=vm.runInNewContext(src+';Gen');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/split-profile.stp'),'utf8');
test('XZ reflection flips displayed Y, is reversible, and generates a mirrored path',()=>{
 const identity=gen.identityRotation(),mirrored=gen.mirrorXZ(identity);
 const original=new gen.Model(fixture,identity),reflected=new gen.Model(fixture,mirrored);
 for(const [id,points] of original.edges)for(let i=0;i<points.length;i++){
  const a=points[i],b=reflected.edges.get(id)[i];
  assert.ok(Math.abs(a[0]+b[0])<1e-8 && Math.abs(a[1]-b[1])<1e-8 && Math.abs(a[2]-b[2])<1e-8);
 }
 assert.deepEqual(JSON.parse(JSON.stringify(gen.mirrorXZ(mirrored))),JSON.parse(JSON.stringify(identity)));
 assert.ok(gen.previewGeometry(fixture,mirrored).rails.length);
 const o={rotation:mirrored,stock:[100,160,100],bottomZ:5,kerf:1,feed:7,minS:500,maxS:1000,clearance:15,retract:10,leadMargin:5,trim:false,side:1,powerComp:false};
 assert.match(gen.buildProgram(fixture,'mirror.stp',o).program,/PROFILE/);
 assert.match(gen.buildProgram(fixture,'pair.stp',{...o,pair:true,stock:[100,160,110]}).program,/PROFILE 1\/2/);
});
test('reflected auxiliary curves remain usable for manual G-code',()=>{
 const extra=["#910001 = CARTESIAN_POINT('',(0.,-30.,10.));","#910002 = CARTESIAN_POINT('',(15.,-30.,20.));",
  "#910003 = CARTESIAN_POINT('',(0.,30.,10.));","#910004 = CARTESIAN_POINT('',(15.,30.,20.));",
  "#910005 = B_SPLINE_CURVE_WITH_KNOTS ('guide',1,(#910001,#910002),.UNSPECIFIED.,.F.,.F.,(2,2),(0.,1.),.UNSPECIFIED.);",
  "#910006 = B_SPLINE_CURVE_WITH_KNOTS ('guide',1,(#910003,#910004),.UNSPECIFIED.,.F.,.F.,(2,2),(0.,1.),.UNSPECIFIED.);",
  "#910007 = GEOMETRIC_CURVE_SET ('guides',(#910005,#910006));"].join('\n');
 const i=fixture.lastIndexOf('ENDSEC;'),step=fixture.slice(0,i)+extra+'\n'+fixture.slice(i);
 const o={rotation:gen.mirrorXZ(gen.identityRotation()),stock:[100,200,70],bottomZ:10,kerf:1,feed:7,
  minS:500,maxS:1000,clearance:15,retract:20,leadMargin:5,offset:[0,0,0],trim:false};
 assert.match(gen.buildF4Program(step,[[910005,910006]],o).program,/F4 B0 GUIDES/);
});
