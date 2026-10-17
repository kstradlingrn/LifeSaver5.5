'use strict';
// Display smoothing applies only to current valid measurements; never hold a lost rate.
class StableCPRRate {
  constructor(){this.reset();}
  reset(){this.history=[];this.value=null;this.at=0;}
  update(result,t){
    if(!Number.isFinite(result.rate)||result.rate<=0){this.reset();return result;}
    this.history=this.history.filter(x=>t-x.t<1500);this.history.push({t,v:result.rate});
    const sorted=this.history.map(x=>x.v).sort((a,b)=>a-b);
    const mid=Math.floor(sorted.length/2),median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
    const alpha=1-Math.exp(-Math.max(0,t-this.at)/1000);
    this.value=this.value===null||t-this.at>1000?median:this.value+alpha*(median-this.value);this.at=t;
    return {...result,rawRate:result.rate,rate:Math.round(this.value)};
  }
}
// Relative camera-motion cue, not compression depth, recoil, or a fatigue diagnosis.
class CPRMovementReference {
  constructor(){this.reset();}
  reset(){this.samples=[];this.baseline=null;}
  update(pose,motion,t){
    if(!(pose>0&&motion>0)){this.reset();return null;}
    if(this.samples.length&&t-this.samples.at(-1).t>1000)this.reset();
    this.samples.push({pose,motion,t});this.samples=this.samples.filter(x=>t-x.t<=10000);
    if(!this.baseline&&t-this.samples[0].t>=5000){
      const median=k=>{const a=this.samples.map(x=>x[k]).sort((a,b)=>a-b);return a[Math.floor(a.length/2)];};
      this.baseline={pose:median('pose'),motion:median('motion')};
    }
    return this.baseline?{pose:pose/this.baseline.pose,motion:motion/this.baseline.motion}:null;
  }
}
class CPRSlowCoach {
  constructor(){this.activeMs=0;this.nextMinute=60000;this.nextRotation=120000;this.lastSpoken=-Infinity;this.interrupt();}
  reset(){this.interrupt();}
  interrupt(){this.lastAt=null;this.lastValid=false;this.goodMs=0;this.goodEvidence=0;this.wasOnTarget=false;this.slowMs=0;this.slowCount=0;this.nextSlow=0;this.stillMs=0;this.pauseSpoken=false;this.previousStill=false;this.kind='';}
  update(rate,t,movement=null,options={}){
    const gap=this.lastAt===null?0:t-this.lastAt;
    if(gap<0||gap>1000)this.interrupt();
    const dt=gap>=0&&gap<=1000?Math.min(gap,300):0;
    this.lastAt=t;this.kind='';
    if(options.aed){this.interrupt();return null;}
    const valid=Number.isFinite(rate)&&rate>0;
    const activeDt=valid&&this.lastValid?dt:0;
    if(valid)this.activeMs+=activeDt;
    const good=valid&&rate>=100&&rate<=120;
    if(good){this.goodMs+=activeDt;this.goodEvidence+=activeDt;if(this.goodEvidence>=2000)this.wasOnTarget=true;}
    else {this.goodMs=0;this.goodEvidence=0;}
    if(valid&&rate<100){this.slowMs+=this.lastValid?dt:0;}else if(valid){this.slowMs=0;this.slowCount=0;this.nextSlow=0;}
    // Unknown camera data is never evidence of stopped compressions.
    const still=!valid&&options.still===true&&this.activeMs>0;
    this.stillMs=still?(this.stillMs+(this.previousStill?dt:0)):0;
    if(!still)this.pauseSpoken=false;
    this.previousStill=still;this.lastValid=valid;
    if(!valid){this.slowMs=0;this.slowCount=0;this.nextSlow=0;if(this.stillMs>=10000&&!this.pauseSpoken){this.pauseSpoken=true;this.kind='pause';this.lastSpoken=t;return 'Resume CPR. If an AED is present, follow the AED’s instructions.';}return null;}
    if(options.busy)return null;
    let cue=null,kind='';
    if(rate<100&&this.slowCount<2&&this.slowMs>=this.nextSlow){this.slowCount++;this.nextSlow=this.slowMs+5000;cue='Speed up toward one hundred to one hundred twenty compressions per minute.';kind='pace';}
    else if(rate<100&&this.slowCount===2&&this.slowMs>=10000&&this.wasOnTarget){this.slowCount++;cue='Your compressions have slowed. If someone else is available, switch compressors and immediately return to CPR.';kind='switch';}
    else if(this.activeMs>=this.nextRotation){cue='Switch compressors if available and immediately return to CPR. Once an AED becomes available, use it and follow its instructions.';kind='rotation';}
    else if(rate>120&&t-this.lastSpoken>=12000){cue='Slow down toward one hundred to one hundred twenty compressions per minute.';kind='pace';}
    else if(this.activeMs>=this.nextMinute){cue='Push hard and let the chest return fully. Once an AED becomes available, use it and follow its instructions.';kind='minute';}
    else if(this.goodMs>=20000){cue='Your compression rate is good. Keep going—you are helping save this person’s life.';kind='good';}
    if(!cue)return null;
    // Keep prompts distinct; urgent pauses can interrupt, routine coaching waits.
    if(t-this.lastSpoken<8000){if(kind==='pace'&&rate<100){this.slowCount--;this.nextSlow=this.slowMs;}if(kind==='switch')this.slowCount--;return null;}
    this.lastSpoken=t;this.kind=kind;
    if(kind==='rotation'){this.nextRotation+=120000;this.nextMinute=Math.floor(this.activeMs/60000+1)*60000;this.goodMs=0;}
    if(kind==='minute'){this.nextMinute+=60000;this.goodMs=0;}
    if(kind==='good')this.goodMs=0;
    return cue;
  }
}
if(typeof module!=='undefined')module.exports={StableCPRRate,CPRSlowCoach,CPRMovementReference};
