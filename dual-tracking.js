'use strict';
// Independent landmark-velocity and local pixel-flow estimates. Training only.
function fuseCPRRates(pose, motion, fresh) {
  if (!fresh) return {rate:null, reason:'Keep the compressor’s wrists, elbows and shoulders visible'};
  if (!pose.rate || !motion.rate) return {rate:null, reason:'Gathering agreement between hand/body tracking and image motion'};
  if (Math.abs(pose.rate-motion.rate)>10) return {rate:null, reason:'Tracking methods disagree · check phone position'};
  return {rate:Math.round((pose.rate+motion.rate)/2), reason:'Hand/body and image-motion estimates agree · experimental'};
}
class DualCPRTracker {
  constructor() {
    this.status='Loading hand/body tracking'; this.ready=false; this.failed=false; this.busy=false;
    this.reset();
    try {
      this.worker=new Worker('tracking-worker.js');
      this.worker.onmessage=e=>this.receive(e.data);
      this.worker.onerror=()=>this.fail();
      this.worker.postMessage({type:'init'});
      this.timeout=setTimeout(()=>{if(!this.ready)this.fail();},30000);
    } catch { this.fail(); }
  }
  reset() {
    this.stable=new StableCPRRate();this.closeView=new CloseViewCPRTracker();this.posePositions=[];this.signalSource=null;this.movementReference=new CPRMovementReference();this.epoch=(this.epoch||0)+1;this.poseSamples=[];this.motionSamples=[];
    this.point=null;this.roi=null;this.poseAt=0;this.lastDispatch=0;
    this.lastMotion=0;this.lastEstimate=0;this.result={rate:null,reason:'Gathering hand/body and image motion'};
  }
  fail() {
    this.failed=true;this.ready=false;this.status='AI tracking unavailable · retry camera or follow the beat';
    this.result={rate:null,reason:this.status};clearTimeout(this.timeout);this.worker?.terminate();
  }
  receive(m) {
    if(m.type==='ready'){this.ready=true;clearTimeout(this.timeout);this.status='Keep wrists, elbows and shoulders visible';return;}
    if(m.type==='error'){this.fail();return;}
    this.busy=false;
    if(m.epoch!==this.epoch)return;
    if(!m.point){this.status='Body tracking briefly obscured · keep the compressor visible';return;}
    const p=m.point,old=this.point,dt=(m.t-this.poseAt)/1000;
    if(old&&(old.source!==p.source||dt>.7||Math.hypot(old.x-p.x,old.y-p.y)>.18)){const closeView=this.closeView;this.reset();this.closeView=closeView;}
    else if(old&&dt>0){if(dt<.3)this.poseSamples.push({t:m.t/1000,v:(p.y-old.y)/dt});else {this.poseSamples=[];this.motionSamples=[];this.stable.reset();this.movementReference.reset();}}
    this.posePositions.push({t:m.t/1000,x:p.x,y:p.y});this.posePositions=this.posePositions.filter(s=>s.t>m.t/1000-6);this.point=p;this.poseAt=m.t;
    // Fixed image coordinates for optical flow; changing the ROI does not shift pixels.
    this.roi={x:p.x-.18,y:p.y-.18,w:.36,h:.36};
    this.poseSamples=this.poseSamples.filter(s=>s.t>m.t/1000-7);
    this.status=m.hand?'Hand and body visible':'Tracking visible upper-body landmark';
  }
  process(video, prev, gray, w, h, t, dt) {
    const close=this.closeView.process(prev,gray,w,h,t,dt);
    if(this.failed||!this.ready)return this.output(close,t);
    if(!this.busy&&t-this.lastDispatch>=65){
      this.busy=true;this.lastDispatch=t;const epoch=this.epoch;
      createImageBitmap(video).then(bitmap=>{
        if(this.closed||epoch!==this.epoch){bitmap.close();this.busy=false;return;}
        this.worker.postMessage({type:'frame',bitmap,t,epoch},[bitmap]);
      }).catch(()=>{this.busy=false;this.fail();});
    }
    const fresh=!!this.point&&t-this.poseAt<650;
    if(!fresh){this.motionSamples=[];this.poseSamples=[];this.posePositions=[];return this.output(close,t);}
    if(prev&&dt>0&&dt<.3){
      const flow=opticalFlow(prev,gray,w,h,this.roi);
      // Do not bridge a low-texture/occluded interval with older periodic samples.
      if(flow.quality>.15){this.motionSamples.push({t:t/1000,v:flow.y/dt,x:flow.x/dt,y:flow.y/dt});this.lastMotion=t;}
      else {this.motionSamples=[];return this.output(close,t);}
    }else{this.motionSamples=[];this.poseSamples=[];this.stable.reset();this.movementReference.reset();this.result={rate:null,reason:'Gathering movement'};return this.result;}
    this.motionSamples=this.motionSamples.filter(s=>s.t>t/1000-7);
    if(t-this.lastEstimate>300){
      this.lastEstimate=t;
      const poseEstimate=cprMotionEstimate(this.posePositions),motionEstimate=cprMotionEstimate(this.motionSamples,true);
      const fused=fuseCPRRates(poseEstimate,motionEstimate,fresh);
      this.result=this.output(fused.rate?{...fused,method:'body-motion',focus:this.point,focusId:this.point.source,amplitudes:{pose:poseEstimate.amplitude,motion:motionEstimate.amplitude}}:close,t);

    }
    return this.result;
  }
  output(result,t){
    const method=result.rate?(result.method+'-'+result.focusId):null;
    if(method!==this.signalSource){this.stable.reset();this.movementReference.reset();this.signalSource=method;}
    this.result=this.stable.update(result,t);
    if(this.result.rate&&result.amplitudes)this.result.movement=this.movementReference.update(result.amplitudes.pose,result.amplitudes.motion,t);else this.movementReference.reset();
    return this.result;
  }
  close(){this.closed=true;clearTimeout(this.timeout);this.worker?.terminate();this.reset();}
}
if(typeof module!=='undefined')module.exports={fuseCPRRates,DualCPRTracker};
