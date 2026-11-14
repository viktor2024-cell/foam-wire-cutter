/* Rectangle packing for stock planning. This does not generate machine paths. */
(function(root) {
  "use strict";
  function parseNames(text) {
    const names = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!names.length) throw new Error("Добавьте хотя бы одно имя файла.");
    return names.map((name, id) => {
      const match = name.match(/(?:^|_)(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(?=_|\.|$)/);
      if (!match) throw new Error("Нет трёх размеров в имени: " + name);
      const dimensions = match.slice(1).map(Number).sort((a,b) => b-a);
      if (dimensions.some(n => !Number.isFinite(n) || n <= 0))
        throw new Error("Некорректные размеры: " + name);
      return {id,name,width:dimensions[0],height:dimensions[1],thickness:dimensions[2]};
    });
  }
  const close=(a,b)=>Math.abs(a-b)<1e-7;
  // An equal-height side at the prescribed gap is a shared cut only when
  // the two ends are aligned as well. Partial contacts are a weaker bonus.
  function contacts(items,candidate,gap) {
    let full=0,length=0;
    for(const a of items){
      if(close(a.x+a.width+gap,candidate.x)||close(candidate.x+candidate.width+gap,a.x)){
        const n=Math.max(0,Math.min(a.y+a.height,candidate.y+candidate.height)-Math.max(a.y,candidate.y));
        length+=n;if(n>0&&close(a.y,candidate.y)&&close(a.height,candidate.height))full++;
      }
      if(close(a.y+a.height+gap,candidate.y)||close(candidate.y+candidate.height+gap,a.y)){
        const n=Math.max(0,Math.min(a.x+a.width,candidate.x+candidate.width)-Math.max(a.x,candidate.x));
        length+=n;if(n>0&&close(a.x,candidate.x)&&close(a.width,candidate.width))full++;
      }
    }
    return {full,length};
  }
  function place(sheet, item, gap) {
    let best=null;
    for (const [index,free] of sheet.free.entries()) for (const rotated of [false,true]) {
      const width=rotated?item.height:item.width, height=rotated?item.width:item.height;
      const w=width+gap,h=height+gap;
      if (w>free.w || h>free.h) continue;
      const contact=contacts(sheet.items,{x:free.x,y:free.y,width,height},gap);
      for(const verticalFirst of [false,true]){
        // A slice is cut across its entire current free rectangle. The two
        // remainders never overlap, so every final layout admits straight cuts.
        const rw=free.w-w,rh=free.h-h;
        const largest=verticalFirst?Math.max(rw*free.h,w*rh):Math.max(rw*h,free.w*rh);
        const score=[-contact.full,-contact.length,Math.min(rw,rh),-largest,free.y,free.x];
        if (!best || score.some((n,i)=>n<best.score[i] && score.slice(0,i).every((v,j)=>v===best.score[j])))
          best={index,free,x:free.x,y:free.y,w,h,width,height,rotated,verticalFirst,score};
      }
    }
    if (!best) return false;
    const f=best.free,rw=f.w-best.w,rh=f.h-best.h;
    const remainder=best.verticalFirst ? [
      {x:f.x+best.w,y:f.y,w:rw,h:f.h},
      {x:f.x,y:f.y+best.h,w:best.w,h:rh}
    ] : [
      {x:f.x+best.w,y:f.y,w:rw,h:best.h},
      {x:f.x,y:f.y+best.h,w:f.w,h:rh}
    ];
    sheet.free.splice(best.index,1,...remainder.filter(r=>r.w>1e-7&&r.h>1e-7));
    sheet.items.push({...item,x:best.x,y:best.y,width:best.width,height:best.height,rotated:best.rotated});
    return true;
  }
  function pack(items, width, height, gap=0) {
    if (![width,height,gap].every(Number.isFinite) || width<=0 || height<=0 || gap<0)
      throw new Error("Проверьте размеры листа и зазор.");
    if (items.some(p=>!((p.width<=width && p.height<=height)||(p.height<=width && p.width<=height))))
      throw new Error("Одна из заготовок не помещается на лист даже с поворотом.");
    let seed=0x7a481, best=null;
    for (let attempt=0;attempt<2500;attempt++) {
      const order=items.slice();
      if (attempt===0) order.sort((a,b)=>b.width*b.height-a.width*a.height);
      else for(let i=order.length-1;i>0;i--) {
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        const j=seed%(i+1); [order[i],order[j]]=[order[j],order[i]];
      }
      const sheets=[];
      for (const item of order) {
        if (sheets.some(s=>place(s,item,gap))) continue;
        const sheet={free:[{x:0,y:0,w:width+gap,h:height+gap}],items:[]};
        if (!place(sheet,item,gap)) throw new Error("Не удалось разместить: "+item.name);
        sheets.push(sheet);
      }
      const quality=sheets.reduce((out,s)=>{
        for(let i=0;i<s.items.length;i++){
          const c=contacts(s.items.slice(0,i),s.items[i],gap);
          out.full+=c.full;out.length+=c.length;
        }return out;
      },{full:0,length:0});
      if (!best || sheets.length<best.sheets.length || sheets.length===best.sheets.length &&
          (quality.full>best.quality.full || quality.full===best.quality.full && quality.length>best.quality.length))
        best={sheets,quality};
    }
    return best.sheets.map(s=>s.items);
  }
  const api={parseNames,pack};
  if (typeof module!=="undefined" && module.exports) module.exports=api;
  else root.SheetLayout=api;
})(typeof globalThis!=="undefined"?globalThis:this);
