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
    if (distance<=0) throw new Error("Расстояние Y должно быть больше 0.");
    if (feed<=0 || feed>14) throw new Error("Скорость должна быть больше 0 и не больше 14 мм/с.");
    if (power<=0 || power>limits.power) throw new Error("Мощность S должна быть больше 0 и не больше 1000.");
    if (angle<0 || angle>90 || !near(origin.B,angle)) throw new Error("Проверьте положение стола в пределах B0–B90.");
    const bottom=origin.Y-depth, target=origin.X-distance;
    if (bottom<0 || bottom>250 || target < -245 || target>245)
      throw new Error("Рез выходит за рабочий ход кареток.");
    return {origin:{...origin},depth,distance,feed,power,angle,dry:!!dry,bottom,target,
      lower:depth>0?`G01 Y${f(bottom)} A${f(bottom)} F${f(feed*60)}`:null,
      heat:`M03 S${f(power)}`,
      cut:`G01 X${f(target)} Z${f(target)} F${f(feed*60)}`,off:"M05"};
  }
  const calibration=`G92 X${f(HOME.X)} Y${f(HOME.Y)} Z${f(HOME.Z)} A${f(HOME.A)} B${f(HOME.B)}`;
  class Session {
    constructor(send,fail) { this.send=send; this.fail=fail; this.reset(); }
    reset() { this.phase="idle"; this.pending=null; this.hot=false; this.plan=null;
      this.tableAngle=null; this.targetAngle=null; this.origin=null; this.jogTarget=null; }
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
    cut() {
      if(!this.plan || !(this.plan.dry ? this.phase==="positioned" && !this.hot : this.phase==="heated" && this.hot))
        throw new Error("Подготовьте рез и включите нагрев либо выберите холостой прогон.");
      this.phase="cutting";
      const horizontal=()=>this.transmit(this.plan.cut,()=>{this.phase="await-cut";});
      if(this.plan.lower) this.transmit(this.plan.lower,horizontal); else horizontal();
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
      action.next();
    }
    status(state,pos,validPosition) {
      if(!validPosition || state!=="Idle") return;
      if(this.phase==="await-home" && same(pos,HOME)) this.phase="ready";
      if(this.phase==="await-rotation" && same(pos,{...HOME,B:this.targetAngle})) {
        this.tableAngle=this.targetAngle;this.align();
      }
      if(this.phase==="await-align" && same(pos,{...ALIGNED,B:this.tableAngle})) this.phase="manual";
      if(this.phase==="await-jog" && same(pos,this.jogTarget)) {
        this.tableAngle=this.jogTarget.B;this.jogTarget=null;this.phase="manual";
      }
      if(this.phase==="await-cut" && this.plan && same(pos,{X:this.plan.target,Z:this.plan.target,
          Y:this.plan.bottom,A:this.plan.bottom,B:this.tableAngle})) this.phase="done";
    }
    lost() {if(this.active) {this.pending=null;this.phase="fault";}}
  }
  const api={HOME,ALIGNED,limits,calibration,plan,Session,checkPosition,same};
  if(typeof module!=="undefined" && module.exports) module.exports=api;
  else root.BlankCut=api;
})(typeof globalThis!=="undefined"?globalThis:this);
