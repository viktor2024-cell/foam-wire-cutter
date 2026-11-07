const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calculateStockPreview}=require('../stock-preview.js');

const settings={W:30,L:30,H:30,Z0:0,FW:60,invB:false,laser:false};
const position=(height,cross=0)=>({X:cross,Y:height,Z:cross,A:height,B:0});

test('a hot wire sweep separates the stock into selectable components',async()=>{
  const result=await calculateStockPreview([{from:position(15,-20),to:position(15,20),wire:true,power:500,type:'G1'}],settings);
  assert.equal(result.components.length,2);
  assert.ok(result.components.every(component=>component.count>0));
  assert.ok(result.labels.some(label=>label===-1));
});

test('cold moves and laser-mode rapids do not remove material',async()=>{
  for(const move of [{wire:false,power:500,type:'G1'},{wire:true,power:500,type:'G0'},{wire:true,power:0,type:'G1'}]){
    const result=await calculateStockPreview([{...move,from:position(15,-20),to:position(15,20)}],{...settings,laser:true});
    assert.equal(result.components.length,1);
    assert.equal(result.components[0].count,result.labels.length);
  }
});

test('translated stock and rotated table retain the correct coordinate frame',async()=>{
  const rotated={...settings,OX:5,OY:0};
  const start={X:15,Y:-10,Z:15,A:-10,B:90};
  const end={...start,Y:40,A:40};
  const result=await calculateStockPreview([{from:start,to:end,wire:true,power:500,type:'G1'}],rotated);
  assert.ok(result.labels.some(label=>label===-1));
});
