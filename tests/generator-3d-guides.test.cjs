const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../generator-view.js'),'utf8');
test('automatic STEP tolerance retries only surface-deviation errors within the 0.60 mm limit',()=>{
 const start=source.indexOf('  function autoTolerancePreview('),end=source.indexOf('  function load() {',start);
 assert.ok(start>0&&end>start);
 const attempted=[];
 const context={Gen:{previewGeometry:(_text,_rotation,_scale,tolerance)=>{
  attempted.push(tolerance);
  return tolerance<.3?{diagnosticOnly:true,previewError:'пересечение вне поверхности'}:{diagnosticOnly:false};
 }}};
 vm.createContext(context);
 const select=vm.runInContext(source.slice(start,end)+';autoTolerancePreview',context);
 const result=select('step',[],1,.1,{diagnosticOnly:true,previewError:'отклонение STEP'});
 assert.equal(result.tolerance,.3);
 assert.deepEqual(attempted,[.15,.2,.25,.3]);
 attempted.length=0;
 const invalid=select('step',[],1,.1,{diagnosticOnly:true,previewError:'другая ошибка'});
 assert.equal(invalid.tolerance,.1);
 assert.equal(attempted.length,0);
 context.Gen.previewGeometry=(_text,_rotation,_scale,tolerance)=>{
  attempted.push(tolerance);
  return {diagnosticOnly:true,previewError:'отклонение STEP'};
 };
 const unresolved=select('step',[],1,.1,{diagnosticOnly:true,previewError:'отклонение STEP'});
 assert.equal(unresolved.tolerance,.1);
 assert.equal(attempted.at(-1),.6);
 assert.ok(attempted.every(tolerance=>tolerance<=.6));
});
test('manual edits clear the green automatic-adjustment indicator',()=>{
 const start=source.indexOf("  for(const id of ['gnTolerance','gnZ','gnClear'])");
 const end=source.indexOf("  document.getElementById('gnTolerance').addEventListener('change'",start);
 assert.ok(start>0&&end>start);
 const nodes=Object.fromEntries(['gnTolerance','gnZ','gnClear'].map(id=>[id,{
  marked:true,classList:{remove(name){assert.equal(name,'auto-adjusted');nodes[id].marked=false}},
  addEventListener(event,handler){assert.equal(event,'input');this.handler=handler}
 }]));
 vm.runInNewContext(source.slice(start,end),{document:{getElementById:id=>nodes[id]}});
 nodes.gnClear.handler();
 assert.equal(nodes.gnClear.marked,false);
 assert.equal(nodes.gnZ.marked,true);
 assert.equal(nodes.gnTolerance.marked,true);
});
function pairing() {
 const start=source.indexOf('  function chooseGuide(id) {');
 const end=source.indexOf('  // Project polyline vertices',start);
 assert.ok(start>0&&end>start);
 const ctx={guideMode:true,pendingGuide:[],savedGuidePairs:[],guideStarts:{},pairKey:ids=>ids.join(':'),
  geometry:{auxiliaryCurves:[
   {id:197,fixedAxis:1,closed:false,points:[[0,0,0],[1,0,0]]},
   {id:544,fixedAxis:1,closed:false,points:[[0,99,0],[1,99,0]]},
   {id:337,fixedAxis:0,closed:true,points:[[0,0,0],[0,1,0]]},
   {id:681,fixedAxis:0,closed:true,points:[[251,0,0],[251,1,0]]},
   {id:694,fixedAxis:0,closed:false,points:[[0,0,0],[0,5,0]]}
  ]},messages:[],guideFeedback(message){this.messages.push(message)},updateGuideColors(){},
  invalidate(){},resetStockSimulation(){},refreshGuideOperations(){},
  guideEntryResult:{textContent:''}};
 ctx.guideFeedback=(message)=>ctx.messages.push(message);
 vm.createContext(ctx);
 vm.runInContext(source.slice(start,end)+';globalThis.pick=chooseGuide;globalThis.confirm=confirmGuidePair;',ctx);
 return ctx;
}
test('3D curve click selection and Enter confirm multiple operations',()=>{
 const t=pairing();
 t.pick(197);t.pick(544);assert.equal(t.confirm(),true);
 t.pick(337);t.pick(681);assert.equal(t.confirm(),true);
 assert.deepEqual(JSON.parse(JSON.stringify(t.savedGuidePairs)),[[197,544],[337,681]]);
 assert.equal(t.confirm(),false);
});
test('reject incompatible pairs and reusing the same curve',()=>{
 const t=pairing();
 t.pick(197);t.pick(681);assert.equal(t.confirm(),false);
 t.pendingGuide=[];t.pick(197);t.pick(544);assert.equal(t.confirm(),true);
 t.pick(197);t.pick(694);assert.equal(t.confirm(),false);
 assert.equal(t.savedGuidePairs.length,1);
});
test('3D interaction has drag guard, Enter, Escape and export',()=>{
 assert.match(source,/moved > 5/);
 assert.match(source,/e\.key === 'Enter'/);
 assert.match(source,/e\.key === 'Escape'/);
 assert.match(source,/foam-wire-guide-pairs-v1/);
 assert.match(source,/renderer\.domElement\.addEventListener\('pointerup'/);
});

test('manual mouse confirmation, explicit button and 3 px centre marker',()=>{
 assert.match(source,/guideConfirmButton\.addEventListener\('click', confirmGuidePair\)/);
 assert.match(source,/e\.button === 2 && rightPointerDown/);
 assert.match(source,/moved <= 5 && guideMode\) confirmGuidePair\(\)/);
 assert.match(source,/e\.preventDefault\(\)/);
 assert.match(source,/guideDot\.style\.left/);
 assert.match(source,/width:'3px', height:'3px'/);
});

test('right-button gestures have explicit navigation roles',()=>{
 const start=source.indexOf('  // Handle right button BEFORE OrbitControls');
 const end=source.indexOf("  renderer.domElement.addEventListener('pointermove'",start);
 assert.ok(start>=0 && end>start);
 const handlers={};
 const ctx={THREE:{MOUSE:{PAN:2,ROTATE:0}},
   controls:{mouseButtons:{RIGHT:2}},guideMode:true,manualActive:true,rightPointerDown:null,
   renderer:{domElement:{addEventListener(event,fn,capture){handlers[event]=fn;assert.equal(capture,true)}}}};
 vm.createContext(ctx);
 vm.runInContext(source.slice(start,end),ctx);
 function click(mod){
   let prevented=false,stopped=false;
   handlers.pointerdown({button:2,clientX:42,clientY:78,ctrlKey:false,metaKey:false,altKey:false,
     preventDefault(){prevented=true},stopImmediatePropagation(){stopped=true},...mod});
   return {prevented,stopped,down:ctx.rightPointerDown,action:ctx.controls.mouseButtons.RIGHT};
 }
 const plain=click({});
 assert.deepEqual(JSON.parse(JSON.stringify(plain.down)),[42,78]);
 assert.equal(plain.prevented,true);assert.equal(plain.stopped,true);
 const ctrl=click({ctrlKey:true});
 assert.equal(ctrl.down,null);assert.equal(ctrl.stopped,false);
 assert.equal(ctrl.action,ctx.THREE.MOUSE.PAN);
 const alt=click({altKey:true});
 assert.equal(alt.down,null);assert.equal(alt.stopped,false);
 assert.equal(alt.action,ctx.THREE.MOUSE.PAN);
 ctx.manualActive=false;
 const inactive=click({});
 assert.equal(inactive.stopped,false);assert.equal(inactive.down,null);
 // The bundled OrbitControls swaps PAN to ROTATE for ctrlKey,
 // and leaves PAN as PAN for altKey.
});

test('3D start pick chooses active pair and blocks midcurve starts on open profiles',()=>{
 const start=source.indexOf('  const guideStarts={};');
 const end=source.indexOf("  const guideModeButton = ",start);
 assert.ok(start>0&&end>start);
 const ctx={
  document:{getElementById:()=>({})},
  Gen:{matchGuideCurves:()=>({correspondence:{reverse:false,shift:0}})},
  savedGuidePairs:[[197,544],[337,681]],guideOp:{value:'0'},
  guideProgress:{value:'50'},guideEntryResult:{textContent:''},
  geometry:{auxiliaryCurves:[
   {id:197,closed:false,fixedAxis:1,points:[[0,0,0],[10,0,5],[20,0,0]]},
   {id:544,closed:false,fixedAxis:1,points:[[0,99,0],[10,99,5],[20,99,0]]},
   {id:337,closed:true,fixedAxis:1,points:[[0,0,0],[10,0,0],[10,10,0],[0,0,0]]},
   {id:681,closed:true,fixedAxis:1,points:[[0,99,0],[10,99,0],[10,99,10],[0,99,0]]}
  ]},guideFeedback:()=>{},invalidate:()=>{},
  resetStockSimulation:()=>{},updateGuideMotion:()=>{}
 };
 vm.createContext(ctx);
 vm.runInContext(source.slice(start,end)+
  ';globalThis.testPick=setGuideStart;globalThis.starts=guideStarts;',ctx);
 assert.equal(ctx.testPick(197,.5),false);
 assert.equal(ctx.testPick(694,0),false);
 assert.equal(ctx.testPick(544,.98),true);
 assert.equal(ctx.starts['197:544'],1);
 assert.equal(ctx.guideProgress.value,'0');
 ctx.guideOp.value='1';
 assert.equal(ctx.testPick(681,.4),true);
 assert.ok(Math.abs(ctx.starts['337:681']-.4)<1e-12);
});
test('native 3D start controls and normalized hit coordinate feed diagnostic motion',()=>{
 assert.match(source,/gnGuideStartMode/);
 assert.match(source,/gnGuideStartReset/);
 assert.match(source,/setGuideStart\(hit\.id,hit\.u\)/);
 assert.match(source,/u:\(i-1\+t\)\/\(positions\.length-1\)/);
 assert.match(source,/Gen\.resolveGuideStart\(a,b,guideStartFor\(pair\)\)/);
 assert.match(source,/guideStarts:\{\.\.\.guideStarts\}/);
});

test('preview stock, edge outline and local axes share the model displacement',()=>{
 const foam=source.match(/foam\.position\.set\(([^;]+)\);/);
 assert.ok(foam,'foam must use an explicit translated position');
 for(const axis of ['modelOffset[0]','modelOffset[1]','modelOffset[2]'])
   assert.ok(foam[1].includes(axis),axis+' missing in stock position');
 assert.match(source,/edge\.position\.copy\(foam\.position\)/);
 assert.match(source,/axes\.position\.set\(modelOffset\[0\]-stock\[0\]\/2,modelOffset\[1\]-stock\[1\]\/2,bottom\+modelOffset\[2\]\)/);
});

test('automatic placement button uses actual solver and keeps operator controls',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(html,/id="gnAutoPlace"/);
 assert.match(source,/gnAutoPlace'\)\.addEventListener\('click',async/);
 assert.match(source,/Gen\.autoPlace\(stepFile\.text,stepFile\.name/);
 assert.match(source,/modelRotation=best\.rotation/);
 assert.match(source,/modelOffset=best\.offset\.slice\(\)/);
 assert.match(source,/showOffset\(\)/);
});
