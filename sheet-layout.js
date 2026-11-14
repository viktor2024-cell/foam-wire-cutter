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
  function place(sheet, item, gap, strategy) {
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
        const usedHeight=Math.max(free.y+height,...sheet.items.map(p=>p.y+p.height));
        const fit=[Math.min(rw,rh),Math.max(rw,rh)];
        const score=strategy===0 ? [usedHeight,...fit,-contact.full,-contact.length,-largest,free.y,free.x] :
          strategy===1 ? [...fit,usedHeight,-contact.full,-contact.length,-largest,free.y,free.x] :
          strategy===2 ? [free.y,free.x,...fit,-contact.full,-contact.length,-largest] :
          [-contact.full,-contact.length,...fit,usedHeight,-largest,free.y,free.x];
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
  // For small jobs enumerate guillotine partitions and retain only useful
  // width/height trade-offs. Each node describes a real straight-cut tree.
  function exactPack(items,width,height,gap){
    const count=items.length,total=1<<count,layouts=Array.from({length:total},()=>[]);
    const better=(a,b)=>a.full>b.full || a.full===b.full&&a.contact>b.contact;
    const add=(list,node)=>{
      if(node.w>width+1e-7||node.h>height+1e-7)return;
      for(const old of list){
        if(close(old.w,node.w)&&close(old.h,node.h)){
          if(!better(node,old))return;
          list.splice(list.indexOf(old),1);break;
        }
        if(old.w<=node.w+1e-7&&old.h<=node.h+1e-7)return;
      }
      for(let i=list.length-1;i>=0;i--)if(node.w<=list[i].w+1e-7&&node.h<=list[i].h+1e-7)list.splice(i,1);
      list.push(node);
    };
    for(let i=0;i<count;i++)for(const rotated of [false,true]){
      const p=items[i],w=rotated?p.height:p.width,h=rotated?p.width:p.height;
      add(layouts[1<<i],{w,h,full:0,contact:0,parts:[{...p,x:0,y:0,width:w,height:h,rotated}]});
    }
    for(let mask=1;mask<total;mask++)for(let left=(mask-1)&mask;left;left=(left-1)&mask){
      const right=mask^left;if(!right||left>right)continue;
      for(const a of layouts[left])for(const b of layouts[right])for(const horizontal of [true,false]){
        const dx=horizontal?a.w+gap:0,dy=horizontal?0:a.h+gap;
        const w=horizontal?a.w+gap+b.w:Math.max(a.w,b.w),h=horizontal?Math.max(a.h,b.h):a.h+gap+b.h;
        if(w>width+1e-7||h>height+1e-7)continue;
        const shifted=b.parts.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
        let full=a.full+b.full,contact=a.contact+b.contact;
        for(const p of shifted){const c=contacts(a.parts,p,gap);full+=c.full;contact+=c.length;}
        add(layouts[mask],{w,h,parts:[...a.parts,...shifted],full,contact});
      }
    }
    const solutions=Array(total).fill(null);solutions[0]={sheets:[],usedHeight:0,full:0,contact:0};
    for(let mask=1;mask<total;mask++){
      const first=mask&-mask;
      for(let subset=mask;subset;subset=(subset-1)&mask){
        if(!(subset&first)||!solutions[mask^subset])continue;
        const previous=solutions[mask^subset];
        for(const layout of layouts[subset]){
          const candidate={sheets:[...previous.sheets,layout.parts],usedHeight:previous.usedHeight+layout.h,
            full:previous.full+layout.full,contact:previous.contact+layout.contact};
          const best=solutions[mask];
          if(!best||candidate.sheets.length<best.sheets.length||candidate.sheets.length===best.sheets.length&&
             (candidate.usedHeight<best.usedHeight-1e-7||close(candidate.usedHeight,best.usedHeight)&&better(candidate,best)))
            solutions[mask]=candidate;
        }
      }
    }
    return solutions[total-1]?.sheets.sort((a,b)=>
      Math.max(...b.map(p=>p.y+p.height))-Math.max(...a.map(p=>p.y+p.height)));
  }
  function pack(items, width, height, gap=0) {
    if (![width,height,gap].every(Number.isFinite) || width<=0 || height<=0 || gap<0)
      throw new Error("Проверьте размеры листа и зазор.");
    if (items.some(p=>!((p.width<=width && p.height<=height)||(p.height<=width && p.width<=height))))
      throw new Error("Одна из заготовок не помещается на лист даже с поворотом.");
    if(items.length>0&&items.length<=8)return exactPack(items,width,height,gap);
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
        if (sheets.some(s=>place(s,item,gap,attempt%4))) continue;
        const sheet={free:[{x:0,y:0,w:width+gap,h:height+gap}],items:[]};
        if (!place(sheet,item,gap,attempt%4)) throw new Error("Не удалось разместить: "+item.name);
        sheets.push(sheet);
      }
      const quality=sheets.reduce((out,s)=>{
        out.usedHeight+=Math.max(0,...s.items.map(p=>p.y+p.height));
        for(let i=0;i<s.items.length;i++){
          const c=contacts(s.items.slice(0,i),s.items[i],gap);
          out.full+=c.full;out.length+=c.length;
        }return out;
      },{usedHeight:0,full:0,length:0});
      if (!best || sheets.length<best.sheets.length || sheets.length===best.sheets.length &&
          (quality.usedHeight<best.quality.usedHeight-1e-7 || close(quality.usedHeight,best.quality.usedHeight) &&
           (quality.full>best.quality.full || quality.full===best.quality.full && quality.length>best.quality.length)))
        best={sheets,quality};
    }
    return best.sheets.map(s=>s.items);
  }
  const api={parseNames,pack};
  if (typeof module!=="undefined" && module.exports) module.exports=api;
  else root.SheetLayout=api;
})(typeof globalThis!=="undefined"?globalThis:this);
