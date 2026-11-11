(function() {
  "use strict";
  const el=id=>document.getElementById(id);
  const svgNS="http://www.w3.org/2000/svg";
  function svgNode(tag,attrs) {
    const node=document.createElementNS(svgNS,tag);
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,String(value));
    return node;
  }
  function renderSheet(items,index,width,height) {
    const section=document.createElement("section");
    const title=document.createElement("h3");
    title.textContent="Лист "+(index+1)+" · "+width+" × "+height+" мм";
    section.appendChild(title);
    const svg=svgNode("svg",{viewBox:`0 0 ${width} ${height}`,role:"img",
      "aria-label":`Раскладка на листе ${index+1}`,style:"display:block;width:min(100%, 700px);max-height:85vh;background:#f5f5f0;border:1px solid #777"});
    items.forEach((item,i)=>{
      svg.appendChild(svgNode("rect",{x:item.x,y:item.y,width:item.width,height:item.height,
        fill:`hsl(${(i*53+195)%360} 52% 76%)`,stroke:"#303840","stroke-width":2}));
      const label=svgNode("text",{x:item.x+item.width/2,y:item.y+item.height/2-8,
        "text-anchor":"middle","font-size":Math.min(20,item.width/9),"font-family":"sans-serif",fill:"#111"});
      const a=svgNode("tspan",{x:item.x+item.width/2,dy:0});
      a.textContent=item.name.replace(/_\d.*$/,""); label.appendChild(a);
      const b=svgNode("tspan",{x:item.x+item.width/2,dy:24});
      b.textContent=`${item.width} × ${item.height} мм`; label.appendChild(b);
      svg.appendChild(label);
    });
    section.appendChild(svg);
    const list=document.createElement("ul");
    items.forEach(item=>{
      const row=document.createElement("li");
      row.textContent=`${item.name}: ${item.width} × ${item.height} мм; X=${item.x}, Y=${item.y} мм${item.rotated?", повёрнута на 90°":""}`;
      list.appendChild(row);
    });
    section.appendChild(list);
    return section;
  }
  function build() {
    const result=el("layoutResults"), message=el("layoutMessage");
    result.replaceChildren();
    try {
      const items=SheetLayout.parseNames(el("layoutNames").value);
      const width=Number(el("layoutWidth").value),height=Number(el("layoutHeight").value),gap=Number(el("layoutGap").value);
      const sheets=SheetLayout.pack(items,width,height,gap);
      const area=items.reduce((n,p)=>n+p.width*p.height,0);
      message.textContent=`Листов: ${sheets.length}. Использовано ${(area/(sheets.length*width*height)*100).toFixed(1)}% площади. Начало координат — левый верхний угол.`;
      sheets.forEach((items,index)=>result.appendChild(renderSheet(items,index,width,height)));
    } catch (error) { message.textContent=error.message; }
  }
  el("layoutFiles").addEventListener("change",event=>{
    el("layoutNames").value=Array.from(event.target.files,file=>file.name).join("\n");
    build();
  });
  el("layoutBuild").addEventListener("click",build);
  build();
})();
