const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const src=html.slice(html.indexOf('const Gen ='),html.indexOf('//  Вкладки и экран генератора'))
 .replace('identityRotation, rotateModel };','identityRotation, rotateModel, Model };');
const gen=vm.runInNewContext(src+';Gen');
const sim=vm.runInNewContext(html.slice(html.indexOf('function parseGcode('),html.indexOf('const css ='))+';({parseGcode,analyse})');
test('optional fallback never chooses the vertical axis as a cutting span',()=>{
 const step=fs.readFileSync(path.join(__dirname,'fixtures/split-profile.stp'),'utf8');
 const r=gen.rotateModel(gen.identityRotation(),1,1),m=new gen.Model(step,r);
 m.forceHorizontalSpan=true;assert.notEqual(m.spanAxis()[0],2);
});
test('automatic stock retries candidate tolerance up to 0.6',async()=>{
 const view=fs.readFileSync(path.join(__dirname,'../generator-view.js'),'utf8');
 const begin=view.indexOf('  async function autoStockOptions('),end=view.indexOf("  document.getElementById('gnStockFromModel').addEventListener",begin);
 const ok={axis:1,diagnosticOnly:false,secondaryCount:0,size:[40,100,30],slopedPreview:false};
 const bad={...ok,diagnosticOnly:true,previewError:'отклонение от STEP'};
 const state={Gen:{...gen,previewGeometry:(text,r,scale,tol)=>tol>=.3?ok:bad},stepFile:{text:'fixture'},
  modelRotation:gen.identityRotation(),modelOffset:[0,0,0],geometry:bad,machine:gen.CONFIG,
  document:{getElementById:()=>({checked:false})},
  n:id=>({gnScale:100,gnKerf:1,gnZ:5,gnClear:15,gnLead:5,gnTolerance:.1})[id],setTimeout};
 const result=await vm.runInNewContext(view.slice(begin,end)+';autoStockOptions()',state);
 assert.ok(result.length);assert.equal(result[0].tolerance,.3);
});
test('automatic stock does not shrink solely for bevel projection',async()=>{
 const view=fs.readFileSync(path.join(__dirname,'../generator-view.js'),'utf8');
 const begin=view.indexOf('  async function autoStockOptions('),end=view.indexOf("  document.getElementById('gnStockFromModel').addEventListener",begin);
 const geometry={axis:1,diagnosticOnly:false,secondaryCount:0,size:[228,282,20],slopedPreview:true,slopedBevelAngle:66};
 const state={Gen:{...gen,previewGeometry:()=>({...geometry,diagnosticOnly:true})},stepFile:{text:'fixture'},
  modelRotation:gen.identityRotation(),modelOffset:[0,0,0],geometry,machine:gen.CONFIG,
  document:{getElementById:id=>({checked:id==='gnTrim'})},
  n:id=>({gnScale:100,gnKerf:1,gnZ:10,gnClear:20,gnLead:5,gnTolerance:.1,gnTrimAngle:90})[id],setTimeout};
 const result=await vm.runInNewContext(view.slice(begin,end)+';autoStockOptions()',state);
 assert.ok(result.length);assert.equal(result[0].width,305);
 assert.ok(2*gen.stockAlongWireAtAngle(result[0].length,result[0].width,[0,0,0],66)>gen.CONFIG.FieldWidth-2);
 assert.match(view,/const fits=stockFits&&stockInMachine;/);
 assert.match(view,/else if\(!bevelFits\)fit\.className='note warn'/);
});
test('rotated kil STEP produces a simulated toolpath at 0.3 mm tolerance',{skip:!process.env.KIL_ROTATED_STEP},()=>{
 const step=fs.readFileSync(process.env.KIL_ROTATED_STEP,'utf8');
 let r=gen.identityRotation();r=gen.rotateModel(r,0,1);r=gen.rotateModel(r,0,1);r=gen.rotateModel(r,1,1);
 const p=gen.previewGeometry(step,r,1,.3);assert.equal(p.diagnosticOnly,false);assert.equal(p.axis,1);
 const o={rotation:r,tolerance:.3,stock:[240,295,40],bottomZ:10,clearance:20,kerf:1,trim:true,trimAngle:90,cutOrder:'B90_B0',feed:7,minS:500,maxS:1000,retract:30,leadMargin:5,side:1,powerComp:false};
 const result=gen.buildProgram(step,'kil.stp',o);assert.ok(result.points>100);
 assert.doesNotMatch(result.program,/WARNING: BEVEL STOCK PROTRUDES/);
 const parsed=sim.parseGcode(result.program),report=sim.analyse(parsed,{...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.equal(report.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(report.warns));
});
test('bevel overhang warns but remains available for machine start',{skip:!process.env.KIL_ROTATED_STEP},()=>{
 const step=fs.readFileSync(process.env.KIL_ROTATED_STEP,'utf8');
 let r=gen.identityRotation();r=gen.rotateModel(r,0,1);r=gen.rotateModel(r,0,1);r=gen.rotateModel(r,1,1);
 const o={rotation:r,tolerance:.3,stock:[240,300,40],bottomZ:10,clearance:20,kerf:1,trim:true,trimAngle:90,cutOrder:'B90_B0',feed:7,minS:500,maxS:1000,retract:30,leadMargin:5,side:1,powerComp:false,frameMarks:true};
 const result=gen.buildProgram(step,'kil.stp',o);
 assert.ok(result.warnings.some(w=>/углы могут выступать за башни/i.test(w)));
 assert.match(result.program,/WARNING: BEVEL STOCK PROTRUDES PAST TOWER SPAN/);
 const parsed=sim.parseGcode(result.program),report=sim.analyse(parsed,{...parsed.stock,FW:370,HT:490,VT:250,angle:45,invB:false,laser:false});
 assert.ok(report.warns.some(w=>w.level==='warn'&&w.text.includes('башни')));
 assert.equal(report.warns.filter(w=>w.level==='crit').length,0,JSON.stringify(report.warns));
 const code=html.slice(html.indexOf('function startJob()'),html.indexOf('function togglePause()'));
 let pumped=false;
 const state={blankSession:{active:false},requireMachinableProgram:()=>true,requireCurrentProgram:()=>true,
  mach:{connected:true,state:'Idle'},job:null,prog:{check:report},$:id=>({checked:false,textContent:''}),
  currentText:result.program,currentName:'kil.gcode',buildStream:()=>[{text:'G01',src:0}],showMsg:()=>{},log:()=>{},
  refreshMachine:()=>{},pump:()=>{pumped=true;},simTime:0,playing:false};
 vm.runInNewContext(code+';startJob()',state);
 assert.equal(pumped,true,'warning must not block streaming to the connected controller');
 assert.throws(()=>gen.buildProgram(step,'kil.stp',{...o,trim:false,frameMarks:false,stock:[240,430,40]}),/поворот|коридор/i);
 assert.throws(()=>gen.buildProgram(step,'kil.stp',{...o,offset:[0,100,0]}),/физические пределы|ход/i);
});
