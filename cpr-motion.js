'use strict';
// Camera motion is an experimental rate proxy, never a depth measurement.
function cprMedian(a){const b=a.slice().sort((x,y)=>x-y),i=Math.floor(b.length/2);return b.length%2?b[i]:(b[i-1]+b[i])/2;}
function cprAxis(samples){
  const mx=samples.reduce((a,p)=>a+p.x,0)/samples.length,my=samples.reduce((a,p)=>a+p.y,0)/samples.length;
  let xx=0,yy=0,xy=0;for(const p of samples){xx+=(p.x-mx)**2;yy+=(p.y-my)**2;xy+=(p.x-mx)*(p.y-my);}
  const angle=.5*Math.atan2(2*xy,xx-yy);return {x:Math.cos(angle),y:Math.sin(angle)};
}
function cprMotionEstimate(samples,velocity=false){
  const unavailable=reason=>({rate:null,reason});
  if(samples.length<45)return unavailable('Gathering complete movement cycles');
  const end=samples.at(-1).t,data=samples.filter(s=>s.t>=end-5);
  if(end-data[0].t<3.5)return unavailable('Gathering complete movement cycles');
  const axis=cprAxis(data),projected=data.map(p=>({t:p.t,v:p.x*axis.x+p.y*axis.y}));
  // Resample with real timestamps; do not interpolate across a missing-camera interval.
  const uniform=[];let j=0;
  for(let t=data[0].t;t<=end;t+=.05){
    while(j<projected.length-2&&projected[j+1].t<t)j++;
    const a=projected[j],b=projected[j+1];if(!b||b.t-a.t>.25)return unavailable('Camera timing interrupted');
    uniform.push({t,v:a.v+(b.v-a.v)*(t-a.t)/(b.t-a.t)});
  }
  // Recent activity must still be present: old cycles must not survive a pause.
  const activity=velocity?uniform:uniform.slice(1).map((p,i)=>({t:p.t,v:(p.v-uniform[i].v)/.05}));
  const rms=a=>Math.sqrt(a.reduce((sum,p)=>sum+p.v*p.v,0)/Math.max(1,a.length));
  if(rms(activity.slice(-12))<Math.max(1e-5,rms(activity)*.12))return unavailable('Movement paused or too small to track');
  const spectrum=estimateRate(uniform);
  if(!spectrum.rate)return spectrum;
  let positions=uniform.map(p=>({...p}));
  if(velocity){const mean=uniform.reduce((a,p)=>a+p.v,0)/uniform.length;let v=0;positions=uniform.map(p=>({t:p.t,v:(v+=(p.v-mean)*.05)}));}
  // Remove linear drift before looking for one complete down-and-up cycle.
  const n=positions.length,mean=positions.reduce((a,p)=>a+p.v,0)/n;
  let cov=0,den=0;positions.forEach((p,i)=>{const k=i-(n-1)/2;cov+=k*(p.v-mean);den+=k*k;});
  const detrended=positions.map((p,i)=>({t:p.t,v:p.v-mean-cov/den*(i-(n-1)/2)}));
  const smooth=detrended.map((p,i)=>({t:p.t,v:(detrended[Math.max(0,i-1)].v+p.v+detrended[Math.min(n-1,i+1)].v)/3}));
  const amp=Math.sqrt(smooth.reduce((a,p)=>a+p.v*p.v,0)/n),threshold=amp*.35;
  if(amp<1e-6)return unavailable('Movement too small to track');
  let armed=false;const events=[];
  for(let i=1;i<n;i++){
    const a=smooth[i-1],b=smooth[i];if(b.v< -threshold)armed=true;
    if(armed&&a.v<threshold&&b.v>=threshold){
      const at=a.t+(b.t-a.t)*(threshold-a.v)/(b.v-a.v);
      if(!events.length||at-events.at(-1)>.25){events.push(at);armed=false;}
    }
  }
  if(events.length<4)return unavailable('Gathering complete movement cycles');
  const intervals=events.slice(1).map((v,i)=>v-events[i]).slice(-5),median=cprMedian(intervals);
  const spread=cprMedian(intervals.map(v=>Math.abs(v-median)))/median,rate=60/median;
  if(median<.25||median>1.5||spread>.22||end-events.at(-1)>Math.max(.85,median*1.6))return unavailable('Movement cycles are inconsistent');
  if(Math.abs(rate-spectrum.rate)>14)return unavailable('Cycle count and rhythm estimate disagree');
  return {rate:Math.round(rate),confidence:Math.min(spectrum.confidence||0,1-spread),amplitude:amp,axis,cycles:events.length,reason:'Complete cycles and rhythm agree'};
}
class CloseViewCPRTracker {
  constructor(){this.reset();}
  reset(){
    this.regions=[{x:.2,y:.12,w:.3,h:.35},{x:.5,y:.12,w:.3,h:.35},{x:.2,y:.48,w:.3,h:.35},{x:.5,y:.48,w:.3,h:.35},{x:.35,y:.12,w:.3,h:.35},{x:.35,y:.48,w:.3,h:.35}];
    this.samples=this.regions.map(()=>[]);this.lastEstimate=0;this.selected=null;this.result={rate:null,reason:'Finding a consistent moving region'};
  }
  process(prev,gray,w,h,t,dt){
    if(!prev||dt<=0||dt>.25){this.reset();return this.result;}
    const flow=this.regions.map(roi=>opticalFlow(prev,gray,w,h,roi));
    const back=[{x:0,y:.15,w:.15,h:.7},{x:.85,y:.15,w:.15,h:.7}].map(roi=>opticalFlow(prev,gray,w,h,roi));
    // Camera movement requires direction agreement, not just activity at both edges.
    const bg=back[0],bg2=back[1],mag=Math.hypot(bg.x,bg.y),mag2=Math.hypot(bg2.x,bg2.y);
    const coherent=bg.quality>.2&&bg2.quality>.2&&mag>.15&&mag2>.15&&Math.hypot(bg.x-bg2.x,bg.y-bg2.y)<Math.max(.12,Math.min(mag,mag2)*.35);
    if(coherent&&flow.filter(p=>p.quality>.2&&Math.hypot(p.x-bg.x,p.y-bg.y)<Math.max(.12,mag*.4)).length>=Math.ceil(this.regions.length*.75)){this.reset();this.result.reason='Phone or whole view moving · keep phone stable';return this.result;}
    flow.forEach((p,i)=>{
      if(p.quality<.2){if(this.samples[i].length&&t/1000-this.samples[i].at(-1).t>.2)this.samples[i]=[];return;}
      this.samples[i].push({t:t/1000,x:p.x/dt,y:p.y/dt});this.samples[i]=this.samples[i].filter(s=>s.t>t/1000-6);
    });
    // A selected region becoming obscured invalidates its displayed rate immediately.
    if(this.selected&&this.selected.some(i=>flow[i].quality<.2)){this.selected=null;this.result={rate:null,reason:'Finding a clear moving region'};}
    if(t-this.lastEstimate>=300){
      this.lastEstimate=t;const estimates=this.samples.map(s=>cprMotionEstimate(s,true));
      const agrees=(a,b)=>estimates[a].rate&&estimates[b].rate&&Math.abs(estimates[a].rate-estimates[b].rate)<=8;
      if(this.selected&&!agrees(...this.selected))this.selected=null;
      if(!this.selected){
        const pairs=[];
        for(let a=0;a<estimates.length;a++)for(let b=a+1;b<estimates.length;b++)if(agrees(a,b))pairs.push({pair:[a,b],score:Math.min(estimates[a].confidence,estimates[b].confidence)});
        pairs.sort((a,b)=>b.score-a.score);this.selected=pairs[0]?.pair||null;
      }
      if(this.selected){
        const [a,b]=this.selected,r=this.regions[a];
        this.result={rate:Math.round((estimates[a].rate+estimates[b].rate)/2),method:'close-view',focus:{x:r.x+r.w/2,y:r.y+r.h/2},focusId:'region-'+a+'-'+b,amplitudes:{pose:estimates[a].amplitude,motion:estimates[b].amplitude},reason:'Moving regions agree · experimental'};
      }else {
        const paused=estimates.filter(e=>e.reason==='Movement paused or too small to track').length>=2;
        this.result={rate:null,reason:paused?'No trackable movement · paused or movement too small':'Searching for consistent down-and-up cycles'};
      }
      this.result.diagnostics={regionQuality:flow.map(p=>Math.round(p.quality*100)/100),historySeconds:this.samples.map(s=>s.length?Math.round((s.at(-1).t-s[0].t)*100)/100:0),regionReasons:estimates.map(e=>e.reason),selected:this.selected?.slice()||null};
    }
    return this.result;
  }
}
if(typeof module!=='undefined')module.exports={cprAxis,cprMotionEstimate,CloseViewCPRTracker};
