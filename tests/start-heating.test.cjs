const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const h=fs.readFileSync('index.html','utf8');
const prep=vm.runInNewContext('('+h.slice(h.indexOf('function prepareContinuousHeat('),h.indexOf('function loadProgram('))+')');
const stream=vm.runInNewContext('('+h.slice(h.indexOf('function buildStream('),h.indexOf('// - Потоковая'))+')');
test('old generated F4 keeps heat through both passes',()=>{
 const t='; *** F4 OPERATOR-DIRECTED G-CODE ***\n$H\nG21 G90\nG92 X0\nG00 X10\nM03 S500\nG01 X20\nM05\nG00 X30\nM03 S500\nG01 X40\nM05\nG00 X0';
 const x=prep(t); assert.equal(x.problem,null); const a=x.text.split('\n');
 assert.ok(a.indexOf('$H')<a.indexOf('M03 S500')); assert.ok(a.indexOf('M03 S500')<a.indexOf('G00 X10'));
 assert.equal(a.filter(s=>s==='M05').length,1); assert.ok(a.indexOf('M05')>a.indexOf('G01 X40'));
 const dry=stream(x.text,true).map(x=>x.text).join('\n'); assert.doesNotMatch(dry,/M0?3|S500/);
});
test('unknown and no HOME programs are not silently rewritten',()=>{
 for(const text of ['G00 X1\nM03 S500\nG01 X2\nM05','; external\n$H\nG00 X1\nM03 S500\nG01 X2\nM05']){
  const result=prep(text); assert.equal(result.text,text); assert.ok(result.problem);
 }
});
