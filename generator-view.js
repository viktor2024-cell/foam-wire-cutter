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
      const fits = geometry.size.every((v,k) => v <= stock[k] + .001);
      const vertices = [], lines = [];
      const point = p => p.map((v,k) => v - geometry.center[k] + (k===2 ? bottom+stock[2]/2 : 0));
      for (const rail of geometry.rails) {
        for (let i=1;i<rail.length;i++) {
          const [a,b] = rail[i-1].map(point), [c,d] = rail[i].map(point);
          vertices.push(...a,...b,...c,...b,...d,...c);
          lines.push(...a,...c,...b,...d);
        }
        lines.push(...point(rail[0][0]),...point(rail[0][1]),...point(rail.at(-1)[0]),...point(rail.at(-1)[1]));
      }
      const mesh = new THREE.BufferGeometry(); mesh.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      const color = fits ? 0xe87722 : 0xd73333;
      group.add(new THREE.Mesh(mesh,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.45,depthWrite:false})));
      const outline = new THREE.BufferGeometry(); outline.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
      group.add(new THREE.LineSegments(outline,new THREE.LineBasicMaterial({color})));
      fit.textContent = 'Модель: ' + geometry.size.map(v=>v.toFixed(2)).join(' × ') + ' мм (вдоль струны × поперёк × высота). ' +
        (fits ? 'Помещается в заготовку. ' : 'Не помещается в заготовку. ') +
        (geometry.axis === 1 ? 'Размах направлен вдоль струны.' : 'Для генерации поверните размах вдоль X — струны.');
      if (!fits || geometry.axis !== 1) fit.className = 'note crit';
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
  document.getElementById('gnStockFromModel').addEventListener('click',()=>{
    load(); // Use the current orientation and scale, including a just-edited scale field.
    if (!geometry) return;
    ['gnL','gnW','gnH'].forEach((id,k)=>{
      // Round up to 0.01 mm; ignore floating-point noise at exact hundredths.
      document.getElementById(id).value = Math.ceil((geometry.size[k] + 20) * 100 - 1e-7) / 100;
    });
    invalidate(); rebuild();
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
  return {load};
})();
