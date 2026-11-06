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
  // Native Three.js curve selection, independent of the old stand-alone editor.
  // The saved pairs are user annotations; they do NOT authorize machine G-code.
  let guideMode = false, pendingGuide = [], savedGuidePairs = [], curveObjects = [];
  const guideModeButton = document.getElementById('gnGuideMode');
  const guideStatus = document.getElementById('gnGuideStatus');
  const guideColor = id => savedGuidePairs.some(p => p.includes(id)) ? 0x49cc83 :
    pendingGuide.includes(id) ? 0xffda54 : 0xc235a6;
  function guideFeedback(message) {
    guideStatus.textContent = message || (pendingGuide.length
      ? 'Выбрана #' + pendingGuide[0] + '. Щёлкните вторую кривую, затем Enter.'
      : 'Пар: ' + savedGuidePairs.length + '. Выберите две кривые мышкой и нажмите Enter.');
    guideModeButton.setAttribute('aria-pressed', String(guideMode));
    guideModeButton.textContent = guideMode ? 'Выбор кривых: включён' : 'Выбрать кривые в 3D';
    renderer.domElement.style.cursor = guideMode ? 'crosshair' : '';
  }
  function updateGuideColors() {
    for (const item of curveObjects) item.object.material.color.setHex(guideColor(item.id));
    draw();
  }
  function chooseGuide(id) {
    if (!guideMode) return;
    if (pendingGuide.includes(id)) pendingGuide = pendingGuide.filter(x => x !== id);
    else if (pendingGuide.length < 2) pendingGuide.push(id);
    else pendingGuide = [id];
    guideFeedback();
    updateGuideColors();
  }
  function confirmGuidePair() {
    if (!guideMode || pendingGuide.length !== 2) {
      if (guideMode) guideFeedback('Нужно выбрать две разные кривые, затем Enter.');
      return false;
    }
    const [idA, idB] = pendingGuide;
    if (savedGuidePairs.some(p => p.includes(idA) || p.includes(idB))) {
      guideFeedback('Кривая уже используется в другой паре. Отмените пару перед повторным выбором.');
      return false;
    }
    const curves = geometry?.auxiliaryCurves || [];
    const a = curves.find(c => c.id === idA), b = curves.find(c => c.id === idB);
    if (!a || !b || a.fixedAxis < 0 || a.fixedAxis !== b.fixedAxis) {
      guideFeedback('Нужны две кривые в параллельных координатных плоскостях.');
      return false;
    }
    const separation = Math.abs(a.points[0][a.fixedAxis] - b.points[0][b.fixedAxis]);
    if (separation < 0.1 || a.closed !== b.closed) {
      guideFeedback('Плоскости должны различаться; контуры должны быть оба открыты или оба замкнуты.');
      return false;
    }
    savedGuidePairs.push([idA, idB]); pendingGuide = [];
    invalidate();
    guideFeedback('Пара #' + idA + ' / #' + idB + ' назначена. Всего: ' +
      savedGuidePairs.length + '. Можно выбрать следующую пару.');
    updateGuideColors();
    return true;
  }
  // Project polyline vertices to screen, finding the closest actual rendered
  // segment. This avoids the world-space threshold ambiguity of Raycaster.Line.
  function guideHit(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = (clientX - rect.left), y = (clientY - rect.top);
    let winner = null, distance = 12; // CSS pixels
    const project = p => {
      const q = new THREE.Vector3(...p).project(camera);
      return [(q.x+1)*rect.width/2, (1-q.y)*rect.height/2, q.z];
    };
    for (const item of curveObjects) {
      const positions = item.points;
      for (let i = 1; i < positions.length; i++) {
        const a = project(positions[i-1]), b = project(positions[i]);
        if (a[2] < -1 || a[2] > 1 || b[2] < -1 || b[2] > 1) continue;
        const dx=b[0]-a[0], dy=b[1]-a[1], len=dx*dx+dy*dy;
        const t=len<1e-10?0:Math.max(0, Math.min(1, ((x-a[0])*dx+(y-a[1])*dy)/len));
        const d=Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);
        if (d < distance) {distance=d;winner=item.id;}
      }
    }
    return winner;
  }
  let pointerDown = null;
  renderer.domElement.addEventListener('pointerdown', e => {
    if (guideMode && e.button === 0) pointerDown = [e.clientX,e.clientY];
  });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!guideMode || !pointerDown || e.button !== 0) return;
    const moved=Math.hypot(e.clientX-pointerDown[0],e.clientY-pointerDown[1]);
    pointerDown = null;
    if (moved > 5) return; // camera drag, not a pick
    const id = guideHit(e.clientX,e.clientY);
    if (id !== null) chooseGuide(id);
  });
  guideModeButton.addEventListener('click', () => {
    guideMode = !guideMode;
    pendingGuide = [];
    guideFeedback(guideMode ? 'Щёлкните первую и вторую кривую, затем Enter.' : undefined);
    updateGuideColors();
  });
  document.getElementById('gnGuideUndo').addEventListener('click', () => {
    if (pendingGuide.length) pendingGuide = [];
    else savedGuidePairs.pop();
    invalidate(); guideFeedback(); updateGuideColors();
  });
  document.getElementById('gnGuideExport').addEventListener('click', () => {
    if (!stepFile || !savedGuidePairs.length) {
      guideFeedback('Сначала назначьте хотя бы одну пару на STEP-модели.');
      return;
    }
    const payload = {schema:'foam-wire-guide-pairs-v1',stepFile:stepFile.name,
      pairs:savedGuidePairs.map(([a,b])=>({a,b})) ,
      validatedForMachining:false};
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url;a.download=stepFile.name.replace(/\\.(stp|step)$/i,'')+'-pairs.json';
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    guideFeedback('Пары сохранены в JSON. Это не разрешение на резку.');
  });
  document.addEventListener('keydown', e => {
    if (!guideMode || document.getElementById('panelGen').hidden ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    if (e.key === 'Enter') { e.preventDefault(); confirmGuidePair(); }
    else if (e.key === 'Escape') {
      e.preventDefault(); pendingGuide = []; guideFeedback(); updateGuideColors();
    }
  });

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
    clear(); curveObjects = []; group = new THREE.Group(); scene.add(group);
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
      const fits=geometry.size[0]+2*Math.abs(modelOffset[0])<=stock[0]+.001 && geometry.size[1]+2*Math.abs(modelOffset[1])<=stock[1]+.001 && requiredZ+2*Math.abs(modelOffset[2])<=stock[2]+.001;
      const shifted=modelOffset.some(v=>v!==0);
      const unsupported=shifted && (paired || geometry.secondaryCount>0 || geometry.wireframe);
      const trimConflict=modelOffset[0]!==0 && document.getElementById('gnTrim').checked && stock[0]>geometry.size[0]+kerf+1e-6;
      const copies=paired ? [
        {sign:[1,1,1],z:placement.zLower,color:0xe87722},
        {sign:[-1,-1,-1],z:placement.zUpper,color:0x22a8a0}
      ] : [{sign:[1,1,1],z:bottom+stock[2]/2,color:0xe87722}];
      for (const copy of copies) {
        const vertices=[],lines=[];
        const point=p=>p.map((v,k)=>copy.sign[k]*(v-geometry.center[k])+(k===2?copy.z:0)+modelOffset[k]);
        for (const rail of geometry.rails) {
          for(let i=1;i<rail.length;i++) {
            const [a,b]=rail[i-1].map(point),[c,d]=rail[i].map(point);
            vertices.push(...a,...b,...c,...b,...d,...c);lines.push(...a,...c,...b,...d);
          }
          lines.push(...point(rail[0][0]),...point(rail[0][1]),...point(rail.at(-1)[0]),...point(rail.at(-1)[1]));
        }
        const color=fits&&!unsupported&&!trimConflict?copy.color:0xd73333;
        const mesh=new THREE.BufferGeometry();mesh.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
        group.add(new THREE.Mesh(mesh,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.45,depthWrite:false})));
        const outline=new THREE.BufferGeometry();outline.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
        group.add(new THREE.LineSegments(outline,new THREE.LineBasicMaterial({color})));
      }
      if (geometry.edgeLines?.length) {
        // Preview-only recovery for BREP faces whose cutting topology is not
        // yet resolved. Show the real model edges behind selectable guides.
        const coords=[];
        for(const ends of geometry.edgeLines) for(const p of ends)
          coords.push(...p.map((v,k)=>v-geometry.center[k]+(k===2?bottom+stock[2]/2:0)+modelOffset[k]));
        const boundary=new THREE.BufferGeometry();
        boundary.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
        group.add(new THREE.LineSegments(boundary,
          new THREE.LineBasicMaterial({color:0x679aad,transparent:true,opacity:.75})));
      }
      if(geometry.auxiliaryCurves?.length) {
        for(const curve of geometry.auxiliaryCurves) {
          const points=curve.points.map(p=>[-p[1],p[0],p[2]]);
          const coords=points.flatMap(p=>p.map((v,k)=>v-geometry.center[k]+(k===2?bottom+stock[2]/2:0)+modelOffset[k]));
          const path=new THREE.BufferGeometry();
          path.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
          const line = new THREE.Line(path,new THREE.LineBasicMaterial({
            color:guideColor(curve.id),depthTest:false,transparent:true,opacity:1
          }));
          line.renderOrder = 10; // visible even through the translucent stock
          group.add(line);
          const coordinates=[];
          for (let i=0;i<coords.length;i+=3) coordinates.push(coords.slice(i,i+3));
          curveObjects.push({id:curve.id,object:line,points:coordinates});
        }
      }
      fit.textContent=(paired?'Пара: ':'Модель: ')+geometry.size.map(v=>v.toFixed(2)).join(' × ')+
        ' мм. '+(unsupported?'Смещение этой комбинации операций пока не поддерживается. ':trimConflict?'Смещение X с торцеванием пока не поддерживается. ':fits?'Помещается. ':'Не помещается. ')+(paired?'Минимальная высота: '+requiredZ.toFixed(1)+' мм. ':'')+
        (geometry.axis===1?'Размах вдоль струны.':'Для генерации поверните размах вдоль струны.')+
        (geometry.auxiliaryCurves?.length?' Найдены '+geometry.auxiliaryCurves.length+
          ' вспомогательные кривые (розовые), пар направляющих: '+
          (geometry.guideAnalysis?.pairs.length||0)+
          '. Предварительные углы стола: '+
          (geometry.guideKinematics?.operations.map(op=>'B'+op.angle).join(', ')||'нет')+
          '. Траектории диагностические, резка запрещена до проверки объёма.':'');
      if (geometry.previewError) fit.textContent += ' Траектория не определена: ' +
        geometry.previewError + '. Для ручной привязки выберите две кривые и нажмите Enter.';
      if(!fits||unsupported||trimConflict||geometry.axis!==1||geometry.auxiliaryCurves?.length||geometry.previewError) fit.className='note crit';
    } else {
      fit.textContent = error || 'Откройте STEP для проверки размещения.';
      if (error) fit.className = 'note crit';
    }
    aim();
  }
  let generatorPreviewLoadedFile = null;
  function load() {
    invalidate(); geometry = null; error = '';
    if (stepFile !== generatorPreviewLoadedFile) {
      savedGuidePairs = []; pendingGuide = []; generatorPreviewLoadedFile = stepFile || null;
    }
    try { if (stepFile) geometry = Gen.previewGeometry(stepFile.text, modelRotation, n('gnScale')/100, n('gnTolerance')); }
    catch (e) { error = e.message; }
    savedGuidePairs = savedGuidePairs.filter(pair => pair.every(id =>
      geometry?.auxiliaryCurves?.some(c => c.id === id)));
    pendingGuide = []; guideFeedback();
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
  const showOffset=()=>{document.getElementById('gnOffset').textContent=modelOffset.map((v,k)=>'XYZ'[k]+' '+(v>0?'+':'')+v).join(' · ')+' мм';};
  document.getElementById('gnMove').addEventListener('click',e=>{
    const button=e.target.closest('button[data-axis]');if(!button||!stepFile)return;
    modelOffset[Number(button.dataset.axis)]+=5*Number(button.dataset.step);showOffset();invalidate();rebuild();
  });
  document.getElementById('gnResetOffset').addEventListener('click',()=>{modelOffset=[0,0,0];showOffset();invalidate();rebuild();});
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
        const g=turn===0&&geometry ? geometry : Gen.previewGeometry(stepFile.text,rotation,scale,n('gnTolerance'));
        // Both machine and generator require the span to lie along the wire.
        if(g.axis!==1)continue;
        const required=paired ? Gen.previewPair(g,0,0,kerf).minimumHeight : g.size[2];
        const minimumHeight=required+20+2*Math.abs(modelOffset[2]); // 10 mm foam margin above and below
        // Standard 20/50/100 mm is the foam SHEET THICKNESS ALONG
        // THE WIRE (gnL / stock X), not the upright Z dimension.
        // Keep 5 mm on each wire-side end; vertical and transverse
        // cutting allowance remains 10 mm per side.
        const minimumLength=g.size[0]+10+2*Math.abs(modelOffset[0]);
        const sheet=[20,50,100].find(t=>t+1e-7>=minimumLength);
        const length=sheet||round5(minimumLength);
        const height=round5(minimumHeight),width=round5(g.size[1]+20+2*Math.abs(modelOffset[1]));
        if(length>machine.FieldWidth+1e-7 || width>machine.HorizontalTravel+1e-7 ||
           width/2+n('gnLead')>machine.ParkX+1e-7 ||
           bottom+height+clearance>machine.VerticalTravel+1e-7)continue;
        results.push({rotation,geometry:g,length,width,height,standard:Boolean(sheet),turn,
          description:rotations[turn].description,area:width*height,minimumHeight,minimumLength});
      }catch(e){/* A candidate may not form valid cutting geometry at this orientation. */}
    }
    // First use the thinnest standard sheet, then preserve current
    // orientation if it already fits. Never rotate just to shave Z.
    results.sort((a,b)=>a.length-b.length||a.turn-b.turn||a.area-b.area||a.height-b.height);
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
    const info='Автоподбор: '+best.description+', толщина листа вдоль струны '+
      best.length+' мм ('+(best.standard?'стандартная':'нестандартная')+
      '), заготовка '+best.length+' × '+best.width+' × '+best.height+' мм.';
    fit.textContent+=' '+info;
  });
  document.getElementById('gnScale').addEventListener('change',load);
  document.getElementById('gnTolerance').addEventListener('change',load);
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
  document.getElementById('gnTrim').addEventListener('change',()=>{invalidate();rebuild();});
  guideFeedback();
  return {load,rebuild,chooseGuide,confirmGuidePair,getGuidePairs:()=>savedGuidePairs.map(p=>p.slice())};
})();
