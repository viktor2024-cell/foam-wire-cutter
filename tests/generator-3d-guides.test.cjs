const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../generator-view.js'),'utf8');
function pairing() {
 const start=source.indexOf('  function chooseGuide(id) {');
 const end=source.indexOf('  // Project polyline vertices',start);
 assert.ok(start>0&&end>start);
 const ctx={guideMode:true,pendingGuide:[],savedGuidePairs:[],
  geometry:{auxiliaryCurves:[
   {id:197,fixedAxis:1,closed:false,points:[[0,0,0],[1,0,0]]},
   {id:544,fixedAxis:1,closed:false,points:[[0,99,0],[1,99,0]]},
   {id:337,fixedAxis:0,closed:true,points:[[0,0,0],[0,1,0]]},
   {id:681,fixedAxis:0,closed:true,points:[[251,0,0],[251,1,0]]},
   {id:694,fixedAxis:0,closed:false,points:[[0,0,0],[0,5,0]]}
  ]},messages:[],guideFeedback(message){this.messages.push(message)},updateGuideColors(){},
  invalidate(){}};
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
 assert.match(source,/moved <= 5\) confirmGuidePair\(\)/);
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
   controls:{mouseButtons:{RIGHT:2}},guideMode:true,rightPointerDown:null,
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
 // The bundled OrbitControls swaps PAN to ROTATE for ctrlKey,
 // and leaves PAN as PAN for altKey.
});
