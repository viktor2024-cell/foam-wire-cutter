const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');

test('switching modes preserves controls and selects the correct generation mode', () => {
  const start = html.indexOf('let generatorMode = "auto";');
  const end = html.indexOf('function showTab(tab)', start);
  const labelStart = html.indexOf('function selectedGenerateMode()');
  const labelEnd = html.indexOf('function refreshGenerateMode()', labelStart);
  assert.ok(start >= 0 && end > start && labelStart >= 0 && labelEnd > labelStart);
  const nodes = {gnModeAuto:{}, gnModeManual:{}, tabCut:{}, panelGen:{}, panelCut:{}, gnGo:{}, gnStockPair:{checked:true}};
  for (const node of [nodes.gnModeAuto, nodes.gnModeManual, nodes.tabCut]) node.setAttribute = (key, value) => node[key] = value;
  const manual = [{hidden:true}], auto = [{hidden:false}];
  const preview = {setManualActive(value){this.active=value;}};
  const context = vm.createContext({$:id=>nodes[id], generatorPreview:preview,
    document:{querySelectorAll:selector=>selector === '.gn-manual' ? manual : selector === '.gn-auto' ? auto : []}});
  vm.runInContext(html.slice(start,html.indexOf('function openStep(',end)) + html.slice(labelStart,labelEnd) +
    ';globalThis.switchMode=showGeneratorMode;globalThis.showTab=showTab;globalThis.selected=selectedGenerateMode;', context);
  context.switchMode('manual');
  assert.equal(manual[0].hidden,false); assert.equal(auto[0].hidden,true);
  assert.equal(preview.active,true); assert.equal(nodes.gnStockPair.checked,true);
  assert.equal(context.selected(),'normal');
  context.showTab('cut');
  assert.equal(nodes.gnModeManual['aria-pressed'],'false'); assert.equal(nodes.tabCut['aria-pressed'],'true');
  context.showTab('gen');
  assert.equal(nodes.gnModeManual['aria-pressed'],'true'); assert.equal(nodes.panelGen.hidden,false);
  context.switchMode('auto');
  assert.equal(manual[0].hidden,true); assert.equal(auto[0].hidden,false);
  assert.equal(context.selected(),'pair'); assert.equal(nodes.gnModeAuto['aria-pressed'],'true');
});

test('manual generation keeps code available for review despite simulator critical warnings',()=>{
 const start=html.indexOf('function generate(mode)');
 const end=html.indexOf('$("tabCut").addEventListener',start);
 const values={gnScale:100,gnTolerance:.1,gnL:100,gnW:200,gnH:70,gnZ:10,
  gnKerf:1,gnFeed:7,gnMinS:500,gnMaxS:1000,gnClear:15,gnRetract:20,gnLead:5,
  gnTrimAngle:0,gnCutOrder:'B0_B90',gnSide:'+'};
 const nodes={};
 const lookup=id=>nodes[id]??=(Object.hasOwn(values,id)?{value:values[id]}:{checked:false});
 nodes.gnWarn={innerHTML:'',items:[],appendChild(item){this.items.push(item)}};
 const calls=[];
 const context=vm.createContext({$:lookup,stepFile:{name:'part.stp',text:'STEP'},job:null,
  generatorMode:'manual',modelRotation:[],modelOffset:[0,0,0],modelZOffset:0,
  generatorPreview:{getGuidePairs:()=>[[1,2]],getGuideStarts:()=>({}),hasAuxiliaryCurves:()=>true},
  Gen:{buildF4Program:()=>({program:'G21\nM05\n',diagnostic:{operations:[{}]},
   warnings:['Вход: нужна прорезь','Выход: нужна проверка']})},
  document:{createElement:()=>({})},generatorSignature:()=> 'current',setCamera:()=>{},
  prog:{check:{warns:[{level:'crit',text:'Перемещение через заготовку'}]}},
  loadProgram:(...args)=>calls.push(args)});
 vm.runInContext(html.slice(start,end)+';globalThis.runGenerate=generate;',context);
 context.runGenerate('normal');
 assert.equal(calls.length,1);
 assert.equal(calls[0][2].previewOnly,false);
 assert.equal(calls[0][2].operatorDirected,true);
 assert.equal(nodes.gnDone.hidden,false);
 assert.equal(nodes.gnSave.hidden,false);
 assert.match(nodes.gnStatus.textContent,/Критических замечаний симулятора: 1/);
 assert.equal(nodes.gnWarn.items.length,2);
});

test('machine start still blocks simulator critical errors for operator-directed code',()=>{
 const start=html.indexOf('function startJob()');
 const end=html.indexOf('function togglePause()',start);
 const messages=[];
 const context=vm.createContext({requireMachinableProgram:()=>true,requireCurrentProgram:()=>true,
  mach:{connected:true,state:'Idle',spinOn:false},job:null,operatorDirectedProgram:true,
  prog:{check:{warns:[{level:'crit',text:'Перемещение через заготовку'}]}},
  $:()=>({checked:false}),currentText:'G21\nM05\n',buildStream:()=>[],
  showMsg:message=>messages.push(message),confirm:()=>assert.fail('blocked job must not reach confirmation')});
 vm.runInContext(html.slice(start,end)+';globalThis.runStart=startJob;',context);
 context.runStart();
 assert.equal(context.job,null);
 assert.match(messages[0],/Запуск заблокирован: критических ошибок траектории 1/);
});
