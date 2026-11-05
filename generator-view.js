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
    try { if (stepFile) geometry = Gen.previewGeometry(stepFile.text, modelRotation, n('gnScale')/100, n('gnTolerance')); }
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
  document.getElementById('gnStockFromModel').addEventListener('click',()=>{
    load(); // Use the current orientation and scale, including a just-edited scale field.
    if (!geometry) return;
    const round5 = x => Math.ceil((x - 1e-7) / 5) * 5;
    const pair = document.getElementById('gnStockPair')?.checked || false;
    const kerf = n('gnKerf') || 0;
    let requiredHeight;
    try { requiredHeight = (pair ? Gen.previewPair(geometry, 100, 0, kerf).minimumHeight : geometry.size[2]) + 20; }
    catch(e) { const fit=document.getElementById("gnFit");fit.className="note crit";fit.textContent=e.message;return; }
    const thickness = [20,50,100].find(t => t + 1e-7 >= requiredHeight);
    if (!thickness) {
      const fit = document.getElementById('gnFit');
      fit.className = 'note crit';
      fit.textContent = 'Нужна высота ' + requiredHeight.toFixed(1) + ' мм; один стандартный лист (20/50/100 мм) не подходит.';
      return;
    }
    document.getElementById('gnL').value = round5(geometry.size[0] + 20);
    document.getElementById('gnW').value = round5(geometry.size[1] + 20);
    document.getElementById('gnH').value = thickness;
    invalidate(); rebuild();
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
  return {load,rebuild};
})();
