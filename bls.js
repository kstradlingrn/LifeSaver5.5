'use strict';
// BLS decision practice stays separate from camera-based manikin practice.
function makeBLSPlan(c){
 const p=[],add=(id,task,why,changes={})=>p.push(step(id,task,why,changes));
 if(c.kind==='resp'){
  add('pulse','Check pulse and signs of life once at the beginning.','This adult has a definite pulse but is not breathing. Provide rescue breaths; do not start compressions while the pulse is definite.');
  add('call','Activate help and request an AED.','Get emergency help while supporting breathing.');
  add('breaths','Support breathing while the pulse is present.','Give one adult breath every 6 seconds, enough for visible chest rise.');
  add('advance','Continue rescue breathing for 2 simulated minutes.','Scripted patient update: the adult remains unresponsive and is not breathing; the pulse is now absent. The case has progressed to cardiac arrest. Start CPR immediately. This change is supplied by the case, not a requested repeat pulse check.',{pulsePresent:false,hr:null,bp:null,spo2:null,symptoms:'Scripted deterioration: no definite pulse and no normal breathing.'});
 }else{
  add('recognize','Check pulse and signs of life once at the beginning.','The adult is unresponsive and not breathing normally. Gasping is abnormal breathing. Lay rescuers do not need to find a pulse; providers assess breathing and pulse together within 10 seconds. If no definite pulse is felt, start CPR promptly.');
  add('call','Activate help and request an AED.','Call on speakerphone or send a helper. Do not delay CPR.');
 }
 add('cpr','Start chest compressions now.','This simplified scenario focuses on compressions and AED decisions. Physical CPR practice is separate.');
 if(c.kind==='opioid')add('naloxone','Address suspected overdose without interrupting CPR.','Naloxone is an adjunct; do not delay CPR or AED use.');
 add('aedOn','An AED is available. Turn it on.','Follow its instructions. CPR has already started; keep compressing while a helper prepares the AED.');
 add('aedPads','Apply pads and connect as instructed.','Expose and dry the chest. Place pads as illustrated. Minimize interruptions to CPR.');
 add('aedAnalyze','Follow AED instructions and clear for analysis.','Nobody touches the patient during analysis. You do not interpret a rhythm tracing.');
 if(c.kind==='rotate')add('rotate','Switch compressors during the AED analysis pause.','Normally plan a switch about every 2 minutes, coordinated with AED analysis. Change rapidly without extending the hands-off pause. If the compressor tires sooner, switch sooner; do not wait for the AED.');
 if(c.kind!=='noshock'){
  add('aedClear','Shock advised. Ensure everyone is clear.','Make sure nobody touches the patient.');
  add('aedShock','Press SHOCK.','Deliver only the AED-advised shock, then resume CPR immediately.');
 }
 add('cpr',c.kind==='noshock'?'No shock advised. Resume CPR now.':'Shock delivered. Resume CPR now.','Resume compressions immediately. The adult remains unresponsive and without normal breathing or a definite pulse in this scripted case. No repeat pulse-check task is needed.');
 add('advance','Continue CPR for 2 simulated minutes, then finish the case.','The case remains in cardiac arrest; this button advances the training interval and opens the debrief. In real care, continue CPR and follow subsequent AED/dispatcher instructions.'+(c.kind==='choking'?' Choking debrief: this is a hands-only arrest scenario. A responsive adult with severe choking uses 5 back blows and 5 abdominal thrusts. Trained rescuers giving breaths during CPR inspect for and remove only a visible object when opening the airway; never perform a blind finger sweep.':''));
 return p;
}
const blsLabels={recognize:'Check pulse & signs of life',call:'☎ Call for help',pulse:'Check pulse & signs of life',cpr:'Start CPR',aedOn:'Turn AED on',aedPads:'Apply pads / connect as instructed',aedAnalyze:'Follow AED instructions · clear for analysis',aedClear:'Everyone clear · confirm',aedShock:'⚡ SHOCK',advance:'Continue CPR · advance 2 simulated minutes',breaths:'Rescue breaths · 1 every 6 seconds',choking:'5 back blows / 5 abdominal thrusts',unresponsive:'Recognize unresponsiveness',visible:'Remove visible object only',naloxone:'Naloxone adjunct · do not delay CPR',rotate:'Change compressor with minimal interruption'};
function renderBLSCase(r){
 const s=r.plan[r.index];if(!s){finishCase('BLS decision pathway completed. Physical CPR is practiced separately.');return;}
 $('blsIncorrect').hidden=!r.blsIncorrect;$('teamRole').textContent='BLS responder · decision practice';$('caseStage').className='screen bls-stage';$('ecgWrap').hidden=true;$('enlargeECG').hidden=true;$('caseVitals').hidden=true;$('caseStage').nextElementSibling.hidden=true;document.querySelector('.electrical-controls').hidden=true;$('medications').closest('details').hidden=true;$('supportActions').closest('details').hidden=true;
 $('blsToolbar').hidden=false;$('blsPhone').disabled=!!r.helpCalled;$('blsPhone').textContent=r.helpCalled?'☎ Help requested':'☎ Call for help';$('blsPhone').onclick=()=>actBLS('call');$('blsStartCPR').hidden=!r.plan.some(x=>x.accept.includes('cpr'))||(r.cpr&&r.aedCycleComplete);$('blsMetronome').hidden=!r.cpr;$('blsMetronomeStatus').hidden=!r.cpr;$('blsStartCPR').textContent=r.cpr?'CPR IN PROGRESS':r.cprStarted?'RESUME CPR':'START CPR';$('blsStartCPR').disabled=!!r.cpr;$('blsStartCPR').onclick=()=>actBLS('cpr');
 $('blsAssess').disabled=!!r.initialAssessed;$('blsAssess').textContent=r.initialAssessed?'Assessment complete':'Check pulse & signs of life';$('blsAssess').onclick=()=>{if(caseRun.initialAssessed)return;actBLS(caseRun.c.kind==='resp'?'pulse':'recognize');};$('blsAdvance').hidden=!(s.accept.includes('advance')||(r.cpr&&r.aedCycleComplete));$('blsAdvance').textContent=r.c.kind==='resp'&&r.pulsePresent?'Continue rescue breaths · 2 minutes':'Continue CPR · 2 minutes';$('blsAdvance').onclick=()=>actBLS('advance');$('blsStepActions').replaceChildren();$('blsAEDToggle').disabled=!r.plan.some(x=>x.accept.includes('aedOn'))||!!r.pulsePresent;$('blsAEDToggle').onclick=()=>{r.aedOpen=!r.aedOpen;renderBLSCase(r);};
 $('blsAED').hidden=!r.aedOpen;$('blsAEDActions').hidden=!r.aedOpen;$('blsAEDToggle').setAttribute('aria-expanded',String(!!r.aedOpen));$('blsAEDActions').replaceChildren();
 const current=s.accept[0];$('blsAEDStatus').textContent=r.aedMessage||'AED off · use when available';
 const nextAED=r.plan.find((x,i)=>!r.blsCompleted?.includes(i)&&x.accept[0].startsWith('aed'))?.accept[0];if(nextAED){if(r.cprStarted&&current==='rotate'){text($('blsAEDActions'),'p','Switch compressors during analysis, then follow the next AED instruction.');}else if(r.cprStarted){const b=text($('blsAEDActions'),'button',blsLabels[nextAED],nextAED==='aedShock'?'shock':'primary');b.onclick=()=>actBLS(nextAED);}else{const b=text($('blsAEDActions'),'button','Start CPR','primary');b.onclick=()=>actBLS('cpr');text($('blsAEDActions'),'p','Begin CPR while a helper prepares the AED.');}}else if(r.aedNeedsCPR){const b=text($('blsAEDActions'),'button','Resume CPR','primary');b.onclick=()=>actBLS('cpr');}
 renderCaseClock();renderPatientResponse(r);$('cprInset').hidden=!!r.aedOpen||(!r.cpr&&!r.clearForShock);if(r.pulseChecked){$('pulseResult').textContent=r.pulsePresent?'DEFINITE PULSE FELT · no normal breathing in this case. Provide rescue breaths.':'NO DEFINITE PULSE · unresponsive, no normal breathing. Begin CPR.';}$('scenarioCPRCaption').textContent=r.cpr?'CPR IN PROGRESS · chest compressions':$('scenarioCPRCaption').textContent;$('monitorMessage').textContent=r.cpr?'CPR started · chest compressions':r.c.kind==='resp'?(r.pulsePresent?'Definite pulse · no breathing. Provide rescue breaths.':'Patient update: no definite pulse, no normal breathing. Start CPR now.'):'Unresponsive · no normal breathing. Gasping is abnormal breathing.';
 $('caseTask').replaceChildren();text($('caseTask'),'span',`Decision ${r.index+1} of ${r.plan.length}`,'eyebrow');text($('caseTask'),'p',s.task);text($('caseTask'),'p','Check responsiveness and normal breathing promptly. Gasping is not normal breathing. Providers check breathing and pulse together within 10 seconds; if no definite pulse is felt, start CPR. Lay rescuers do not need a pulse check. Do not delay CPR trying to find a pulse. Screen choices record decisions, not physical CPR.','decision-note');
 const holder=$('blsStepActions');
 if(!current.startsWith('aed')&&!['call','cpr','recognize','pulse','advance'].includes(current)){
 const choices=[current,...(current==='cpr'?['breaths']:current==='breaths'?['cpr']:['cpr'])];[...new Set(choices)].filter(id=>id!=='cpr').forEach(id=>{const b=text(holder,'button',blsLabels[id]||labels[id]);b.onclick=()=>actBLS(id);});
 }
 $('caseLog').replaceChildren();r.events.slice(-20).forEach(e=>text($('caseLog'),'p',`${time(e.time)} · ${e.label}${e.correct?' ✓':' · review'}`));
}
function actBLS(id){
 const r=caseRun;if(!r||r.c.category!=='BLS')return;const pending=r.plan[r.index];if(!pending||!(id in blsLabels))return;
 r.blsCompleted ||= [];
 if(['pulse','recognize'].includes(id)&&r.initialAssessed){toast('Initial assessment is complete. Follow the CPR/AED pathway without another pulse check.');return;}
 if(id==='cpr'&&r.cpr){renderBLSCase(r);return;}
 let target=r.index;
 const nextAEDIndex=r.plan.findIndex((x,i)=>!r.blsCompleted.includes(i)&&x.accept[0].startsWith('aed'));
 // Help activation and appropriate CPR must not be blocked by an earlier screen choice.
 if(id==='call'||(id==='cpr'&&!r.pulsePresent&&( !r.cprStarted||r.aedNeedsCPR))){target=r.plan.findIndex((x,i)=>!r.blsCompleted.includes(i)&&x.accept.includes(id));}
 if(id==='advance'&&r.cpr&&r.aedCycleComplete)target=r.plan.findIndex((x,i)=>!r.blsCompleted.includes(i)&&x.accept.includes('advance'));
 if(id.startsWith('aed')&&pending.accept[0]!=='rotate'&&r.cprStarted&&nextAEDIndex>=0&&r.plan[nextAEDIndex].accept.includes(id))target=nextAEDIndex;
 const s=r.plan[target]||pending;
 const correct=target>=0&&s.accept.includes(id)&&!r.blsCompleted.includes(target)&&!(id==='cpr'&&r.pulsePresent);
 const why=correct?s.explanation:'This is not the indicated action. '+pending.explanation;
 r.events.push({stage:'BLS',time:r.sim,label:blsLabels[id],correct,explanation:why});
 if(correct){r.correct++;r.blsCompleted.push(target);while(r.blsCompleted.includes(r.index))r.index++;
 if(id==='call')r.helpCalled=true;if(id==='unresponsive')r.pulsePresent=false;if(['pulse','recognize'].includes(id)){r.initialAssessed=true;if(id==='pulse'||r.c.rescuer==='provider')showPulseResult(r,s);}
 if(id==='cpr'){$('beatEnabled').checked=true;initAudio();if(!r.initialAssessed){const initial=r.plan.findIndex(x=>x.accept.includes('recognize'));if(initial>=0&&!r.blsCompleted.includes(initial)){r.blsCompleted.push(initial);r.initialAssessed=true;while(r.blsCompleted.includes(r.index))r.index++;}}if(r.aedNeedsCPR)r.aedCycleComplete=true;r.aedOpen=false;r.cpr=true;r.cprStarted=true;r.aedNeedsCPR=false;r.analysisVisualUntil=0;r.clearForShock=false;r.charged=false;}
 if(id==='advance')r.sim+=120;Object.assign(r,s.changes);if(id==='advance'&&s.changes.pulsePresent===false){$('caseStory').textContent='Patient update: the adult remains unresponsive and is not breathing. The case now reports no definite pulse. Start CPR, then use the AED.';$('pulseResult').hidden=true;r.pulseChecked=false;r.aedOpen=false;}
 if(id==='aedOn')r.aedMessage='AED on · apply pads';
 if(id==='aedPads')r.aedMessage='Pads attached · follow instructions';
 if(id==='aedAnalyze'){r.cpr=false;r.analysisVisualUntil=performance.now()+4000;r.aedMessage=r.c.kind==='rotate'?'AED ANALYZING · switch compressors while everyone is clear':r.c.kind==='noshock'?'NO SHOCK ADVISED · resume CPR now':'SHOCK ADVISED · keep everyone clear';if(r.c.kind==='noshock')r.aedNeedsCPR=true;}
 if(id==='rotate'){r.aedMessage='SHOCK ADVISED · keep everyone clear';}
 if(id==='aedClear'){r.clearForShock=true;r.charged=true;}
 if(id==='aedShock'){r.aedMessage='Shock delivered · resume CPR now';r.cpr=false;r.charged=false;r.clearForShock=false;r.aedNeedsCPR=true;r.analysisVisualUntil=0;}
 }else{r.errors++;r.sim+=15;}
 if(!r.cpr)cancelBeat();updateBeatStatus();
 r.blsIncorrect=!correct;
 $('caseFeedback').hidden=false;$('caseFeedback').className='feedback'+(correct?'':' wrong');$('caseFeedback').textContent=(correct?'Correct. ':'Review. ')+why;renderBLSCase(r);
}
// Practical AED state is advanced by the existing session clock, never by detached timers.
function setupPracticeAED(){
 live.withAED=live.mode==='practice'&&document.querySelector('input[name="practicalMode"]:checked')?.value==='aed';live.aedPhase='cpr';live.aedCPR=0;live.aedCycles=0;live.aedEvents=[];live.aedHandsOff=false;live.aedPending=false;
 if(live.withAED&&live.limit)live.limit=Math.max(240,live.limit);
 $('liveAED').hidden=!live.withAED;$('practiceCall').hidden=live.mode!=='practice';$('practiceCall').disabled=false;$('practiceCall').textContent='☎ Call for help · simulated';$('practiceCall').onclick=()=>{if(!live)return;live.helpCalled=true;$('practiceCall').disabled=true;$('practiceCall').textContent='☎ Help requested · simulated';logAED('Emergency help and AED requested · simulated call');};
 $('liveInstructions').textContent=live.mode==='practice'?'Training only: place the phone beside the manikin and start physical CPR promptly. Practice adult hands-only CPR with continuous chest compressions. Follow dispatcher and AED instructions. The beat is a compression-rate cue. A helper may operate the phone; never delay real CPR for the app.':'Call 911 and send someone for an AED. Use a firm, flat surface without delaying CPR. Push on the lower half of the breastbone, at least 2 inches deep while avoiding more than 2.4 inches. Let the chest return fully between pushes.';
 renderPracticeAED();
}
function logAED(label){if(live)live.aedEvents.push({time:live.elapsed,label});}
function renderPracticeAED(){
 if(!live?.withAED)return;const phase=live.aedPhase,states={cpr:live.aedCycles?'Resume hands-only CPR now · continuous chest compressions. Next AED analysis after about 2 minutes.':'Begin CPR now · AED arrives after 2 minutes of practice.',on:'AED has arrived · turn it on',pads:'Expose and dry the chest. Apply pads on the manikin as illustrated; connect if instructed.',clearAnalysis:'Follow AED instructions. Everyone clear for analysis.',analyzing:'ANALYZING · do not touch the manikin',clearShock:'SHOCK ADVISED · make sure everyone is clear',shock:'EVERYONE CLEAR · press SHOCK'};
 $('liveAEDStatus').textContent=states[phase];$('liveAEDActions').replaceChildren();const buttons={on:['Turn AED on','pads'],pads:['Pads applied / connected','clearAnalysis'],clearAnalysis:['Everyone clear · analyze','analyzing'],clearShock:['Everyone clear · confirm','shock'],shock:['⚡ SHOCK','resume']};
 if(buttons[phase]){const [label,next]=buttons[phase],b=text($('liveAEDActions'),'button',label,phase==='shock'?'shock':'primary');b.onclick=()=>advancePracticeAED(next);}
 const off=live.aedHandsOff;$('liveCPRImage').src=off?('hands-off-visual.webp'):('cpr-visual.webp');$('liveCPRImage').alt=off?'Rescuers clear of the manikin for AED analysis or shock':'CPR compressions in progress on the training manikin';$('liveCPRImage').parentElement.querySelector('figcaption').textContent=off?'ALL CLEAR · hands off':'CPR practice · hands on breastbone';updateLiveCPRVisual();
}
function advancePracticeAED(next){
 if(!live?.withAED)return;
 if(next==='resume'){logAED('Simulated AED shock delivered');resumePracticeCPR('Shock delivered. Resume CPR now, starting with compressions.');return;}
 live.aedPhase=next;logAED({pads:'AED turned on',clearAnalysis:'Pad placement confirmed by learner',analyzing:'Everyone clear confirmed; AED analyzing',shock:'Everyone clear confirmed before shock'}[next]||next);
 if(next==='clearAnalysis'){live.aedHandsOff=true;$('rate').textContent='—';$('pace').textContent='Everyone clear · follow AED analysis instructions';}
 if(next==='analyzing'){live.aedHandsOff=true;live.aedAnalyzeEnd=performance.now()+3000;live.samples=[];live.rate=null;$('rate').textContent='—';$('pace').textContent='Hands off · AED analyzing';speak('Everyone clear. Analyzing. Do not touch the manikin.');}
 else speak(next==='pads'?'Apply pads to the exposed, dry chest on the manikin. If a second rescuer is available, continue CPR while they apply pads.':next==='clearAnalysis'?'Follow the AED instructions. Make sure everyone is clear for analysis.':next==='shock'?'Everyone clear. Press the shock button.':'Follow AED instructions.');
 renderPracticeAED();
}
function resumePracticeCPR(message){
 logAED(message);live.aedCycles++;live.aedPhase='cpr';live.aedHandsOff=false;live.aedPending=false;live.aedCPR=0;live.samples=[];live.prev=null;live.rate=null;if(audio)beatNext=audio.currentTime+.05;
 // Preserve a full post-AED CPR interval before ending a timed practice session.
 if(live.limit)live.limit=Math.max(live.limit,live.elapsed+120);$('pace').textContent='Resume CPR now';renderPracticeAED();$('liveAEDStatus').textContent=message;speak(message);
}
function tickPracticeAED(dt){
 if(!live?.withAED)return;
 if(live.aedPhase==='cpr'){live.aedCPR+=dt;if(live.aedCPR>=120&&(!live.limit||live.elapsed+1<live.limit)){
 live.aedPending=true;live.aedPhase=live.aedCycles?'clearAnalysis':'on';logAED(live.aedCycles?'AED requests reassessment':'AED arrives after initial CPR practice interval');renderPracticeAED();speak(live.aedCycles?'Continue until ready, then follow AED instructions. Everyone clear for analysis.':'A helper brings an AED. Keep compressing while the helper turns it on and applies pads.');}}
 if(live.aedPhase==='analyzing'&&performance.now()>=live.aedAnalyzeEnd){if(live.aedCycles%2===0){live.aedPhase='clearShock';logAED('AED advises shock');$('pace').textContent='Hands off · shock advised';renderPracticeAED();speak('Shock advised. Make sure everyone is clear.');}else resumePracticeCPR('No shock advised. Resume CPR now, starting with compressions.');}
}
