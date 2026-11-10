const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../tools/guide-editor.html'),'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new Function(js);
class C{setTransform(){}clearRect(){}beginPath(){}moveTo(){}lineTo(){}stroke(){}arc(){}fill(){}fillText(){}setLineDash(){}}
function browser(){
 const nodes=new Map(),handlers={};
 function get(id){if(!nodes.has(id))nodes.set(id,{id,value:'',checked:false,textContent:'',className:'',innerHTML:'',options:[],
  append(o){this.options.push(o)},getBoundingClientRect(){return {width:500,height:320,left:0,top:0}},
  getContext(){return new C()},addEventListener(e,fn){handlers[id+':'+e]=fn}});
  return nodes.get(id);}
 const document={getElementById:get,createElement:()=>({value:'',textContent:'',click(){}})};
 const c=vm.createContext({document,window:{devicePixelRatio:1,addEventListener(){}},console,Blob,
  URL:{createObjectURL(){return 'blob:test'},revokeObjectURL(){}},requestAnimationFrame(){}});
 vm.runInContext(js+';globalThis.api={setup,current,pick,pointAt,project,toScreen,frame:id=>frames[id],pairs:()=>pairs};',c);
 return {ui:c.api,get,handlers};
}
const coords=Array.from({length:8},(_,i)=>'#'+(i+1)+" = CARTESIAN_POINT('',("+(i%2*10)+'. ,'+Math.floor(i/2)*20+'. ,'+(i%2*5)+'.));').join('\n');
const guides=[11,12,13,14].map((id,i)=>"#"+id+" = B_SPLINE_CURVE_WITH_KNOTS ('',1,(#"+(i*2+1)+",#"+(i*2+2)+"),.UNSPECIFIED.,.F.,.F.,(2,2),(0.,1.),.UNSPECIFIED.);").join('\n');
test('mouse guide editor loads STEP, binds corresponding anchors, remembers pairs',()=>{
 const {ui,get,handlers}=browser();ui.setup(coords+'\n'+guides+"\n#20 = GEOMETRIC_CURVE_SET ('',(#11,#12,#13,#14));",'test.stp');
 assert.equal(get('curveA').options.length,4);
 for(const side of ['A','B']){
  const c=ui.current()[side==='A'?0:1],id='canvas'+side,p=ui.pointAt(c,.35),xy=ui.toScreen(ui.frame(id),ui.project(c,p));
  ui.pick({currentTarget:get(id),clientX:xy[0],clientY:xy[1]},side);
 }
 assert.equal(ui.pairs().length,1);
 assert.match(get('motion').textContent,/Координаты кареток/);
 get('curveA').value=13;get('curveB').value=14;handlers['curveB:change']();assert.equal(ui.pairs().length,0);
 get('curveA').value=11;get('curveB').value=12;handlers['curveB:change']();assert.equal(ui.pairs().length,1);
});
test('optional F4-11 real STEP smoke',{skip:!process.env.F4_STEP},()=>{
 const {ui}=browser();ui.setup(fs.readFileSync(process.env.F4_STEP,'utf8'),'F4-11.stp');
 assert.deepEqual(Array.from(ui.current(),c=>c.id),[197,544]);
});