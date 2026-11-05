/* Generator-only placement view. Coordinates match Gen's model-to-machine mapping. */
const generatorPreview = (() => {
  const host = document.getElementById('gnView');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000);
  camera.up.set(0, 0, 1);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  let group = null, geometry = null, envelope = null, error = '', mode = '3d';
  const machine = Gen.CONFIG;
  document.getElementById('gnEnvelopeLegend').textContent = `Пунктир — рабочая область станка: ${machine.HorizontalTravel} мм поперёк струны × ${machine.VerticalTravel} мм по высоте × ${machine.FieldWidth} мм вдоль струны.`;
  const n = id => Number(document.getElementById(id).value);
  const draw = () => {
    scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--view').trim());
    if (envelope) envelope.material.color.set(getComputedStyle(document.documentElement).getPropertyValue('--muted').trim());
    if (!document.getElementById('panelGen').hidden) renderer.render(scene, camera);
  };
  controls.addEventListener('change', draw);
  const invalidate = () => {
    document.getElementById('gnDone').hidden = true;
    document.getElementById('gnOut').textContent = '';
    document.getElementById('gnStatus').textContent = '';
  };
  function aim() {
    const bottom = n('gnZ') || 0, height = n('gnH') || 0, modelHeight = geometry?.size[2] || 0;
    const low = Math.min(0, bottom, bottom + (height - modelHeight) / 2);
    const high = Math.max(machine.VerticalTravel, bottom + height, bottom + (height + modelHeight) / 2);
    const size = Math.max(machine.FieldWidth, machine.HorizontalTravel, high - low, n('gnL') || 1, n('gnW') || 1, ...(geometry?.size || [1]));
    const z = (low + high) / 2;
    // Fit both portrait and landscape canvases; preserve the chosen view when dimensions change.
    const d = size * 2.2 / Math.min(1, camera.aspect);
    controls.target.set(0, 0, z);
    camera.up.set(0, 0, 1);
    if (mode === 'top') { camera.position.set(0, 0, z + d); camera.up.set(0, 1, 0); }
    else if (mode === 'side') camera.position.set(d, 0, z);
    else { camera.position.set(.8, 1, .7).normalize().multiplyScalar(d); camera.position.z += z; }
    controls.update(); draw();
  }
  function clear() {
    if (!group) return;
    group.traverse(object => {
      object.geometry?.dispose();
      if (object.material) for (const mat of [].concat(object.material)) mat.dispose();
    });
    scene.remove(group);
  }
  function rebuild() {
    document.getElementById('gnStockFromModel').disabled = !geometry;
    clear(); group = new THREE.Group(); scene.add(group);
    const machineBox = new THREE.BoxGeometry(machine.FieldWidth, machine.HorizontalTravel, machine.VerticalTravel);
    envelope = new THREE.LineSegments(new THREE.EdgesGeometry(machineBox), new THREE.LineDashedMaterial({color:0x667788, dashSize:7, gapSize:5}));
    machineBox.dispose();
    envelope.computeLineDistances();
    envelope.position.z = machine.VerticalTravel / 2;
    group.add(envelope);
    const stock = [n('gnL'), n('gnW'), n('gnH')], bottom = n('gnZ');
    const valid = stock.every(v => Number.isFinite(v) && v > 0) && Number.isFinite(bottom) && bottom >= 0;
    const fit = document.getElementById('gnFit');
    fit.className = 'note';
    if (!valid) { fit.className = 'note crit'; fit.textContent = 'Введите положительные размеры заготовки и неотрицательный низ Z.'; aim(); return; }
    const box = new THREE.BoxGeometry(...stock);
    const foam = new THREE.Mesh(box, new THREE.MeshBasicMaterial({color: 0x4499cc, transparent:true, opacity:.12, depthWrite:false}));
    foam.position.z = bottom + stock[2]/2; group.add(foam);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({color:0x4499cc}));
    edge.position.copy(foam.position); group.add(edge);
    const axes = new THREE.AxesHelper(Math.max(...stock)*.35); axes.position.set(-stock[0]/2,-stock[1]/2,bottom); group.add(axes);
    if (geometry) {
      const paired = document.getElementById('gnStockPair').checked;
      const kerf = n('gnKerf');
      let placement;
      try { if (paired) placement=Gen.previewPair(geometry,stock[2],bottom,kerf); }
      catch(e) { fit.className='note crit';fit.textContent=e.message;aim();return; }
      const requiredZ=paired ? placement.minimumHeight : geometry.size[2];
      const fits=geometry.size[0]<=stock[0]+.001 && geometry.size[1]<=stock[1]+.001 && requiredZ<=stock[2]+.001;
      const copies=paired ? [
        {sign:[1,1,1],z:placement.zLower,color:0xe87722},
        {sign:[-1,-1,-1],z:placement.zUpper,color:0x22a8a0}
      ] : [{sign:[1,1,1],z:bottom+stock[2]/2,color:0xe87722}];
      for (const copy of copies) {
        const vertices=[],lines=[];
        const point=p=>p.map((v,k)=>copy.sign[k]*(v-geometry.center[k])+(k===2?copy.z:0));
        for (const rail of geometry.rails) {
          for(let i=1;i<rail.length;i++) {
            const [a,b]=rail[i-1].map(point),[c,d]=rail[i].map(point);
            vertices.push(...a,...b,...c,...b,...d,...c);lines.push(...a,...c,...b,...d);
          }
          lines.push(...point(rail[0][0]),...point(rail[0][1]),...point(rail.at(-1)[0]),...point(rail.at(-1)[1]));
        }
        const color=fits?copy.color:0xd73333;
        const mesh=new THREE.BufferGeometry();mesh.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
        group.add(new THREE.Mesh(mesh,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.45,depthWrite:false})));
        const outline=new THREE.BufferGeometry();outline.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
        group.add(new THREE.LineSegments(outline,new THREE.LineBasicMaterial({color})));
      }
      fit.textContent=(paired?'Пара: ':'Модель: ')+geometry.size.map(v=>v.toFixed(2)).join(' × ')+
        ' мм. '+(fits?'Помещается. ':'Не помещается. ')+(paired?'Минимальная высота: '+requiredZ.toFixed(1)+' мм. ':'')+
        (geometry.axis===1?'Размах вдоль струны.':'Для генерации поверните размах вдоль струны.');
      if(!fits||geometry.axis!==1) fit.className='note crit';
    } else {
      fit.textContent = error || 'Откройте STEP для проверки размещения.';
      if (error) fit.className = 'note crit';
    }
    aim();
  }
  function load() {
    invalidate(); geometry = null; error = '';
    try { if (stepFile) geometry = Gen.previewGeometry(stepFile.text, modelRotation, n('gnScale')/100); }
    catch (e) { error = e.message; }
    rebuild();
  }
  for (const [id,m] of [['gnView3d','3d'],['gnViewTop','top'],['gnViewSide','side']]) {
    document.getElementById(id).addEventListener('click',()=>{
      mode=m;
      for (const [button,v] of [['gnView3d','3d'],['gnViewTop','top'],['gnViewSide','side']]) document.getElementById(button).setAttribute('aria-pressed',String(mode===v));
      aim();
    });
  }
  document.getElementById('gnRotate').addEventListener('click',e=>{
    const button=e.target.closest('button[data-axis]'); if (!button || !stepFile) return;
    modelRotation=Gen.rotateModel(modelRotation,Number(button.dataset.axis),Number(button.dataset.turn)); load();
  });
  document.getElementById('gnResetRotation').addEventListener('click',()=>{modelRotation=Gen.identityRotation();load();});
  // Evaluate the actual model at every 90-degree orientation around the
  // wire axis, without rotating the span away from the wire. Choose stock
  // thickness first (20/50/100 if possible), then the smallest footprint.
  // A model that cannot fit any standard sheet gets a custom blank, subject
  // to the machine envelope and safe clearance.
  function autoStockOptions() {
    if (!stepFile) return [];
    const scale=n('gnScale')/100, paired=document.getElementById('gnStockPair').checked;
    const kerf=n('gnKerf'), bottom=n('gnZ'), clearance=n('gnClear');
    const round5=x=>Math.ceil((x-1e-7)/5)*5;
    const results=[];
    const rotations=[];
    const queue=[{matrix:modelRotation,turns:0,description:'текущее положение'}];
    const seen=new Set();
    for(let i=0;i<queue.length;i++){
      const state=queue[i],key=state.matrix.flat().map(v=>Math.round(v*1e6)).join(',');
      if(seen.has(key))continue;
      seen.add(key);rotations.push(state);
      for(let axis=0;axis<3;axis++){
        queue.push({matrix:Gen.rotateModel(state.matrix,axis,1),turns:state.turns+1,
          description:state.description==='текущее положение'?
            'поворот '+('XYZ'[axis])+' +90°':state.description+', '+('XYZ'[axis])+' +90°'});
      }
      if(rotations.length>=24)break;
    }
    for(let turn=0;turn<rotations.length;turn++){
      const rotation=rotations[turn].matrix;
      try{
        const g=turn===0&&geometry ? geometry : Gen.previewGeometry(stepFile.text,rotation,scale);
        // Both machine and generator require the span to lie along the wire.
        if(g.axis!==1)continue;
        const required=paired ? Gen.previewPair(g,0,0,kerf).minimumHeight : g.size[2];
        const minimumHeight=required+20; // 10 mm foam margin above and below
        const sheet=[20,50,100].find(h=>h+1e-7>=minimumHeight);
        const height=sheet||round5(minimumHeight);
        const length=round5(g.size[0]+20),width=round5(g.size[1]+20);
        if(length>machine.FieldWidth+1e-7 || width>machine.HorizontalTravel+1e-7 ||
           width/2+n('gnLead')>machine.ParkX+1e-7 ||
           bottom+height+clearance>machine.VerticalTravel+1e-7)continue;
        results.push({rotation,geometry:g,length,width,height,standard:Boolean(sheet),turn,
          description:rotations[turn].description,area:width*height,minimumHeight});
      }catch(e){/* A candidate may not form valid cutting geometry at this orientation. */}
    }
    results.sort((a,b)=>a.height-b.height||a.minimumHeight-b.minimumHeight||a.area-b.area||a.turn-b.turn);
    return results;
  }
  document.getElementById('gnStockFromModel').addEventListener('click',()=>{
    load(); // refresh orientation, model scale and geometry
    if(!geometry)return;
    const choices=autoStockOptions();
    if(!choices.length){
      const fit=document.getElementById('gnFit');
      fit.className='note crit';
      fit.textContent='Ни одно положение модели не помещается в рабочую область с заданным нижним Z и безопасным зазором. Уменьшите масштаб или измените установку.';
      return;
    }
    const best=choices[0];
    modelRotation=best.rotation;
    geometry=best.geometry;
    document.getElementById('gnL').value=best.length;
    document.getElementById('gnW').value=best.width;
    document.getElementById('gnH').value=best.height;
    invalidate();rebuild();
    const fit=document.getElementById('gnFit');
    // The stock check above has validated dimensions; append actionable
    // explanation without hiding its own "fits" status.
    const info='Автоподбор: '+best.description+', высота листа '+
      best.height+' мм ('+(best.standard?'стандартная':'нестандартная')+').';
    fit.textContent+=' '+info;
  });
  document.getElementById('gnScale').addEventListener('change',load);
  for (const id of ['gnL','gnW','gnH','gnZ']) document.getElementById(id).addEventListener('input',()=>{invalidate();rebuild();});
  new ResizeObserver(()=>{
    const w=host.clientWidth,h=host.clientHeight;if (!w || !h) return;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();aim();
  }).observe(host);
  new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',draw);
  rebuild();
  document.getElementById('gnStockPair')?.addEventListener('change',rebuild);
  document.getElementById('gnKerf').addEventListener('input',()=>{invalidate();rebuild();});
  return {load,rebuild};
})();
