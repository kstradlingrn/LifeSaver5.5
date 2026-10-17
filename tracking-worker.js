let pose,hand,anchor=null,frameCount=0;
self.onmessage=async ({data:m})=>{
  try {
    if(m.type==='init'){
      const {FilesetResolver,PoseLandmarker,HandLandmarker}=await import('./vision_bundle.mjs');
      const files=await FilesetResolver.forVisionTasks(new URL('.',self.location.href).href.replace(/\/$/,''));
      const options=model=>({canvas:new OffscreenCanvas(640,480),baseOptions:{modelAssetPath:new URL(model,self.location.href).href,delegate:'CPU'},runningMode:'VIDEO'});
      pose=await PoseLandmarker.createFromOptions(files,{...options('./pose_landmarker_lite.task'),numPoses:1,minPoseDetectionConfidence:.6,minPosePresenceConfidence:.6,minTrackingConfidence:.6});
      hand=await HandLandmarker.createFromOptions(files,{...options('./hand_landmarker.task'),numHands:2,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6});
      self.postMessage({type:'ready'});return;
    }
    if(m.type!=='frame')return;
    let p,h;
    try{p=pose.detectForVideo(m.bitmap,m.t);h=(frameCount++%4===0)?hand.detectForVideo(m.bitmap,m.t):{landmarks:[]};}finally{m.bitmap.close();}
    const points=p.landmarks?.[0];
    // Keep the same visible anatomical anchor. A low phone view may crop a shoulder.
    const valid=i=>points&&points[i].visibility>.65&&points[i].x>.02&&points[i].x<.98&&points[i].y>.02&&points[i].y<.98;
    if(anchor===null||!valid(anchor)){
      const candidates=[15,16,13,14,11,12].filter(valid);
      const score=i=>points[i].visibility+Math.min(points[i].x,1-points[i].x,points[i].y,1-points[i].y)*.5+(i>=15?.12:i>=13?.06:0);
      candidates.sort((a,b)=>score(b)-score(a));anchor=candidates[0]??null;
    }
    let point=null,detectedHand=false;
    if(anchor!==null){
      const tracked=points[anchor];
      // Hand detection confirms visibility but never changes the measured anchor.
      detectedHand=(h.landmarks||[]).some(a=>Math.hypot(a[0].x-tracked.x,a[0].y-tracked.y)<.16);
      point={x:tracked.x,y:tracked.y,source:'body-'+anchor};
    }
    self.postMessage({type:'frame',t:m.t,epoch:m.epoch,point,hand:detectedHand});
  } catch {self.postMessage({type:'error'});}
};
