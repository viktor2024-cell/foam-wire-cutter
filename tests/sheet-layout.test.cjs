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
function guillotine(items,gap) {
  if(items.length<2)return true;
  for(const [coord,size] of [['x','width'],['y','height']])for(const item of items){
    const cut=item[coord]+item[size],left=[],right=[];
    for(const p of items){
      if(p[coord]+p[size]<=cut+1e-7)left.push(p);
      else if(p[coord]>=cut+gap-1e-7)right.push(p);
      else break;
    }
    if(left.length+right.length===items.length && left.length && right.length &&
       guillotine(left,gap) && guillotine(right,gap))return true;
  }
  return false;
}
function fullShared(a,b,gap){
 const eq=(x,y)=>Math.abs(x-y)<1e-7;
 return ((eq(a.x+a.width+gap,b.x)||eq(b.x+b.width+gap,a.x))&&eq(a.y,b.y)&&eq(a.height,b.height))||
        ((eq(a.y+a.height+gap,b.y)||eq(b.y+b.height+gap,a.y))&&eq(a.x,b.x)&&eq(a.width,b.width));
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
test("matching dimensions share complete sides and sheets admit straight cuts",()=>{
 const input=parseNames(`F1_410-230-100.gcode\nF2_330-240-100.gcode\nW1_310-250-100.gcode\nstab_320-240-100.gcode\nkil_300-240-100.gcode\nW2_310-230-100.gcode\nW3_320-200-100.gcode`);
 for(const gap of [0,3]){
  const sheets=pack(input,700,1180,gap);assert.equal(sheets.length,1);verify(sheets,700,1180,gap);
  assert.ok(guillotine(sheets[0],gap),'cuts must separate the entire remaining rectangle');
  let matched=0;for(let i=0;i<sheets[0].length;i++)for(const p of sheets[0].slice(i+1))if(fullShared(sheets[0][i],p,gap))matched++;
  assert.ok(matched>=2,'equal-length sides should align for shared cuts');
 }
});
test("straight-cut layouts remain valid with varied parts and kerf",()=>{
 let seed=12345;
 const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let k=0;k<20;k++){
  const parts=Array.from({length:5+rnd(4)},(_,id)=>({id,name:'p'+id,width:30+rnd(100),height:30+rnd(100)}));
  const gap=k%2?3:0,sheets=pack(parts,250,300,gap);
  verify(sheets,250,300,gap);
  assert.equal(sheets.flat().length,parts.length);
  for(const sheet of sheets)assert.ok(guillotine(sheet,gap),'layout has no full straight-cut sequence');
 }
});
