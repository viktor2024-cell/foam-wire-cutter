const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('const Gen ='),html.indexOf('//  Вкладки и экран генератора'))
 .replace('identityRotation, rotateModel };','identityRotation, rotateModel, Model, coincidentWireContours, sharedBodyContours };');
const gen=vm.runInNewContext(source+';Gen');
const sim=vm.runInNewContext(html.slice(html.indexOf('function parseGcode('),html.indexOf('const css ='))+';({parseGcode,analyse})');
function circle(edge,r=7,phase=0,reverse=false,twist=0){
 const point=(t,y,extra=0)=>[r*Math.cos((reverse?-1:1)*t+phase+extra),y,r*Math.sin((reverse?-1:1)*t+phase+extra)];
 return [[{A:t=>point(t,0),B:t=>point(t,100,twist),t0:0,t1:2*Math.PI,closed:true,boundaryEdgeIds:[edge]},true]];
}
function bodies(owners){
 const entities=new Map(),shells=new Map(),facesRaw=[];
 owners.forEach((owner,i)=>{
  const face=100+i,edge=1000+i;
  if(!entities.has(owner))entities.set(owner,{name:'MANIFOLD_SOLID_BREP',args:['',{id:owner+10000}]});
  const shell=shells.get(owner+10000)||{name:'CLOSED_SHELL',args:['',[]]};shell.args[1].push({id:face});shells.set(owner+10000,shell);
  facesRaw.push({fid:face,edgeIds:[edge]});
 });
 return {entities,facesRaw,get:ref=>shells.get(ref.id)};
}
test('shared contour matches both ends despite different seams and directions',()=>{
 const a=circle(1000),b=circle(1001,7,1.17,true);
 assert.ok(gen.coincidentWireContours(a,b));
 const result=gen.sharedBodyContours(bodies([1,2]),[a,b]);
 assert.equal(result.holes.length,1);assert.equal(result.shared.length,1);
});
test('distinct sizes, twisted correspondence, and same-body contours are never merged',()=>{
 const a=circle(1000),larger=circle(1001,7.03),twisted=circle(1001,7,0,false,.1),same=circle(1001);
 assert.equal(gen.coincidentWireContours(a,larger),false);
 assert.equal(gen.coincidentWireContours(a,twisted),false);
 assert.equal(gen.sharedBodyContours(bodies([1,2]),[a,larger]).holes.length,2);
 assert.equal(gen.sharedBodyContours(bodies([1,1]),[a,same]).holes.length,2);
 const endsDiffer=circle(1001);endsDiffer[0][0].B=t=>[7.03*Math.cos(t),100,7.03*Math.sin(t)];
 assert.equal(gen.coincidentWireContours(a,endsDiffer),false,'matching one end must not merge different trajectories');
 const unknown=bodies([1,2]);unknown.facesRaw[1].edgeIds=[];
 assert.equal(gen.sharedBodyContours(unknown,[a,same]).holes.length,2,'ambiguous ownership must not merge cuts');
});
test('W2 cuts shared boundary once and preserves inner bore in single, mirror and pair modes',{skip:!process.env.W2_SHARED_STEP},()=>{
 const step=fs.readFileSync(process.env.W2_SHARED_STEP,'utf8'),model=new gen.Model(step,gen.identityRotation(),1,.1);
 assert.equal(model.build().holes.length,3);
 const base={stock:[210,220,50],bottomZ:10,kerf:1,feed:7,minS:500,maxS:1000,clearance:15,retract:5,leadMargin:5,trim:false,side:1,powerComp:false,tolerance:.1};
 for(const mode of ['normal','mirror','pair']){
  const pair=mode==='pair',mirror=mode==='mirror';
  const result=gen.buildProgram(step,'W2.stp',{...base,pair,mirror,stock:pair?[210,220,100]:base.stock});
  assert.equal(result.holes,2);assert.equal((result.program.match(/\*\*\* HOLE:/g)||[]).length,pair?4:2);
  assert.ok(result.warnings.some(w=>w.includes('общий контур режется один раз')));
  const sections=result.program.split('; SHARED BODY BOUNDARY: CUT ON NOMINAL CENTERLINE');
  assert.equal(sections.length-1,pair?2:1);
  const headings=[...result.program.matchAll(/; \*\*\* HOLE:/g)].map(m=>m.index);
  const shared=[...result.program.matchAll(/; SHARED BODY BOUNDARY:/g)].map(m=>m.index);
  assert.ok(shared[0]>headings[1]&&(!pair||shared[1]>headings[3]),'cut the enclosed bore before releasing the shared boundary');
  for(let index=1;index<sections.length;index++){
    const section=sections[index],count=Number([...sections[index-1].matchAll(/HOLE: (\d+) points/g)].at(-1)[1]);
    const block=section.split('; *** HOLE:')[0].split('; *** PROFILE')[0];
    const x=block.split(/\r?\n/).filter(line=>/^G01 /.test(line)).slice(0,count).map(line=>+line.match(/X(-?[\d.]+)/)[1]);
    assert.ok(Math.abs(Math.max(...x)-Math.min(...x)-14)<.06,'shared boundary must follow nominal 14 mm diameter');
  }
  const p=sim.parseGcode(result.program),report=sim.analyse(p,{...p.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
  assert.equal(report.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(report.warns));
 }
});
