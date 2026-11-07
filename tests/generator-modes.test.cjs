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
  const nodes = {gnModeAuto:{}, gnModeManual:{}, gnGo:{}, gnStockPair:{checked:true}};
  for (const node of [nodes.gnModeAuto, nodes.gnModeManual]) node.setAttribute = (key, value) => node[key] = value;
  const manual = [{hidden:true}], auto = [{hidden:false}];
  const preview = {setManualActive(value){this.active=value;}};
  const context = vm.createContext({$:id=>nodes[id], generatorPreview:preview,
    document:{querySelectorAll:selector=>selector === '.gn-manual' ? manual : auto}});
  vm.runInContext(html.slice(start,end) + html.slice(labelStart,labelEnd) +
    ';globalThis.switchMode=showGeneratorMode;globalThis.selected=selectedGenerateMode;', context);
  context.switchMode('manual');
  assert.equal(manual[0].hidden,false); assert.equal(auto[0].hidden,true);
  assert.equal(preview.active,true); assert.equal(nodes.gnStockPair.checked,true);
  assert.equal(context.selected(),'normal');
  context.switchMode('auto');
  assert.equal(manual[0].hidden,true); assert.equal(auto[0].hidden,false);
  assert.equal(context.selected(),'pair'); assert.equal(nodes.gnModeAuto['aria-pressed'],'true');
});
