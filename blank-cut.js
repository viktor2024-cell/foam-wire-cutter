(function(root) {
  "use strict";
  const HOME={X:249,Y:238,Z:245,A:236,B:-7.3};
  const ALIGNED={X:245,Y:236,Z:245,A:236};
  const limits={horizontal:490,vertical:250,power:1000};
  const f=n=>Number(n).toFixed(2);
  const near=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<0.15;
  const same=(pos,target)=>Object.entries(target).every(([axis,value])=>near(pos[axis],value));
  function checkPosition(pos) {
    if (!pos || !["X","Y","Z","A","B"].every(a=>Number.isFinite(pos[a])) ||
        Math.abs(pos.X-pos.Z)>0.15 || Math.abs(pos.Y-pos.A)>0.15)
      throw new Error("Положение обеих кареток не подтверждено или струна не выровнена.");
    if ([pos.X,pos.Z].some(x=>Math.abs(x)>245) || [pos.Y,pos.A].some(z=>z<0 || z>250))
      throw new Error("Положение вне рабочего хода кареток.");
  }
  function plan(origin,depth,distance,feed,power,angle,dry) {
    checkPosition(origin);
    if (![depth,distance,feed,power,angle].every(Number.isFinite)) throw new Error("Введите все параметры реза.");
    if (depth<0) throw new Error("Глубина Z должна быть неотрицательной.");
    if (distance<0) throw new Error("Расстояние Y не может быть отрицательным.");
    if (feed<=0 || feed>14) throw new Error("Скорость должна быть больше 0 и не больше 14 мм/с.");
    if (power<=0 || power>limits.power) throw new Error("Мощность S должна быть больше 0 и не больше 1000.");
    if (angle<0 || angle>90 || !near(origin.B,angle)) throw new Error("Проверьте положение стола в пределах B0–B90.");
    const bottom=origin.Y-depth, target=origin.X-distance;
    if (bottom<0 || bottom>250 || target < -245 || target>245)
      throw new Error("Рез выходит за рабочий ход кареток.");
    return {origin:{...origin},depth,distance,feed,power,angle,dry:!!dry,bottom,target,
      lower:depth>0?`G01 Y${f(bottom)} A${f(bottom)} F${f(feed*60)}`:null,
      heat:`M03 S${f(power)}`,
      cut:`G01 X${f(target)} Z${f(target)} F${f(feed*60)}`,
      lift:`G01 Y${f(origin.Y)} A${f(origin.A)} F${f(feed*60)}`,off:"M05"};
  }
  const calibration=`G92 X${f(HOME.X)} Y${f(HOME.Y)} Z${f(HOME.Z)} A${f(HOME.A)} B${f(HOME.B)}`;
  class Session {
    constructor(send,fail) { this.send=send; this.fail=fail; this.reset(); }
    reset() { this.phase="idle"; this.pending=null; this.hot=false; this.plan=null;
      this.tableAngle=null; this.targetAngle=null; this.origin=null; this.jogTarget=null;
      this.paused=false; this.holdOff=false; this.deferred=null; this.returnSteps=[]; this.returnTarget=null; this.cutStart=null; this.horizontalNeeded=false; }
    get active() { return this.phase!=="idle"; }
    transmit(command,next) {
      if(this.pending) throw new Error("Дождитесь ответа контроллера.");
      this.pending={command,next}; this.send(command);
    }
    home() {
      if(this.active) throw new Error("Сначала завершите текущую операцию.");
      this.phase="homing"; this.transmit("M05",()=>this.transmit("$H",()=>
        this.transmit("G21 G90 G94",()=>this.transmit(calibration,()=>{this.phase="await-home";}))));
    }
    rotate(angle) {
      if(this.phase!=="ready" || this.hot) throw new Error("Поворот доступен только после HOME с выключенным нагревом.");
      if(![0,90].includes(angle)) throw new Error("Выберите B0 или B90.");
      this.targetAngle=angle; this.tableAngle=null; this.phase="rotating";
      this.transmit(`G00 B${f(angle)} F1800.0`,()=>{this.phase="await-rotation";});
    }
    align() {
      this.phase="aligning";
      this.transmit("G00 X245.00 Z245.00",()=>this.transmit("G00 Y236.00 A236.00",()=>{this.phase="await-align";}));
    }
    jog(axis,direction,step,pos,feed) {
      if(!["manual","zeroed"].includes(this.phase) || this.hot) throw new Error("Ручное перемещение пока недоступно.");
      checkPosition(pos);
      if(!near(pos.B,this.tableAngle)) throw new Error("Положение стола изменилось.");
      if(!["Y","Z"].includes(axis) || ![-1,1].includes(direction) ||
          !Number.isFinite(step) || step<0.1 || step>20 || !Number.isFinite(feed) || feed<=0 || feed>14)
        throw new Error("Проверьте шаг и скорость ручного перемещения.");
      const delta=direction*step, next={...pos};
      if(axis==="Y") {next.X-=delta;next.Z-=delta;}
      else {next.Y-=delta;next.A-=delta;}
      for(const a of ["X","Y","Z","A"]) next[a]=Number(f(next[a]));
      checkPosition(next);
      this.origin=null;this.plan=null;this.jogTarget=next;this.phase="jogging";
      const move=axis==="Y"?`X${f(next.X)} Z${f(next.Z)}`:`Y${f(next.Y)} A${f(next.A)}`;
      this.transmit(`G01 ${move} F${f(feed*60)}`,()=>{this.phase="await-jog";});
    }
    jogB(direction,step,pos) {
      if(!["manual","zeroed"].includes(this.phase) || this.hot)
        throw new Error("Поворот доступен только при выключенном нагреве и остановленном станке.");
      checkPosition(pos);
      if(!same(pos,{...ALIGNED,B:this.tableAngle}))
        throw new Error("Перед поворотом верните струну в поднятое положение у HOME.");
      if(![-1,1].includes(direction) || !Number.isFinite(step) || step<0.1 || step>15)
        throw new Error("Шаг поворота должен быть от 0,1 до 15 градусов.");
      const target=Number(f(this.tableAngle+direction*step));
      if(target<0 || target>90) throw new Error("Поворот ограничен углами B0–B90.");
      this.origin=null;this.plan=null;this.jogTarget={...pos,B:target};this.phase="jogging";
      this.transmit(`G00 B${f(target)} F1800.0`,()=>{this.phase="await-jog";});
    }
    zero(pos) {
      if(!["manual","zeroed"].includes(this.phase) || this.hot) throw new Error("Сначала остановите ручное перемещение.");
      checkPosition(pos);
      if(!near(pos.B,this.tableAngle)) throw new Error("Положение стола изменилось.");
      this.origin={...pos};this.plan=null;this.phase="zeroed";
    }
    navigate(pos,goal,bottom) {
      checkPosition(pos);
      if(!near(pos.B,this.tableAngle)) throw new Error("Положение стола изменилось.");
      if(!Number.isFinite(goal) || !Number.isFinite(bottom) || goal < -245 || goal>245 || bottom<0 || bottom>250)
        throw new Error("Цель выходит за рабочий ход кареток.");
      const high=Number(f(Math.max(pos.Y,pos.A,bottom))), steps=[];
      let here={...pos};
      const add=(command,target)=>{steps.push({command,target});here=target;};
      if(Math.abs(pos.Y-high)>0.02 || Math.abs(pos.A-high)>0.02)
        add(`G00 Y${f(high)} A${f(high)}`,{...here,Y:high,A:high});
      if(Math.abs(pos.X-goal)>0.02 || Math.abs(pos.Z-goal)>0.02)
        add(`G00 X${f(goal)} Z${f(goal)}`,{...here,X:goal,Z:goal});
      if(high>bottom+0.02)
        add(`G00 Y${f(bottom)} A${f(bottom)}`,{...here,Y:bottom,A:bottom});
      this.origin=null;this.plan=null;this.returnSteps=steps;
      this.returnNext();
    }
    moveFree(pos,depth,distance) {
      if(this.phase!=="manual" || this.hot || this.paused) throw new Error("Свободное перемещение доступно до установки нуля с выключенным нагревом.");
      if(!Number.isFinite(depth) || depth<0 || depth>ALIGNED.Y || !Number.isFinite(distance) || distance<0 || distance>limits.horizontal)
        throw new Error("Проверьте Z и Y относительно HOME.");
      this.navigate(pos,ALIGNED.X-distance,ALIGNED.Y-depth);
    }
    returnHome(pos) {
      if(!["manual","zeroed","positioned","finished","done"].includes(this.phase) || this.paused || (this.hot && this.phase!=="done"))
        throw new Error("Остановите станок перед возвратом.");
      checkPosition(pos);
      if(!near(pos.B,this.tableAngle)) throw new Error("Положение стола изменилось.");
      if(this.hot) {
        this.phase="cooling-return";
        this.transmit("M05",()=>{this.hot=false;this.navigate(pos,ALIGNED.X-5,ALIGNED.Y-5);});
      } else this.navigate(pos,ALIGNED.X-5,ALIGNED.Y-5);
    }
    returnNext() {
      const next=this.returnSteps.shift();
      if(!next) {this.returnTarget=null;this.phase="manual";return;}
      this.returnTarget=next.target;this.phase="returning";
      this.transmit(next.command,()=>{this.phase="await-return";});
    }
    prepare(p) {
      if(this.phase!=="zeroed" || !this.origin || !same(p.origin,this.origin) || this.tableAngle!==p.angle)
        throw new Error("Сначала задайте ноль у угла заготовки.");
      this.plan=p;this.phase="positioned";
    }
    heat() {
      if(this.phase!=="positioned" || this.plan.dry) throw new Error("Нагрев недоступен для холостого прогона.");
      this.phase="heating";
      this.transmit(this.plan.heat,()=>{this.hot=true;this.phase="heated";});
    }
    cut(pos=this.origin) {
      if(!this.plan || !(this.plan.dry ? this.phase==="positioned" && !this.hot : this.phase==="heated" && this.hot))
        throw new Error("Подготовьте рез и включите нагрев либо выберите холостой прогон.");
      checkPosition(pos);
      if(!near(pos.Y,this.origin.Y) || !near(pos.A,this.origin.A) || !near(pos.B,this.tableAngle))
        throw new Error("Перед резом струна должна находиться на уровне Z=0.");
      const horizontalNeeded=!near(pos.X,this.plan.target) || !near(pos.Z,this.plan.target);
      if(!this.plan.lower && !horizontalNeeded) throw new Error("Задайте ненулевое перемещение для реза.");
      this.cutStart={...pos};this.horizontalNeeded=horizontalNeeded;this.phase="cutting";
      if(this.plan.lower) this.transmit(this.plan.lower,()=>{this.phase="await-lower";}); else this.continueCut();
    }
    continueCut() {
      if(this.horizontalNeeded) {this.phase="cutting";this.transmit(this.plan.cut,()=>{this.phase="await-cut";});}
      else this.liftCut();
    }
    liftCut() {
      if(this.plan.depth>0) {this.phase="lifting";this.transmit(this.plan.lift,()=>{this.phase="await-lift";});}
      else this.finishCut();
    }
    autoCut(pos) {
      if(this.phase!=="positioned" || this.plan.dry) throw new Error("Нагрев недоступен.");
      const start={...pos};checkPosition(start);
      if(!near(start.Y,this.origin.Y) || !near(start.A,this.origin.A) || !near(start.B,this.tableAngle))
        throw new Error("Перед резом струна должна находиться на уровне Z=0.");
      if(!this.plan.lower && near(start.X,this.plan.target) && near(start.Z,this.plan.target))
        throw new Error("Задайте ненулевое перемещение для реза.");
      this.phase="heating";
      this.transmit(this.plan.heat,()=>{this.hot=true;this.phase="heated";this.cut(start);});
    }
    pause() {
      if(this.paused || !["cutting","await-lower","await-cut","lifting","await-lift"].includes(this.phase))
        throw new Error("Пауза доступна во время реза.");
      this.paused=true;
    }
    resume() {
      if(!this.paused) throw new Error("Рез не на паузе.");
      this.paused=false;this.holdOff=false;
      const next=this.deferred;this.deferred=null;
      if(next) next();
    }
    off() {
      if(!this.hot || !["heated","done"].includes(this.phase)) throw new Error("Остановите движение перед выключением нагрева.");
      this.phase="cooling";this.transmit("M05",()=>{this.hot=false;this.phase="finished";});
    }
    end() {
      if(this.hot || this.pending || !["ready","manual","zeroed","positioned","finished","done"].includes(this.phase))
        throw new Error("Сначала остановите движение и выключите нагрев.");
      this.reset();
    }
    ack(error) {
      if(!this.pending) return;
      const action=this.pending;this.pending=null;
      if(error) {this.phase="fault";this.fail(error);return;}
      if(this.paused) this.deferred=action.next; else action.next();
    }
    status(state,pos,validPosition) {
      if(this.paused || !validPosition || state!=="Idle") return;
      if(this.phase==="await-home" && same(pos,HOME)) this.phase="ready";
      if(this.phase==="await-rotation" && same(pos,{...HOME,B:this.targetAngle})) {
        this.tableAngle=this.targetAngle;this.align();
      }
      if(this.phase==="await-align" && same(pos,{...ALIGNED,B:this.tableAngle})) this.phase="manual";
      if(this.phase==="await-jog" && same(pos,this.jogTarget)) {
        this.tableAngle=this.jogTarget.B;this.jogTarget=null;this.phase="manual";
      }
      if(this.phase==="await-return" && this.returnTarget &&
          Object.entries(this.returnTarget).every(([axis,value])=>Number.isFinite(pos[axis]) && Math.abs(pos[axis]-value)<0.02))
        this.returnNext();
      if(this.phase==="await-lower" && this.plan && same(pos,{X:this.cutStart.X,Z:this.cutStart.Z,
          Y:this.plan.bottom,A:this.plan.bottom,B:this.tableAngle})) this.continueCut();
      if(this.phase==="await-cut" && this.plan && same(pos,{X:this.plan.target,Z:this.plan.target,
          Y:this.plan.bottom,A:this.plan.bottom,B:this.tableAngle})) this.liftCut();
      if(this.phase==="await-lift" && this.plan && same(pos,{X:this.plan.target,Z:this.plan.target,
          Y:this.origin.Y,A:this.origin.A,B:this.tableAngle})) this.finishCut();
    }
    finishCut() {
      if(this.plan.dry) {this.plan=null;this.phase="zeroed";return;}
      this.phase="cooling";
      this.transmit("M05",()=>{this.hot=false;this.plan=null;this.phase="zeroed";});
    }
    lost() {if(this.active) {this.pending=null;this.deferred=null;this.returnSteps=[];this.returnTarget=null;this.paused=false;this.phase="fault";}}
  }
  const api={HOME,ALIGNED,limits,calibration,plan,Session,checkPosition,same};
  if(typeof module!=="undefined" && module.exports) module.exports=api;
  else root.BlankCut=api;
})(typeof globalThis!=="undefined"?globalThis:this);
