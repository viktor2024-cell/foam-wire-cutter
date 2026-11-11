const test=require("node:test"),assert=require("node:assert/strict");
const {parseNames,pack}=require("../sheet-layout.js");
const names=`F1_100-410-250_auto.gcode
F2_100-330-240_auto.gcode
kil_240-300-100_auto.gcode
stab_330-240-100_pair_auto.gcode
W1_310-250-50_auto.gcode
W1_L_310-250-50_auto.gcode
W2_330-230-100_pair_auto.gcode
W3_330-220-100_pair_auto.gcode`;
function verify(sheets,width,height,gap) {
  for(const sheet of sheets) for(let i=0;i<sheet.length;i++) {
    const a=sheet[i];
    assert.ok(a.x>=0 && a.y>=0 && a.x+a.width<=width && a.y+a.height<=height);
    for(const b of sheet.slice(i+1))
      assert.ok(a.x+a.width+gap<=b.x || b.x+b.width+gap<=a.x ||
        a.y+a.height+gap<=b.y || b.y+b.height+gap<=a.y,
        `overlap or insufficient gap: ${a.name}, ${b.name}`);
  }
}
test("provided filenames fit within at most two sheets without overlaps",()=>{
  const parts=parseNames(names),sheets=pack(parts,700,1180,0);
  assert.equal(parts.length,8);
  assert.deepEqual([parts[0].width,parts[0].height,parts[0].thickness],[410,250,100]);
  assert.deepEqual([parts[4].width,parts[4].height,parts[4].thickness],[310,250,50]);
  assert.ok(sheets.length<=2);
  assert.equal(sheets.flat().length,8);
  assert.equal(new Set(sheets.flat().map(p=>p.id)).size,8);
  verify(sheets,700,1180,0);
});
test("adjustable gap and rotation are respected",()=>{
  const parts=parseNames("a_80-50-10.gcode\nb_80-50-10.gcode");
  const sheets=pack(parts,105,80,10);
  assert.equal(sheets.length,2); verify(sheets,105,80,10);
  const turned=pack(parseNames("a_80-50-10.gcode"),50,80,0);
  assert.equal(turned.length,1); assert.equal(turned[0][0].rotated,true);
});
test("invalid filenames and oversized blanks are reported",()=>{
  assert.throws(()=>parseNames("unlabelled.gcode"),/размер/);
  assert.throws(()=>pack(parseNames("big_800-710-10.gcode"),700,1180),/не помещается/);
});
