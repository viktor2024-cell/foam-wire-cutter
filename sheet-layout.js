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
  function splitFree(rect, used) {
    if (used.x >= rect.x+rect.w || used.x+used.w <= rect.x ||
        used.y >= rect.y+rect.h || used.y+used.h <= rect.y) return [rect];
    const result=[];
    if (used.x>rect.x) result.push({x:rect.x,y:rect.y,w:used.x-rect.x,h:rect.h});
    if (used.x+used.w<rect.x+rect.w) result.push({x:used.x+used.w,y:rect.y,w:rect.x+rect.w-used.x-used.w,h:rect.h});
    if (used.y>rect.y) result.push({x:rect.x,y:rect.y,w:rect.w,h:used.y-rect.y});
    if (used.y+used.h<rect.y+rect.h) result.push({x:rect.x,y:used.y+used.h,w:rect.w,h:rect.y+rect.h-used.y-used.h});
    return result;
  }
  function place(sheet, item, gap) {
    let best=null;
    for (const free of sheet.free) for (const rotated of [false,true]) {
      const width=rotated?item.height:item.width, height=rotated?item.width:item.height;
      const w=width+gap,h=height+gap;
      if (w>free.w || h>free.h) continue;
      const score=[Math.min(free.w-w,free.h-h),Math.max(free.w-w,free.h-h),free.y,free.x];
      if (!best || score.some((n,i)=>n<best.score[i] && score.slice(0,i).every((v,j)=>v===best.score[j])))
        best={x:free.x,y:free.y,w,h,width,height,rotated,score};
    }
    if (!best) return false;
    let next=sheet.free.flatMap(r=>splitFree(r,best));
    next=next.filter((a,i)=>!next.some((b,j)=>i!==j && a.x>=b.x && a.y>=b.y &&
      a.x+a.w<=b.x+b.w && a.y+a.h<=b.y+b.h &&
      (a.x!==b.x || a.y!==b.y || a.w!==b.w || a.h!==b.h || i>j)));
    sheet.free=next;
    sheet.items.push({...item,x:best.x,y:best.y,width:best.width,height:best.height,rotated:best.rotated});
    return true;
  }
  function pack(items, width, height, gap=0) {
    if (![width,height,gap].every(Number.isFinite) || width<=0 || height<=0 || gap<0)
      throw new Error("Проверьте размеры листа и зазор.");
    if (items.some(p=>!((p.width<=width && p.height<=height)||(p.height<=width && p.width<=height))))
      throw new Error("Одна из заготовок не помещается на лист даже с поворотом.");
    const area=items.reduce((s,p)=>s+p.width*p.height,0);
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
      if (!best || sheets.length<best.length) best=sheets;
      if (best.length===Math.ceil(area/(width*height))) break;
    }
    return best.map(s=>s.items);
  }
  const api={parseNames,pack};
  if (typeof module!=="undefined" && module.exports) module.exports=api;
  else root.SheetLayout=api;
})(typeof globalThis!=="undefined"?globalThis:this);
