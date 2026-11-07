(function(root) {
  async function calculateStockPreview(moves, settings, onProgress = () => {}) {
    const sizes = [settings.W, settings.L, settings.H];
    if (!sizes.every(value => Number.isFinite(value) && value > 0) || !(settings.FW > 0)) throw new Error('Укажите размеры заготовки и расстояние между башнями.');
    const resolution = Math.max(3, Math.cbrt(sizes[0] * sizes[1] * sizes[2] / 120000));
    const dims = sizes.map(value => Math.max(1, Math.ceil(value / resolution)));
    const cell = sizes.map((value, index) => value / dims[index]);
    const min = [(settings.OX || 0) - sizes[0]/2, (settings.OY || 0) - sizes[1]/2, settings.Z0 + (settings.OZ || 0)];
    const [nx, ny, nz] = dims, total = nx * ny * nz;
    if(total>300000)throw new Error('Слишком большая объёмная сетка для предварительного просмотра.');
    const solid = new Uint8Array(total).fill(1);
    const index = (x, y, z) => (z * ny + y) * nx + x;
    const wireAt = (position) => {
      const angle = (settings.invB ? -1 : 1) * position.B * Math.PI / 180;
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      return [[-settings.FW/2, position.X, position.Y], [settings.FW/2, position.Z, position.A]].map(([x,y,z]) => [x*cosine+y*sine, -x*sine+y*cosine, z]);
    };
    const cutWire = (ends) => {
      const [first, second] = ends, direction = first.map((value, axis) => second[axis]-value);
      let low = 0, high = 1;
      for (let axis=0; axis<3; axis++) {
        if (Math.abs(direction[axis]) < 1e-12) { if (first[axis]<min[axis] || first[axis]>min[axis]+sizes[axis]) return; continue; }
        const start=(min[axis]-first[axis])/direction[axis], end=(min[axis]+sizes[axis]-first[axis])/direction[axis];
        low=Math.max(low,Math.min(start,end)); high=Math.min(high,Math.max(start,end));
      }
      if (low>high) return;
      const length=Math.hypot(...direction)*(high-low), steps=Math.max(1,Math.ceil(length/(Math.min(...cell)*0.4)));
      for(let sample=0;sample<=steps;sample++) {
        const fraction=low+(high-low)*sample/steps;
        const coords=first.map((value,axis)=>Math.floor((value+direction[axis]*fraction-min[axis])/cell[axis]));
        if(coords.every((value,axis)=>value>=0 && value<dims[axis])) solid[index(...coords)]=0;
      }
    };
    for(let moveIndex=0;moveIndex<moves.length;moveIndex++) {
      const move=moves[moveIndex];
      if(move.wire && !(settings.laser && move.type==='G0') && move.power>0) {
        const axes=['X','Y','Z','A','B'];
        const distance=Math.max(...['X','Y','Z','A'].map(axis=>Math.abs(move.to[axis]-move.from[axis])));
        const steps=Math.max(1,Math.ceil(distance/(Math.min(...cell)*0.4)),Math.ceil(Math.abs(move.to.B-move.from.B)));
        for(let sample=0;sample<=steps;sample++) {
          const position=Object.fromEntries(axes.map(axis=>[axis,move.from[axis]+(move.to[axis]-move.from[axis])*sample/steps]));
          cutWire(wireAt(position));
        }
      }
      if(moveIndex%30===0) { onProgress(moveIndex,moves.length); await new Promise(resolve=>setTimeout(resolve,0)); }
    }
    const labels=new Int32Array(total).fill(-1), queue=new Int32Array(total), components=[];
    for(let start=0;start<total;start++) {
      if(!solid[start] || labels[start]!==-1) continue;
      const label=components.length;let head=0,tail=1;queue[0]=start;labels[start]=label;
      while(head<tail) {
        const current=queue[head++],x=current%nx,y=Math.floor(current/nx)%ny,z=Math.floor(current/(nx*ny));
        const adjacent=[x>0?current-1:-1,x<nx-1?current+1:-1,y>0?current-nx:-1,y<ny-1?current+nx:-1,z>0?current-nx*ny:-1,z<nz-1?current+nx*ny:-1];
        for(const next of adjacent) if(next>=0 && solid[next] && labels[next]===-1){labels[next]=label;queue[tail++]=next;}
      }
      components.push({id:label,count:tail});
      if(components.length>512)throw new Error('Слишком много отдельных фрагментов для просмотра; увеличьте размер ячеек или проверьте траекторию.');
    }
    onProgress(moves.length,moves.length);
    return {dims,cell,min,labels,components};
  }
  root.calculateStockPreview=calculateStockPreview;
  if(typeof module!=='undefined')module.exports={calculateStockPreview};
})(typeof globalThis!=='undefined'?globalThis:this);
