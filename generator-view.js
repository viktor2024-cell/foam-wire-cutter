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
  let guideMode = false, startMode = false, manualActive = false, pendingGuide = [], savedGuidePairs = [], curveObjects = [];
  const guideStarts={}; // Keys are ordered STEP IDs: "curveA:curveB"; normalized A parameter.
  let guideStartMarker=null;
  const startButton=document.getElementById('gnGuideStartMode');
  const startResetButton=document.getElementById('gnGuideStartReset');
  const pairKey=ids=>ids.join(':');
  const selectedGuidePair=()=>savedGuidePairs[Number(guideOp.value)];
  const guideStartFor=ids=>guideStarts[pairKey(ids)]??0;
  function redrawStartMarker() {
    if(guideStartMarker) {
      guideStartMarker.parent?.remove(guideStartMarker);
      guideStartMarker.traverse(obj=>{
        obj.geometry?.dispose();obj.material?.dispose();
      });
      guideStartMarker=null;
    }
    const ids=selectedGuidePair();
    if(!geometry || !ids || !group) return;
    const a=geometry.auxiliaryCurves.find(x=>x.id===ids[0]);
    const b=geometry.auxiliaryCurves.find(x=>x.id===ids[1]);
    if(!a||!b)return;
    const {mapA,mapB}=Gen.resolveGuideStart(a,b,guideStartFor(ids));
    const positions=[
      guideToScene(guideSample(a,mapA(0))),
      guideToScene(guideSample(b,mapB(0)))
    ];
    const holder=new THREE.Group();
    for(const p of positions){
      const dot=new THREE.Mesh(new THREE.SphereGeometry(2.5,10,8),
        new THREE.MeshBasicMaterial({color:0xffe25b,depthTest:false}));
      dot.position.copy(p);dot.renderOrder=35;holder.add(dot);
    }
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(positions),
      new THREE.LineBasicMaterial({color:0xffe25b,depthTest:false,
        transparent:true,opacity:.75}));
    line.renderOrder=34;holder.add(line);
    guideStartMarker=holder;group.add(holder);
  }
  function setGuideStart(id,u) {
    const ids=selectedGuidePair();
    if(!ids || !ids.includes(id)) {
      guideFeedback('Выбери точку на одной из двух кривых активной пары.');
      return false;
    }
    const a=geometry?.auxiliaryCurves.find(c=>c.id===ids[0]);
    const b=geometry?.auxiliaryCurves.find(c=>c.id===ids[1]);
    if(!a||!b||!Number.isFinite(u))return false;
    const clicked=id===a.id?a:b;
    let start;
    if(clicked.closed) {
      if(id===a.id)start=((u%1)+1)%1;
      else {
        const {correspondence}=Gen.matchGuideCurves(a,b),offset=correspondence.shift/128;
        start=((correspondence.reverse?offset-u:u-offset)%1+1)%1;
      }
    }else{
      if(u>.1&&u<.9){
        guideFeedback('Открытый профиль: начало выбирается только у одного из двух концов.');
        return false;
      }
      const endpoint=u>=.9?1:0;
      if(id===a.id)start=endpoint;
      else {
        const {correspondence}=Gen.matchGuideCurves(a,b);
        start=correspondence.reverse?1-endpoint:endpoint;
      }
    }
    guideStarts[pairKey(ids)]=start;
    guideProgress.value='0';
    resetStockSimulation();
    guideEntryResult.textContent='Начало реза изменено: перепроверьте вход/выход и остаток материала.';
    updateGuideMotion();
    guideFeedback('Начало для #'+ids.join('/#')+' задано на '+(start*100).toFixed(1)+'% первого профиля.');
    invalidate();
    return true;
  }

  const guideModeButton = document.getElementById('gnGuideMode');
  const guideStatus = document.getElementById('gnGuideStatus');
  const guideOp = document.getElementById('gnGuideOperation');
  const guideProgress = document.getElementById('gnGuideProgress');
  const guideProgressText = document.getElementById('gnGuideProgressText');
  const guideMotion = document.getElementById('gnGuideMotion');
  let guideWire = null;
  const stockStage=document.getElementById('gnStockStage');
  const stockCloudToggle=document.getElementById('gnStockCloud');
  const stockSimResult=document.getElementById('gnStockSimResult');
  let stockSimulation=null,stockCloud=null;
  function clearStockCloud(){
    if(stockCloud){stockCloud.parent?.remove(stockCloud);
      stockCloud.geometry.dispose();stockCloud.material.dispose();stockCloud=null;}
  }
  function resetStockSimulation(){
    stockSimulation=null;clearStockCloud();stockStage.disabled=true;stockStage.replaceChildren();
    stockSimResult.textContent='Параметры или геометрия изменились. Повторите симуляцию удаления материала.';
  }
  function showStockStage(){
    clearStockCloud();
    if(!geometry||!stockSimulation||!stockCloudToggle.checked)return draw();
    const op=stockSimulation.operations[Number(stockStage.value)];
    if(!op)return draw();
    const data=op.sequentialStock.sparseRemainingPoints,converted=[];
    for(let i=0;i<data.length;i+=3){
      const p=guideToScene(data.slice(i,i+3));
      converted.push(p.x,p.y,p.z);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(converted,3));
    stockCloud=new THREE.Points(geo,new THREE.PointsMaterial({
      color:0x9eeab8,size:2.5,sizeAttenuation:false,depthTest:false,
      transparent:true,opacity:0.75
    }));
    stockCloud.renderOrder=14;group.add(stockCloud);draw();
  }
  stockStage.addEventListener('change',showStockStage);
  stockCloudToggle.addEventListener('change',showStockStage);
  // The wire preview is geometric only. No toolpath is approved by this UI.
  const guideSample = (curve, u) => {
    const pts = curve.points, end = pts.length - 1;
    const at = Math.max(0, Math.min(end, u * end));
    const i = Math.min(end - 1, Math.floor(at)), t = at - i;
    return pts[i].map((x,k) => x + t * (pts[i+1][k]-x));
  };
  const guideToScene = p => new THREE.Vector3(
    -p[1]-geometry.center[0]+modelOffset[0],
    p[0]-geometry.center[1]+modelOffset[1],
    p[2]-geometry.center[2]+(n('gnZ')+n('gnH')/2)+modelOffset[2]+modelZOffset
  );
  function updateGuideMotion() {
    guideProgressText.textContent = guideProgress.value + '%';
    if (guideWire) {guideWire.parent?.remove(guideWire);guideWire.geometry.dispose();guideWire.material.dispose();guideWire=null;}
    const pair = savedGuidePairs[Number(guideOp.value)];
    if (!geometry || !pair) {
      guideMotion.textContent='Назначьте пару кривых для диагностического просмотра. Станочный G-code не разрешён.';
      return draw();
    }
    const curves = geometry.auxiliaryCurves;
    const a=curves.find(c=>c.id===pair[0]), b=curves.find(c=>c.id===pair[1]);
    if (!a || !b) return draw();
    const t=Number(guideProgress.value)/100;
    const {correspondence,mapA,mapB,startU,reverseA}=Gen.resolveGuideStart(a,b,guideStartFor(pair));
    const pa=guideSample(a,mapA(t)),pb=guideSample(b,mapB(t));
    // Same phase and traversal matching used by the diagnostic two-tower
    // computation: 3D segment agrees with exported point correspondence.
    const vertices=[guideToScene(pa),guideToScene(pb)];
    const lineGeo=new THREE.BufferGeometry().setFromPoints(vertices);
    guideWire=new THREE.Line(lineGeo,new THREE.LineBasicMaterial({color:0xff6c00,depthTest:false}));
    guideWire.renderOrder=30;
    group.add(guideWire);
    const length=Math.hypot(...pa.map((x,k)=>x-pb[k]));
    guideMotion.textContent='Диагностика #'+pair.join('/#')+
      ' · '+Math.round(100*t)+'% · струна '+length.toFixed(1)+' мм · '+ 
      (a.fixedAxis===1?'B0':a.fixedAxis===0?'B90':'ось Z')+
      ' · обход B '+(correspondence.reverse?'обратный':'прямой')+
      ' · сдвиг начала '+correspondence.shift+'/128 · RMS '+correspondence.shapeRms.toFixed(2)+
      ' мм · начало A '+(startU*100).toFixed(1)+'%'+
      (reverseA?' (от конечной точки)':'')+
      '. Вход/выход и сохранность детали НЕ проверены.';
    redrawStartMarker();
    draw();
  }
  function refreshGuideOperations() {
    const current=guideOp.value;
    guideOp.replaceChildren();
    const first=document.getElementById('gnCutOrder').value==='B0_B90'?1:0;
    const order=savedGuidePairs.map((ids,i)=>({ids,i,
      axis:geometry?.auxiliaryCurves?.find(c=>c.id===ids[0])?.fixedAxis}));
    order.sort((a,b)=>(a.axis===first?0:1)-(b.axis===first?0:1));
    for (const {i,ids} of order) {
      const o=document.createElement('option');o.value=String(i);
      const a=geometry?.auxiliaryCurves?.find(c=>c.id===ids[0]);
      o.textContent='#'+ids.join(' / #')+' · '+(a?.fixedAxis===1?'B0':a?.fixedAxis===0?'B90':'ось Z');
      guideOp.appendChild(o);
    }
    guideOp.disabled=guideProgress.disabled=!savedGuidePairs.length;
    if ([...guideOp.options].some(o=>o.value===current)) guideOp.value=current;
    else guideOp.value=String(Math.max(0,savedGuidePairs.length-1));
    updateGuideMotion();
    const orderLabel=document.getElementById('gnCutOrder').value==='B0_B90'?'B0 → B90':'B90 → B0';
    const trimming=document.getElementById('gnTrim').checked?
      'Торцевание B'+document.getElementById('gnTrimAngle').value+' → ':'';
    const mixed=!!geometry?.auxiliaryCurves?.length;
    const blocked=geometry?.secondaryCount>0&&
      document.getElementById('gnCutOrder').value==='B0_B90';
    const finalOpenSlot=geometry?.openSlotCount>0&&!blocked&&!mixed;
    document.getElementById('gnOrderExplanation').textContent=
      'План: '+trimming+(finalOpenSlot?
        'B90 замкнутое отверстие → B0 основной профиль → B90 нижний паз (последний)':orderLabel)+'. '+
      (mixed?'Для вспомогательных кривых это диагностическая последовательность; проверьте G-code F4 отдельно.':
        blocked?'ВНИМАНИЕ: B0 первым может освободить деталь; этот порядок до дополнительной проверки заблокирован.':
        finalOpenSlot?'Перед завершающим пазом проверьте фиксацию детали после основного профиля.':
        'При поддерживаемой геометрии генератор сформирует G-code с указанными параметрами.');
  }
  guideOp.addEventListener('change',updateGuideMotion);
  guideProgress.addEventListener('input',updateGuideMotion);
  const guideEntryResult=document.getElementById('gnGuideEntryExitResult');
  const getGuideDiagnostic=()=>{
    if(!stepFile || !savedGuidePairs.length)
      throw new Error('Сначала выберите и подтвердите хотя бы одну пару направляющих.');
    const n=id=>Number(document.getElementById(id).value);
    return Gen.manualGuideDiagnostics(stepFile.text,savedGuidePairs,{
      rotation:modelRotation,offset:[...modelOffset],scale:n('gnScale')/100,
      tolerance:n('gnTolerance'),stock:[n('gnL'),n('gnW'),n('gnH')],
      bottomZ:n('gnZ'),clearance:n('gnClear'),kerf:n('gnKerf'),
      trim:document.getElementById('gnTrim').checked,
      trimAngle:n('gnTrimAngle'),cutOrder:document.getElementById('gnCutOrder').value,
      guideStarts:{...guideStarts},samples:128
    });
  };
  guideEntryResult.style.whiteSpace='pre-wrap';
  const guideEntrySummary=report=>report.operations.map(op=>{
    const name={ABOVE_STOCK:'сверху',OUTSIDE_LEFT:'слева',OUTSIDE_RIGHT:'справа'};
    const describe=(kind,data)=>kind+': '+data.candidates.map(c=>
      name[c.route]+' — '+(c.status==='CLEAR_RAPID'?'свободно':
        c.status==='OUT_OF_TRAVEL'?'ВНЕ ХОДОВ':'нужна прорезь')
    ).join('; ');
    return op.operation+' #'+op.ids.join('/#')+'\n'+
      describe('Вход',op.entryExit.entry)+'\n'+
      describe('Выход',op.entryExit.exit)+
      (op.closed?'\nЗамкнутый контур: нужен подтверждённый способ входа в материал.':'');
  }).join('\n\n');
  document.getElementById('gnGuideEntryExit').addEventListener('click',()=>{
    try {
      const report=getGuideDiagnostic();
      guideEntryResult.className='note crit';
      guideEntryResult.textContent='Результаты входов и выходов (3 варианта для каждого конца):\n\n'+
        guideEntrySummary(report)+
        '\n\nПересечения проверены с исходным прямоугольным блоком, не с готовой деталью. G-code запрещён.';
    } catch(e) {
      guideEntryResult.className='note crit';
      guideEntryResult.textContent='Проверка не выполнена: '+e.message;
    }
  });
  document.getElementById('gnCutOrder').addEventListener('change',()=>{
    resetStockSimulation();
    refreshGuideOperations();
    guideEntryResult.textContent='Изменён порядок B0/B90: повторите проверку входов и выходов.';
  });
  document.getElementById('gnTrimAngle').addEventListener('change',()=>{
    guideEntryResult.textContent='Изменён угол торцевания: повторите проверку.';
    rebuild(); refreshGuideOperations();
  });
  document.getElementById('gnTrim').addEventListener('change',()=>{
    resetStockSimulation();
    guideEntryResult.textContent='Изменён режим торцевания: повторите проверку.';
    refreshGuideOperations();
  });
  document.getElementById('gnGuideDiagnostic').addEventListener('click',()=>{
    try {
      const report=getGuideDiagnostic();
      const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=stepFile.name.replace(/\\.(stp|step)$/i,'')+'-motion-DIAGNOSTIC.json';
      document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
      const plan=report.plannedSequence.map(op=>op.type==='TRIM'?'Торцевание B'+op.angle:
        'Рез B'+op.angle+' #'+op.ids.join('/#')).join(' → ');
      const summary=report.operations.map(op=>op.operation+' #'+op.ids.join('/#')+
        ': X '+op.bounds.transverse.map(v=>v.toFixed(1)).join('…')+
        ', Z '+op.bounds.z.map(v=>v.toFixed(1)).join('…')+
        (op.insideEnvelope?' мм (в ходах)':' мм (ВНЕ ХОДОВ)')).join('; ');
      guideMotion.textContent='План: '+plan+'. Экспортировано '+report.operations.length+
        ' диагностических операций: '+summary+'. Это НЕ G-code.';
      guideEntryResult.className='note crit';
      guideEntryResult.textContent=guideEntrySummary(report)+'. Это не разрешение на резку.';
    } catch(e) {guideFeedback('Не удалось рассчитать диагностическую траекторию: '+e.message);}
  });

  document.getElementById('gnStockSimulate').addEventListener('click',()=>{
    try {
      stockSimResult.textContent='Вычисление объёмного остатка…';
      const report=getGuideDiagnostic();
      stockSimulation=report;
      stockStage.replaceChildren();
      report.operations.forEach((op,i)=>{
        const opt=document.createElement('option');opt.value=String(i);
        opt.textContent='Рез B'+op.angle+' (#'+op.ids.join('/#')+')';
        stockStage.appendChild(opt);
      });
      stockStage.disabled=false;
      stockStage.value=String(report.operations.length-1);
      const sim=report.stockRemoval;
      const summary=sim.operations.map(op=>
        'B'+op.angle+': срезано '+op.removedVoxels+' ячеек, осталось '+
        op.remainingVoxels+', связных частей '+op.componentCount+
        '; вход после предыдущих резов — '+
        op.entry.map(c=>c.route+': '+c.occupiedVoxelHits).join(', ')+
        '; выход после реза — '+
        op.exit.map(c=>c.route+': '+c.occupiedVoxelHits).join(', ')
      ).join(' | ');
      stockSimResult.className='note crit';
      stockSimResult.textContent='Диагностическая сетка '+
        sim.voxelSize.map(v=>v.toFixed(2)).join('×')+
        ' мм; снято торцеванием '+sim.trimmedVoxels+' ячеек. '+summary+
        '. Числа после двоеточия — пересечённые ячейки оставшегося пенопласта. '+
        'Облако показывает выбранный остаток. Сохранность STEP-детали ещё не подтверждена; G-code заблокирован.';
      showStockStage();
    }catch(e){
      resetStockSimulation();
      stockSimResult.className='note crit';
      stockSimResult.textContent='Не удалось смоделировать остаток: '+e.message;
    }
  });

  const guideConfirmButton = document.getElementById('gnGuideConfirm');
  // Keep Three.js navigation intact; a 3 px dot marks the pick cursor centre.
  host.style.position = 'relative';
  const guideDot = document.createElement('div');
  Object.assign(guideDot.style, {
    position:'absolute', width:'3px', height:'3px',
    borderRadius:'50%', background:'#ffffff', pointerEvents:'none',
    transform:'translate(-50%, -50%)', display:'none', zIndex:'20',
    boxShadow:'0 0 0 1px #17202b'
  });
  host.appendChild(guideDot);
  const guideColor = id => savedGuidePairs.some(p => p.includes(id)) ? 0x49cc83 :
    pendingGuide.includes(id) ? 0xffda54 : 0xc235a6;
  function guideFeedback(message) {
    guideConfirmButton.disabled = !guideMode || pendingGuide.length !== 2;
    guideStatus.textContent = message || (pendingGuide.length
      ? (pendingGuide.length === 2
        ? 'Выбраны #' + pendingGuide.join(' и #') + '. Нажмите ПОДТВЕРДИТЬ, правую кнопку мыши или Enter.'
        : 'Выбрана #' + pendingGuide[0] + '. Щёлкните вторую кривую.')
      : 'Пар: ' + savedGuidePairs.length + '. Выберите две кривые мышкой, затем ПКМ или ПОДТВЕРДИТЬ.');
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
      if (guideMode) guideFeedback('Нужно выбрать две разные кривые, затем нажать ПОДТВЕРДИТЬ, ПКМ или Enter.');
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
    guideStarts[pairKey([idA,idB])]=0;
    resetStockSimulation();
    guideEntryResult.textContent='Пары изменены: выполните проверку входа и выхода заново.';
    invalidate(); refreshGuideOperations();
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
        if (d < distance) {distance=d;winner={id:item.id,u:(i-1+t)/(positions.length-1)};}
      }
    }
    return winner;
  }
  let pointerDown = null, rightPointerDown = null;
  // Handle right button BEFORE OrbitControls' bubble listener. Its built-in
  // Ctrl/Meta/Shift inversion converts PAN into ROTATE; Alt is not inverted.
  // Accordingly Ctrl+RMB => PAN action (inverted to ROTATE), Alt+RMB =>
  // PAN action, and unmodified RMB is reserved for pair confirmation.
  renderer.domElement.addEventListener('pointerdown', e => {
    if (!manualActive) return;
    if (e.button !== 2) return;
    if (e.ctrlKey || e.metaKey) {
      controls.mouseButtons.RIGHT = THREE.MOUSE.PAN; // Ctrl swaps pan -> rotate
      rightPointerDown = null;
    } else if (e.altKey) {
      controls.mouseButtons.RIGHT = THREE.MOUSE.PAN; // Alt does not swap in this OrbitControls
      rightPointerDown = null;
    } else {
      rightPointerDown = guideMode ? [e.clientX,e.clientY] : null;
      e.preventDefault();
      e.stopImmediatePropagation(); // no accidental camera pan on plain RMB
    }
  }, true);
  renderer.domElement.addEventListener('pointermove', e => {
    if (!manualActive || (!guideMode && !startMode)) return;
    const rect = renderer.domElement.getBoundingClientRect();
    guideDot.style.left = (e.clientX - rect.left) + 'px';
    guideDot.style.top = (e.clientY - rect.top) + 'px';
    guideDot.style.display = 'block';
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    pointerDown = rightPointerDown = null;
    guideDot.style.display = 'none';
  });
  renderer.domElement.addEventListener('contextmenu', e => {
    if ((manualActive && (guideMode || startMode)) || e.ctrlKey || e.metaKey || e.altKey) e.preventDefault();
  });
  renderer.domElement.addEventListener('pointerdown', e => {
    if (!manualActive || (!guideMode && !startMode)) return;
    if (e.button === 0) pointerDown = [e.clientX,e.clientY];
    // Plain RMB is tracked by the capture-phase listener above.
  });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!manualActive || (!guideMode && !startMode)) return;
    if (e.button === 2 && rightPointerDown) {
      const moved = Math.hypot(e.clientX-rightPointerDown[0], e.clientY-rightPointerDown[1]);
      rightPointerDown = null;
      if (moved <= 5 && guideMode) confirmGuidePair(); // plain RMB click confirms
      return;
    }
    if (!pointerDown || e.button !== 0) return;
    const moved=Math.hypot(e.clientX-pointerDown[0],e.clientY-pointerDown[1]);
    pointerDown = null;
    if (moved > 5) return; // camera drag, not a pick
    const hit = guideHit(e.clientX,e.clientY);
    if (hit !== null) {
      if(startMode)setGuideStart(hit.id,hit.u);
      else chooseGuide(hit.id);
    }
  });
  guideModeButton.addEventListener('click', () => {
    guideMode = !guideMode;
    if(guideMode){startMode=false;startButton.setAttribute('aria-pressed','false');}
    pendingGuide = [];
    guideDot.style.display = 'none';
    guideFeedback(guideMode ? 'Выберите две кривые мышкой, затем ПКМ или ПОДТВЕРДИТЬ.' : undefined);
    renderer.domElement.style.cursor=guideMode?'crosshair':'';
    updateGuideColors();
  });
  startButton.addEventListener('click',()=>{
    startMode=!startMode;
    if(startMode){guideMode=false;pendingGuide=[];guideFeedback();}
    startButton.setAttribute('aria-pressed',String(startMode));
    startButton.textContent=startMode?'Начало реза: выбор в 3D':'Задать начало реза';
    guideDot.style.display='none';
    guideFeedback(startMode?
      'Выбери точку на любом профиле активной пары. Открытый профиль — только концы.':
      'Режим выбора начала выключен.');
    renderer.domElement.style.cursor=startMode?'crosshair':'';
  });
  startResetButton.addEventListener('click',()=>{
    const ids=selectedGuidePair();
    if(ids)setGuideStart(ids[0],0);
  });
  guideConfirmButton.addEventListener('click', confirmGuidePair);
  document.getElementById('gnGuideUndo').addEventListener('click', () => {
    if (pendingGuide.length) pendingGuide = [];
    else {
      const removed=savedGuidePairs.pop();
      if(removed)delete guideStarts[pairKey(removed)];
    }
    resetStockSimulation();
    guideEntryResult.textContent='Пары изменены: выполните проверку входа и выхода заново.';
    invalidate(); refreshGuideOperations(); guideFeedback(); updateGuideColors();
  });
  document.getElementById('gnGuideExport').addEventListener('click', () => {
    if (!stepFile || !savedGuidePairs.length) {
      guideFeedback('Сначала назначьте хотя бы одну пару на STEP-модели.');
      return;
    }
    const payload = {schema:'foam-wire-guide-pairs-v1',stepFile:stepFile.name,
      pairs:savedGuidePairs.map(([a,b])=>({a,b,startU:guideStartFor([a,b])})),
      guideStarts:{...guideStarts},
      validatedForMachining:false};
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url;a.download=stepFile.name.replace(/\\.(stp|step)$/i,'')+'-pairs.json';
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    guideFeedback('Пары сохранены в JSON. Это не разрешение на резку.');
  });
  document.addEventListener('keydown', e => {
    if (!manualActive || !guideMode || document.getElementById('panelGen').hidden ||
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
  function rebuild(preserveDiagnostics = false) {
    document.getElementById('gnStockFromModel').disabled = !geometry || geometry.diagnosticOnly;
    document.getElementById('gnAutoPlace').disabled = !geometry || geometry.diagnosticOnly;
    guideWire = null;guideStartMarker=null;
    if (preserveDiagnostics === true) clearStockCloud();
    else { stockCloud=null;resetStockSimulation(); }
    clear();curveObjects = []; group = new THREE.Group(); scene.add(group);
    if (guideEntryResult && preserveDiagnostics !== true) guideEntryResult.textContent='Размещение или модель изменены. Повторите проверку входа и выхода.';
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
    // Keep the stock and model in the same preview coordinate frame.
    // The model and auxiliary guides below already use modelOffset.
    foam.position.set(modelOffset[0],modelOffset[1],bottom + stock[2]/2 + modelOffset[2]);
    group.add(foam);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({color:0x4499cc}));
    edge.position.copy(foam.position); group.add(edge);
    const axes = new THREE.AxesHelper(Math.max(...stock)*.35);
    axes.position.set(modelOffset[0]-stock[0]/2,modelOffset[1]-stock[1]/2,bottom+modelOffset[2]);
    group.add(axes);
    if (geometry) {
      const paired = !manualActive && document.getElementById('gnStockPair').checked;
      const kerf = n('gnKerf');
      let placement;
      try { if (paired) placement=Gen.previewPair(geometry,stock[2],bottom,kerf); }
      catch(e) { fit.className='note crit';fit.textContent=e.message;aim();return; }
      const requiredZ=paired ? placement.minimumHeight : geometry.size[2];
      const stockFits=geometry.size[0]<=stock[0]+.001 &&
        geometry.size[1]<=stock[1]+.001 && requiredZ+2*Math.abs(modelZOffset)<=stock[2]+.001;
      const stockInMachine=stock[0]/2+Math.abs(modelOffset[0])<=machine.FieldWidth/2+.001 &&
        stock[1]/2+Math.abs(modelOffset[1])<=machine.HorizontalTravel/2+.001 &&
        bottom+modelOffset[2]>=0 &&
        bottom+modelOffset[2]+stock[2]<=machine.VerticalTravel+.001;
      // A blank may fit at B0 but exceed the 370 mm tower spacing at
      // the STEP bevel angle. Use the same physical projection as G-code.
      const bevelAngle=geometry.slopedPreview&&Number.isFinite(geometry.slopedBevelAngle)?
        geometry.slopedBevelAngle:null;
      const bevelProjection=bevelAngle===null?null:
        2*Gen.stockAlongWireAtAngle(stock[0],stock[1],modelOffset,bevelAngle);
      const bevelRoom=machine.FieldWidth-2;
      const bevelFits=bevelProjection===null||bevelProjection<=bevelRoom+1e-6;
      const fits=stockFits&&stockInMachine&&bevelFits;
      const shifted=modelOffset.some(v=>v!==0);
      const manualGuides=geometry.auxiliaryCurves?.length>0;
      const unsupported=shifted && !manualGuides && (paired || geometry.secondaryCount>0 || geometry.wireframe);
      const trimConflict=false;
      const copies=paired ? [
        {sign:[1,1,1],z:placement.zLower,color:0xe87722},
        {sign:[-1,-1,-1],z:placement.zUpper,color:0x22a8a0}
      ] : [{sign:[1,1,1],z:bottom+stock[2]/2,color:0xe87722}];
      for (const copy of copies) {
        const vertices=[],lines=[];
        const point=p=>p.map((v,k)=>copy.sign[k]*(v-geometry.center[k])+(k===2?copy.z+modelZOffset:0)+modelOffset[k]);
        const displayShell=geometry.closedShell||geometry.diagnosticShell;
        const displayRails=displayShell?[displayShell.rail]:geometry.slopedPreview?geometry.rails.slice(geometry.outerCount):geometry.rails;
        for (const rail of displayRails) {
          for(let i=1;i<rail.length;i++) {
            const [a,b]=rail[i-1].map(point),[c,d]=rail[i].map(point);
            vertices.push(...a,...b,...c,...b,...d,...c);lines.push(...a,...c,...b,...d);
          }
          lines.push(...point(rail[0][0]),...point(rail[0][1]),...point(rail.at(-1)[0]),...point(rail.at(-1)[1]));
        }
        if(displayShell){
          const axis=displayShell.capAxis,axes=[0,1,2].filter(value=>value!==axis);
          for(const end of [0,1]){
            const boundary=displayShell.rail.map(pair=>point(pair[end]));
            if(boundary.length>1 && Math.hypot(...boundary[0].map((value,k)=>value-boundary.at(-1)[k]))<.01)boundary.pop();
            const triangles=THREE.ShapeUtils.triangulateShape(boundary.map(p=>new THREE.Vector2(p[axes[0]],p[axes[1]])),[]);
            for(const triangle of triangles)for(const index of triangle)vertices.push(...boundary[index]);
          }
        }
        // Boundary-only tessellation is a diagnostic approximation for trimmed
        // faces; it must not be interpreted as a machining surface.
        for(const face of geometry.diagnosticFaces||[]){
          const boundary=face.map(point),normal=[0,0,0];
          if(face.patch){
            const grid=face.patch.map(row=>row.map(point));
            for(let j=1;j<grid.length;j++)for(let i=1;i<grid[j].length;i++){
              const a=grid[j-1][i-1],b=grid[j-1][i],c=grid[j][i-1],d=grid[j][i];
              vertices.push(...a,...b,...c,...b,...d,...c);
            }
            for(let i=0;i<boundary.length;i++)lines.push(...boundary[i],...boundary[(i+1)%boundary.length]);
            continue;
          }
          for(let i=0;i<boundary.length;i++){
            const a=boundary[i],b=boundary[(i+1)%boundary.length];
            normal[0]+=(a[1]-b[1])*(a[2]+b[2]);
            normal[1]+=(a[2]-b[2])*(a[0]+b[0]);
            normal[2]+=(a[0]-b[0])*(a[1]+b[1]);
            lines.push(...a,...b);
          }
          const axis=normal.reduce((best,v,i)=>Math.abs(v)>Math.abs(normal[best])?i:best,0);
          if(Math.abs(normal[axis])<1e-8)continue;
          const axes=[0,1,2].filter(k=>k!==axis);
          const triangles=THREE.ShapeUtils.triangulateShape(boundary.map(p=>new THREE.Vector2(p[axes[0]],p[axes[1]])),[]);
          for(const triangle of triangles)for(const index of triangle)vertices.push(...boundary[index]);
        }
        const color=fits&&!unsupported&&!trimConflict?copy.color:0xd73333;
        const mesh=new THREE.BufferGeometry();mesh.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
        group.add(new THREE.Mesh(mesh,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.45,depthWrite:false})));
        const outline=new THREE.BufferGeometry();outline.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
        group.add(new THREE.LineSegments(outline,new THREE.LineBasicMaterial({color})));
      }
      if (geometry.edgeLines?.length && !geometry.diagnosticShell) {
        // Preview-only recovery for BREP faces whose cutting topology is not
        // yet resolved. Show the real model edges behind selectable guides.
        const coords=[];
        for(const ends of geometry.edgeLines) for(const p of ends)
          coords.push(...p.map((v,k)=>v-geometry.center[k]+(k===2?bottom+stock[2]/2+modelZOffset:0)+modelOffset[k]));
        const boundary=new THREE.BufferGeometry();
        boundary.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
        group.add(new THREE.LineSegments(boundary,
          new THREE.LineBasicMaterial({color:0x679aad,transparent:true,opacity:.75})));
      }
      if(geometry.auxiliaryCurves?.length) {
        for(const curve of geometry.auxiliaryCurves) {
          const points=curve.points.map(p=>[-p[1],p[0],p[2]]);
          const coords=points.flatMap(p=>p.map((v,k)=>v-geometry.center[k]+(k===2?bottom+stock[2]/2+modelZOffset:0)+modelOffset[k]));
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
        ' мм. '+(unsupported?'Смещение этой комбинации операций пока не поддерживается. ':fits?'Помещается. ':!stockFits?'Модель не помещается в заготовку. ':!stockInMachine?'Заготовка выходит за ход станка в B0. ':'Заготовка не помещается между башнями при скосе. ')+(paired?'Минимальная высота: '+requiredZ.toFixed(1)+' мм. ':'')+
        (geometry.diagnosticOnly?'Направление реза не подтверждено.':geometry.axis===1?'Размах вдоль струны.':'Для генерации поверните размах вдоль струны.')+
        (geometry.auxiliaryCurves?.length?' Найдены '+geometry.auxiliaryCurves.length+
          ' вспомогательные кривые (розовые), пар направляющих: '+
          (geometry.guideAnalysis?.pairs.length||0)+
          '. Предварительные углы стола: '+
          (geometry.guideKinematics?.operations.map(op=>'B'+op.angle).join(', ')||'нет')+
          '. Траектории диагностические, резка запрещена до проверки объёма.':'');
      if(!bevelFits)fit.textContent+=' При B'+bevelAngle.toFixed(2)+
        '° проекция '+bevelProjection.toFixed(1)+' мм, доступно '+bevelRoom.toFixed(1)+
        ' мм (превышение '+(bevelProjection-bevelRoom).toFixed(1)+
        ' мм). Нажмите «По модели с припуском» или уменьшите размеры заготовки L/W.';
      if (geometry.previewError) fit.textContent += ' Траектория не определена: ' +
        geometry.previewError + (geometry.auxiliaryCurves?.length
          ? '. Для ручной привязки выберите две кривые и нажмите Enter.'
          : geometry.diagnosticFaces?.length
            ? '. Показаны приближённые грани STEP; генерация и автоматическое размещение недоступны.'
            : geometry.diagnosticShell
            ? '. Показана приближённая оболочка STEP; автоматический подбор заготовки и размещения недоступен.'
            : '. Показаны упрощённые рёбра STEP; автоматический подбор заготовки и размещения недоступен.');
      if(geometry.slopedPreview){
        fit.textContent+=' Контур со скосом: одна деталь; размещение проверяется также при повороте на скос.';
        if(geometry.rails.length>geometry.outerCount)fit.textContent+=' Вход в отверстие: прорезь сверху профиля.';
      }
      if(geometry.previewError && geometry.bevelCandidates?.length)
        fit.textContent+=' Возможные наклонные торцы: '+geometry.bevelCandidates.map(b=>'грань #'+b.face+' (B'+(document.getElementById('invB').checked?-b.angle:b.angle).toFixed(1)+'°)').join(', ')+'. Это анализ, не траектория реза.';
      if(!fits||unsupported||trimConflict||geometry.axis!==1||geometry.auxiliaryCurves?.length||geometry.previewError) fit.className='note crit';
    } else {
      fit.textContent = error || 'Откройте STEP для проверки размещения.';
      if (error) fit.className = 'note crit';
    }
    aim(); updateGuideMotion();
    if (preserveDiagnostics === true && manualActive) showStockStage();
  }
  let generatorPreviewLoadedFile = null;
  function load() {
    invalidate(); geometry = null; error = '';
    if (stepFile !== generatorPreviewLoadedFile) {
      savedGuidePairs = []; pendingGuide = []; 
      for(const key of Object.keys(guideStarts))delete guideStarts[key];
      generatorPreviewLoadedFile = stepFile || null;
    }
    try { if (stepFile) geometry = Gen.previewGeometry(stepFile.text, modelRotation, n('gnScale')/100, n('gnTolerance')); }
    catch (e) { error = e.message; }
    savedGuidePairs = savedGuidePairs.filter(pair => pair.every(id =>
      geometry?.auxiliaryCurves?.some(c => c.id === id)));
    pendingGuide = []; guideFeedback();
    guideEntryResult.textContent='Модель перестроена: проверка входа/выхода ещё не выполнялась.';
    rebuild(); refreshGuideOperations();
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
  const showOffset=()=>{document.getElementById('gnOffset').textContent=modelOffset.map((v,k)=>'XYZ'[k]+' '+(v>0?'+':'')+v).join(' · ')+' мм'+(modelZOffset?' · модель относительно центра Z '+(modelZOffset>0?'+':'')+modelZOffset+' мм':'');};
  document.getElementById('gnMove').addEventListener('click',e=>{
    const button=e.target.closest('button[data-axis]');if(!button||!stepFile)return;
    modelOffset[Number(button.dataset.axis)]+=5*Number(button.dataset.step);showOffset();invalidate();rebuild();
  });
  document.getElementById('gnResetOffset').addEventListener('click',()=>{modelOffset=[0,0,0];modelZOffset=0;showOffset();invalidate();rebuild();});

  // Full toolpath placement: analyse possible 90-degree orientations, solve
  // machine-axis displacement analytically, then run the normal postprocessor.
  // The existing +/- 5 mm controls remain available for manual adjustment.
  let autoPlacementBusy=false;
  document.getElementById('gnAutoPlace').addEventListener('click',async()=>{
    if(!stepFile||autoPlacementBusy)return;
    const button=document.getElementById('gnAutoPlace');
    const fit=document.getElementById('gnFit');
    const progress=document.getElementById('gnPlacementProgress');
    const progressText=document.getElementById('gnPlacementProgressText');
    const progressBar=document.getElementById('gnPlacementProgressBar');
    const initialSignature=generatorSignature();
    const config={
      rotation:modelRotation,modelZOffset,scale:n('gnScale')/100,tolerance:n('gnTolerance'),
      stock:[n('gnL'),n('gnW'),n('gnH')],bottomZ:n('gnZ'),
      kerf:n('gnKerf'),feed:n('gnFeed'),minS:n('gnMinS'),maxS:n('gnMaxS'),
      clearance:n('gnClear'),retract:n('gnRetract'),leadMargin:n('gnLead'),
      trim:document.getElementById('gnTrim').checked,
      trimAngle:n('gnTrimAngle'),cutOrder:document.getElementById('gnCutOrder').value,
      invB:document.getElementById('invB').checked,sideEntry:document.getElementById('gnSideEntry').checked,
      side:document.getElementById('gnSide').value==='-'?-1:1,
      powerComp:document.getElementById('gnComp').checked,
      pair:document.getElementById('gnStockPair').checked,
      mirror:false,manualGuidePairs:savedGuidePairs.map(p=>p.slice())
    };
    if(geometry?.auxiliaryCurves?.length){
      fit.className='note warn';
      fit.textContent='Авторазмещение ручных STEP-направляющих F4 ещё не поддержано. Для них сохраняется ручная установка.';
      return;
    }
    if(config.pair||config.sideEntry){
      fit.className='note warn';
      fit.textContent='Для авторазмещения отключите режим пары и боковой вход.';
      return;
    }
    autoPlacementBusy=true;button.disabled=true;
    button.textContent='Идёт авторазмещение…';
    progress.hidden=false;progressBar.value=0;
    progressText.textContent='Подготовка авторазмещения…';
    const rotations=[],seen=new Set(),queue=[{matrix:modelRotation,turns:0}];
    let best=null,checked=0,firstError='';
    try {
      for(let i=0;i<queue.length&&rotations.length<24;i++){
        const candidate=queue[i],key=candidate.matrix.flat().map(x=>Math.round(x*1e6)).join(',');
        if(seen.has(key))continue;
        seen.add(key);rotations.push(candidate);
        for(let axis=0;axis<3;axis++)
          queue.push({matrix:Gen.rotateModel(candidate.matrix,axis,1),turns:candidate.turns+1});
      }
      const stages=[
        {keepHeight:true,preferNegativeX:true,label:'сдвиг по −X без изменения заготовки'},
        {keepHeight:true,preferNegativeX:false,label:'без изменения заготовки'},
        {keepHeight:false,preferNegativeX:false,label:'с увеличением высоты заготовки'}
      ];
      for(const stage of stages){
      for(const item of rotations){
        checked++;
        progressBar.max=rotations.length*stages.length;progressBar.value=checked-1;
        progressText.textContent='Поиск: '+stage.label+'; проверено '+(checked-1)+' из '+(rotations.length*stages.length)+' вариантов…';
        fit.className='note';
        fit.textContent='Проверка вариантов '+checked+'/'+(rotations.length*stages.length)+
          ': рассчитываю полные траектории обеих кареток…';
        // Refresh the canvas and status between computational candidates.
        await new Promise(resolve=>setTimeout(resolve,0));
        try{
          const g=item.turns===0&&geometry ? geometry : Gen.previewGeometry(stepFile.text,item.matrix,config.scale,config.tolerance);
          if(g.axis!==1||g.diagnosticOnly||g.secondaryCount||g.wireframe||
             g.size[0]>config.stock[0]+.001||g.size[1]>config.stock[1]+.001||
             g.size[2]>config.stock[2]+.001) continue;
          const options={...config,rotation:item.matrix,grounded:true,keepHeight:stage.keepHeight,preferNegativeX:stage.preferNegativeX};
          const result=Gen.groundPlacement(stepFile.text,stepFile.name,options,
            Gen.autoPlace(stepFile.text,stepFile.name,options));
          // Prefer a small translation; a quarter turn costs a little to
          // retain the operator's chosen orientation when both are valid.
          const score=result.displacement+Math.min(item.turns,6)*2;
          if(!best||score<best.score)best={...result,score,turns:item.turns};
        }catch(e){if(!firstError)firstError=e.message;}
      }
      if(best)break;
      }
      progressBar.value=progressBar.max;
      if(initialSignature!==generatorSignature()){
        fit.className='note crit';
        fit.textContent='Параметры изменились во время расчёта. Запустите авторазмещение заново.';
        return;
      }
      if(!best){
        fit.className='note crit';
        fit.textContent='Авторазмещение не найдено для заданной заготовки и ходов станка. '+
          (firstError?'Причина одного из отклонённых вариантов: '+firstError:'Проверьте размеры STEP и заготовки.');
        return;
      }
      modelRotation=best.rotation;
      modelOffset=best.offset.slice();
      modelZOffset=best.modelZOffset;
      document.getElementById('gnH').value=best.stock[2];
      showOffset();
      load();
      fit.className='note';
      fit.textContent+=' Авторазмещение: X='+best.offset[0].toFixed(2)+
        ', Y='+best.offset[1].toFixed(2)+', Z='+best.offset[2].toFixed(2)+
        ' мм; модель поднята на '+best.lift.toFixed(2)+' мм внутри заготовки, высота заготовки '+best.stock[2].toFixed(2)+' мм; поворотов от исходного положения: '+best.turns+
        '. Шаг смещения: 5 мм; запас хода кареток по Z: не менее 5 мм. Траектория проверена обычным генератором. Проверяйте G-code в РЕЗКЕ.';
    }catch(e){
      fit.className='note crit';
      fit.textContent='Ошибка авторазмещения: '+e.message;
    }finally{
      autoPlacementBusy=false;button.disabled=!geometry || geometry.diagnosticOnly;
      button.textContent='Авторазмещение: поворот + сдвиг';
      progress.hidden=true;
    }
  });
  // Evaluate the actual model at every 90-degree orientation around the
  // wire axis, without rotating the span away from the wire. Choose stock
  // thickness first (20/50/100 if possible), then the smallest footprint.
  // A model that cannot fit any standard sheet gets a custom blank, subject
  // to the machine envelope and safe clearance.
  async function autoStockOptions(onProgress = ()=>{}) {
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
      onProgress(turn,rotations.length);
      await new Promise(resolve=>setTimeout(resolve,0));
      const rotation=rotations[turn].matrix;
      try{
        const g=turn===0&&geometry ? geometry : Gen.previewGeometry(stepFile.text,rotation,scale,n('gnTolerance'));
        // Both machine and generator require the span to lie along the wire.
        if(g.axis!==1||g.diagnosticOnly)continue;
        const required=paired ? Gen.previewPair(g,0,0,kerf).minimumHeight : g.size[2];
        const minimumHeight=required+20; // Stock and model move together; preserve 10 mm margins.
        // Standard 20/50/100 mm is the foam SHEET THICKNESS ALONG
        // THE WIRE (gnL / stock X), not the upright Z dimension.
        // Keep 5 mm on each wire-side end; vertical and transverse
        // cutting allowance remains 10 mm per side.
        const minimumLength=g.size[0]+10;
        const sheet=[20,50,100].find(t=>t+1e-7>=minimumLength);
        let length=sheet||round5(minimumLength);
        const height=round5(minimumHeight);
        let width=round5(g.size[1]+20);
        if(g.slopedPreview){
          if(paired||!Number.isFinite(g.slopedBevelAngle))continue;
          // Prefer the normal margins, then reduce excess only as necessary.
          // Leave at least half the kerf on each side of the model.
          const minLength=round5(g.size[0]+kerf),minWidth=round5(g.size[1]+kerf);
          const sweepAngles=[g.slopedBevelAngle];
          if(document.getElementById('gnTrim').checked&&n('gnTrimAngle')===90)
            sweepAngles.push(document.getElementById('invB').checked?-90:90);
          let chosen=null;
          for(let l=length;l>=minLength-1e-7&&!chosen;l-=5){
            for(let w=width;w>=minWidth-1e-7;w-=5){
              if(sweepAngles.some(a=>Gen.stockAlongWireAtAngle(l,w,modelOffset,a)>(machine.FieldWidth-2)/2+1e-7))continue;
              const radius=Math.hypot(l/2+Math.abs(modelOffset[0]),w/2+Math.abs(modelOffset[1]));
              if(radius>machine.ParkX-2+1e-7)continue;
              if(document.getElementById('gnTrim').checked&&n('gnTrimAngle')===90&&w/2+Math.abs(modelOffset[1])>machine.FieldWidth/2+1e-7)continue;
              chosen={length:l,width:w};break;
            }
          }
          if(!chosen)continue;
          length=chosen.length;width=chosen.width;
        }
        if(length/2+Math.abs(modelOffset[0])>machine.FieldWidth/2+1e-7 ||
           width/2+Math.abs(modelOffset[1])>machine.HorizontalTravel/2+1e-7 ||
           width/2+Math.abs(modelOffset[1])+n('gnLead')>machine.ParkX+1e-7 ||
           bottom+modelOffset[2]<0 ||
           bottom+modelOffset[2]+height+clearance>machine.VerticalTravel+1e-7)continue;
        results.push({rotation,geometry:g,length,width,height,standard:Boolean(sheet&&Math.abs(length-sheet)<1e-7),turn,
          description:rotations[turn].description,area:width*height,minimumHeight,minimumLength});
      }catch(e){/* A candidate may not form valid cutting geometry at this orientation. */}
    }
    // First use the thinnest standard sheet, then preserve current
    // orientation if it already fits. Never rotate just to shave Z.
    results.sort((a,b)=>a.length-b.length||a.turn-b.turn||a.area-b.area||a.height-b.height);
    return results;
  }
  document.getElementById('gnStockFromModel').addEventListener('click',async()=>{
    const button=document.getElementById('gnStockFromModel');
    const progress=document.getElementById('gnStockProgress');
    const progressText=document.getElementById('gnStockProgressText');
    const progressBar=document.getElementById('gnStockProgressBar');
    const initialSignature=generatorSignature();
    button.disabled=true;button.textContent='Расчёт заготовки…';progress.hidden=false;
    progressBar.removeAttribute('value');progressText.textContent='Подготовка расчёта заготовки…';
    let choices;
    try {
      await new Promise(resolve=>setTimeout(resolve,0));
      if(initialSignature!==generatorSignature())throw new Error('Параметры изменились. Запустите подбор заготовки заново.');
      load();
      if(!geometry)return;
      choices=await autoStockOptions((done,total)=>{
        progressBar.max=total;progressBar.value=done;
        progressText.textContent='Проверяется положение '+(done+1)+' из '+total+'…';
      });
    } catch(error) {
      const fit=document.getElementById('gnFit');fit.className='note crit';
      fit.textContent='Не удалось подобрать заготовку: '+error.message;
      return;
    } finally {
      progress.hidden=true;button.disabled=!geometry || geometry.diagnosticOnly;
      button.textContent='По модели с припуском';
    }
    if(initialSignature!==generatorSignature()){
      const fit=document.getElementById('gnFit');fit.className='note crit';
      fit.textContent='Параметры изменились во время расчёта. Запустите подбор заготовки заново.';
      return;
    }
    if(!choices.length){
      const fit=document.getElementById('gnFit');
      fit.className='note crit';
      fit.textContent='Ни одно положение модели не помещается в рабочую область с заданным нижним Z и безопасным зазором. Уменьшите масштаб или измените установку.';
      return;
    }
    const best=choices[0];
    modelRotation=best.rotation;
    modelZOffset=0;showOffset();
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
      '), заготовка '+best.length+' × '+best.width+' × '+best.height+' мм.'+
      (best.geometry.slopedPreview&&(best.width<Math.ceil((best.geometry.size[1]+20-1e-7)/5)*5||best.length<Math.ceil((best.geometry.size[0]+10-1e-7)/5)*5)
        ? ' Припуски уменьшены для поворота: вдоль струны '+((best.length-best.geometry.size[0])/2).toFixed(1)+' мм и поперёк '+((best.width-best.geometry.size[1])/2).toFixed(1)+' мм с каждой стороны.' : '');
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
  return {load,rebuild,chooseGuide,confirmGuidePair,setManualActive(active){
    manualActive=active; pointerDown=rightPointerDown=null; guideDot.style.display='none';
    renderer.domElement.style.cursor=active && (guideMode || startMode) ? 'crosshair' : '';
    if (document.getElementById('gnStockPair').checked) rebuild(true);
    else if (stockCloud) { stockCloud.visible=active; draw(); }
  },hasAuxiliaryCurves:()=>!!geometry?.auxiliaryCurves?.length,
    getGuidePairs:()=>savedGuidePairs.map(p=>p.slice()),
    getGuideStarts:()=>({...guideStarts})};
})();
