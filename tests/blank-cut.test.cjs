const test=require("node:test"),assert=require("node:assert/strict");
const {plan,HOME,ALIGNED,Session}=require("../blank-cut.js");
const origin={X:200,Y:180,Z:200,A:180,B:90};
function ready() {
  const sent=[],s=new Session(command=>sent.push(command),()=>{});
  s.home();s.ack();s.ack();s.ack();s.ack();s.status("Idle",HOME,true);
  s.rotate(90);s.ack();s.status("Idle",{...HOME,B:90},true);
  assert.equal(sent.at(-1),"G00 X245.00 Z245.00");s.ack();
  assert.equal(sent.at(-1),"G00 Y236.00 A236.00");s.ack();
  s.status("Idle",{...ALIGNED,B:90},true);
  assert.equal(s.phase,"manual");return {s,sent};
}
test("zero-relative plan goes down Z then inward Y",()=>{
  const p=plan(origin,50,100,7,500,90,false);
  assert.equal(p.lower,"G01 Y130.00 A130.00 F420.00");
  assert.equal(p.cut,"G01 X100.00 Z100.00 F420.00");
  assert.equal(plan(origin,0,100,7,500,90,true).lower,null);
  for(const args of [[181,100,7,500],[10,446,7,500],[-1,1,7,500],
    [1,0,7,500],[1,1,15,500],[1,1,7,1001]])
    assert.throws(()=>plan(origin,...args,90,false));
  assert.throws(()=>plan({...origin,A:170},1,1,7,500,90,false));
});
test("manual jogs wait for actual idle positions and zero does not send a command",()=>{
  const {s,sent}=ready(),start={...ALIGNED,B:90};
  assert.throws(()=>s.jog("Y",-1,5,start,7));
  assert.throws(()=>s.jog("Z",-1,20,start,7));
  s.jog("Z",1,5,start,7);assert.equal(sent.at(-1),"G01 Y231.00 A231.00 F420.00");s.ack();
  s.status("Run",{...start,Y:231,A:231},true);assert.equal(s.phase,"await-jog");
  const lowered={...start,Y:231,A:231};s.status("Idle",lowered,true);
  s.jog("Y",1,10,lowered,7);assert.equal(sent.at(-1),"G01 X235.00 Z235.00 F420.00");s.ack();
  const corner={...lowered,X:235,Z:235};s.status("Idle",corner,true);
  const before=sent.length;s.zero(corner);assert.equal(sent.length,before);assert.equal(s.phase,"zeroed");
  s.jog("Z",-1,5,corner,7);assert.equal(s.origin,null);
});
test("table jog is limited to HOME, cold wire and angles B0–B90",()=>{
  const {s,sent}=ready(),park={...ALIGNED,B:90};
  assert.throws(()=>s.jogB(1,5,park));
  assert.throws(()=>s.jogB(-1,5,{...park,X:240,Z:240}));
  s.jogB(-1,5,park);assert.equal(sent.at(-1),"G00 B85.00 F1800.0");s.ack();
  s.status("Idle",{...park,B:85},true);assert.equal(s.tableAngle,85);
  const zero={...park,B:85};s.zero(zero);
  assert.equal(plan(zero,10,10,7,500,85,false).angle,85);
});
test("heated cut and dry run enforce preparation and movement order",()=>{
  for(const dry of [false,true]){
    const {s,sent}=ready(),corner={...ALIGNED,B:90};s.zero(corner);
    const p=plan(corner,50,100,7,500,90,dry);s.prepare(p);
    if(dry) assert.throws(()=>s.heat()); else {assert.throws(()=>s.cut());s.heat();s.ack();}
    s.cut();assert.equal(sent.at(-1),p.lower);s.ack();
    assert.equal(sent.at(-1),p.cut);s.ack();
    s.status("Idle",{X:p.target,Z:p.target,Y:p.bottom,A:p.bottom,B:90},true);
    assert.equal(s.phase,"done");
    if(!dry){assert.throws(()=>s.end());s.off();s.ack();}
    s.end();assert.equal(s.phase,"idle");
  }
});
test("errors and lost connection prevent further movement",()=>{
  const failures=[],s=new Session(()=>{},error=>failures.push(error));
  s.home();s.ack("error:1");assert.equal(s.phase,"fault");
  assert.deepEqual(failures,["error:1"]);assert.throws(()=>s.zero(origin));
  s.reset();s.home();s.lost();assert.equal(s.phase,"fault");
});
test("return waits for the vertical move before moving Y and keeps B fixed",()=>{
  const {s,sent}=ready(),pos={X:100,Z:100,Y:100,A:100,B:90};
  s.zero(pos);s.returnHome(pos);
  assert.equal(s.origin,null);
  assert.equal(sent.at(-1),"G00 Y231.00 A231.00");s.ack();
  const count=sent.length;
  s.status("Run",{...pos,Y:231,A:231},true);assert.equal(sent.length,count);
  s.status("Idle",pos,true);assert.equal(sent.length,count);
  s.status("Idle",{...pos,Y:231,A:231},true);
  assert.equal(sent.at(-1),"G00 X240.00 Z240.00");s.ack();
  s.status("Idle",{X:240,Z:240,Y:231,A:231,B:90},true);
  assert.equal(s.phase,"manual");
  assert.ok(!sent.slice(count-1).some(line=>/\bB/.test(line)));
});
test("return from above target moves horizontally before final lowering",()=>{
  const {s,sent}=ready(),pos={X:200,Z:200,Y:236,A:236,B:90};
  s.returnHome(pos);assert.equal(sent.at(-1),"G00 X240.00 Z240.00");s.ack();
  s.status("Idle",{...pos,X:240,Z:240},true);
  assert.equal(sent.at(-1),"G00 Y231.00 A231.00");s.ack();
  s.status("Idle",{X:240,Z:240,Y:231,A:231,B:90},true);
  assert.equal(s.phase,"manual");
});
