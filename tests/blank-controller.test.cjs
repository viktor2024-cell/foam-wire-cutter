const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const BlankCut=require("../blank-cut.js");
const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8").replace(/\r/g,"");
test("centre control sets zero and machine panel retains a separate stop",()=>{
  assert.match(html,/<button id="blankZero" class="jog-center stop"[^>]*>0<\/button>/);
  assert.equal((html.match(/id="blankZero"/g)||[]).length,1);
  assert.match(html,/<button id="blankMachineStop" class="stop">Стоп<\/button>/);
  assert.doesNotMatch(html,/id="blankStop"/);
});
function controller() {
  const start=html.indexOf("const BAUD ="),end=html.indexOf("refreshMachine();\n\n// ---",start);
  assert.ok(start>0&&end>start);
  const nodes={};
  const get=id=>nodes[id]??=( {value:"",checked:false,disabled:false,textContent:"",classList:{toggle(key,value){this[key]=value;}},
    setAttribute(key,value){this[key]=value;},
    addEventListener(type,fn){this[type]=fn;}} );
  const context=vm.createContext({BlankCut,$:get,TextEncoder,Uint8Array,
    performance:{now:()=>1000},setTimeout:()=>1,clearTimeout:()=>{},
    clearInterval:()=>{},confirm:()=>true,window:{addEventListener:()=>{}},
    navigator:{},playing:false,previewOnlyProgram:false,prog:null,simTime:0,
    render:()=>{},recheck:()=>{},requireMachinableProgram:()=>true,requireCurrentProgram:()=>true});
  vm.runInContext(html.slice(start,end)+"refreshMachine();"+
    ";globalThis.test={mach,blankSession,onLine,onStatus,refreshMachine,setJob:value=>job=value};",context);
  const c=context.test;
  const writes=[];
  Object.assign(c.mach,{connected:true,state:"Idle",writer:{write:bytes=>{writes.push([...bytes]);return Promise.resolve();}},hasPos:true});
  for(const [id,value] of Object.entries({blankZ:"50",blankY:"100",blankAngle:"90",blankFeed:"7",blankPower:"500",blankStep:"5",blankStepB:"5"}))
    get(id).value=value;
  c.onLine("$32=0"); c.refreshMachine();
  return {c,get,writes,click:id=>get(id).click(),ack:()=>c.onLine("ok")};
}
test("manual controls send steps only after home, calibration and matching live positions",()=>{
  const {c,get,click,ack}=controller();
  assert.equal(get("blankHeat").className,"heat-off");
  assert.equal(get("blankHeat").textContent,"Включить нагрев");
  assert.equal(get("blankStart").disabled,true);
  click("blankHome"); assert.equal(c.mach.queue[0].text,"M05");
  ack(); assert.equal(c.mach.queue[0].text,"$H");
  ack(); assert.equal(c.mach.queue[0].text,"G21 G90 G94");
  ack(); assert.match(c.mach.queue[0].text,/^G92 X249/);
  ack(); assert.equal(c.blankSession.phase,"await-home");
  c.onStatus("<Idle|MPos:249,238,245,236,-7.3>");
  assert.equal(c.blankSession.phase,"await-home");
  c.onStatus("<Idle|WPos:249,238,245,236,-7.3>");
  assert.equal(c.blankSession.phase,"ready");
  click("blankRotate"); assert.equal(c.mach.queue[0].text,"G00 B90.00 F1800.0"); ack();
  c.onStatus("<Idle|WPos:249,238,245,236,0>");
  assert.equal(c.blankSession.phase,"await-rotation");
  c.onStatus("<Idle|WPos:249,238,245,236,90>");
  assert.equal(c.mach.queue[0].text,"G00 X245.00 Z245.00");ack();
  assert.equal(c.mach.queue[0].text,"G00 Y236.00 A236.00");ack();
  c.onStatus("<Idle|WPos:245,236,245,236,90>");
  click("blankZDown");assert.equal(c.mach.queue[0].text,"G01 Y231.00 A231.00 F420.00");ack();
  c.onStatus("<Idle|WPos:245,231,245,231,90>");
  click("blankZero");assert.equal(c.mach.queue.length,0);
  assert.equal(c.mach.queue.length,0);
  assert.equal(c.blankSession.phase,"zeroed");
  assert.equal(get("blankHeat").className,"heat-off");
  click("blankHeat"); assert.equal(c.mach.queue[0].text,"M03 S500.00");
  assert.equal(get("blankHeat").disabled,true); assert.equal(get("blankHeat").className,"heat-on");ack();
  assert.equal(get("blankHeat").className,"heat-on");
  click("blankStart"); assert.equal(c.mach.queue[0].text,"G01 Y181.00 A181.00 F420.00");ack();
  assert.equal(c.mach.queue[0].text,"G01 X145.00 Z145.00 F420.00");ack();
  c.onStatus("<Idle|WPos:145,181,145,181,90>");
  click("blankHeat"); assert.equal(c.mach.queue[0].text,"M05");
  assert.equal(get("blankHeat").className,"heat-on");ack();
  assert.equal(get("blankHeat").className,"heat-off");
  click("blankEnd"); assert.equal(c.blankSession.phase,"idle");
});
test("out-of-travel Z and Y are marked red and block starting",()=>{
  const {c,get,click,ack}=controller();
  get("blankDry").checked=true;
  click("blankHome");ack();ack();ack();ack();
  c.onStatus("<Idle|WPos:249,238,245,236,-7.3>");
  click("blankRotate");ack();c.onStatus("<Idle|WPos:249,238,245,236,90>");
  ack();ack();c.onStatus("<Idle|WPos:245,236,245,236,90>");
  click("blankZero");
  get("blankZ").value="237";get("blankY").value="491";c.refreshMachine();
  assert.equal(get("blankZ").classList["blank-invalid"],true);
  assert.equal(get("blankY").classList["blank-invalid"],true);
  assert.equal(get("blankStart").disabled,true);
  get("blankZ").value="50";get("blankY").value="100";c.refreshMachine();
  assert.equal(get("blankZ").classList["blank-invalid"],false);
  assert.equal(get("blankY").classList["blank-invalid"],false);
  assert.equal(get("blankStart").disabled,false);
});
test("table arrow sends bounded rotation only at the raised HOME position",()=>{
  const {c,get,click,ack}=controller();
  click("blankHome");ack();ack();ack();ack();
  c.onStatus("<Idle|WPos:249,238,245,236,-7.3>");
  click("blankRotate");ack();c.onStatus("<Idle|WPos:249,238,245,236,90>");
  ack();ack();c.onStatus("<Idle|WPos:245,236,245,236,90>");
  assert.equal(get("blankBPlus").disabled,true);
  assert.equal(get("blankBMinus").disabled,false);
  click("blankBMinus");assert.equal(c.mach.queue[0].text,"G00 B85.00 F1800.0");ack();
  c.onStatus("<Idle|WPos:245,236,245,236,85>");
  assert.equal(c.blankSession.tableAngle,85);
  click("blankZero");
  assert.equal(c.blankSession.tableAngle,85);
});
test("return button uses calibrated 5 mm point without rotating the table",()=>{
  const {c,get,click,ack}=controller();
  click("blankHome");ack();ack();ack();ack();
  c.onStatus("<Idle|WPos:249,238,245,236,-7.3>");
  click("blankRotate");ack();c.onStatus("<Idle|WPos:249,238,245,236,90>");
  ack();ack();c.onStatus("<Idle|WPos:245,236,245,236,90>");
  assert.equal(get("blankReturn").disabled,false);
  click("blankReturn");assert.equal(c.mach.queue[0].text,"G00 X240.00 Z240.00");ack();
  c.onStatus("<Idle|WPos:240,236,240,236,90>");
  assert.equal(c.mach.queue[0].text,"G00 Y231.00 A231.00");ack();
  c.onStatus("<Idle|WPos:240,231,240,231,90>");
  assert.equal(c.blankSession.phase,"manual");assert.equal(c.blankSession.tableAngle,90);
});
test("controller errors block further motion",()=>{
  const {c,click,ack}=controller(); click("blankHome"); c.onLine("error:1");
  assert.equal(c.blankSession.phase,"fault"); assert.ok(c.mach.stopTimer);
  assert.throws(()=>c.blankSession.cut());
});
test("machine stop interrupts a manual operation and blocks further movement",()=>{
  const {c,click}=controller();
  click("blankHome");click("blankMachineStop");
  assert.equal(c.blankSession.phase,"fault");
  assert.ok(c.mach.stopTimer);
  assert.throws(()=>c.blankSession.cut());
});
test("laser mode prevents stationary heating",()=>{
  const {c,get,click,ack}=controller();
  click("blankHome"); ack(); ack(); ack(); ack();
  c.onStatus("<Idle|WPos:249,238,245,236,-7.3>");
  click("blankRotate"); ack(); c.onStatus("<Idle|WPos:249,238,245,236,90>");
  ack(); ack(); c.onStatus("<Idle|WPos:245,236,245,236,90>");
  click("blankZero");
  c.onLine("$32=1"); c.refreshMachine();
  assert.equal(get("blankHeat").disabled,true);
  click("blankHeat");
  assert.equal(c.mach.queue.length,0);
  assert.match(get("blankMessage").textContent,/\$32=0/);
});
test("dry run sends movements without enabling heat",()=>{
  const {c,get,click,ack}=controller();
  get("blankDry").checked=true;
  click("blankHome");ack();ack();ack();ack();
  c.onStatus("<Idle|WPos:249,238,245,236,-7.3>");
  click("blankRotate");ack();c.onStatus("<Idle|WPos:249,238,245,236,90>");
  ack();ack();c.onStatus("<Idle|WPos:245,236,245,236,90>");
  click("blankZero");
  assert.equal(get("blankHeat").disabled,true);
  assert.equal(get("blankStart").disabled,false);
  assert.equal(get("blankMoveTarget").disabled,false);
  click("blankMoveTarget");
  assert.equal(c.mach.queue[0].text,"G01 Y186.00 A186.00 F420.00");ack();
  assert.equal(c.mach.queue[0].text,"G01 X145.00 Z145.00 F420.00");ack();
  c.onStatus("<Idle|WPos:145,186,145,186,90>");
  assert.equal(c.blankSession.phase,"done");assert.equal(c.blankSession.hot,false);
});
test("heater state is marked uncertain after a controller alarm",()=>{
  const {c,get,click,ack}=controller();
  click("blankHome");ack();ack();ack();ack();
  c.onStatus("<Idle|WPos:249,238,245,236,-7.3>");
  click("blankRotate");ack();c.onStatus("<Idle|WPos:249,238,245,236,90>");
  ack();ack();c.onStatus("<Idle|WPos:245,236,245,236,90>");
  click("blankZero");click("blankHeat");ack();
  assert.equal(get("blankHeat").className,"heat-on");
  c.onLine("ALARM:1");
  assert.equal(get("blankHeat").className,"heat-unknown");
  assert.equal(get("blankHeat").disabled,true);
});
test("blank machine panel pauses without sending the next cut until resume",async()=>{
  const {c,get,click,ack,writes}=controller();
  get("blankHoldOff").checked=true;
  click("blankHome");ack();ack();ack();ack();
  c.onStatus("<Idle|WPos:249,238,245,236,-7.3>");
  click("blankRotate");ack();c.onStatus("<Idle|WPos:249,238,245,236,90>");
  ack();ack();c.onStatus("<Idle|WPos:245,236,245,236,90>");
  click("blankZero");click("blankHeat");ack();
  click("blankStart");assert.equal(c.mach.queue[0].text,"G01 Y186.00 A186.00 F420.00");
  click("blankPause");assert.equal(c.blankSession.paused,true);
  c.onStatus("<Hold:0|WPos:245,220,245,220,90>");
  assert.equal(c.blankSession.holdOff,true);
  assert.equal(get("blankHeat").className,"heat-unknown");
  ack();assert.equal(c.mach.queue.length,0);
  assert.equal(get("blankPause").textContent,"Продолжить");
  click("gPause");assert.equal(c.blankSession.paused,false);
  assert.equal(get("blankPause").textContent,"Пауза");
  assert.equal(c.mach.queue[0].text,"G01 X145.00 Z145.00 F420.00");
  await c.mach.tx;
  const realtime=writes.filter(a=>a.length===1).map(a=>a[0]);
  assert.deepEqual(realtime.slice(-3),[0x21,0x9e,0x7e]);
});
test("machine command and unlock are shared and blocked during a blank session",()=>{
  const {c,get,click,ack}=controller();
  click("blankUnlock");assert.equal(c.mach.queue[0].text,"$X");ack();
  assert.match(get("blankLog").textContent,/\$X/);
  get("blankCmd").value="$$";get("blankCmd").keydown({key:"Enter",target:get("blankCmd")});
  assert.equal(c.mach.queue[0].text,"$$");ack();
  click("blankHome");assert.equal(get("blankUnlock").disabled,true);
  const before=c.mach.queue.length;click("blankUnlock");
  get("blankCmd").value="G0 X0";get("blankCmd").keydown({key:"Enter",target:get("blankCmd")});
  assert.equal(c.mach.queue.length,before);
});
test("the blank panel can pause a program started in the main cutting tab",()=>{
  const {c,get,click}=controller();
  const active={paused:false,halt:false,acked:0,lines:[{text:"G01 X1"}],dry:false};
  c.setJob(active);c.refreshMachine();
  assert.equal(get("blankPause").disabled,false);
  click("blankPause");
  assert.equal(active.paused,true);
  assert.equal(get("blankPause").textContent,"Продолжить");
  assert.equal(get("gPause").textContent,"Продолжить");
});
