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
