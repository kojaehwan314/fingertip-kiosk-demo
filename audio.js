/* Sound guidance v4: local Web Audio, no microphone or new models. */
(function(){
'use strict';
const el=id=>document.getElementById(id), clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function mapping(f,b,w,h){
 const dx=(b.x0+b.x1)/2-f.x,dy=(b.y0+b.y1)/2-f.y,d=Math.hypot(dx,dy);
 const radius=Math.max(18,Math.min(b.x1-b.x0,b.y1-b.y0)*.5),dead=Math.max(12,h*.018);
 return {dx,dy,d,radius,near:d<radius,pan:clamp(dx/Math.max(1,w*.25),-1,1),hz:Math.abs(dy)<=dead?660:dy<0?880:440,interval:180+820*clamp((d-radius)/Math.max(1,Math.hypot(w,h)*.55),0,1)};
}
window.soundMapping=mapping;
let enableEpoch=0;
let ac=null,master=null,enabled=false,timer=null,next=0,inside=0,arrived=false,lastRun=-1,lastVideo=-1,videoChanged=0,test=null,testArrival=false;
const voices=new Set();
function silence(){for(const x of voices){try{x.o.stop()}catch(e){}try{x.o.disconnect();x.g.disconnect();x.p.disconnect()}catch(e){}}voices.clear();}
function clearState(){silence();next=0;inside=0;arrived=false;test=null;testArrival=false;}
function status(t,detail='—'){el('soundStatus').textContent=t;el('soundDetails').textContent=detail;}
function beep(hz,pan,len=.075,delay=0){
 if(!enabled||!ac||ac.state!=='running'||document.hidden)return;
 const t=ac.currentTime+delay,o=ac.createOscillator(),g=ac.createGain(),pn=ac.createStereoPanner(),voice={o,g,p:pn};
 o.type='sine';o.frequency.value=hz;pn.pan.value=clamp(pan,-1,1);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.65,t+.008);g.gain.setValueAtTime(.65,t+Math.max(.01,len-.02));g.gain.linearRampToValueAtTime(0,t+len);o.connect(g);g.connect(pn);pn.connect(master);voices.add(voice);o.onended=()=>{voices.delete(voice);o.disconnect();g.disconnect();pn.disconnect()};o.start(t);o.stop(t+len+.01);
}
function done(){silence();beep(784,0,.09);beep(1046,0,.14,.11);}
function off(reason='소리 꺼짐'){enableEpoch++;
 enabled=false;clearInterval(timer);timer=null;clearState();if(master&&ac)master.gain.setValueAtTime(0,ac.currentTime);if(ac)ac.suspend().catch(()=>{});el('soundToggle').textContent='소리 안내 시작';el('soundToggle').setAttribute('aria-pressed','false');status(reason);
}
async function enable(){const epoch=++enableEpoch;
 const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('이 브라우저는 Web Audio를 지원하지 않습니다.');
 if(!ac){ac=new C();if(!ac.createStereoPanner)throw Error('스테레오 출력을 지원하는 최신 Chrome이 필요합니다.');master=ac.createGain();master.connect(ac.destination);}
 await ac.resume();if(epoch!==enableEpoch)return false;if(ac.state!=='running')throw Error('오디오 시작이 차단되었습니다. 버튼을 다시 눌러 주세요.');
 enabled=true;master.gain.setValueAtTime(Number(el('soundVolume').value),ac.currentTime);el('soundToggle').textContent='소리 끄기';el('soundToggle').setAttribute('aria-pressed','true');if(!timer)timer=setInterval(tick,50);next=0;status('안내 준비 · 목표와 검지를 기다립니다');return true;
}
function tick(){
 if(!enabled)return;if(document.hidden){off('화면 이탈 · 소리 꺼짐');return;}if(ac.state!=='running'){silence();status('오디오 일시중지 · 소리를 껐다 켜 주세요');return;}
 const now=performance.now();
 if(test){if(now>=test.end){silence();test=null;next=0;status('테스트 종료');return;}if(now>=next){if(test.arrival){if(!testArrival){done();testArrival=true;}}else beep(test.hz,test.pan);next=now+test.interval;}status('이어폰 테스트 · '+test.label,'실제 인식 결과가 아닌 시험용 소리');return;}
 const z=window.readSoundGuidance();
 if(z.run!==lastRun){lastRun=z.run;clearState();lastVideo=-1;videoChanged=now;}
 if(z.videoTime!==lastVideo){lastVideo=z.videoTime;videoChanged=now;}
 if(!z.active||!z.locked||!z.box||!z.tip||z.age>500||z.ready<2||now-videoChanged>700){silence();inside=0;next=0;arrived=false;status(!z.active?'카메라·AI 시작을 기다립니다':!z.locked||!z.box?'목표 글자 고정을 기다립니다':'검지 또는 영상 유실 · 안내 중지');return;}
 const m=mapping(z.tip,z.box,z.w,z.h);
 if(m.near){if(!inside)inside=now;if(!arrived&&now-inside>=350){arrived=true;done();}if(!arrived)silence();status(arrived?'목표 근처 도달 · 방향음 중지':'도달 확인 중', '실제 버튼 터치·선택 성공을 뜻하지 않습니다.');return;}
 inside=0;if(arrived&&m.d<m.radius*1.5){status('목표 근처 · 대기');return;}if(arrived){arrived=false;next=0;}
 if(now>=next){beep(m.hz,m.pan);next=now+m.interval;}
 status('소리로 이동 방향 안내 중',`${m.pan<-.06?'왼쪽':m.pan>.06?'오른쪽':'중앙'} · ${m.hz===880?'위 / 높은 음':m.hz===440?'아래 / 낮은 음':'높이 일치 / 중간 음'} · ${m.hz} Hz · 간격 ${Math.round(m.interval)} ms · 거리 ${Math.round(m.d)} px`);
}
el('soundToggle').onclick=async()=>{if(enabled){off();return;}try{await enable()}catch(e){off('소리 시작 오류: '+e.message)}};
el('soundVolume').oninput=()=>{el('soundVolumeValue').textContent=Math.round(Number(el('soundVolume').value)/.2*100)+'%';if(master&&ac)master.gain.setTargetAtTime(Number(el('soundVolume').value),ac.currentTime,.03)};
const cases={left:{pan:-1,hz:660,interval:600,label:'왼쪽'},right:{pan:1,hz:660,interval:600,label:'오른쪽'},up:{pan:0,hz:880,interval:600,label:'위 / 높은 음'},down:{pan:0,hz:440,interval:600,label:'아래 / 낮은 음'},far:{pan:0,hz:660,interval:1000,label:'먼 거리 / 느림'},near:{pan:0,hz:660,interval:180,label:'가까운 거리 / 빠름'},arrival:{arrival:true,label:'도달 완료음',interval:3000}};
let testRequest=0;
document.querySelectorAll('[data-sound-test]').forEach(button=>button.onclick=async()=>{const id=++testRequest;try{if(!await enable())return;if(id!==testRequest||document.hidden)return;clearState();test={...cases[button.dataset.soundTest],end:performance.now()+2500};tick()}catch(e){off('테스트 오류: '+e.message)}});
window.stopSoundGuidance=()=>{testRequest++;off('인식 정지 · 소리 꺼짐')};
window.resetSoundTarget=()=>{clearState();status(enabled?'목표 재탐색 · 소리 대기':'소리 꺼짐')};
addEventListener('pagehide',()=>off());document.addEventListener('visibilitychange',()=>{if(document.hidden)off('화면 이탈 · 소리 꺼짐')});
})();
