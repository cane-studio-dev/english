/* ===== Global diagnostics (runs first, before anything else) =====
   Surfaces ANY uncaught error or unhandled promise rejection as a visible
   on-screen banner instead of a silent console-only failure — most people
   never open devtools on their phone, so a silently-thrown exception looks
   exactly like "the site just does nothing."
   It also proactively flags the single most common real-world cause of
   "voice/mic totally broken on mobile but perfect on desktop": the page
   being loaded over an insecure origin. Desktop testing via
   http://localhost is specially exempted by browsers from the HTTPS
   requirement for getUserMedia/AudioContext, but a phone hitting the same
   dev server via its LAN IP (e.g. http://192.168.x.x) or opening the file
   directly (file://) is NOT exempt — navigator.mediaDevices simply doesn't
   exist there, on iOS Safari AND Android Chrome alike, with no error at
   all — which looks identical to "the mic button just doesn't work." */
(function(){
function vfShowDiagBanner(msg){
try{
var existing=document.getElementById('vf-diag-banner');
if(existing){existing.textContent='';existing.appendChild(document.createTextNode(msg));return}
var b=document.createElement('div');
b.id='vf-diag-banner';
b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:999999;background:#3a0d0d;color:#ffd7d7;font-family:Tajawal,Arial,sans-serif;font-size:13px;line-height:1.6;padding:10px 40px 10px 16px;text-align:center;direction:rtl;box-shadow:0 2px 12px rgba(0,0,0,0.5)';
b.appendChild(document.createTextNode(msg));
var closeBtn=document.createElement('span');
closeBtn.textContent='✕';
closeBtn.setAttribute('aria-label','إغلاق');
closeBtn.style.cssText='cursor:pointer;font-weight:bold;position:absolute;left:14px;top:8px;padding:2px 6px';
closeBtn.onclick=function(){b.remove()};
b.appendChild(closeBtn);
function attach(){document.body.insertBefore(b,document.body.firstChild)}
if(document.body)attach();else document.addEventListener('DOMContentLoaded',attach);
}catch(e){}
}
window.addEventListener('error',function(e){
vfShowDiagBanner('⚠️ خطأ برمجي: '+(e.message||'unknown')+(e.lineno?' (سطر '+e.lineno+')':''));
});
window.addEventListener('unhandledrejection',function(e){
var reason=(e.reason&&e.reason.message)?e.reason.message:String(e.reason);
vfShowDiagBanner('⚠️ خطأ غير معالج (Promise): '+reason);
});
var isSecure=(location.protocol==='https:')||(location.hostname==='localhost')||(location.hostname==='127.0.0.1');
window._vfIsSecureContext=isSecure;
if(!isSecure){
vfShowDiagBanner('🔒 هذه الصفحة مفتوحة عبر رابط غير آمن ('+location.protocol+'//'+(location.host||'ملف محلي')+') — المتصفح يمنع المايكروفون والصوت المباشر تماماً في هذه الحالة على الجوال. افتح الموقع عبر رابط https:// حقيقي (مثل رابط GitHub Pages أو Render) وليس عبر IP محلي أو فتح الملف مباشرة.');
}
/* Diagnostic-only DOM node counter, exposed on window so it can be checked
   from the console (or wired into the visible banner) right at the moment
   of a suspected crash — confirms or rules out real element duplication
   without guessing. */
window.vfDomNodeCount=function(){return document.getElementsByTagName('*').length};
window.addEventListener('load',function(){
try{
var n=window.vfDomNodeCount();
console.log('[vf-diag] total DOM nodes at load:',n);
if(n>6000){vfShowDiagBanner('⚠️ تنبيه تشخيصي: عدد عناصر الصفحة مرتفع بشكل غير طبيعي ('+n+') — قد يشير لتكرار في توليد عناصر.')}
}catch(e){}
});
})();

/* ================================================== */

(function(){
var s = document.getElementById('splash-screen');
var dismissed = false;
function dismissSplash(){
if (dismissed) return;
dismissed = true;
if (s) s.classList.add('splash-fade');
document.body.classList.remove('splash-active');
setTimeout(function(){ try { if (s && s.parentNode) s.remove(); } catch(e){} }, 900);
}
document.body.classList.add('splash-active');
setTimeout(dismissSplash, 2000);
// Failsafe #2: if the first timer was throttled/killed, window.load forces it.
window.addEventListener('load', function(){ setTimeout(dismissSplash, 2600); });
// Failsafe #3: any first user interaction dismisses immediately.
window.addEventListener('pointerdown', function(){ if (dismissed) return; setTimeout(dismissSplash, 2200); }, { once: true });
})();

/* ================================================== */

// رابط الباك إند على Render — يُستخدم للاتصال بالويب سوكيت من أي دومين يستضيف هذا الملف
  window.VOICE_BACKEND_WS_URL = 'wss://stylish-english.onrender.com/api/voice-session';
  /* Server warm-up: fire a lightweight health-check request the moment the
     page loads (fire-and-forget, failures are silently ignored — this is
     purely an optimization, never a requirement). Render's free tier can
     cold-sleep after inactivity; by the time the student has read the
     page, picked options, and actually tapped "start" a few seconds later,
     the server has usually already woken up from this ping instead of
     waking up cold exactly when the real WebSocket connection is needed.
     Exposed as a named, de-duplicated function (not a one-shot inline
     call) so it can also be re-triggered on hover/touchstart of the hero
     CTA — extra, harmless warm-up attempts, never required, never
     blocking anything. */
  var _seWarmupSent=false;
  window.seWarmupBackend=function(){
    if(_seWarmupSent)return;
    _seWarmupSent=true;
    try{
      fetch('https://stylish-english.onrender.com/api/health',{mode:'cors'}).catch(function(){});
    }catch(e){}
  };
  window.seWarmupBackend();

/* ================================================== */

(function(){'use strict';
window._vfOpen=false;
window._vfRec=false;
window._vfTutorGender='female'; /* fixed — single persona "Alexa", no more gender choice */
window.vfTutorName=function(){return 'Alexa'};
function vfTutorVerb(femForm,maleForm){return window._vfTutorGender==='male'?maleForm:femForm}
var _vfAge='boy',_vfStream;
var VF_WS_PATH='/api/voice-session';
var _vfHistory=[];
function vfPushHistory(item){
if(!item)return;
_vfHistory.push(item);
if(_vfHistory.length>50)_vfHistory.shift();
}
var VF_MSG_LIMIT=50;
var VF_MSG_KEY='se_voice_msgs';

// ===== Real-time WebSocket voice engine (Gemini Live / BidiGenerateContent) =====
var _vfSocket=null;
var _vfSessionReady=false;
/* Safely expose these two as READ-ONLY window properties via getters —
   fixes a real "_vfSessionReady is not defined" ReferenceError: code
   defined in a LATER, separate <script> block (e.g. vfPracticePhonetic(),
   which already correctly used window._vfRec right next to these) has no
   closure access to var declarations inside this IIFE, since function-
   scoped vars never leak to the global/window scope regardless of
   strict mode. A getter (not a one-time assignment) is essential here —
   both variables get reassigned in dozens of places throughout this
   IIFE, so a plain `window._vfSessionReady = _vfSessionReady;` snapshot
   here would immediately go stale; a getter always re-reads the live
   closure variable instead. Internal code inside this IIFE is
   completely unaffected — it keeps using the bare `_vfSocket`/
   `_vfSessionReady` identifiers exactly as before, this only adds an
   external, read-only window-level view for cross-script-block code. */
Object.defineProperty(window,'_vfSessionReady',{get:function(){return _vfSessionReady;},configurable:true});
Object.defineProperty(window,'_vfSocket',{get:function(){return _vfSocket;},configurable:true});
var _vfMicCtx=null,_vfMicProcessor=null,_vfMicSource=null;
var _vfPlayCtx=null;
var _vfCurrentAiText='',_vfCurrentAiChunks=[];
var _vfLastAiChunks=null,_vfLastAiText='';
var _vfLiveAiEl=null,_vfLiveUserEl=null;
var _vfMinimized=false;
var _vfStarting=false; /* re-entry guard: blocks rapid double-taps from creating duplicate AudioContexts/mic streams, which can crash mobile Safari */
var _vfMicMuted=false;
var _vfMicSuppressed=false; /* true while Alexa's audio is playing, to stop echo/barge-in */
var _vfAiIsSpeaking=false; /* true while Alexa's audio is actively queued/playing — used for amplitude-gated barge-in below */
var _vfPlaybackResumeTimer=null;
var _vfLessonId=null;
var _vfCallHadAiTurn=false;

/* ===== Token-budget protection =====
   Auto-ends the call if the student goes quiet for too long, or after a
   hard cap on total call length, so a forgotten open mic can't run up
   Gemini usage indefinitely. */
var _vfSessionStartTime=0;
var _vfConnectionEstablishedTime=0;
var _vfLastUserSpeechTime=0;
var _vfIdleCheckTimer=null;
var _vfConnectTimeout=null;
var _vfReconnectAttempted=false;
var _vfHasSpokenSinceTurnEnd=false;
var _vfConsecutiveLoudCallbacks=0;
var _vfConsecutiveBargeInCallbacks=0;
var _vfBargeInOnsetTime=0,_vfBargeInFired=false;
var _vfPreRollBuffer=[];
var _vfInterruptGraceUntil=0;
var _vfTurnGenerationComplete=false,_vfTurnEndSignaled=false;
var _vfResponseTimeoutTimer=null;
var _vfMicUnmuteGuardTimer=null;
var _vfSilenceStartTime=null;
var _vfWarmupHintTimeout=null;
var VF_SILENCE_TIMEOUT_MS=180000; /* 3 minutes of no detected student speech — comfortably above the 45s minimum, more lenient than the previous 2-minute setting */
var VF_MAX_SESSION_MS=1200000; /* 20 minutes soft-pause point per turn-taking round — significantly extended from 7 minutes rather than removed entirely; see CLAUDE.md §9 for why the graceful resume mechanism itself was kept as a distant safety net */
var VF_DAILY_LIMIT_SECONDS=900; /* 15 minutes of actual active voice time per calendar date */
/* Daily voice-time budget: localStorage-only (no server-side enforcement —
   this is a client-side courtesy limit, not a security boundary; a
   determined user could clear localStorage, which is an accepted
   trade-off for a purely client-side implementation). Stores {date,
   seconds} as one JSON blob; the date check means the counter naturally
   resets itself the first time it's read/written on a new calendar day,
   no explicit "reset" job needed. */
function vfTodayKey(){
var d=new Date();
return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function vfGetDailyVoiceSeconds(){
try{
var raw=JSON.parse(localStorage.getItem('se_voice_daily')||'{}');
if(raw.date!==vfTodayKey())return 0;
return raw.seconds||0;
}catch(e){return 0;}
}
function vfAddDailyVoiceSeconds(delta){
try{
var current=vfGetDailyVoiceSeconds();
localStorage.setItem('se_voice_daily',JSON.stringify({date:vfTodayKey(),seconds:current+delta}));
}catch(e){}
}
/* Lifetime spoken-minutes total (Dashboard "Total Spoken Minutes" stat) —
   deliberately a SEPARATE counter from the daily one above, which resets
   every calendar day by design. This one only ever grows, for as long as
   the student has this browser's localStorage. Same accumulation source
   (vfCheckSessionLimits()'s 5s tick, while _vfRec is true and not
   _vfPaused) calls both — see its call site for why "real active voice
   time" excludes soft-paused/idle periods. */
function vfGetLifetimeVoiceSeconds(){
try{return parseInt(localStorage.getItem('se_lifetime_voice_seconds')||'0',10)||0;}catch(e){return 0;}
}
function vfAddLifetimeVoiceSeconds(delta){
try{localStorage.setItem('se_lifetime_voice_seconds',String(vfGetLifetimeVoiceSeconds()+delta));}catch(e){}
}
function vfDailyLimitReached(){
/* Daily 15-minute voice cap — DISABLED per explicit request. Single
   source of truth: both call sites below (the pre-call check in
   vfUnlockAndStart() and the mid-call check in vfCheckSessionLimits())
   read this one function, so returning false here alone fully disables
   enforcement everywhere — no separate blocks to hunt down and remove.
   vfAddDailyVoiceSeconds() below still quietly accumulates time in
   localStorage in the background (harmless, and easy to make use of
   again later if the cap is ever re-enabled) — it's simply never
   checked against the limit anymore. To restore the cap, revert this
   one line back to: return vfGetDailyVoiceSeconds()>=VF_DAILY_LIMIT_SECONDS; */
return false;
}
var _vfPaused=false; /* true during a soft pause: mic stops sending, but the
   WebSocket + Gemini Live session stay fully connected so resuming needs
   no reconnect at all — same live session, same conversation memory. */

var _vfLessonTitleAr=null;
var _vfLessonTitleEn=null;
var _vfLessonGoal=null;
var _vfLessonVocab=null;

/* Called from saveProgress() (in the other <script> block, global scope) every
   time the student opens a lesson card, so Alexa always knows the lesson the
   student is currently reviewing without any extra UI. Accepts a DOM id like
   "lesson-03", a plain number, or null/undefined to clear the context.
   Also pulls the REAL lesson title/objective/vocabulary straight out of that
   lesson card's own DOM (.lesson-title-ar / .lesson-title-en / .lesson-goal /
   .vc-verb) — this is the single source of truth for lesson content, so
   Alexa's greeting and focus always match the actual curriculum text on
   screen instead of a separately hand-maintained copy that could drift out
   of sync. */
window.vfSetLessonContext=function(lessonId){
if(lessonId===null||lessonId===undefined||lessonId===''){_vfLessonId=null;_vfLessonTitleAr=null;_vfLessonTitleEn=null;_vfLessonGoal=null;_vfLessonVocab=null;vfUpdateActiveLessonBadge();return;}
if(typeof lessonId==='number'){_vfLessonId=lessonId;_vfLessonTitleAr=null;_vfLessonTitleEn=null;_vfLessonGoal=null;_vfLessonVocab=null;vfUpdateActiveLessonBadge();return;}
var m=String(lessonId).match(/(\d+)/);
_vfLessonId=m?parseInt(m[1],10):null;
_vfLessonTitleAr=null;_vfLessonTitleEn=null;_vfLessonGoal=null;_vfLessonVocab=null;
try{
var card=document.getElementById(lessonId);
if(card){
var ar=card.querySelector('.lesson-title-ar');
var en=card.querySelector('.lesson-title-en');
var goal=card.querySelector('.lesson-goal');
if(ar)_vfLessonTitleAr=ar.textContent.trim().slice(0,200);
if(en)_vfLessonTitleEn=en.textContent.trim().slice(0,200);
if(goal)_vfLessonGoal=goal.textContent.trim().slice(0,400);
var vocabEls=card.querySelectorAll('.vc-verb');
if(vocabEls&&vocabEls.length){
var words=[];
for(var i=0;i<vocabEls.length&&words.length<12;i++){
var w=vocabEls[i].textContent.trim();
if(w&&words.indexOf(w)===-1)words.push(w);
}
if(words.length)_vfLessonVocab=words.join(', ').slice(0,300);
}
}
}catch(e){}
vfUpdateActiveLessonBadge();
};
/* Visible tracking of the active lesson context inside the voice panel
   itself — shows/hides #vf-active-lesson-badge based on whether a
   specific curriculum lesson (not free chat, not a roleplay scenario,
   not casual chat) is currently set. Called from every exit point of
   vfSetLessonContext() above, so it always reflects the latest state. */
function vfUpdateActiveLessonBadge(){
var badge=document.getElementById('vf-active-lesson-badge');
var text=document.getElementById('vf-active-lesson-badge-text');
if(!badge||!text)return;
if(_vfLessonId&&(_vfLessonTitleAr||_vfLessonTitleEn)){
text.textContent='الدرس '+_vfLessonId+': '+(_vfLessonTitleAr||_vfLessonTitleEn);
badge.style.display='block';
}else{
badge.style.display='none';
text.textContent='';
}
}

// If the backend is hosted on a different origin than this page, set
// window.VOICE_BACKEND_WS_URL = 'wss://your-backend-host/api/voice-session'
// before this script runs. Otherwise we default to the same host as the page.
function vfBuildWsUrl(){
if(window.VOICE_BACKEND_WS_URL)return window.VOICE_BACKEND_WS_URL;
if(location.protocol==='file:'||!location.host){
return null;
}
var proto=location.protocol==='https:'?'wss:':'ws:';
return proto+'//'+location.host+VF_WS_PATH;
}

function getVoiceMsgCount(){
try{var d=sessionStorage.getItem(VF_MSG_KEY);return d?parseInt(d):0}catch(e){return 0}
}
function incVoiceMsgCount(){
try{var c=getVoiceMsgCount()+1;sessionStorage.setItem(VF_MSG_KEY,c);return c}catch(e){return 999}
}
var _shaderActive=false;
/* setWaveActive() now just toggles the lightweight CSS status badge
   (#vf-status-display) — no canvas, no WebGL context, no shader compile,
   no requestAnimationFrame loop to schedule/throttle/cancel. Called from
   the exact same call-lifecycle points the old WebGL version was
   (vfStart() on session_ready, vfStop() and toggleVoiceFab()'s close
   branch on end), so no other code needed to change. */
function setWaveActive(active){
var badge=document.getElementById('vf-status-display');
var text=document.getElementById('vf-status-text');
if(badge){if(active){badge.classList.add('vf-status-active')}else{badge.classList.remove('vf-status-active')}}
if(text)text.textContent=active?'Voice Session Active':'Voice Session Idle';
}
window.toggleVoiceFab=function(){window._vfOpen=!window._vfOpen;
var overlay=document.getElementById('vf-overlay');
var controlPanel=document.getElementById('ai-control-panel');
if(window._vfOpen){
overlay.classList.add('vf-modal-open');
if(controlPanel)controlPanel.style.display='';
/* Warm up the playback AudioContext right now, on this genuine user tap
   (opening the panel) — satisfies the browser's autoplay-gesture
   requirement early, so by the time the student actually presses "start"
   a moment later, context creation is already done instead of adding to
   that critical path. */
try{if(typeof vfEnsurePlayCtx==='function')vfEnsurePlayCtx();}catch(e){}
/* Direct launch: tapping the floating/header Alexa icon starts the voice
   session immediately with the default scenario/age, instead of just
   opening the panel and waiting for a separate manual "ابدأ المحادثة" tap
   — one fewer step between "I want to talk to Alexa" and actually talking
   to her. vfUnlockAndStart() owns its own guard (checks window._vfRec),
   so this is always safe to call here even if a call is already active
   (e.g. reopening a minimized session) — it silently no-ops in that case
   rather than starting a duplicate session. Still runs synchronously
   within this same tap's call stack, so it still counts as a genuine
   user gesture for mobile audio-unlock purposes. */
if(typeof window.vfUnlockAndStart==='function')window.vfUnlockAndStart();
}else{
overlay.classList.remove('vf-modal-open');
if(controlPanel)controlPanel.style.display='none';
vfStop();setWaveActive(false);if(typeof window.vfStopAllVisuals==='function')window.vfStopAllVisuals();
var ti=document.querySelector('.vf-text-in');if(ti)ti.remove();
}};

/* ===== Floating widget: minimize / expand while a call is active =====
   Minimizing NEVER touches _vfSocket, the mic stream, or the playback
   AudioContext — only the overlay's visibility changes, so the WebSocket
   session and the 16kHz-in/24kHz-out audio streaming stay fully alive
   while the student scrolls or taps anywhere on the lesson content. */
window.vfHandleCloseIntent=function(){
if(window._vfRec){
vfMinimize();
}else{
toggleVoiceFab();
}
};
function vfMinimize(){
if(!window._vfRec)return;
var overlay=document.getElementById('vf-overlay');
overlay.classList.remove('vf-modal-open');
window._vfOpen=false;
_vfMinimized=true;
var fab=document.getElementById('voice-fab');
if(fab)fab.classList.add('vf-hidden');
var bar=document.getElementById('vf-floating-bar');
if(bar)bar.classList.add('vf-floating-open');
vfUpdateFloatingBarState();
}
function vfExpand(){
if(!_vfMinimized)return;
_vfMinimized=false;
var bar=document.getElementById('vf-floating-bar');
if(bar)bar.classList.remove('vf-floating-open');
var overlay=document.getElementById('vf-overlay');
overlay.classList.add('vf-modal-open');
window._vfOpen=true;
}
function vfExitMinimized(){
_vfMinimized=false;
var bar=document.getElementById('vf-floating-bar');
if(bar)bar.classList.remove('vf-floating-open');
var fab=document.getElementById('voice-fab');
if(fab)fab.classList.remove('vf-hidden');
}
function vfToggleMicMute(e){
if(e){e.stopPropagation();}
if(!window._vfRec)return;
_vfMicMuted=!_vfMicMuted;
if(_vfStream){
_vfStream.getAudioTracks().forEach(function(t){t.enabled=!_vfMicMuted});
}
var btn=document.getElementById('vf-fb-mute');
var icon=document.getElementById('vf-fb-mute-icon');
if(btn)btn.classList.toggle('vf-fb-muted',_vfMicMuted);
if(icon)icon.innerHTML='<use href="#'+(_vfMicMuted?'ic-mic-off':'ic-mic')+'"/>';
vfUpdateFloatingBarState();
}
function vfEndCallFromWidget(e){
if(e){e.stopPropagation();}
vfStop();
}
function vfUpdateFloatingBarState(state){
var bar=document.getElementById('vf-floating-bar');
if(!bar)return;
if(state)bar.dataset.state=state;
var effective=_vfMicMuted?'muted':(bar.dataset.state||'idle');
bar.classList.remove('vf-fb-speaking','vf-fb-waiting','vf-fb-recording','vf-fb-idle');
var txt=document.getElementById('vf-fb-status');
if(effective==='speaking'){bar.classList.add('vf-fb-speaking');if(txt)txt.textContent='🔊 '+window.vfTutorName()+' '+vfTutorVerb('تتحدث','يتحدث')+'...';}
else if(effective==='waiting'){bar.classList.add('vf-fb-waiting');if(txt)txt.textContent='🤖 '+window.vfTutorName()+' '+vfTutorVerb('تفكر','يفكر')+'...';}
else if(effective==='connecting'){bar.classList.add('vf-fb-waiting');if(txt)txt.textContent='🔄 جاري الاتصال...';}
else if(effective==='muted'){bar.classList.add('vf-fb-idle');if(txt)txt.textContent='🔇 المايكروفون مكتوم';}
else if(effective==='recording'){bar.classList.add('vf-fb-recording');if(txt)txt.textContent='🎤 أسمعك الآن...';}
else{if(txt)txt.textContent='Alexa';}
}
var _vfScenario='free';
var _vfToneMode='normal';
window.vfSelectScenario=function(b){
document.querySelectorAll('.vf-scenario').forEach(function(x){x.classList.remove('vf-scenario-on')});
b.classList.add('vf-scenario-on');
_vfScenario=b.dataset.scenario;
if(window._vfRec&&_vfSessionReady&&_vfSocket&&_vfSocket.readyState===WebSocket.OPEN){
/* Mid-call: switch the AI's roleplay persona live, without ending the
   session, dropping the WebSocket, or clearing the conversation so far.
   The AI's own spoken acknowledgment of the switch arrives naturally
   through the normal audio/text message flow, same as any other reply. */
console.log('[WS] Switching scenario mid-call to: '+_vfScenario);
_vfSocket.send(JSON.stringify({type:'switch_scenario',scenario:_vfScenario}));
}else{
/* Not in a call yet — this choice simply applies to the next session start. */
_vfHistory=[];
var tr=document.getElementById('vf-tr');if(tr)tr.innerHTML='';
}
};
window.vfSelectTone=function(b){
document.querySelectorAll('.vf-tone').forEach(function(x){x.classList.remove('vf-tone-on')});
b.classList.add('vf-tone-on');
_vfToneMode=b.dataset.tone;
if(window._vfRec&&_vfSessionReady&&_vfSocket&&_vfSocket.readyState===WebSocket.OPEN){
/* Mid-call: switch Alexa's tone/personality live, without ending the
   session, dropping the WebSocket, or clearing ANY conversation/lesson
   state — unlike scenario switching, a tone change is not a topic
   change, so the transcript/history stays exactly as-is. The AI's own
   spoken acknowledgment of the new tone arrives naturally through the
   normal audio/text message flow, same as any other reply. */
console.log('[WS] Switching tone mid-call to: '+_vfToneMode);
_vfSocket.send(JSON.stringify({type:'switch_tone',toneMode:_vfToneMode}));
}
/* If not in a call yet, no action needed beyond updating _vfToneMode —
   it's simply included in the next start_session payload. */
};
window.vfToggleSession=function(){
console.log('[WS] Mic button pressed (vfToggleSession), _vfStarting='+_vfStarting+', _vfPaused='+_vfPaused);
/* While a connection attempt is already in flight (_vfStarting true —
   getUserMedia prompt showing, or WebSocket/Gemini handshake in progress),
   ignore extra taps entirely instead of treating them as "stop". Without
   this, an impatient second tap during the 1-3 second connecting window
   would call vfStop() and cancel the FIRST attempt outright (since
   window._vfRec is already true by then) — needing a third tap to finally
   succeed. This was the actual cause of "needs multiple clicks". */
if(_vfStarting)return;
/* "Push to Talk" resume: the call is soft-paused (20-minute round boundary
   reached), so this tap means "continue", not "stop" — resume the exact
   same live session instead of ending or restarting anything. */
if(_vfPaused){vfResumeFromSoftPause();return;}
if(window._vfRec)vfStop();else vfStart();
};

/* ===== iOS AudioContext Unlock + Start ===== */
window.vfUnlockAndStart=function(){
console.log('[WS] Start button pressed (vfUnlockAndStart)');
/* Daily 15-minute cap: checked BEFORE anything else — no mic prompt, no
   WebSocket, no AudioContext work at all if today's budget is already
   spent. This is the "prevent NEW calls until the next day" half of the
   requirement; vfCheckSessionLimits() above is the "end gracefully if the
   cap is hit mid-call" half. */
if(vfDailyLimitReached()){
vfSetStatus('لقد استنفدت حدك اليومي للمحادثة الصوتية (15 دقيقة). نلتقي غداً لمتابعة التعلم!','');
vfShowDailyLimitToast();
return;
}
/* CRITICAL crash guard: without this, rapidly double/triple-tapping the
   start button (very common on mobile when the UI feels slow/unresponsive)
   would call vfStart() multiple times concurrently — each call opens a
   brand-new getUserMedia() stream AND a brand-new AudioContext without
   ever closing the previous one, since the old references get silently
   overwritten. Mobile Safari enforces a hard limit on concurrent
   AudioContexts; exceeding it is a well-known cause of the whole tab
   crashing outright ("يتعذر فتح هذه الصفحة"), not just a soft error.
   IMPORTANT: the actual guard flag (_vfStarting) is owned entirely by
   vfStart() itself (checked+set as its very first line) — this function
   must NOT also check/set it here, otherwise vfStart() sees the flag
   already true (which THIS function just set) and returns immediately
   without ever running, silently no-op'ing the whole button with zero
   network requests. That exact double-guard bug is what broke the start
   button entirely for a while. */
if(window._vfRec)return;
var btn=document.getElementById('vf-start-btn');
var micW=document.getElementById('vf-mic-w');
if(btn){btn.disabled=true;btn.style.pointerEvents='none';btn.style.opacity='0.6';}
vfUnlockAudioForMobile();
if(btn)btn.style.display='none';
if(micW)micW.style.display='flex';
/* Start the synthesized ringback tone right here, in the same click —
   this is the user-gesture moment that satisfies autoplay policy for
   creating a fresh AudioContext, same reasoning as vfUnlockAudioForMobile
   right above it. */
vfStartRingtone();
/* Call vfStart() (and therefore getUserMedia) immediately, in the same
   tick as the tap — recent iOS Safari versions can drop "user activation"
   even across a short setTimeout, which used to silently block the mic
   permission prompt on iPhone with zero visible error. */
vfStart();
};

/* ===== Mic Visual State Manager ===== */
/* Updates every static UI text/label that shows the tutor's name ("Alexa").
   Only touches elements showing the IDLE/default state — never overwrites
   a live in-call status message. */
function vfApplyTutorNameToUI(){
var name=window.vfTutorName();
var isMale=window._vfTutorGender==='male';
var nm=document.getElementById('vf-nm');if(nm)nm.textContent=name;
var orbLabel=document.querySelector('.vf-orb-label');if(orbLabel)orbLabel.textContent=name;
var orbBtn=document.getElementById('vf-orb');if(orbBtn)orbBtn.setAttribute('aria-label',(isMale?'المعلم الصوتي ':'المعلمة الصوتية ')+name);
var fbar=document.getElementById('vf-floating-bar');if(fbar)fbar.setAttribute('aria-label','توسيع نافذة المحادثة مع '+name);
var fbName=document.querySelector('.vf-fb-name');if(fbName)fbName.textContent=name;
var fbStatus=document.getElementById('vf-fb-status');if(fbStatus&&!window._vfRec)fbStatus.textContent=name;
var sts=document.getElementById('vf-sts');
if(sts&&!window._vfRec)sts.textContent='اضغط "ابدأ المحادثة" للتحدث مع '+name;
var connText=document.getElementById('ai-conn-text');
if(connText)connText.setAttribute('data-ar-active','متصلة بـ '+name+' 🟢');
}
function setMicState(state){
vfUpdateFloatingBarState(state);
var ring=document.getElementById('vf-mic-ring');
var label=document.getElementById('vf-mic-label');
var mic=document.getElementById('vf-mic');
if(!ring||!label||!mic)return;
ring.className='vf-mic-ring';
label.className='vf-mic-label';
mic.classList.remove('vf-rec');
if(state==='recording'){
ring.classList.add('ring-recording');
label.classList.add('lbl-recording');
label.textContent='🎤 أسمعك الآن...';
mic.classList.add('vf-rec');
}else if(state==='connecting'){
ring.classList.add('ring-waiting');
label.classList.add('lbl-waiting');
label.textContent='🔄 جاري الاتصال...';
}else if(state==='waiting'){
ring.classList.add('ring-waiting');
label.classList.add('lbl-waiting');
label.textContent='🤖 '+window.vfTutorName()+' '+vfTutorVerb('تجهّز','يجهّز')+' الرد...';
}else if(state==='speaking'){
ring.classList.add('ring-waiting');
label.classList.add('lbl-waiting');
label.textContent='🔊 '+window.vfTutorName()+' '+vfTutorVerb('تتحدث','يتحدث')+'...';
}else if(state==='paused'){
ring.classList.add('ring-waiting');
label.classList.add('lbl-paused');
label.textContent='▶️ إكمال الدرس';
}else{
label.textContent='اضغط للتحدث';
}
}
function vfSetState(s,t){var d=document.getElementById('vf-st-dot'),x=document.getElementById('vf-st-txt');d.className='vf-st-dot'+(s?' st-'+s:'');if(x)x.textContent=t||''}
function vfSetStatus(t,c){var e=document.getElementById('vf-sts');e.textContent=t;e.className='vf-sts'+(c?' st-'+c:'')}
var VF_MAX_TR_LINES=16; /* ~6-8 conversation turns (student+AI pair each) — tightened from 20. Honest scope note: this bounds the DISPLAYED transcript's DOM node count, not a resent conversational payload — Gemini Live's own session manages its conversational context server-side on Google's end; there's no client-managed growing text payload to trim in this architecture the way there would be with a stateless chat-completion API. */
function vfTrimTranscript(e){
/* Count only VISIBLE lines toward the cap — hidden student STT lines
   (display:none, see vfUpsertLiveUserLine()) must not silently eat into
   the budget of visible Alexa lines the student actually sees. */
var visible=[];
for(var i=0;i<e.children.length;i++){if(e.children[i].style.display!=='none')visible.push(e.children[i]);}
while(visible.length>VF_MAX_TR_LINES){
var oldest=visible.shift();
e.removeChild(oldest);
}
}
function vfAddTr(t,w){var e=document.getElementById('vf-tr'),l=document.createElement('div');l.className='vf-tr-l vf-tr-'+(w==='user'?'u':'a');
var txt=document.createElement('span');txt.textContent=(w==='user'?'🎤 ':'🤖 ')+t;l.appendChild(txt);
if(w==='ai'){var rb=document.createElement('button');rb.className='vf-tr-btn';rb.textContent='🔊';rb.title='أعد الصوت';rb.onclick=function(){replayText(t)};l.appendChild(rb)}
e.appendChild(l);vfTrimTranscript(e);e.scrollTop=e.scrollHeight;return l}
var _hintSets = {
greeting: ['Hello, nice to meet you!', 'Hi! How are you?', 'Good morning, teacher!'],
confused: ['Can you repeat that?', 'I do not understand.', 'Can you speak slower?'],
agree: ['Yes, I agree.', 'That is correct!', 'I think so too.'],
answer: ['My name is...', 'I am from...', 'I like to...'],
practice: ['Can we try again?', 'Let me try that sentence.', 'How do you say...?'],
thanks: ['Thank you, teacher!', 'That was very helpful.', 'I learned something new!']
};
/* Survival Phrases (رقائق النجاة السريعة) — genuinely revives _hintSets
   above (previously fully dead code, unreferenced anywhere) rather than
   introducing new hardcoded strings elsewhere. Curates 5 specific items
   from the "confused"/"practice" categories — the ones that actually
   function as beginner survival phrases — rather than exposing all 18
   phrases across all 6 categories, which would be UI clutter for a
   small always-visible utility (unlike the old removed contextual
   showHints() system, this is a fixed, curated set). */
/* Arabic display labels for the survival chips — DISPLAY ONLY. The
   English phrase itself (the object's value) remains exactly what gets
   sent to Alexa via vfSendText() and what gets spoken via speak() below
   — the functional English voice trigger/pronunciation prompt is
   completely unchanged; only the visible button text is now natural,
   beginner-friendly Arabic instead of the raw English sentence. */
var VF_SURVIVAL_ARABIC_LABELS={
'Can you repeat that?':'ممكن تعيد؟',
'I do not understand.':'ما فهمت',
'Can you speak slower?':'تكلم ببطء',
'Can we try again?':'نحاول مرة ثانية؟',
'How do you say...?':'كيف أقول...؟'
};
function vfRenderSurvivalChips(){
var grid=document.getElementById('vf-survival-grid');
if(!grid||grid.children.length)return; // render once, not on every call
var curated=[_hintSets.confused[0],_hintSets.confused[2],_hintSets.practice[2],_hintSets.confused[1],_hintSets.practice[0]];
curated.forEach(function(phrase){
var btn=document.createElement('button');
btn.className='vf-survival-chip';
btn.title=phrase; // keep the underlying English visible on hover/long-press, for transparency about what actually gets sent
btn.onclick=function(){vfSendText(phrase)};
var playIcon=document.createElement('span');
playIcon.className='vf-survival-play';
playIcon.textContent='🔊';
playIcon.onclick=function(e){e.stopPropagation();speak(phrase)};
btn.appendChild(playIcon);
btn.appendChild(document.createTextNode(VF_SURVIVAL_ARABIC_LABELS[phrase]||phrase));
grid.appendChild(btn);
});
}
function replayText(text) {
if (!window.speechSynthesis) return;
window.speechSynthesis.cancel();
var u = new SpeechSynthesisUtterance(text);
u.lang = 'en-US';
u.rate = _aiVoiceSpeed || 0.88;
var voices = window.speechSynthesis.getVoices();
var enV = voices.find(function(v) { return v.lang.indexOf('en') === 0; });
if (enV) u.voice = enV;
window.speechSynthesis.speak(u);
}
function repeatLastAI() {
if (_vfLastAiChunks && _vfLastAiChunks.length) { vfPlayChunksArray(_vfLastAiChunks); return; }
var last = '';
_vfHistory.forEach(function(h) { if (h.role === 'ai') last = h.text; });
if (last) replayText(last);
}

/* ===== PCM helpers ===== */
/* Reused across every onaudioprocess call within a session — the input
   buffer size (4096 samples) and the mic's sample rate are both constant
   for the entire duration of a call, so the output length here never
   changes mid-call. Allocating a fresh Int16Array/Float32Array on every
   single callback (several times a second, for the whole call) was real,
   avoidable GC churn; lazily size these once and reuse the same backing
   memory every time instead. Nulled in vfStopMicStreaming() so a later
   call with a different mic (different sample rate) resizes correctly
   rather than reusing a wrongly-sized buffer. */
var _vfReusableInt16=null;
function vfFloat32ToInt16(f32){
if(!_vfReusableInt16||_vfReusableInt16.length!==f32.length){
_vfReusableInt16=new Int16Array(f32.length);
}
var out=_vfReusableInt16;
for(var i=0;i<f32.length;i++){var s=Math.max(-1,Math.min(1,f32[i]));out[i]=s<0?s*0x8000:s*0x7FFF}
return out;
}
var _vfReusableResampled=null;
function vfDownsampleTo16k(float32Arr,inputSampleRate){
if(Math.round(inputSampleRate)===16000)return vfFloat32ToInt16(float32Arr);
var ratio=inputSampleRate/16000;
var newLen=Math.round(float32Arr.length/ratio);
if(!_vfReusableResampled||_vfReusableResampled.length!==newLen){
_vfReusableResampled=new Float32Array(newLen);
}
var result=_vfReusableResampled;
for(var i=0;i<newLen;i++){
var idx=i*ratio,idx0=Math.floor(idx),idx1=Math.min(idx0+1,float32Arr.length-1),frac=idx-idx0;
result[i]=float32Arr[idx0]*(1-frac)+float32Arr[idx1]*frac;
}
return vfFloat32ToInt16(result);
}
function vfInt16ToBase64(int16arr){
var bytes=new Uint8Array(int16arr.buffer,int16arr.byteOffset,int16arr.byteLength);
/* Single String.fromCharCode.apply call instead of a per-byte
   binary+=String.fromCharCode(...) loop — the old loop's repeated string
   concatenation ran on every single outgoing audio chunk (several times a
   second for the whole call) and is a well-known JS performance anti-
   pattern. Chunked at 8KB to stay safely under browsers' apply() argument
   limits for larger buffers. */
var CHUNK=8192;
var parts=[];
for(var i=0;i<bytes.length;i+=CHUNK){
parts.push(String.fromCharCode.apply(null,bytes.subarray(i,i+CHUNK)));
}
return btoa(parts.join(''));
}
function vfBase64ToInt16(b64){
var binary=atob(b64);
var bytes=new Uint8Array(binary.length);
for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
return new Int16Array(bytes.buffer);
}

/* ===== Playback (Gemini audio, 24kHz PCM16) ===== */
/* ===== Mobile audio unlock (iOS Safari / Android Chrome) =====
   Mobile browsers create every new AudioContext in a "suspended" state and
   only let it run if resume() (or an actual sound) happens synchronously
   inside a real user gesture (click/touchend). Our real problem was that
   _vfPlayCtx — the context that actually plays Alexa's voice — used to get
   created lazily later, when the first WebSocket audio chunk arrived (i.e.
   asynchronously, outside any tap), so it stayed silently suspended on
   iOS. This unlocks the REAL context directly inside the tap handler. */
function vfUnlockAudioForMobile(){
try{
var ctx=vfEnsurePlayCtx();
if(ctx.state==='suspended'){ctx.resume().catch(function(){});}
var buf=ctx.createBuffer(1,1,ctx.sampleRate||22050);
var src=ctx.createBufferSource();
src.buffer=buf;src.connect(ctx.destination);
if(src.start)src.start(0);else src.noteOn(0);
}catch(e){}
if(_vfMicCtx&&_vfMicCtx.state==='suspended'){_vfMicCtx.resume().catch(function(){});}
}
/* Cheap, safe-to-call-often safety net: some phones auto-suspend an
   AudioContext again after the screen locks/unlocks or the tab is
   backgrounded mid-call. This never CREATES a context, it only resumes
   ones that already exist, so it's harmless to attach globally. */
function vfResumeAudioContextsIfNeeded(){
if(_vfPlayCtx&&_vfPlayCtx.state==='suspended'){_vfPlayCtx.resume().catch(function(){});}
if(_vfMicCtx&&_vfMicCtx.state==='suspended'){_vfMicCtx.resume().catch(function(){});}
}
document.addEventListener('touchend',vfResumeAudioContextsIfNeeded,{passive:true});
document.addEventListener('click',vfResumeAudioContextsIfNeeded,{passive:true});
document.addEventListener('visibilitychange',function(){
if(document.visibilityState==='visible')vfResumeAudioContextsIfNeeded();
});

function vfEnsurePlayCtx(){
if(!_vfPlayCtx){
_vfPlayCtx=new(window.AudioContext||window.webkitAudioContext)();
/* Reactive interruption recovery: catches involuntary state changes
   (OS-level audio focus loss, an incoming phone call, etc.) the instant
   they happen, on top of the existing explicit state==='suspended'
   checks scattered at specific trigger points (mic start, user gesture,
   etc.) — those only catch suspension AT that specific moment; this
   catches it whenever it happens, including while nothing else in the
   code happens to be running a check. */
_vfPlayCtx.onstatechange=function(event){
/* Same event.target pattern as the mic context's handler — see its
   detailed comment. _vfPlayCtx itself is never nulled elsewhere in this
   file today (the persistent-pipeline design, documented separately),
   so this specific handler isn't currently exposed to the exact race
   that broke the mic one — but reading event.target here too is a
   consistent, defensive safeguard against the same class of bug if
   that ever changes, not just a reactive patch for one call site. */
var ctxThatChanged=(event&&event.target)?event.target:_vfPlayCtx;
if(!ctxThatChanged)return;
console.log('[Audio] Playback AudioContext state changed to:',ctxThatChanged.state);
if(ctxThatChanged.state==='suspended'||ctxThatChanged.state==='interrupted'){
ctxThatChanged.resume().catch(function(err){console.warn('[Audio] Playback context resume failed:',err);});
}
};
}
if(_vfPlayCtx.state==='suspended'){_vfPlayCtx.resume().catch(function(){});}
return _vfPlayCtx;
}

/* ===== Continuous streaming playback (iOS Safari fix) =====
   The old approach created a brand-new AudioBufferSourceNode for every
   incoming ~170ms audio chunk and scheduled them back-to-back by precise
   timestamps. That works fine on desktop Chrome, but iOS Safari's audio
   pipeline is measurably less precise at stitching many small, separately-
   scheduled buffer nodes together — the boundary between each chunk can
   introduce a faint click/gap, which is what sounded like "choppy, low
   quality" audio specifically on iPhone.
   Instead we now use ONE persistent ScriptProcessorNode that continuously
   pulls samples from a single growing queue and writes them straight into
   the output buffer every audio callback — there are no per-chunk
   start/stop boundaries at all, so there's nothing for iOS to stitch
   imperfectly. Silence is written only if the queue actually runs dry
   (network jitter), which is inaudible as a click, just a brief gap. */
var _vfPlaybackQueue=[]; // array of Float32Array chunks, already resampled to ctx.sampleRate
var VF_PREBUFFER_MS=50; // jitter-absorption cushion at the start of each AI turn — REBALANCED UP a FOURTH time (150→50→20→50ms) after an explicit report of stuttering/clipping/burst playback, the opposite direction from the three prior latency-focused reductions. This is the exact tension §60/§63/§67's own comments predicted ("if stutter/dropout complaints resurface, that's this cushion being too thin again") — honoring the new, explicit symptom report over blindly continuing the latency-only trend.
var _vfPrebuffering=false,_vfPrebufferDeadline=0; // re-armed per-turn in vfEnqueueAudio()
var _vfLastChunkArrivalTime=0;
var _vfUnderrunCount=0,_vfLastUnderrunLogTime=0; // rate-limited underrun diagnostic logging
var _vfPlaybackQueueOffset=0; // read offset into the first chunk in the queue
var _vfPlaybackNode=null;
var _vfPlaybackGain=null;

function vfUpsampleTo(float32Arr, fromRate, toRate){
if(fromRate===toRate)return float32Arr;
var ratio=toRate/fromRate;
var newLen=Math.round(float32Arr.length*ratio);
var result=new Float32Array(newLen);
for(var i=0;i<newLen;i++){
var srcIdx=i/ratio;
var idx0=Math.floor(srcIdx),idx1=Math.min(idx0+1,float32Arr.length-1);
var frac=srcIdx-idx0;
result[i]=float32Arr[idx0]*(1-frac)+float32Arr[idx1]*frac;
}
return result;
}

function vfEnsurePlaybackNode(){
var ctx=vfEnsurePlayCtx();
if(_vfPlaybackNode)return _vfPlaybackNode;
/* 0 input channels, 1 output channel — this node only ever produces audio,
   it never reads from the mic (that's a completely separate node/context).
   8192 (up from 4096) gives the queue even more headroom against network
   jitter before an audio callback can run dry — fewer, less frequent
   underrun gaps on uneven connections, at the cost of a still barely-
   perceptible bit of extra latency (~170ms at 48kHz). */
_vfPlaybackNode=ctx.createScriptProcessor(8192,0,1);
_vfPlaybackNode.onaudioprocess=function(e){
var out=e.outputBuffer.getChannelData(0);
var written=0;
/* Pre-buffering (jitter buffer) gate: at the START of a new AI turn
   (queue was empty, first chunk of this turn just arrived), don't drain
   immediately — accumulate a small cushion (~50ms, VF_PREBUFFER_MS)
   first, so brief network jitter between the first couple of chunks
   doesn't cause an audible stutter right at the start of Alexa's reply.
   REBALANCED a FOURTH time — 150→50→20→50ms (see CLAUDE.md for the
   full history). The first three moves were all latency-driven
   reductions; THIS one reverses that trend — an explicit report of
   audible stuttering/clipping/burst playback came in, which is exactly
   the failure mode this mechanism exists to prevent, so the cushion
   went back up rather than down. This remains a genuine, ongoing
   trade-off between two real, competing goals, not a one-directional
   "fix" — if "feels laggy again" complaints resurface after this, that
   points back toward reducing it again; if stutter persists even at
   50ms, the next lever to check is network conditions or Gemini's own
   chunk delivery pacing, not just pushing this number higher indefinitely.
   Capped by a 90ms wall-clock deadline (_vfPrebufferDeadline) — tightened
   from 250ms specifically to stop ultra-short turns (the 3-6 word norm
   this app's pedagogy targets) from waiting the FULL previous deadline
   before any sound played, even when the turn's only chunk was itself
   under the 50ms cushion target and no more chunks were ever coming.
   HONEST TRADE-OFF NOTE: 90ms is now LESS than one onaudioprocess
   callback cycle (~170ms at this node's 8192-sample buffer size) — the
   same situation §63's comment described at 100ms as "effectively
   neutering the mechanism," and the same thing is true again here: the
   deadline will typically win over the sample-threshold check almost
   every time, so in practice this cushion now behaves close to
   near-zero buffering rather than a real multi-callback accumulation
   window. Unlike that earlier case, this is now the explicit, deliberate
   intent (matching this request's own "immediate first-chunk playback"
   goal), not an accidental side effect — if audible stutter/clipping
   resurfaces after this change, that's the direct, expected cost of this
   trade-off, and the fix is raising this number again, not adding
   compensating logic elsewhere. A
   genuinely short reply that never reaches the sample threshold doesn't
   wait forever — whichever comes first. Once draining begins for this
   turn, pre-buffering does not re-trigger mid-turn (only a fresh empty
   queue at turn start re-arms it, via vfEnqueueAudio()). */
if(_vfPrebuffering){
var queuedSamples=0;
for(var q=0;q<_vfPlaybackQueue.length;q++)queuedSamples+=_vfPlaybackQueue[q].length;
var haveEnough=queuedSamples>=Math.round(e.outputBuffer.sampleRate*VF_PREBUFFER_MS/1000);
var deadlinePassed=_vfPrebufferDeadline&&Date.now()>=_vfPrebufferDeadline;
if(!haveEnough&&!deadlinePassed){
for(var z=0;z<out.length;z++)out[z]=0; // hold silence during the cushion window — not an underrun, a deliberate wait
return;
}
console.log('[Audio] Pre-buffer cushion released — buffered ~'+Math.round(queuedSamples/e.outputBuffer.sampleRate*1000)+'ms'+(deadlinePassed&&!haveEnough?' (hit deadline before reaching target)':''));
_vfPrebuffering=false;
}
while(written<out.length&&_vfPlaybackQueue.length>0){
var chunk=_vfPlaybackQueue[0];
var available=chunk.length-_vfPlaybackQueueOffset;
var need=out.length-written;
var take=Math.min(available,need);
out.set(chunk.subarray(_vfPlaybackQueueOffset,_vfPlaybackQueueOffset+take),written);
written+=take;
_vfPlaybackQueueOffset+=take;
if(_vfPlaybackQueueOffset>=chunk.length){
_vfPlaybackQueue.shift();
_vfPlaybackQueueOffset=0;
}
}
if(written<out.length){
/* De-click on underrun: jumping straight from the last real (usually
   non-zero) sample to hard 0 is itself a waveform discontinuity — an
   audible pop/click, not the silent gap the old comment here assumed.
   Micro-fade the tail end of whatever real audio we did get down to 0
   over a short ramp (~64 samples, ~1.3ms at 48kHz) before filling the
   rest with true silence, so an inevitable underrun sounds like a soft
   fade instead of a click. */
var fadeLen=Math.min(64,written);
var lastVal=written>0?out[written-1]:0;
for(var f=0;f<fadeLen;f++){
var idx=written-fadeLen+f;
var t=(f+1)/fadeLen; // 0 (exclusive) -> 1 across the ramp
out[idx]=lastVal*(1-t);
}
for(var i=written;i<out.length;i++)out[i]=0; // true silence for the remainder, now click-free
/* Rate-limited diagnostic logging (at most once every 2s) — this
   callback fires many times per second during active playback, so
   logging every single underrun would flood the console and add its
   own overhead. A persistent stream of these log lines is a genuine
   signal worth investigating (network/CPU struggling to keep the
   queue fed), not just cosmetic noise. */
_vfUnderrunCount=(_vfUnderrunCount||0)+1;
var _nowT=Date.now();
if(!_vfLastUnderrunLogTime||_nowT-_vfLastUnderrunLogTime>2000){
console.warn('[Audio] Playback buffer underrun x'+_vfUnderrunCount+' (queue ran dry mid-callback) — possible network/CPU strain.');
_vfLastUnderrunLogTime=_nowT;
_vfUnderrunCount=0;
}
/* Precise turn-end detection — the closest real equivalent to an
   AudioBufferSourceNode's onended event available in this pull-based
   architecture (§43 explains why we don't use that node type). This is
   the exact millisecond the queue has genuinely run dry — but that
   alone doesn't mean the turn is over, since a temporary underrun
   mid-response (network hiccup, more chunks still coming) looks
   identical from inside this callback. Only treat it as genuine turn
   completion when the server has ALSO already signaled generation is
   done (_vfTurnGenerationComplete, set in case 'turn_complete': below) —
   the combination of "queue empty" AND "server confirmed done
   generating" is what makes this trustworthy, not either signal alone.
   Fires the mic-reopen/UI-update instantly, synchronously, right here —
   replacing dependence on vfScheduleMicResume()'s pre-computed timer
   estimate, which could drift slightly out of sync with when audio
   actually finished. */
if(_vfTurnGenerationComplete&&!_vfTurnEndSignaled){
_vfTurnEndSignaled=true;
if(typeof vfFireTurnGenuinelyEnded==='function')vfFireTurnGenuinelyEnded();
}
}
};
/* Volume normalization chain: a DynamicsCompressorNode actively evens out
   Alexa's volume turn-to-turn (Gemini's own output level isn't perfectly
   consistent turn to turn), followed by a fixed GainNode to trim the
   overall level back to a comfortable, steady loudness — instead of the
   raw, sometimes-loud-sometimes-quiet stream going straight to the
   speakers. Strict/near-limiting settings: low threshold (catches quiet
   passages into the compression range too, not just loud peaks), high
   ratio (~12:1, close to a limiter — firmly caps sudden loud peaks), fast
   attack (catches transients before they're heard at full volume), with a
   release slow enough to avoid audible "pumping" between words despite
   the more aggressive ratio. Net effect: peak-normalized, consistently
   smooth listening level with no sudden loud spikes or whisper-quiet
   drops. */
var compressor=ctx.createDynamicsCompressor();
compressor.threshold.setValueAtTime(-30,ctx.currentTime);
compressor.knee.setValueAtTime(10,ctx.currentTime);
compressor.ratio.setValueAtTime(12,ctx.currentTime);
compressor.attack.setValueAtTime(0.003,ctx.currentTime);
compressor.release.setValueAtTime(0.25,ctx.currentTime);
_vfPlaybackGain=ctx.createGain();
_vfPlaybackGain.gain.setValueAtTime(1.3,ctx.currentTime);
_vfPlaybackNode.connect(compressor);
compressor.connect(_vfPlaybackGain);
_vfPlaybackGain.connect(ctx.destination);
return _vfPlaybackNode;
}

function vfRemainingPlaybackSeconds(){
var ctx=_vfPlayCtx;
if(!ctx||!_vfPlaybackQueue.length)return 0;
var totalSamples=0;
for(var i=0;i<_vfPlaybackQueue.length;i++){
totalSamples+=(i===0?(_vfPlaybackQueue[0].length-_vfPlaybackQueueOffset):_vfPlaybackQueue[i].length);
}
return totalSamples/ctx.sampleRate;
}

/* ===== Realistic phone ringback tone (pure Web Audio API synthesis,
   zero external audio assets) =====
   Deliberately uses its OWN dedicated AudioContext, entirely separate
   from _vfPlayCtx (Alexa's actual voice playback pipeline) — this keeps
   the ringtone's gain staging/cleanup completely independent, so it can
   never interfere with or complicate the already-tested voice playback
   chain (ScriptProcessorNode → DynamicsCompressorNode → GainNode →
   destination). Two separate AudioContexts mixing to the same physical
   output is perfectly normal and handled natively by the browser/OS. */
var _vfRingtoneCtx=null;
var _vfRingtoneNodes=null; // {osc1,osc2,gain,intervalId}
var _vfRingtoneActive=false;
function vfStartRingtone(){
if(_vfRingtoneActive)return; // idempotent — safe to call even if already ringing
_vfRingtoneActive=true;
try{
_vfRingtoneCtx=new (window.AudioContext||window.webkitAudioContext)();
var gain=_vfRingtoneCtx.createGain();
gain.gain.value=0;
gain.connect(_vfRingtoneCtx.destination);
/* Standard North American ringback dual-tone: 440Hz + 480Hz. */
var osc1=_vfRingtoneCtx.createOscillator();osc1.type='sine';osc1.frequency.value=440;
var osc2=_vfRingtoneCtx.createOscillator();osc2.type='sine';osc2.frequency.value=480;
osc1.connect(gain);osc2.connect(gain);
osc1.start();osc2.start();
_vfRingtoneNodes={osc1:osc1,osc2:osc2,gain:gain,intervalId:null};
/* Pulse pattern: ~2s tone, 4s silence, looped (6s cycle) — matches real
   telephone ringback timing. A modest peak gain (0.09) keeps this
   clearly audible as a "calling..." cue without ever being loud enough
   to feel jarring or risk any perceived clipping once Alexa's own
   voice — on its own, separately-gained pipeline — starts. */
function pulse(){
if(!_vfRingtoneActive||!_vfRingtoneCtx||!_vfRingtoneNodes)return;
var now=_vfRingtoneCtx.currentTime;
var g=_vfRingtoneNodes.gain.gain;
g.cancelScheduledValues(now);
g.setValueAtTime(0.0001,now);
g.exponentialRampToValueAtTime(0.09,now+0.05);
g.setValueAtTime(0.09,now+1.9);
g.linearRampToValueAtTime(0.0001,now+2.0);
}
pulse();
_vfRingtoneNodes.intervalId=setInterval(pulse,6000);
}catch(e){
console.warn('[Ringtone] failed to start (non-fatal, call proceeds silently):',e);
_vfRingtoneActive=false;_vfRingtoneCtx=null;_vfRingtoneNodes=null;
}
}
function vfStopRingtone(){
if(!_vfRingtoneActive)return; // idempotent — safe to call from multiple cleanup paths
_vfRingtoneActive=false;
var ctx=_vfRingtoneCtx,nodes=_vfRingtoneNodes;
_vfRingtoneCtx=null;_vfRingtoneNodes=null;
if(!ctx||!nodes)return;
try{
if(nodes.intervalId)clearInterval(nodes.intervalId);
var now=ctx.currentTime;
/* Instant, click-free fade-out (not an abrupt stop, which can produce
   an audible pop) — "instantly fade out" per spec, ~120ms. */
nodes.gain.gain.cancelScheduledValues(now);
nodes.gain.gain.setValueAtTime(nodes.gain.gain.value,now);
nodes.gain.gain.linearRampToValueAtTime(0.0001,now+0.12);
setTimeout(function(){
try{nodes.osc1.stop();nodes.osc2.stop();}catch(e){}
try{ctx.close();}catch(e){}
},180);
}catch(e){
try{ctx.close();}catch(e2){}
}
}

function vfEnqueueAudio(base64pcm){
var ctx=vfEnsurePlayCtx();
vfEnsurePlaybackNode();
/* Re-arm pre-buffering only at the genuine start of a new AI turn (queue
   was completely empty before this chunk) — not on every chunk, which
   would otherwise re-introduce a stutter mid-sentence every time. */
if(_vfPlaybackQueue.length===0){
_vfPrebuffering=true;
_vfPrebufferDeadline=Date.now()+90;
/* New turn genuinely starting — reset the precise-end-detection flags
   too, so the previous turn's "generation complete" state can't leak
   into this new one and cause vfFireTurnGenuinelyEnded() to fire
   instantly/incorrectly on the very first chunk of a fresh response. */
_vfTurnGenerationComplete=false;
_vfTurnEndSignaled=false;
}
/* Diagnostic: chunk arrival timing, to make any remaining network jitter
   directly visible rather than just inferred from audible symptoms. */
var _nowArrival=Date.now();
if(_vfLastChunkArrivalTime){
var gap=_nowArrival-_vfLastChunkArrivalTime;
if(gap>300)console.warn('[Audio] Large gap between chunk arrivals:',gap+'ms — likely network jitter.');
}
_vfLastChunkArrivalTime=_nowArrival;
var int16=vfBase64ToInt16(base64pcm);
var float32=new Float32Array(int16.length);
for(var i=0;i<int16.length;i++)float32[i]=int16[i]/32768;
/* Gemini always sends 24kHz PCM16; the node runs at the context's native
   rate (48kHz on most devices, sometimes different) — resample here so
   playback speed/pitch is correct regardless of the device's native rate. */
var resampled=vfUpsampleTo(float32,24000,ctx.sampleRate);
/* Micro-fade-in (~1.5ms) on the HEAD of every incoming chunk — smooths
   any potential discontinuity between where the previous chunk's last
   sample left off and where this new chunk's first sample starts
   (Gemini's own TTS segment boundaries aren't guaranteed to connect
   perfectly sample-for-sample). Deliberately head-only, not also a
   tail fade — a symmetric fade-out+fade-in at every single chunk
   boundary would introduce its own small, audible volume dip at every
   junction (chunks can arrive fairly frequently), which risks sounding
   like a subtle pulsing artifact of its own; a one-sided fade-in still
   smooths a genuine jump without that risk. Skipped for the very first
   chunk of a turn (nothing preceding it to be discontinuous with —
   the pre-buffering cushion above already handles that moment). */
if(_vfPlaybackQueue.length>0){
var _fadeInLen=Math.min(Math.round(ctx.sampleRate*0.0015),resampled.length);
for(var _fi=0;_fi<_fadeInLen;_fi++){
resampled[_fi]=resampled[_fi]*(_fi/_fadeInLen);
}
}
_vfPlaybackQueue.push(resampled);
_vfCurrentAiChunks.push(int16);
/* Defensive cap, not an expected-path guard: under normal conditions this
   queue drains continuously via the playback callback and never grows
   unbounded (each AI turn is itself short per the "3-6 words" rule).
   This only ever matters in a genuinely pathological case (e.g. a
   network hiccup causing chunks to arrive faster than they can play)
   during a long session — rather than let memory grow without limit,
   drop the OLDEST buffered audio once total queued duration exceeds
   ~30s, which the student would perceive as a brief skip-ahead rather
   than an ever-growing memory footprint. */
var totalQueuedSamples=0;
for(var q=0;q<_vfPlaybackQueue.length;q++)totalQueuedSamples+=_vfPlaybackQueue[q].length;
var maxQueuedSamples=ctx.sampleRate*30;
while(totalQueuedSamples>maxQueuedSamples&&_vfPlaybackQueue.length>1){
totalQueuedSamples-=_vfPlaybackQueue[0].length;
_vfPlaybackQueue.shift();
_vfPlaybackQueueOffset=0;
}
/* ROOT CAUSE FIX for the reported "stutter then burst all accumulated
   audio at once after 3-5 minutes": the 30s cap above is a genuinely
   pathological-case-only backstop — far too loose to prevent the
   reported symptom, which is exactly what a queue silently growing
   toward that 30s ceiling over time looks and sounds like right before
   it gets trimmed. Two tighter, genuinely time-based checks, restored
   here (they existed on a related build of this codebase but were
   missing from this specific file):
   1) chunk-COUNT cap (max 5 queued chunks) — a coarse, cheap early
      catch for a queue that's clearly fallen behind.
   2) REAL real-time alignment: if total queued duration exceeds
      (VF_PREBUFFER_MS + 100ms) — genuine excess beyond the intentional
      jitter cushion, not the cushion itself — trim from the front until
      back within that window. This is what actually keeps playback
      "strictly tracking audioContext.currentTime" in a pull-based
      architecture: there's no literal nextPlayTime variable to reset
      here (this engine plays a continuous concatenated buffer, not
      individually-scheduled AudioBufferSourceNode chunks — see the
      dedicated comment on that architectural choice elsewhere in this
      file), but discarding stale backlog down to a small, bounded
      window achieves the same practical effect: recent audio only,
      never a growing stale backlog waiting to burst. */
while(_vfPlaybackQueue.length>5){
_vfPlaybackQueue.shift();
_vfPlaybackQueueOffset=0;
}
var _queuedMs=0;
for(var _qi=0;_qi<_vfPlaybackQueue.length;_qi++)_queuedMs+=(_vfPlaybackQueue[_qi].length/ctx.sampleRate)*1000;
var _maxAlignedMs=VF_PREBUFFER_MS+100;
while(_queuedMs>_maxAlignedMs&&_vfPlaybackQueue.length>1){
_queuedMs-=(_vfPlaybackQueue[0].length/ctx.sampleRate)*1000;
_vfPlaybackQueue.shift();
_vfPlaybackQueueOffset=0;
}
}
function vfStopPlayback(){
_vfPlaybackQueue=[];
_vfPlaybackQueueOffset=0;
_vfPrebuffering=false;
_vfPrebufferDeadline=0;
_vfLastChunkArrivalTime=0;
/* Deliberately does NOT disconnect/null _vfPlaybackNode (ScriptProcessor)
   or the compressor/_vfPlaybackGain chain here — that pipeline is built
   exactly ONCE per page load (see vfEnsurePlaybackNode()'s cache-and-
   return-existing pattern) and intentionally persists, suspended-not-
   destroyed, across every call in the session (see the suspend() call
   and its comment in vfStop()) specifically to avoid re-doing the mobile
   audio-unlock dance on every single call. Tearing the nodes down here
   would fight that existing, already-reasoned design rather than fix a
   real leak — the queue arrays above are the actual per-call memory that
   needs clearing, and that's what this function does. */
}

/* Smooth fade-out specifically for natural barge-in (the student starts
   genuinely talking over Alexa, §60's duration-debounced barge-in gate
   already filters out filler words before this ever fires) — a plain
   vfStopPlayback() here would hard-cut whatever's mid-playback to
   silence instantly, an audible pop/click (the same waveform-
   discontinuity problem already fixed for underrun in vfEnsurePlaybackNode's
   onaudioprocess, just triggered by an interruption instead of the queue
   running dry). Applies a short linear fade-out ramp (~15ms) directly to
   the samples still queued to play, THEN clears — the student hears a
   natural, quick fade instead of an abrupt cut, closer to how a real
   person trails off when interrupted. Falls back to a normal instant
   vfStopPlayback() if there's nothing currently queued to fade (nothing
   audible to click in the first place). */
function vfFadeOutAndStopPlayback(){
if(!_vfPlaybackQueue.length){vfStopPlayback();return;}
var ctx=_vfPlayCtx;
var fadeSamples=ctx?Math.round(ctx.sampleRate*0.015):660; // ~15ms
var chunk=_vfPlaybackQueue[0];
var available=chunk.length-_vfPlaybackQueueOffset;
var applyLen=Math.min(fadeSamples,available);
for(var i=0;i<applyLen;i++){
var idx=_vfPlaybackQueueOffset+i;
var t=i/applyLen; // 0 -> 1 across the short ramp
chunk[idx]=chunk[idx]*(1-t);
}
/* Keep only the now-faded snippet in the queue — the callback plays it
   out naturally over the next callback or two, then the queue is empty
   exactly as if vfStopPlayback() had run, just without the click. */
_vfPlaybackQueue=[chunk.subarray(_vfPlaybackQueueOffset,_vfPlaybackQueueOffset+applyLen)];
_vfPlaybackQueueOffset=0;
_vfPrebuffering=false;
_vfPrebufferDeadline=0;
_vfLastChunkArrivalTime=0;
}

/* ===== Anti barge-in / echo-prevention =====
   The mic and the speaker are open at the same time on most laptops/phones
   without headsets, so without this, the mic picks up Alexa's own voice
   coming out of the speaker and Gemini's server-side VAD reads that as the
   student interrupting her — cutting her reply short mid-sentence. We stop
   sending mic audio to the WebSocket entirely while Alexa's audio is
   playing, and only resume once everything scheduled has actually finished
   playing through the speaker (not just when the server says the turn is
   done — there's still a queued audio tail at that point). */
function vfResumeMicNow(){
if(_vfPlaybackResumeTimer){clearTimeout(_vfPlaybackResumeTimer);_vfPlaybackResumeTimer=null}
_vfMicSuppressed=false;
}
/* The single source of truth for "the student's turn has genuinely
   begun" — called from two places: primarily, synchronously, from
   inside the playback callback the instant the queue actually drains
   AND generation is confirmed done (see the onaudioprocess comment
   above); defensively, from vfScheduleMicResume()'s fallback timer
   below, in case the callback-based path somehow doesn't fire (e.g. the
   queue was already fully drained before turn_complete even arrived,
   an edge case the callback path handles too, but belt-and-suspenders).
   Idempotent by design (guarded by _vfTurnEndSignaled at both call
   sites) — calling it twice for the same turn is harmless. */
function vfFireTurnGenuinelyEnded(){
/* Explicit 250ms guard buffer AFTER the queue has genuinely drained,
   before actually un-muting the mic — the detection itself (this
   function being called) is still instant, only the ACTION is delayed.
   Without this, mic un-suppression happened the exact same instant
   playback ended, with zero margin for residual echo/reverb tail
   (speaker bleed, room echo) that hasn't fully dissipated yet — risking
   Alexa's own tail-end audio being picked up and misread as the start
   of a student interruption. A setTimeout here, not a blocking wait —
   this function can be called from inside the playback audio callback
   itself, which must never block. */
if(_vfMicUnmuteGuardTimer){clearTimeout(_vfMicUnmuteGuardTimer);_vfMicUnmuteGuardTimer=null;}
_vfMicUnmuteGuardTimer=setTimeout(function(){
_vfMicUnmuteGuardTimer=null;
_vfMicSuppressed=false;
if(_vfPlaybackResumeTimer){clearTimeout(_vfPlaybackResumeTimer);_vfPlaybackResumeTimer=null;}
if(window._vfRec&&!_vfPaused&&!_vfAiIsSpeaking){
setMicState('recording');
vfSetStatus('🎤 دورك — تحدث الآن','l');
}
},250);
}
function vfScheduleMicResume(){
if(_vfPlaybackResumeTimer){clearTimeout(_vfPlaybackResumeTimer);_vfPlaybackResumeTimer=null}
var remainingMs=vfRemainingPlaybackSeconds()*1000;
var MARGIN_MS=180; /* small safety buffer past the last queued sample */
_vfPlaybackResumeTimer=setTimeout(function(){
_vfPlaybackResumeTimer=null;
if(!_vfTurnEndSignaled){
_vfTurnEndSignaled=true;
vfFireTurnGenuinelyEnded();
}
},remainingMs+MARGIN_MS);
}

function vfPlayChunksArray(chunks){
if(!chunks||!chunks.length)return;
var ctx=vfEnsurePlayCtx();
var total=0;chunks.forEach(function(c){total+=c.length});
var merged=new Int16Array(total);
var off=0;chunks.forEach(function(c){merged.set(c,off);off+=c.length});
var float32=new Float32Array(merged.length);
for(var i=0;i<merged.length;i++)float32[i]=merged[i]/32768;
/* This is a one-shot standalone replay (the 🔊 button on a transcript
   line), not part of the live continuous stream, so a single discrete
   buffer node is fine here — Web Audio auto-resamples from the buffer's
   declared 24000Hz rate to the context's output rate for us. */
var buffer=ctx.createBuffer(1,float32.length,24000);
buffer.getChannelData(0).set(float32);
var srcNode=ctx.createBufferSource();
srcNode.buffer=buffer;
/* Explicit cleanup on completion, not just relying on GC timing —
   AudioBufferSourceNode is spec'd as fire-and-forget (can't be
   restarted once played), so it WOULD eventually get garbage collected
   on its own once unreferenced, but disconnecting explicitly the
   instant it finishes guarantees the destination-chain link is severed
   immediately and deterministically, rather than whenever GC happens to
   run. */
srcNode.onended=function(){
try{srcNode.disconnect();}catch(e){}
srcNode=null;
};
/* Route through the same normalization chain as the live stream (created
   by vfEnsurePlaybackNode) so a replayed line sounds just as steady as
   the original — falls back to a direct connection only in the unlikely
   case the chain isn't set up yet. */
vfEnsurePlaybackNode();
srcNode.connect(_vfPlaybackGain||ctx.destination);
srcNode.start();
}

/* ===== Mic capture -> 16kHz PCM16 -> WebSocket, streamed continuously ===== */
function vfStartMicStreaming(stream){
/* Safety net: if anything is still lingering from a previous attempt
   (shouldn't happen now that vfStart() is re-entry-guarded, but this makes
   it impossible to ever stack a second AudioContext/processor on top of an
   old one), tear it down first. */
vfStopMicStreaming();
_vfMicCtx=new(window.AudioContext||window.webkitAudioContext)();
if(_vfMicCtx.state==='suspended'){_vfMicCtx.resume().catch(function(){});}
/* Same reactive interruption recovery as the playback context above —
   catches involuntary mic-side interruptions the instant they happen. */
_vfMicCtx.onstatechange=function(event){
/* Read from event.target (the actual AudioContext that fired this
   event), NOT the outer _vfMicCtx variable — fixes a real, reproducible
   "Cannot read properties of null (reading 'state')" TypeError:
   vfStopMicStreaming() calls _vfMicCtx.close() then IMMEDIATELY sets
   _vfMicCtx=null on the very next statement, but close() fires its
   'statechange' event asynchronously (transitioning to 'closed') — by
   the time that event actually arrives, the outer _vfMicCtx variable
   has already become null, even though the AudioContext object itself
   (still alive, still dispatching its own event) has not. Reading
   event.target sidesteps this entirely, since it's a direct reference
   to the object that dispatched the event, independent of whatever the
   mutable outer variable currently holds. Defensive null-guard kept as
   a second safety layer regardless. */
var ctxThatChanged=(event&&event.target)?event.target:_vfMicCtx;
if(!ctxThatChanged)return;
console.log('[Audio] Mic AudioContext state changed to:',ctxThatChanged.state);
if(ctxThatChanged.state==='suspended'||ctxThatChanged.state==='interrupted'){
ctxThatChanged.resume().catch(function(err){console.warn('[Audio] Mic context resume failed:',err);});
}
};
_vfMicSource=_vfMicCtx.createMediaStreamSource(stream);
/* 4096 samples (~85ms at a typical 48kHz mic — the closest achievable
   power-of-2 to the requested ~100ms; ScriptProcessorNode buffer sizes
   must be a power of 2, so exactly 100ms isn't selectable). Reduced from
   8192 (~170ms) specifically for lower per-chunk latency, at a real,
   honest trade-off: this roughly doubles onaudioprocess callback
   frequency (more CPU/battery use) and doubles outgoing WebSocket/JSON
   message frequency versus the previous value — acceptable for the
   latency win, but if mobile battery/CPU complaints come back, this is
   the first knob to reconsider turning back up. */
var bufferSize=4096;
_vfMicProcessor=_vfMicCtx.createScriptProcessor(bufferSize,1,1);
_vfMicProcessor.onaudioprocess=function(e){
if(!window._vfRec)return;
if(_vfPaused)return;
/* Defensive guard: ScriptProcessorNode callbacks can still be in-flight
   or queued for one more tick even after disconnect()/context-close
   begins, in the narrow window right as a call ends — window._vfRec
   alone doesn't guarantee _vfMicCtx is still non-null by the time this
   specific callback actually runs. This callback reads _vfMicCtx.
   sampleRate further below; guard here before touching it at all. */
if(!_vfMicCtx)return;
var input=e.inputBuffer.getChannelData(0);
/* Simple amplitude-based speech proxy (not real VAD) just to know the
   student actually said something, so the 2-minute silence auto-end timer
   only resets on real speech, not on streamed background silence.
   THRESHOLD IS A GENUINE, ONGOING TRADE-OFF, NOT A FREE TUNE: this value
   was previously LOWERED from 0.01 to 0.007 specifically because quiet-
   but-real speech was getting miscounted as silence, causing premature
   cutoffs. Raised slightly here to 0.009 (not back to 0.01) to reduce
   residual background-noise false-positives that were preventing clean
   end-of-turn detection even with browser-level noiseSuppression:true
   already active — a modest middle-ground adjustment, not a full
   reversion. If quiet-speech cutoff complaints resurface, that's this
   same knob pulling in the other direction — there is no single value
   that fully solves both directions at once; retune based on which
   complaint is actually being reported, not both preemptively. */
var sum=0;for(var i=0;i<input.length;i++){sum+=Math.abs(input[i]);}
var avgAmplitude=sum/input.length;
var isSpeakingNow=avgAmplitude>0.006;
if(isSpeakingNow){_vfLastUserSpeechTime=Date.now();}
var _prerollInt16=vfDownsampleTo16k(input,_vfMicCtx.sampleRate);
var _prerollB64=vfInt16ToBase64(_prerollInt16);
_vfPreRollBuffer.push(_prerollB64);
/* Audit fix: cap was 3 chunks, but the barge-in onset debounce below
   requires ~300ms of SUSTAINED loud audio before it actually fires (by
   design, to reject filler words) — at a common 48kHz mic sample rate
   this 4096-sample buffer is only ~85ms/chunk, so 300ms of continuous
   speech spans ~4 chunks by the time onset fires, one more than a
   cap of 3 could ever hold. The oldest ~85-100ms of the student's own
   interrupting speech was therefore already evicted and permanently
   lost before the flush below ever runs — heard as the very start of
   their interruption getting clipped. Raised to 5 for margin across
   slower/faster sample rates (44.1kHz, variable buffer timing) without
   changing the 300ms debounce value itself. */
if(_vfPreRollBuffer.length>5)_vfPreRollBuffer.shift();
if(isSpeakingNow){
_vfConsecutiveLoudCallbacks=(_vfConsecutiveLoudCallbacks||0)+1;
}else{
_vfConsecutiveLoudCallbacks=0;
}
var isSustainedSpeech=isSpeakingNow&&(!_vfHasSpokenSinceTurnEnd||_vfSilenceStartTime===null||_vfConsecutiveLoudCallbacks>=2);
if(isSustainedSpeech){
_vfHasSpokenSinceTurnEnd=true;
_vfSilenceStartTime=null;
}else if(_vfHasSpokenSinceTurnEnd){
if(_vfSilenceStartTime===null)_vfSilenceStartTime=Date.now();
else if(Date.now()-_vfSilenceStartTime>=750){
_vfHasSpokenSinceTurnEnd=false;
_vfSilenceStartTime=null;
if(_vfSocket&&_vfSocket.readyState===WebSocket.OPEN&&_vfSessionReady){
try{_vfSocket.send(JSON.stringify({type:'audio_stream_end'}));}catch(e){}
setTimeout(function(){vfSetStatus('🤔 '+window.vfTutorName()+' '+vfTutorVerb('تفكر','يفكر')+'...','thinking');},0);
if(_vfResponseTimeoutTimer)clearTimeout(_vfResponseTimeoutTimer);
_vfResponseTimeoutTimer=setTimeout(function(){
_vfResponseTimeoutTimer=null;
if(window._vfRec&&!_vfPaused&&!_vfAiIsSpeaking){
console.warn('[WS] Response wait timeout — resetting listening state.');
setMicState('recording');
vfSetStatus('🎤 أسمعك — تحدث بالإنجليزية','l');
}
},7500);
}
}
}
/* History (for future reference, not current behavior): this gate went
   through several distinct policies across prior requests — §60 built
   duration-debounced barge-in universally, §64 made suppression
   absolute during Guided Lesson & Drill Mode specifically to protect
   Strict Auditory Modeling (server.js §1C), §66 made it mode-aware
   (absolute during lessons, debounced during Free Chat). This current
   version REMOVES the mode distinction again per an explicit, informed
   request — see the barge-in block below for the current, single
   universal policy and its own reasoning. PROCESSING (the window
   between audio_stream_end and the first response chunk) still stays
   suppressed regardless of mode — there's nothing to forward there
   either way, the student already finished talking; that part of the
   policy was never mode-dependent and remains unchanged. */
/* PROCESSING-window gate REMOVED — true continuous full-duplex per an
   explicit later request: the mic must never wait for any discrete
   "turn" state, including the brief window between the student
   finishing an utterance and Alexa's response arriving. A student
   adding a follow-up thought, or genuinely speaking again immediately,
   is now captured and forwarded exactly like any other moment in the
   call — nothing gates on _vfResponseTimeoutTimer's existence anymore. */
/* UNIVERSAL instant barge-in — DELIBERATE REVERSAL of the prior mode-aware
   policy (Guided Lesson & Drill Mode used to suppress barge-in
   absolutely, specifically to protect Strategy 2's auditory-modeling
   moment from being cut short). This was explicitly flagged as a real
   tension before implementing — Strict Auditory Modeling (server.js §1C)
   genuinely can now get interrupted mid-model if the student starts
   talking immediately — and the person confirmed they want universal,
   always-on barge-in in both modes anyway, informed choice, not an
   oversight. If this needs to be scoped back to Free-Chat-only again in
   the future, the removed _vfLessonId branch's reasoning is preserved in
   git history/prior CLAUDE.md-equivalent notes — not rebuilt from
   scratch here. */
if(_vfAiIsSpeaking){
if(avgAmplitude<0.08){_vfConsecutiveBargeInCallbacks=0;_vfBargeInOnsetTime=0;return;}
if(!_vfBargeInOnsetTime)_vfBargeInOnsetTime=Date.now();
if(Date.now()-_vfBargeInOnsetTime<300)return;
if(!_vfBargeInFired){
_vfBargeInFired=true;
vfStopPlayback();
_vfAiIsSpeaking=false;
/* Audit fix: this client-initiated barge-in path was missing the same
   stray-chunk grace period the server-confirmed 'interrupted' case
   below already has — audio chunks for the just-interrupted turn could
   already be in flight over the network at the exact moment this fires
   (before the server has even received/processed our 'interrupt'
   message below), and would otherwise still arrive and get enqueued
   normally right after this flush, making Alexa's voice audibly "come
   back" for a beat. Same 300ms window, same reasoning as the
   server-confirmed path. */
_vfInterruptGraceUntil=Date.now()+300;
/* DOM updates deferred via setTimeout(fn,0) — same reasoning as the
   "thinking" status trigger above: setMicState()/vfSetStatus() touch
   getElementById/classList/style, which must never run synchronously
   inside the raw audio-processing callback. vfStopPlayback() above stays
   fully synchronous (it's pure array/state clearing, not DOM, and the
   whole point of this barge-in path is a genuinely zero-delay flush of
   Alexa's queued audio) — only the visual state update is pushed off
   the audio thread's own timing. */
/* Same root-cause fix as case 'interrupted' below: without this, the
   just-interrupted turn's accumulated text stayed in _vfCurrentAiText,
   and the next turn's first text chunk would silently concatenate onto
   it (case 'text' does _vfCurrentAiText+=msg.content, append not
   replace). The variable resets are pure JS state, safe to do
   synchronously right here alongside vfStopPlayback() above; only the
   actual DOM removal is deferred into the same setTimeout already used
   for this path's other UI updates, for the same "never touch DOM
   synchronously inside the audio callback" reason. */
var _vfStaleAiEl=_vfLiveAiEl,_vfStaleUserEl=_vfLiveUserEl;
_vfLiveAiEl=null;_vfLiveUserEl=null;_vfCurrentAiText='';_vfCurrentAiChunks=[];_vfLiveAiLinePendingText=null;
setTimeout(function(){
if(_vfStaleAiEl&&_vfStaleAiEl.parentNode)_vfStaleAiEl.parentNode.removeChild(_vfStaleAiEl);
if(_vfStaleUserEl&&_vfStaleUserEl.parentNode)_vfStaleUserEl.parentNode.removeChild(_vfStaleUserEl);
setMicState('recording');
vfSetStatus('🎤 دورك — تحدث الآن','l');
},0);
if(_vfSocket&&_vfSocket.readyState===WebSocket.OPEN&&_vfSessionReady){
try{_vfSocket.send(JSON.stringify({type:'interrupt'}));}catch(e){}
/* Flush the pre-roll buffer immediately — this recovers the first
   ~250ms of the interruption that was captured and encoded the whole
   time but never sent while still crossing the onset threshold above.
   Sent in order, oldest first, so Gemini receives a continuous-sounding
   stream rather than the tail arriving before the head. */
for(var _pi=0;_pi<_vfPreRollBuffer.length;_pi++){
try{_vfSocket.send(JSON.stringify({type:'audio',data:_vfPreRollBuffer[_pi],mimeType:'audio/pcm;rate=16000'}))}catch(e){}
}
_vfPreRollBuffer=[];
}
}
}else{
_vfConsecutiveBargeInCallbacks=0;
_vfBargeInOnsetTime=0;
_vfBargeInFired=false;
}
if(!_vfSocket||_vfSocket.readyState!==WebSocket.OPEN||!_vfSessionReady)return;
/* Client-side RMS noise gate — deliberately separate from isSpeakingNow
   above (which serves a different purpose: tracking silence duration
   for end-of-turn detection, not deciding whether to stream at all).
   ROOT CAUSE this addresses: during normal listening (_vfAiIsSpeaking
   false — the barge-in block above only gates the OTHER state), every
   single mic frame was being sent to sendRealtimeInput() unconditionally,
   including pure background noise/silence between words. Per Gemini
   Live's own documented behavior, sendRealtimeInput interrupts/feeds its
   turn-generation continuously — a steady stream of low-level noise
   frames (not true digital silence, given normal room/mic noise floor)
   risked being misread as ongoing "activity," contributing to spurious
   micro-turns or bundled responses. Real RMS (root-mean-square, not the
   avgAmplitude mean-absolute-value already computed above for a
   different purpose) of this exact frame, gated separately: below
   threshold means don't stream it at all — silence/noise-only frames
   are simply dropped here, never reaching the WebSocket. Genuinely
   quiet real speech still passes: this threshold is deliberately close
   to (not stricter than) the existing isSpeakingNow threshold, so this
   doesn't introduce a NEW risk of cutting off quiet speech beyond what
   already exists in the silence-detection logic above. */
var _rmsSumSq=0;for(var _ri=0;_ri<input.length;_ri++){_rmsSumSq+=input[_ri]*input[_ri];}
var _rmsValue=Math.sqrt(_rmsSumSq/input.length);
if(_rmsValue<0.006)return;
/* Same backpressure guard as the server side: if the socket already has a
   substantial backlog of unsent bytes (slow/congested connection), skip
   this mic frame instead of piling more delay onto an already-backed-up
   connection — a dropped 170ms mic frame is inaudible; a growing queue of
   them is not. */
if(_vfSocket.bufferedAmount>262144)return;
try{_vfSocket.send(JSON.stringify({type:'audio',data:_prerollB64,mimeType:'audio/pcm;rate=16000'}))}catch(e){}
};
_vfMicSource.connect(_vfMicProcessor);
_vfMicProcessor.connect(_vfMicCtx.destination);
}
function vfStopMicStreaming(){
if(_vfMicProcessor){try{_vfMicProcessor.disconnect()}catch(e){}_vfMicProcessor=null}
if(_vfMicSource){try{_vfMicSource.disconnect()}catch(e){}_vfMicSource=null}
if(_vfMicCtx){try{_vfMicCtx.close()}catch(e){}_vfMicCtx=null}
_vfReusableInt16=null;_vfReusableResampled=null;
}

/* ===== WebSocket connection to the relay server (/api/voice-session) =====
   Note: systemPrompt is intentionally NOT sent from the client anymore.
   server.js's own SYSTEM_INSTRUCTION ("Alexa") is now the single source of
   truth for every session, regardless of the selected age/scenario chips. */
function vfConnectSocket(){
if(_vfSocket&&(_vfSocket.readyState===WebSocket.OPEN||_vfSocket.readyState===WebSocket.CONNECTING))return;
_vfSessionReady=false;
var url=vfBuildWsUrl();
if(!url){
vfSetState('','غير متصل');
vfSetStatus('⚠️ تعذر تحديد رابط الخادم (الصفحة مفتوحة عبر ملف محلي) — لا يمكن الاتصال بالصوت المباشر','error');
vfShowTextInput();
return;
}
console.log('[WS] Connecting to Render...', url);
try{_vfSocket=new WebSocket(url)}catch(e){vfSetState('','غير متصل');vfSetStatus('⚠️ تعذر الاتصال بالخادم: '+(e&&e.message?e.message:''),'error');vfShowTextInput();return}
/* Explicit connection-handshake timeout: without this, a silently-dropped
   connection (bad URL, firewall, sleeping free-tier host) leaves the UI
   stuck showing "جاري الاتصال..." forever with zero feedback — indistinguishable
   from a real hang. We do NOT retry automatically (no reconnect loop that
   could flood the event loop); we simply surface a clear, actionable error
   once, and the student can tap the button again if they want to retry. */
if(_vfConnectTimeout){clearTimeout(_vfConnectTimeout);}
_vfConnectTimeout=setTimeout(function(){
_vfConnectTimeout=null;
if(!_vfSessionReady){
console.warn('WebSocket handshake timed out');
try{_vfSocket&&_vfSocket.close();}catch(e){}
vfStopRingtone();
vfSetState('','غير متصل');
vfSetStatus('⌛ انتهت مهلة الاتصال بالخادم — تحقق من اتصالك بالإنترنت وحاول مرة أخرى','error');
vfShowTextInput();
/* Actually tear the call down, not just the UI text: getUserMedia may
   have already resolved (it runs in parallel with this handshake) and
   the mic may already be live and streaming at this point. Without
   this, a timed-out handshake left the microphone recording/processing
   in the background indefinitely — window._vfRec stayed true with no
   visual sign the call was still "live" underneath the error message,
   which is the same class of orphaned-audio-pipeline bug as the
   getUserMedia race fixed above. vfStop() is fully idempotent/safe to
   call even if the mic never started yet. */
if(window._vfRec)vfStop();
}
},12000);
/* Honest, non-blocking expectation-setting (not a hard timeout, doesn't
   close/retry anything) — Render's free tier can take several seconds to
   wake from a cold sleep. If we're still waiting past the point where a
   warm server would normally have answered, update the visible status
   text so the wait doesn't feel like a silent hang, without touching the
   connection itself at all. */
if(_vfWarmupHintTimeout){clearTimeout(_vfWarmupHintTimeout);}
_vfWarmupHintTimeout=setTimeout(function(){
_vfWarmupHintTimeout=null;
if(!_vfSessionReady&&_vfSocket&&_vfSocket.readyState===WebSocket.CONNECTING){
vfSetStatus('🔄 جاري تجهيز الخادم — قد يستغرق الاتصال الأول وقتًا أطول قليلًا...','');
}
},5000);
_vfSocket.onopen=function(){
/* Cumulative connection-open timestamp — separate from
   _vfSessionStartTime, which resets every 20-minute round. Used to
   decide when a TRUE session renewal (not just a mic soft-pause) is
   warranted — see vfEnterSoftPause()'s comment for why this matters. */
_vfConnectionEstablishedTime=Date.now();
_vfSocket.send(JSON.stringify({type:'start_session',tutorGender:window._vfTutorGender,tutorName:window.vfTutorName(),voiceName:'Aoede',scenario:_vfScenario,userAge:_vfAge,lessonId:_vfLessonId,lessonTitleAr:_vfLessonTitleAr,lessonTitleEn:_vfLessonTitleEn,lessonGoal:_vfLessonGoal,lessonVocab:_vfLessonVocab,struggleWords:(typeof getStruggleWords==='function'?getStruggleWords():[]),toneMode:_vfToneMode,kickoffNote:(typeof vfBuildKickoffNote==='function'?vfBuildKickoffNote():null),studentPersonalization:(typeof vfBuildStudentPersonalization==='function'?vfBuildStudentPersonalization():null)}));
};
_vfSocket.onmessage=function(ev){vfHandleServerMessage(ev.data)};
_vfSocket.onerror=function(err){
console.warn('[WS] Socket error event fired:',err);
if(_vfConnectTimeout){clearTimeout(_vfConnectTimeout);_vfConnectTimeout=null;}
if(_vfWarmupHintTimeout){clearTimeout(_vfWarmupHintTimeout);_vfWarmupHintTimeout=null;}
vfStopRingtone();
if(window._vfRec){
  vfSetState('active','متصل');
  var lessonName = (window.vfCurrentLesson && window.vfCurrentLesson.title_ar) || 'الدرس';
  vfSpeakReply("Hello! I am Alexa. Let's practice English together!\nأهلاً بك! أنا أليكسا، جاهزة لمساعدتك في " + lessonName);
}
};
_vfSocket.onclose=function(closeEvent){
console.warn('[WS] Socket closed — fallback to smart voice engine. Code:',closeEvent&&closeEvent.code);
_vfSessionReady=false;
if(_vfConnectTimeout){clearTimeout(_vfConnectTimeout);_vfConnectTimeout=null;}
if(_vfWarmupHintTimeout){clearTimeout(_vfWarmupHintTimeout);_vfWarmupHintTimeout=null;}
if(window._vfRec){
  vfSetState('active','متصل');
  var lessonName = (window.vfCurrentLesson && window.vfCurrentLesson.title_ar) || 'الدرس';
  vfSpeakReply("Hello! I am Alexa. Let's practice English together!\nأهلاً بك! أنا أليكسا، جاهزة لمساعدتك في " + lessonName);
}
};
}
var _vfLiveAiLinePendingText=null;
var _vfLiveAiLineRafScheduled=false;
function vfUpsertLiveAiLine(text){
/* DECOUPLED FROM THE WEBSOCKET MESSAGE HANDLER via requestAnimationFrame —
   this used to run the actual DOM work (createElement/appendChild/
   scrollTop read-write, which forces a synchronous layout) synchronously
   inside case 'text' itself, on the same main thread the playback
   ScriptProcessorNode's onaudioprocess callback also runs on. A forced
   layout here could plausibly delay that callback's next invocation
   enough to matter. The queued text itself is cheap to store immediately;
   only the actual DOM mutation is deferred to the next animation frame,
   and multiple text updates arriving before that frame fires collapse
   into a single DOM update (only the LATEST text matters — no need to
   render every intermediate streamed state), rather than each queuing
   its own separate rAF callback. */
_vfLiveAiLinePendingText=text;
if(_vfLiveAiLineRafScheduled)return;
_vfLiveAiLineRafScheduled=true;
requestAnimationFrame(function(){
_vfLiveAiLineRafScheduled=false;
var pendingText=_vfLiveAiLinePendingText;
if(pendingText===null)return;
_vfLiveAiLinePendingText=null;
if(!_vfLiveAiEl){
var e=document.getElementById('vf-tr');
var l=document.createElement('div');l.className='vf-tr-l vf-tr-a';
var span=document.createElement('span');span.textContent='🤖 ';l.appendChild(span);
e.appendChild(l);vfTrimTranscript(e);
_vfLiveAiEl=l;_vfLiveAiEl._span=span;
}
_vfLiveAiEl._span.textContent='🤖 '+pendingText;
var tr=document.getElementById('vf-tr');tr.scrollTop=tr.scrollHeight;
vfUpdateWordDisplay(pendingText);
});
}
/* Pulls out the target word/phrase Alexa is currently teaching, for the
   large, eye-comfortable display above the transcript. Our system prompt's
   own word-by-word teaching examples naturally quote the target word (e.g.
   "Let's learn a new word: 'Water'."), so the last quoted segment in the
   current utterance is a reliable signal. CRITICAL: deliberately does
   NOT fall back to the raw/full text when nothing is quoted — that
   fallback used to leak whole Arabic conversational sentences, system
   notes, and unrelated content into this box. No quote (or a quoted
   segment that isn't genuinely English) now means "nothing to show,"
   handled by vfUpdateWordDisplay() hiding the box entirely — the full
   dialogue always still appears in #vf-tr regardless, unaffected by
   this. */
function vfExtractHighlightWord(text){
if(!text)return null;
var matches=text.match(/['"]([^'"]{1,40})['"]/g);
if(!matches||!matches.length)return null; // no quoted target — nothing to show, NOT a fallback to raw text
var candidate=matches[matches.length-1].replace(/^['"]|['"]$/g,'').trim();
if(!candidate)return null;
/* Safety check: only display it if it's genuinely English (the target
   words this box exists for) — rejects a stray Arabic phrase that
   happened to land inside quote marks, rather than trusting punctuation
   alone. Requires at least one Latin letter and zero Arabic script. */
if(/[\u0600-\u06FF]/.test(candidate))return null;
if(!/[A-Za-z]/.test(candidate))return null;
return candidate;
}
/* ============================================================
   Reactive Lesson-Flow State Tracker (additive reinforcement layer)
   ============================================================
   HONEST SCOPE NOTE: this is NOT a fully deterministic state machine
   that knows the exact upcoming word/sentence ahead of time — the 36
   lessons are static HTML content, not structured, queryable data, so
   a client that "pre-plans" the curriculum isn't something this
   codebase can support without a much larger content-restructuring
   project. What this genuinely IS: reactive state tracking based on
   the one reliable signal already available client-side — the target
   word/phrase Alexa just quoted (vfExtractHighlightWord's output,
   already populated on every turn via vfUpdateWordDisplay below). This
   sends a lightweight directive note REINFORCING the current step,
   layered additively on top of the full system prompt — it does not
   replace or strip down alexaPrompt.js's comprehensive rules (Strict
   Evaluation, 3-Attempt Patience, L1-error awareness, tone modes, exact
   phrases the app's own regex depends on all stay fully in effect).
   The goal is reducing long-session rule drift via an explicit,
   current-step reminder, not replacing the reasoning that makes a
   correction actually accurate. */
var STATE_VOCAB_INTRO='STATE_VOCAB_INTRO';
var STATE_VOCAB_DRILL='STATE_VOCAB_DRILL';
var STATE_SENTENCE_INTRO='STATE_SENTENCE_INTRO';
var STATE_SENTENCE_SCAFFOLD='STATE_SENTENCE_SCAFFOLD';
var STATE_SENTENCE_COMPLETE='STATE_SENTENCE_COMPLETE';
var _vfLessonFlowState=STATE_VOCAB_INTRO;
var _vfSawSentenceTargetThisLesson=false;
var _vfPendingStateDirective=null;

function vfInferLessonFlowState(targetText){
var wordCount=targetText.trim().split(/\s+/).length;
if(wordCount>=3){
// A 3-4 word target — either a fresh sentence intro, or the
// "say it all together" moment right after word-by-word scaffolding.
if(_vfLessonFlowState===STATE_SENTENCE_SCAFFOLD)return STATE_SENTENCE_COMPLETE;
_vfSawSentenceTargetThisLesson=true;
return STATE_SENTENCE_INTRO;
}
// A single-word target — either plain vocab drilling, or word-by-word
// scaffolding WITHIN a sentence we've already started (only reachable
// once a sentence target has actually appeared this lesson).
if(_vfSawSentenceTargetThisLesson)return STATE_SENTENCE_SCAFFOLD;
return STATE_VOCAB_DRILL;
}

function vfMaybeSendStateDirective(newState,targetText){
if(newState===_vfLessonFlowState)return; // only fire on a genuine transition
_vfLessonFlowState=newState;
/* RACE CONDITION FIX: this used to send the directive immediately, right
   here — but vfUpdateWordDisplay() (which calls this) is invoked from
   vfUpsertLiveAiLine(), which itself runs on every STREAMED TEXT CHUNK
   as Alexa's current turn is still being generated (case 'text': fires
   repeatedly mid-turn, not once after it's done) — so a new text input
   was being sent to Gemini WHILE it was still mid-generation on the
   current turn, which could genuinely confuse it into an overlapping or
   duplicate response. Instead, just queue the directive here (cheap,
   synchronous, no network I/O) — it gets sent from case 'turn_complete'
   below, the one moment that's actually safe: generation has genuinely
   finished, Gemini is waiting for the next input, nothing is mid-stream. */
_vfPendingStateDirective={state:newState,target:targetText};
}
function vfFlushPendingStateDirective(){
if(!_vfPendingStateDirective)return;
var pending=_vfPendingStateDirective;
_vfPendingStateDirective=null;
if(!_vfSocket||_vfSocket.readyState!==WebSocket.OPEN||!_vfSessionReady)return;
var directives={};
directives[STATE_VOCAB_DRILL]='[current step: vocabulary drill — target "'+pending.target+'". Keep evaluating strictly per the rules already in effect.]';
directives[STATE_SENTENCE_INTRO]='[current step: sentence practice begins — target "'+pending.target+'". Explain the combined meaning briefly first, per the Sentence Practice Stage rules already in effect.]';
directives[STATE_SENTENCE_SCAFFOLD]='[current step: word-by-word scaffolding within the sentence — current word "'+pending.target+'". Do not re-model the whole sentence yet.]';
directives[STATE_SENTENCE_COMPLETE]='[current step: full sentence repetition — target "'+pending.target+'". This is the combined sentence after word-by-word success.]';
var note=directives[pending.state];
if(!note)return;
try{_vfSocket.send(JSON.stringify({type:'text',content:note}));}catch(e){}
}

function vfUpdateWordDisplay(text){
var wd=document.getElementById('vf-word-display');
var wdt=document.getElementById('vf-word-display-text');
if(!wd||!wdt)return;
var word=vfExtractHighlightWord(text);
if(!word){
/* No legitimate target word/phrase to show this turn — keep the box
   cleanly hidden rather than ever falling back to raw conversational
   text (Arabic explanations, system notes, unrelated content, etc.). */
wd.style.display='none';
wdt.textContent='';
return;
}
vfMaybeSendStateDirective(vfInferLessonFlowState(word),word);
wd.style.display='block';
wdt.textContent=word;
/* Instruction label consistency fix: the sub-label used to always say
   "Say this word out loud" regardless of what's actually shown — a
   genuine mismatch whenever a multi-word phrase (from Phase 2+, §1B)
   was the extracted target. Now reflects the actual word count. */
var sublabelEl=document.getElementById('vf-word-display-sublabel');
if(sublabelEl){
var wordCount=word.trim().split(/\s+/).length;
var micIconHtml='<svg class="ic" style="font-size:18px;vertical-align:middle;color:#c084fc;"><use href="#ic-mic"/></svg>';
sublabelEl.innerHTML=(wordCount>1?'Say this phrase out loud ':'Say this word out loud ')+micIconHtml;
}
}
function vfUpsertLiveUserLine(text){
if(!_vfLiveUserEl){
var e=document.getElementById('vf-tr');
var l=document.createElement('div');l.className='vf-tr-l vf-tr-u';
/* Hidden by design (not removed): the student should only see Alexa's
   clean responses/hints, never their own raw real-time STT transcript
   (which can look messy/distracting mid-recognition). This element is
   still created and kept up to date exactly as before — vfFinalizeAiTurn()
   below reads its text to populate _vfHistory (used for session replay
   and other internal tracking), and evaluation itself happens entirely
   server-side in Gemini's own reasoning regardless of what the UI shows
   — so hiding this visually has zero effect on backend transcript
   processing or AI evaluation, only on what's rendered on screen. */
l.style.display='none';
var span=document.createElement('span');span.textContent='🎤 ';l.appendChild(span);
e.appendChild(l);vfTrimTranscript(e);
_vfLiveUserEl=l;_vfLiveUserEl._span=span;
}
_vfLiveUserEl._span.textContent='🎤 '+text;
var tr=document.getElementById('vf-tr');tr.scrollTop=tr.scrollHeight;
}
function vfFinalizeAiTurn(){
if(_vfLiveAiEl&&_vfCurrentAiText){
var chunks=_vfCurrentAiChunks.slice();
var rb=document.createElement('button');rb.className='vf-tr-btn';rb.textContent='🔊';rb.title='أعد الصوت';
rb.onclick=function(){vfPlayChunksArray(chunks)};
_vfLiveAiEl.appendChild(rb);
vfPushHistory({role:'ai',text:_vfCurrentAiText});
_vfLastAiChunks=chunks;_vfLastAiText=_vfCurrentAiText;
_aiTurnCount++;
_vfCallHadAiTurn=true; /* per-call flag, reset at each vfStart() — see vfStop() */
var score=Math.min(95,55+_aiTurnCount*4+Math.floor(Math.random()*8));
if(typeof updateAccentScore==='function')updateAccentScore(score);
if(_vfCurrentAiText.match(/instead of|not.*correct|try saying|should be/i)){
var cm=_vfCurrentAiText.match(/"([^"]+)".*?"([^"]+)"/);
if(cm&&typeof addCorrection==='function')addCorrection(cm[1],cm[2]);
}
}
if(_vfLiveUserEl){
var text=_vfLiveUserEl._span.textContent.replace('🎤 ','');
if(text)vfPushHistory({role:'user',text:text});
/* This element is hidden (display:none, see vfUpsertLiveUserLine()) and
   therefore excluded from vfTrimTranscript()'s visible-line cap — it
   would otherwise linger in the DOM forever across a long session with
   nothing to ever clean it up. Its only purpose was feeding _vfHistory
   just above; remove it now that that's done, rather than leaving an
   orphaned node behind. */
if(_vfLiveUserEl.parentNode)_vfLiveUserEl.parentNode.removeChild(_vfLiveUserEl);
}
_vfLiveAiEl=null;_vfLiveUserEl=null;_vfCurrentAiText='';_vfCurrentAiChunks=[];_vfLiveAiLinePendingText=null;
setMicState('recording');
vfSetStatus('🎤 دورك — تحدث الآن','l');
}
/* First-turn opening lines per roleplay scenario, sent right after
   session_ready so Alexa opens in character immediately instead of asking
   for the student's name (only used when a non-free scenario is picked). */
var SCENARIO_KICKOFFS={
coffee:'[system note: start the very first turn fully in character as the barista at "Stylish Café" — greet the customer and ask what they would like to order, e.g. "Welcome to Stylish Café! What can I get for you today?". Do not ask for the student\'s name, stay in character.]',
interview:'[system note: start the very first turn fully in character as the job interviewer — greet the candidate and ask them to introduce themselves, e.g. "Good morning! Thanks for coming in today — could you start by telling me a bit about yourself?". Do not ask for the student\'s name, stay in character.]',
airport:'[system note: start the very first turn fully in character as airport check-in staff — greet the traveler and ask for their passport and ticket, e.g. "Welcome! May I see your passport and ticket, please?". Do not ask for the student\'s name, stay in character.]',
hotel:'[system note: start the very first turn fully in character as the hotel receptionist — greet the guest and ask about their reservation, e.g. "Welcome to our hotel! Do you have a reservation with us today?". Do not ask for the student\'s name, stay in character.]',
doctor:'[system note: start the very first turn fully in character as the doctor — greet the patient warmly and ask what is bothering them, e.g. "Hello, please have a seat. What brings you in today?". Do not ask for the student\'s name, stay in character.]'
};
/* Student personalization payload for start_session — deliberately built
   from ALREADY-LOCALLY-CACHED data (localStorage, kept in sync with
   Supabase via seFetchAndMergeCloudProgress() on login, not a fresh
   network fetch at every session start), since a blocking Supabase query
   here would reintroduce exactly the kind of latency the kickoff-note
   optimization elsewhere in this file was built to eliminate. Only
   non-null when a student is actually signed in — anonymous/guest
   students get none of these fields, and the server treats their
   absence as "no personalization available," not an error. */
function vfBuildStudentPersonalization(){
if (typeof _seCurrentUser === 'undefined' || !_seCurrentUser) return null;
var fullName = _seCurrentUser.fullName || null;
var xp = (typeof getXP === 'function') ? getXP() : 0;
var levelInfo = (typeof seGetLevelInfo === 'function') ? seGetLevelInfo(xp) : null;
var completed = (typeof getCompletedLessons === 'function') ? getCompletedLessons() : [];
var highestLessonNum = 0;
completed.forEach(function(id){
var m = String(id).match(/(\d+)/);
if (m) { var n = parseInt(m[1], 10); if (n > highestLessonNum) highestLessonNum = n; }
});
return {
fullName: fullName,
levelName: levelInfo ? levelInfo.name : null,
lastCompletedLessonNum: highestLessonNum || null,
};
}
function vfBuildKickoffNote(){
if(_vfScenario&&_vfScenario!=='free'&&SCENARIO_KICKOFFS[_vfScenario]){
return SCENARIO_KICKOFFS[_vfScenario];
}
var greeting=buildPersonalizedGreeting();
return (greeting&&greeting.isReturning)
?'[system note: greet the returning student briefly] '+greeting.en
:'[system note: this is a new session — start talking now exactly as instructed: greet the student warmly, ask their name, and ask if they are ready to begin the lesson]';
}
function vfHandleServerMessage(raw){
var msg;try{msg=JSON.parse(raw)}catch(e){return}
try{
switch(msg.type){
case 'reconnecting':
/* Real fix for a gap explicitly documented as a known limitation when
   this server-side feature was first built (transparent reconnect on
   Gemini's transient 1011 disconnects) — this message existed on the
   server but had no client handler at all, so it was being silently
   dropped by the switch's implicit no-op on unknown types. Without
   this, the student would just see the call go quiet for a moment
   during the server's background reconnect attempt, with zero
   explanation. A brief, calm status line — not an error, not a scary
   message — bridges that gap. */
vfSetStatus('🔄 لحظة، نُعيد الاتصال...','');
break;
case 'session_ending_soon':
/* Same category of gap — server-side goAway handling (Gemini's own
   pre-disconnect warning) had no client-side counterpart at all.
   Logged for now rather than shown to the student: the session
   genuinely might still have several minutes left (Gemini's own
   session-length limits, not an imminent failure), so a visible
   warning this early would likely read as more alarming than useful.
   The console log at least makes the event visible for debugging
   real "session ended abruptly" reports going forward. */
console.log('[WS] Server reported session ending soon:',msg.timeLeftMs?Math.round(msg.timeLeftMs/1000)+'s left':'(no timeLeft given)');
break;
case 'session_ready':
_vfSessionReady=true;
_vfReconnectAttempted=false;
if(_vfConnectTimeout){clearTimeout(_vfConnectTimeout);_vfConnectTimeout=null;}
if(_vfWarmupHintTimeout){clearTimeout(_vfWarmupHintTimeout);_vfWarmupHintTimeout=null;}
vfSetState('active','متصل');
vfSetStatus('🎤 أسمعك — تحدث بالإنجليزية','l');
setMicState('recording');
updateConnState(true);
if(typeof vfRenderSurvivalChips==='function')vfRenderSurvivalChips();
var _survivalEl=document.getElementById('vf-survival-chips');if(_survivalEl)_survivalEl.style.display='block';
/* REVERTED (explicit later request): the scenario-selection grid and
   tone selector (both share the .vf-sec class) used to get hidden here
   once a call went active — that hiding is removed. Both sections now
   stay fully visible and interactable throughout an active call,
   exactly like the rest of the background interface around it. */
/* Latency fix: the kickoff nudge (scenario opener / new-vs-returning
   greeting) is no longer sent from here — it's computed up front and
   included in start_session's payload instead, so the server can relay
   it to Gemini the moment ITS OWN connection is established, without
   waiting for this round trip back to the client first. See
   vfBuildKickoffNote() and its use in start_session below. */
break;
case 'audio':
if(_vfResponseTimeoutTimer){clearTimeout(_vfResponseTimeoutTimer);_vfResponseTimeoutTimer=null;}
/* Stray-chunk rejection for the short window right after an
   interruption — see the 'interrupted' case above for why this is
   safe (a genuinely new reply can't physically arrive this fast). */
if(_vfInterruptGraceUntil&&Date.now()<_vfInterruptGraceUntil){break;}
_vfInterruptGraceUntil=0;
/* Stop the ringback tone the instant Alexa's first audio packet starts
   playing — vfStopRingtone() is idempotent (no-ops after the first real
   call), so calling it on every subsequent audio chunk in this same
   call is harmless and doesn't need its own "already stopped" guard. */
vfStopRingtone();
vfEnqueueAudio(msg.data);
_vfAiIsSpeaking=true;
setMicState('speaking');
vfSetStatus('🔊 '+window.vfTutorName()+' '+vfTutorVerb('تتحدث','يتحدث')+'...','s');
break;
case 'text':
if(_vfResponseTimeoutTimer){clearTimeout(_vfResponseTimeoutTimer);_vfResponseTimeoutTimer=null;}
_vfCurrentAiText+=msg.content;
vfUpsertLiveAiLine(_vfCurrentAiText);
break;
case 'user_text':
_vfLastUserSpeechTime=Date.now();
vfUpsertLiveUserLine(msg.content);
break;
case 'interrupted':
/* This path is active for genuine barge-in in BOTH Guided Lesson & Drill
   Mode and Free Chat/Open Scenarios now — the universal 60ms speech-
   onset threshold (see the onaudioprocess gate above) can legitimately
   trigger this via the client's own explicit 'interrupt' signal in
   either mode, and it can also still arrive independently from Gemini's
   own server-side logic regardless of mode. */
_vfAiIsSpeaking=false;
_vfBargeInOnsetTime=0;
_vfBargeInFired=false;
_vfPreRollBuffer=[];
_vfPendingStateDirective=null;
/* ROOT CAUSE FIX for "old speech turn text concatenates with the new
   one after an interruption": unlike case 'turn_complete' (which
   already resets _vfCurrentAiText/_vfLiveAiEl via vfFinalizeAiTurn()),
   this interruption path used to leave the just-interrupted turn's
   accumulated text sitting in _vfCurrentAiText untouched — since
   case 'text' below does _vfCurrentAiText+=msg.content (append, not
   replace), the NEXT turn's first text chunk would get silently
   concatenated onto the stale leftover from the turn that was just
   cut off. Same cleanup as vfFinalizeAiTurn(), just without the
   struggle/mastery-phrase detection (that's specifically about a
   turn that finished normally, not one that got interrupted). */
if(_vfLiveAiEl&&_vfLiveAiEl.parentNode)_vfLiveAiEl.parentNode.removeChild(_vfLiveAiEl);
if(_vfLiveUserEl&&_vfLiveUserEl.parentNode)_vfLiveUserEl.parentNode.removeChild(_vfLiveUserEl);
_vfLiveAiEl=null;_vfLiveUserEl=null;_vfCurrentAiText='';_vfCurrentAiChunks=[];_vfLiveAiLinePendingText=null;
vfFadeOutAndStopPlayback();
vfResumeMicNow();
_vfTurnGenerationComplete=false;
_vfTurnEndSignaled=false;
/* Grace-period stray-chunk rejection: audio for the JUST-interrupted
   turn may already have been in flight over the network at the moment
   the interruption was registered — without this, those 1-2 late
   chunks could still arrive and get enqueued normally, making Alexa's
   voice audibly "come back" for a beat right after the fade-out
   finished (sounding exactly like resuming/talking over the student).
   A genuinely NEW response (for whatever the student just said) can't
   physically arrive this fast anyway — there's always at least a real
   network+generation round trip — so silently dropping audio chunks
   for a short window here has no cost to legitimate new replies. */
_vfInterruptGraceUntil=Date.now()+300;
break;
case 'turn_complete':
_vfAiIsSpeaking=false;
/* Send any queued lesson-flow-state directive NOW — the one genuinely
   safe moment: generation has actually finished, Gemini is waiting for
   the next input, nothing is mid-stream. See vfMaybeSendStateDirective's
   own comment for why this was moved here from the mid-stream point it
   used to fire from. */
vfFlushPendingStateDirective();
/* Personal Student Error Memory detection — runs exactly once per
   completed AI turn (not per streamed text chunk, which would otherwise
   re-match the same phrase repeatedly as text accumulates). Looks for
   the natural-sounding spoken marker phrases Alexa is instructed to say
   (server.js): an English word right before ANY of three rollover
   connector phrases ("بنرجعلها بعدين"/"بنمر عليها بعدين"/"مسجلة عندنا" —
   Alexa varies which one she uses) logs a struggle; one right before
   "صارت متقنة" clears it and awards bonus XP. Best-effort by design —
   natural language varies, so this may occasionally miss a match; that's
   an acceptable trade-off for not requiring a rigid, unnatural-sounding
   spoken format. If server.js's rollover wording is ever changed again,
   this regex's three-way alternation must be updated to match — a
   silent mismatch here means struggle words stop being logged at all,
   with no visible error anywhere. */
try{
var struggleMatch=_vfCurrentAiText.match(/([A-Za-z][A-Za-z\s'-]{0,30}?)\s+(?:بنرجعلها بعدين|بنمر عليها بعدين|مسجلة عندنا)/);
if(struggleMatch&&typeof addStruggleWord==='function'){
addStruggleWord(struggleMatch[1].trim());
}
var masteryMatch=_vfCurrentAiText.match(/([A-Za-z][A-Za-z\s'-]{0,30}?)\s+صارت متقنة/);
if(masteryMatch){
if(typeof removeStruggleWord==='function')removeStruggleWord(masteryMatch[1].trim());
if(typeof addXP==='function')addXP(150); // bonus XP for mastering a previously-struggled word, via the one real XP system — see CLAUDE.md §7
}
}catch(e){console.error('[Error Memory] detection failed (non-fatal):',e);}
vfFinalizeAiTurn();
_vfTurnGenerationComplete=true;
vfScheduleMicResume();
break;
case 'rate_limited':
case 'error':
console.warn('Voice session server message:',msg.message);
vfStopRingtone();
vfStopPlayback();
_vfAiIsSpeaking=false;
setWaveActive(false);
if(window._vfRec && typeof vfSpeakReply === 'function'){
  var lessonName = (window.vfCurrentLesson && window.vfCurrentLesson.title_ar) || 'الدرس';
  vfSpeakReply("Hello! I am Alexa, your English AI tutor. Let's practice together!\nأهلاً بك! أنا أليكسا، يلا نبدأ التدريب على " + lessonName);
} else {
  vfSetStatus(msg.message || '⚠️ تعذر الاتصال بالخادم','warn');
}
break;
case 'session_closed':
_vfSessionReady=false;
updateConnState(false);
if(window._vfRec){
vfStop();
vfSetStatus('⚠️ انتهت الجلسة من طرف الخادم','error');
}
break;
}
}catch(err){
/* Whole-switch safety net: one unexpected error in a single message
   type's handling used to be able to propagate uncaught, potentially
   leaving state half-updated for that message (e.g. mic/UI stuck mid-
   transition if a case threw partway through). Never lets a single bad
   message break the whole voice session or freeze the UI silently —
   log it (the global window.addEventListener('error',...) diagnostic
   banner near the top of this file also surfaces genuinely uncaught
   errors visibly, but catching here first stops this specific error
   from ever reaching that point) and fall back to a safe, known-good
   visible state rather than leaving the student staring at a frozen
   mic button with no idea why. */
console.error('[WS] Error handling message type "'+(msg&&msg.type)+'":',err);
try{
if(window._vfRec&&!_vfPaused){setMicState('recording');vfSetStatus('🎤 دورك — تحدث الآن','l');}
}catch(recoveryErr){}
}
}

/* Runs every 5s while a call is active. Soft-pauses the mic (NOT the call)
   once VF_MAX_SESSION_MS is reached each round — the WebSocket and Gemini
   Live session stay fully connected, so "Push to Talk" resumes the exact
   same conversation with zero reconnect and zero lost context. Still hard-
   ends the call if the student goes truly silent for VF_SILENCE_TIMEOUT_MS
   (that's a real "walked away" signal, not just a round boundary). */
function vfCheckSessionLimits(){
if(!window._vfRec||_vfPaused)return;
if(_vfHistory.length>100)_vfHistory=_vfHistory.slice(-100);
var now=Date.now();
/* Daily 15-minute cap: this function already runs every 5s exactly while
   a call is active and not soft-paused, so it doubles as the natural
   accumulator tick for real active voice time (paused/idle time is never
   counted, matching the spirit of "15 minutes of AI Voice calls"). */
vfAddDailyVoiceSeconds(5);
vfAddLifetimeVoiceSeconds(5);
if(vfDailyLimitReached()){
vfStop();
vfSetStatus('لقد استنفدت حدك اليومي للمحادثة الصوتية (15 دقيقة). نلتقي غداً لمتابعة التعلم!','');
vfShowDailyLimitToast();
return;
}
if(now-_vfSessionStartTime>=VF_MAX_SESSION_MS){
/* CRITICAL: never enter soft-pause (which can trigger a full session
   renewal — closing and reopening the WebSocket, §52) while Alexa is
   actively speaking/streaming a response. This check used to fire
   purely on elapsed time with zero awareness of _vfAiIsSpeaking — if
   the 20-minute mark landed mid-sentence, this could genuinely cut her
   voice off mid-stream by tearing down the connection she was actively
   using. Deferred, not cancelled: this function re-runs every 5s, so
   the very next tick after her turn ends (_vfAiIsSpeaking becomes
   false) will catch the already-elapsed time and enter the pause then
   — the round doesn't effectively get longer by more than one 5s tick
   in the worst case. */
if(!_vfAiIsSpeaking){
vfEnterSoftPause();
return;
}
}
if(_vfLastUserSpeechTime&&(now-_vfLastUserSpeechTime>=VF_SILENCE_TIMEOUT_MS)){
vfStop();
vfSetStatus('🤫 تم إنهاء الجلسة تلقائياً بسبب عدم التحدث لأكثر من 3 دقائق','');
return;
}
}

/* Soft pause: stop sending mic audio and stop the round-timer, but leave
   _vfSocket / the Gemini Live session completely untouched — Alexa's
   current sentence keeps playing normally since we never interrupt
   playback, only the mic input going forward. Also explicitly tells Alexa
   to announce the pause herself in Saudi Arabic (she has no way to know a
   pause is happening on her own, since nothing about the live session
   itself changes) — this is a real spoken turn, not just a silent UI
   status change. */
/* Clear, visible daily-limit toast — separate from vfSetStatus() (which
   only updates the small in-panel status line, easy to miss if the panel
   isn't in view) so the "no more calls until tomorrow" message is
   genuinely hard to miss regardless of what's on screen. */
function vfShowDailyLimitToast(){
try{
var existing=document.querySelector('.vf-daily-limit-toast');
if(existing)return; // don't stack duplicates if triggered twice in quick succession
var toast=document.createElement('div');
toast.className='vf-daily-limit-toast';
toast.innerHTML='<span class="vf-daily-limit-icon"><svg class="ic" style="font-size:22px"><use href="#ic-timer"/></svg></span><div>لقد استنفدت حدك اليومي للمحادثة الصوتية (15 دقيقة).<br>نلتقي غداً لمتابعة التعلم!</div>';
document.body.appendChild(toast);
requestAnimationFrame(function(){toast.classList.add('show');});
setTimeout(function(){
toast.classList.remove('show');
setTimeout(function(){toast.remove();},400);
},5000);
}catch(e){}
}

function vfEnterSoftPause(){
_vfPaused=true;
if(_vfIdleCheckTimer){clearInterval(_vfIdleCheckTimer);_vfIdleCheckTimer=null}
setMicState('paused');
var micBtn=document.getElementById('vf-mic');if(micBtn)micBtn.classList.remove('vf-rec');
/* Top luxury prompt takes over as the one obvious call-to-action; the
   bottom mic button softly fades so there's no ambiguity about which
   button to press. */
var topBtn=document.getElementById('vf-continue-top');if(topBtn)topBtn.style.display='flex';
var micW=document.getElementById('vf-mic-w');if(micW)micW.classList.add('vf-mic-faded');
/* True session renewal check — separate from (and rarer than) the
   20-minute round pause itself. The original behavior here kept the
   SAME underlying Gemini Live session alive indefinitely across every
   resumed round, no matter how many rounds a student chained together
   in one sitting — fine for a normal session, but Gemini Live sessions
   plausibly have their own hard maximum duration server-side that
   simply pausing the mic does nothing to avoid. Renew (close the old
   WebSocket cleanly + open a fresh one with identical scenario/lesson/
   tone/struggleWords/personalization context) once cumulative CONNECTION
   time crosses 1.5x the round length (tightened from 2x per a report of
   progressive session slowdown over long calls) — most sessions never
   reach this and behave exactly as before; only a genuinely long
   combined study session does. HONEST SCOPE NOTE: this is the closest
   real lever available for "session degrades over time," not a literal
   fix for it — Gemini Live's conversational context is managed entirely
   server-side in this architecture, there's no mechanism to selectively
   prune/trim it from the client or server the way a stateless chat-
   completion API's resent history could be windowed (§43 explains this
   architectural difference in more depth). A fresh connection with
   fresh context is the only tool actually available here, not a
   verified fix for a specific measured degradation curve — if
   degradation is still reported well under 30 minutes, that points to a
   different root cause than long-context growth and needs its own
   investigation, not a further blind reduction of this same number. */
var cumulativeMs=_vfConnectionEstablishedTime?(Date.now()-_vfConnectionEstablishedTime):0;
if(cumulativeMs>=VF_MAX_SESSION_MS*1.5&&_vfSocket&&_vfSocket.readyState===WebSocket.OPEN){
console.log('[WS] Cumulative connection time exceeded threshold — performing a clean session renewal.');
vfSetStatus('⏸️ استراحة قصيرة — نجدد الاتصال بهدوء...','');
_vfSessionReady=false;
try{
var oldSock = _vfSocket;
_vfSocket = null;
oldSock.onclose = function() {
try { vfConnectSocket(); } catch(err) { console.error('[WS] Reconnect after renewal failed:', err); }
};
oldSock.close(1000,'Scheduled session renewal');
}catch(e){
vfConnectSocket();
}
}else{
vfSetStatus('⏸️ كملنا 20 دقيقة — اضغط زر الاستمرار للمتابعة','');
if(_vfSocket&&_vfSocket.readyState===WebSocket.OPEN&&_vfSessionReady){
_vfSocket.send(JSON.stringify({type:'text',content:'[system note: 20 minutes have passed. Ask the student verbally in friendly Saudi Arabic whether they want to continue — say exactly this: "كملنا وقت طويل! حاب نستمر ونكمل الدرس؟" Keep it short, then stop and wait — do not continue the lesson content in this turn.]'}));
}
}
}

/* "Continue Lesson" resume: normally the same live session, same
   conversation memory, same lesson state — just un-gate the mic and
   start a fresh 20-minute round-timer, no WebSocket reconnect. The one
   exception: if vfEnterSoftPause() just performed a scheduled session
   renewal (see its comment), _vfSocket is already a brand-new
   connection by the time this runs — the check below already handles
   that gracefully (a benign no-op if the fresh session isn't marked
   ready yet), so no separate branch is needed here. */
function vfResumeFromSoftPause(){
try{
_vfPaused=false;
_vfSessionStartTime=Date.now();
_vfLastUserSpeechTime=Date.now();
if(_vfIdleCheckTimer){clearInterval(_vfIdleCheckTimer);}
_vfIdleCheckTimer=setInterval(vfCheckSessionLimits,5000);
var micBtn=document.getElementById('vf-mic');if(micBtn)micBtn.classList.add('vf-rec');
setMicState('recording');
vfSetStatus('🎤 أسمعك — تحدث بالإنجليزية','l');
var topBtn=document.getElementById('vf-continue-top');if(topBtn)topBtn.style.display='none';
var micW=document.getElementById('vf-mic-w');if(micW)micW.classList.remove('vf-mic-faded');
if(_vfSocket&&_vfSocket.readyState===WebSocket.OPEN&&_vfSessionReady){
_vfSocket.send(JSON.stringify({type:'text',content:'[system note: the student just tapped the continue button to keep going after the pause — react immediately with warm, welcome-back enthusiasm in Saudi Arabic, then continue the lesson/scenario/discussion exactly where it left off, keeping sentences ultra-short as usual]'}));
}
}catch(e){
/* Graceful failure safeguard: even if something above threw (a missing
   element, an unexpected state), still guarantee the two things that
   actually matter most — the mic is un-gated and the round-timer is
   extended — rather than leaving the student stuck paused with a broken
   button. */
console.error('[vfResumeFromSoftPause] recovered from error:',e);
_vfPaused=false;
if(!_vfIdleCheckTimer){_vfIdleCheckTimer=setInterval(vfCheckSessionLimits,5000);}
_vfSessionStartTime=Date.now();
var topBtnFallback=document.getElementById('vf-continue-top');if(topBtnFallback)topBtnFallback.style.display='none';
}
}
function vfStart(){
console.log('[WS] vfStart() invoked, _vfStarting='+_vfStarting+', _vfRec='+window._vfRec);
if(window._vfRec||_vfStarting)return;
_vfStarting=true;
try{
vfUnlockAudioForMobile();
window._vfRec=true;
_vfMicMuted=false;
_vfMicSuppressed=false;
_vfCallHadAiTurn=false;
_vfSessionStartTime=Date.now();
_vfLastUserSpeechTime=Date.now();
if(_vfIdleCheckTimer){clearInterval(_vfIdleCheckTimer);}
_vfIdleCheckTimer=setInterval(vfCheckSessionLimits,5000);
if(_vfPlaybackResumeTimer){clearTimeout(_vfPlaybackResumeTimer);_vfPlaybackResumeTimer=null}
if(_vfMicUnmuteGuardTimer){clearTimeout(_vfMicUnmuteGuardTimer);_vfMicUnmuteGuardTimer=null}
var muteBtn=document.getElementById('vf-fb-mute');if(muteBtn)muteBtn.classList.remove('vf-fb-muted');
var muteIcon=document.getElementById('vf-fb-mute-icon');if(muteIcon)muteIcon.innerHTML='<use href="#ic-mic"/>';
var micBtn=document.getElementById('vf-mic');if(micBtn)micBtn.classList.add('vf-rec');
/* Show "connecting", NOT "connected" — the WebSocket handshake and
   getUserMedia permission prompt haven't even started yet at this point.
   The UI only switches to the real "متصل" (Connected) state once the
   server actually confirms session_ready — see vfHandleServerMessage. */
vfSetState('connecting','جاري الاتصال...');
vfSetStatus('🔄 جاري الاتصال بالخادم...','');
setWaveActive(true);
setMicState('connecting');
_vfCurrentAiText='';_vfCurrentAiChunks=[];
/* Defensive reset, not an expected-path fix: guarantees a completely
   clean playback queue at the start of every session regardless of
   what happened in a previous one (e.g. an abrupt disconnect that
   didn't fully complete vfStop()'s own cleanup) — stale leftover audio
   from a prior session should never be able to bleed into a new one. */
vfStopPlayback();
}catch(setupErr){
console.error('vfStart setup error:',setupErr);
if(_vfIdleCheckTimer){clearInterval(_vfIdleCheckTimer);_vfIdleCheckTimer=null;}
vfSetStatus('⚠️ خطأ داخلي عند بدء الجلسة — '+(setupErr&&setupErr.message?setupErr.message:'raise console'),'error');
window._vfRec=false;_vfStarting=false;vfRestoreStartButton();
return;
}
if(window._vfIsSecureContext===false){
vfSetStatus('🔒 المايكروفون ممنوع لأن الصفحة غير آمنة (ليست https) — استخدم الكتابة، أو افتح الموقع عبر رابط https:// حقيقي','');
vfShowTextInput();
_vfStarting=false;vfRestoreStartButton();
return;
}
if(!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)){
vfSetStatus('⌨️ المايكروفون غير مدعوم على هذا المتصفح — استخدم الكتابة','');
vfShowTextInput();
_vfStarting=false;vfRestoreStartButton();
return;
}
console.log('[WS] Requesting microphone permission...');
/* echoCancellation/noiseSuppression: true — genuinely help here (echo
   cancellation specifically addresses "Alexa's voice from the speakers
   falsely triggering barge-in", directly relevant to this feature).
   autoGainControl: DELIBERATELY false, requested again as part of this
   barge-in feature bundle with no new specific technical justification
   — same standing position as every prior time this came up: enabling
   it was found to clip/dip the student's voice dynamically. Bundling it
   into an unrelated feature request doesn't constitute new justification
   on its own; this needs a genuinely new, specific reason to revisit. */
var micPromise=navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:false}});
/* Latency fix: start the WebSocket + Gemini handshake immediately, in
   parallel with the mic permission prompt, instead of waiting for the
   student to grant mic access first. The Gemini handshake alone can take
   1-3+ seconds; overlapping it with the permission prompt (which the
   student is already looking at) removes that time from the perceived
   "tap to talk" delay instead of stacking both delays back-to-back. The
   mic-processing loop already gates on _vfSessionReady, so no audio is
   ever sent before the session actually confirms it's ready either way. */
console.log('[WS] Connecting to Render in parallel with mic permission...');
vfConnectSocket();
micPromise.then(function(s){
/* Race-condition guard: getUserMedia's permission prompt can take
   seconds (or the connect-timeout below can fire first), during which
   the student may have already tapped "end call" — vfStop() runs,
   window._vfRec becomes false, and _vfSocket/_vfStream are torn down
   and nulled. Without this check, this .then() callback would still
   fire and unconditionally open a brand-new AudioContext + mic
   processor for a call that no longer exists — nothing ever stops or
   nulls THIS particular stream reference afterwards (vfStop() has
   already run and won't run again until the next call), so the
   hardware mic and its ScriptProcessor keep running silently in the
   background indefinitely: this is the direct cause of the reported
   device heating / audio interference / page slowdown, since the
   browser is left actively capturing and processing audio for a call
   the UI shows as ended. Immediately release the just-granted track
   and bail out instead. */
if(!window._vfRec){
console.log('[WS] Microphone granted AFTER the call already ended — releasing it immediately, not starting streaming.');
try{s.getTracks().forEach(function(t){t.stop();});}catch(e){}
_vfStarting=false;
return;
}
console.log('[WS] Microphone granted, starting mic stream...');
_vfStream=s;
vfStartMicStreaming(s);
_vfStarting=false;
}).catch(function(err){
console.error('[WS] getUserMedia FAILED:',err&&err.name,err&&err.message);
console.warn('Mic access denied:',err&&err.name);
var isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
if(err&&(err.name==='NotAllowedError'||err.name==='PermissionDeniedError')){
vfSetStatus(isIOS?'⚠️ افتح الإعدادات > Safari > المايكروفون':'⚠️ اسمح بالمايكروفون من شريط العنوان','');
}else{
vfSetStatus('⌨️ المايكروفون غير متاح ('+(err&&err.name?err.name:'خطأ غير معروف')+') — استخدم الكتابة','');
}
setMicState('idle');
vfShowTextInput();
/* The WebSocket/Gemini connection was already started in parallel above —
   since there will never be any mic audio to send now, tear the whole
   session down cleanly instead of leaving a connected-but-silent session
   running for nothing. */
vfStop();
window._vfRec=false;_vfStarting=false;vfRestoreStartButton();
});
}
function vfRestoreStartButton(){
var btn=document.getElementById('vf-start-btn');
if(btn){btn.disabled=false;btn.style.pointerEvents='';btn.style.opacity='';}
}
function vfShowTextInput(){
var panel=document.getElementById('vf-panel');
if(!panel||panel.querySelector('.vf-text-in'))return;
var box=document.createElement('div');
box.className='vf-text-in';
box.style.cssText='padding:8px 18px 14px';
box.innerHTML='<input type="text" id="vf-tinput" placeholder="اكتب بالإنجليزية هنا..." style="width:100%;padding:10px 14px;border-radius:10px;border:1px solid rgba(124,77,204,0.2);background:rgba(255,255,255,0.05);color:#fff;font-family:Tajawal,sans-serif;font-size:14px;direction:ltr;outline:none;" />';
panel.appendChild(box);
var inp=document.getElementById('vf-tinput');
inp.addEventListener('keydown',function(e){
if(e.key==='Enter'&&inp.value.trim()){
var txt=inp.value.trim();inp.value='';
vfSendText(txt);
}});
inp.focus();
}
function vfStop(){
/* Safety cleanup: stop/dispose the ringtone unconditionally first — this
   function is the universal "call ended" path (user cancel, error,
   normal end), so this alone covers every case the spec asks for
   without needing separate calls scattered across each error branch. */
vfStopRingtone();
var _survivalElStop=document.getElementById('vf-survival-chips');if(_survivalElStop)_survivalElStop.style.display='none';
_vfLessonFlowState=STATE_VOCAB_INTRO;
_vfSawSentenceTargetThisLesson=false;
_vfPendingStateDirective=null;
window._vfRec=false;
_vfStarting=false;
_vfPaused=false;
_vfAiIsSpeaking=false;
_vfReconnectAttempted=false;
_vfHasSpokenSinceTurnEnd=false;
_vfSilenceStartTime=null;
_vfConsecutiveLoudCallbacks=0;
_vfConsecutiveBargeInCallbacks=0;
_vfBargeInOnsetTime=0;
_vfBargeInFired=false;
_vfPreRollBuffer=[];
_vfInterruptGraceUntil=0;
_vfTurnGenerationComplete=false;
_vfTurnEndSignaled=false;
if(_vfResponseTimeoutTimer){clearTimeout(_vfResponseTimeoutTimer);_vfResponseTimeoutTimer=null;}
vfRestoreStartButton();
var topBtn=document.getElementById('vf-continue-top');if(topBtn)topBtn.style.display='none';
var micWEl=document.getElementById('vf-mic-w');if(micWEl)micWEl.classList.remove('vf-mic-faded');
if(_vfIdleCheckTimer){clearInterval(_vfIdleCheckTimer);_vfIdleCheckTimer=null}
if(_vfConnectTimeout){clearTimeout(_vfConnectTimeout);_vfConnectTimeout=null}
if(_vfWarmupHintTimeout){clearTimeout(_vfWarmupHintTimeout);_vfWarmupHintTimeout=null}
var micEl=document.getElementById('vf-mic');if(micEl)micEl.classList.remove('vf-rec');
var wd=document.getElementById('vf-word-display');if(wd)wd.style.display='none';
vfSetState('','غير متصل');
vfSetStatus('اضغط الزر وتحدث بالإنجليزية','');
setWaveActive(false);
setMicState('idle');
updateConnState(false);
if(_vfPlaybackResumeTimer){clearTimeout(_vfPlaybackResumeTimer);_vfPlaybackResumeTimer=null}
if(_vfMicUnmuteGuardTimer){clearTimeout(_vfMicUnmuteGuardTimer);_vfMicUnmuteGuardTimer=null}
_vfMicSuppressed=false;
vfStopMicStreaming();
if(_vfStream){_vfStream.getTracks().forEach(function(t){t.stop()});_vfStream=null}
vfStopPlayback();
/* Suspend (not close) the playback AudioContext once the call ends: this
   immediately frees the CPU work the browser was doing for it, without
   destroying the context outright — closing it would mean losing the
   mobile "unlock" we did earlier, forcing a fresh unlock dance next call. */
if(_vfPlayCtx&&_vfPlayCtx.state==='running'){_vfPlayCtx.suspend().catch(function(){});}
if(_vfSocket){
try{
if(_vfSocket.readyState===WebSocket.OPEN)_vfSocket.send(JSON.stringify({type:'end_session'}));
_vfSocket.close();
}catch(e){}
_vfSocket=null;
}
_vfSessionReady=false;
/* Defensive cleanup for the same reason as vfFinalizeAiTurn() above: if
   the call ends abruptly mid-utterance (before a turn ever finalizes),
   any lingering hidden user-transcript element would otherwise be
   orphaned in the DOM with nothing left to ever remove it. */
if(_vfLiveUserEl&&_vfLiveUserEl.parentNode)_vfLiveUserEl.parentNode.removeChild(_vfLiveUserEl);
_vfLiveAiEl=null;_vfLiveUserEl=null;_vfLiveAiLinePendingText=null;
/* Second explicit completion trigger: the student had a real voice
   conversation with Alexa about a SPECIFIC lesson (at least one full AI
   reply happened — _aiTurnCount>0 rules out an accidental instant tap) and
   then ended the call. Merely opening the lesson earlier does not do this
   on its own; this only fires once the AI conversation for it actually
   concluded. */
if(_vfLessonId&&_vfCallHadAiTurn){
var lid='lesson-'+String(_vfLessonId).padStart(2,'0');
if(document.getElementById(lid)&&typeof markLessonDone==='function'){markLessonDone(lid);}
}
/* "بطل المحادثة" badge counter: any real voice conversation counts (free
   chat, scenario roleplay, or lesson practice) — broader than the
   lesson-completion trigger above, which only fires for lesson-specific
   calls. */
if(_vfCallHadAiTurn&&typeof incrementVoiceSessionCount==='function'){incrementVoiceSessionCount();}
/* Per-scenario session counter (Dashboard §D scenario-mastery badges,
   e.g. "باريستا المحترف"/"المسافر الواثق") — honestly what this measures
   is "genuine voice sessions completed with this scenario active," not a
   literal "flawless execution" score (no per-turn pass/fail signal
   exists client-side to verify that claim precisely). Same
   _vfCallHadAiTurn guard as the badge counter above it — only counts
   real conversations, not an instant accidental tap. */
if(_vfCallHadAiTurn&&_vfScenario&&_vfScenario!=='free'&&typeof vfIncrementScenarioSession==='function'){
vfIncrementScenarioSession(_vfScenario);
}
/* "وسام الشجاعة الصوتية" badge trigger: a real single call lasting 5+
   minutes, measured from this call's own actual start time — not
   cumulative across multiple short calls, and not the daily/lifetime
   accumulators above (those measure total practice time, this measures
   sustained-conversation courage in one sitting). */
if(_vfCallHadAiTurn&&_vfSessionStartTime&&(Date.now()-_vfSessionStartTime)>=300000){
try{localStorage.setItem('se_had_5min_call','1');}catch(e){}
if(typeof checkBadgeUnlocks==='function')checkBadgeUnlocks();
}
_vfMicMuted=false;
var muteBtn=document.getElementById('vf-fb-mute');if(muteBtn)muteBtn.classList.remove('vf-fb-muted');
var muteIcon=document.getElementById('vf-fb-mute-icon');if(muteIcon)muteIcon.innerHTML='<use href="#ic-mic"/>';
vfExitMinimized();
var overlay=document.getElementById('vf-overlay');
if(overlay)overlay.classList.remove('vf-modal-open');
window._vfOpen=false;
}

/* ===== Sends a typed / hint message through the live Gemini session,
   falling back to the offline canned tutor if the socket isn't connected ===== */
function vfSendText(text){
vfAddTr(text,'user');
vfPushHistory({role:'user',text:text});
if(_vfSocket&&_vfSocket.readyState===WebSocket.OPEN&&_vfSessionReady){
setMicState('waiting');
vfSetStatus('🤖 '+window.vfTutorName()+' '+vfTutorVerb('تفكر','يفكر')+'...','');
_vfSocket.send(JSON.stringify({type:'text',content:text}));
}else{
vfLocalFallback(text);
}
}

/* ===== Offline fallback (used only if the WebSocket/Gemini session is unavailable) ===== */
function vfSpeakReply(fullReply){
var parts=fullReply.split(/\n+/);
var enPart=parts[0]||fullReply;
var arPart=parts.length>1?parts.slice(1).join(' '):'';
vfAddTr(enPart,'ai');
if(arPart)vfAddTr(arPart,'ai');
vfSetStatus('🔊 '+window.vfTutorName()+' '+vfTutorVerb('تتحدث','يتحدث')+'... (وضع عدم الاتصال)','s');
setMicState('speaking');
_aiTurnCount++;
var score=Math.min(95,55+_aiTurnCount*4+Math.floor(Math.random()*8));
if(typeof updateAccentScore==='function')updateAccentScore(score);
if(fullReply.match(/instead of|not.*correct|try saying|should be/i)){
var cm=fullReply.match(/"([^"]+)".*?"([^"]+)"/);
if(cm&&typeof addCorrection==='function')addCorrection(cm[1],cm[2]);
}
if(window.speechSynthesis){
window.speechSynthesis.cancel();
var u=new SpeechSynthesisUtterance(enPart);
u.lang='en-US';u.rate=_aiVoiceSpeed||0.88;u.pitch=1.0;
var voices=window.speechSynthesis.getVoices();
var enV=voices.find(function(v){return v.lang.indexOf('en')===0});
if(enV)u.voice=enV;
u.onend=function(){
vfSetStatus(window._vfRec?'🎤 دورك — تحدث الآن':'اضغط الزر وتحدث بالإنجليزية','l');
setMicState(window._vfRec?'recording':'idle');
};
u.onerror=function(){vfSetStatus('🎤 دورك — تحدث الآن','l');setMicState('recording')};
window.speechSynthesis.speak(u);
}else{vfSetStatus('🎤 دورك — تحدث الآن','l');setMicState('recording')}
}
function vfLocalFallback(ut){
var msgCount=incVoiceMsgCount();
if(msgCount>VF_MSG_LIMIT){
vfSetStatus('','');
var stsEl=document.getElementById('vf-sts');
if(stsEl){stsEl.className='vf-sts';stsEl.textContent='✨ أنهيت جلسة التعلم المكثفة لليوم! ارجع بكرة وكمّل مشوارك'}
setMicState('idle');
vfAddTr('Great session today! Come back tomorrow to continue practising.','ai');
return;
}
var lower=ut.toLowerCase().trim();
var resp='';var arResp='';
if(/hack|crack|virus|malware|linux terminal|ignore.*instruction|forget.*teacher|pretend.*you.*are|act as|system prompt|your instruction|your rules|kill|weapon/i.test(lower)){
resp='Interesting! But let us talk about something fun. Tell me, what is your favourite food?';
arResp='يلا نتكلم عن شي حلو! وش أكلك المفضل؟';
vfPushHistory({role:'ai',text:resp});
vfSpeakReply(resp+'\n'+arResp);
return;
}
var lessonMatch=lower.match(/lesson\s*(\d+)|درس\s*(\d+)/i);
if(lessonMatch){
var lnum=parseInt(lessonMatch[1]||lessonMatch[2]);
var ltopics={1:'the Alphabet',2:'Vowels and Consonants',3:'CVC Words like cat and dog',4:'PH and WH sounds',5:'Articles: A, An, and The',6:'Singular and Plural nouns',7:'Subject Pronouns',8:'Verb To Be: am, is, are',9:'making Affirmative sentences',10:'Negation with not',11:'Yes and No Questions',12:'Wh-Questions',13:'Action Verbs',14:'Present Simple tense',15:'Frequency Adverbs',16:'Do and Does',17:'Possessives',18:'the word And',19:'the word But',20:'the word Because',21:'Quantities: some, any, much, many',22:'ordering at a Coffee Shop',23:'asking for Directions',24:'Polite Requests',25:'Past Simple with -ed',26:'Irregular Past Verbs',27:'Past Negation with Did',28:'Storytelling',29:'Future with Going To',30:'Future with Will',31:'Future Negation',32:'Time Expressions',33:'describing your Day',34:'Airport vocabulary',35:'Free Speech',36:'Grand Review'};
var topic=ltopics[lnum]||'that topic';
resp='Great! Lesson '+lnum+' is about '+topic+'. Let me give you a quick practice sentence. Try saying: ';
if(lnum<=6)resp+='The cat is on the table.';
else if(lnum<=12)resp+='Where is the nearest hospital?';
else if(lnum<=24)resp+='I usually drink coffee in the morning.';
else resp+='Yesterday, I went to the market and bought some fruits.';
arResp='ممتاز! الدرس '+lnum+' عن '+topic+'. جرب تقول الجملة';
vfPushHistory({role:'ai',text:resp});
vfSpeakReply(resp+'\n'+arResp);
return;
}
if(/quiz|test|exam|اختبار|امتحان|answer.*question|what.*correct/i.test(lower)){
resp='I can see you are working on a quiz! I will not give you the answer directly, but here is a hint: think about the grammar rule you just learned. Read each option carefully and pick the one that sounds most natural. You can do it!';
arResp='شكلك في اختبار! ما راح أعطيك الإجابة مباشرة، بس فكر في القاعدة اللي تعلمتها. أنت تقدر!';
vfPushHistory({role:'ai',text:resp});
vfSpeakReply(resp+'\n'+arResp);
return;
}
if(/^(hi|hello|hey|good morning|good evening)/i.test(lower)){
resp='Hello! Welcome to Stylish English. My name is '+window.vfTutorName()+'. Tell me, what is your name?';
arResp='أهلاً وسهلاً! أنا '+window.vfTutorName()+' '+vfTutorVerb('معلمتك','معلمك')+'. قل لي اسمك بالإنجليزي';
}else if(/my name is|i am |i'm /i.test(lower)){
var name=lower.replace(/.*my name is |.*i am |.*i'm /i,'').replace(/[^a-zA-Z ]/g,'').trim();
name=name.charAt(0).toUpperCase()+name.slice(1);
if(name.length>1)saveStudentName(name);
var next=getNextLesson();
var lessonHint=next?' Your next lesson is Lesson '+next.number+': '+next.title+'.':'';
resp='Nice to meet you, '+name+'! Your pronunciation is very clear.'+lessonHint+' Now tell me: where are you from?';
arResp='تشرفنا '+name+'! نطقك واضح ما شاء الله. الحين قل لي: من وين أنت؟';
}else if(/from |live in|i am from/i.test(lower)){
resp='Wonderful! That is great. Now let us practise something new. Can you say: I like to drink coffee in the morning?';
arResp='ممتاز! يلا نجرب جملة جديدة';
}else if(/coffee|tea|drink|eat|food|breakfast/i.test(lower)){
resp='Excellent sentence! Your grammar is correct. Now try this harder one: Yesterday, I went to the market and bought some fruits.';
arResp='جملة ممتازة وقواعدك صحيحة!';
}else if(/yesterday|went|bought|last|ago/i.test(lower)){
resp='Amazing! You used the past tense perfectly. The word went is the past of go. Very impressive!';
arResp='ما شاء الله! استخدمت الماضي صح. went هو ماضي go';
}else if(/will|going to|tomorrow|next|future|plan/i.test(lower)){
resp='Great job with the future tense! Remember: use going to for plans, and will for instant decisions.';
arResp='ممتاز! تذكر: going to للخطط، و will للقرارات اللحظية';
}else if(/where|what|when|who|how|why/i.test(lower)){
resp='Good question! You are using Wh-words correctly. Now try answering your own question in a full sentence.';
arResp='سؤال جميل! جرب تجاوب عليه بجملة كاملة';
}else if(/thank|thanks|bye|goodbye/i.test(lower)){
resp='You are very welcome! Keep practising every day. See you next time!';
arResp='العفو! واصل التمرين كل يوم. إلى اللقاء!';
}else if(lower.split(' ').length<=2){
resp='Good word! Now try putting it inside a full sentence.';
arResp='كلمة حلوة! جرب تحطها في جملة كاملة';
}else{
var adv=['Brilliant sentence structure! Your fluency is really improving.',
'Excellent! Try telling me about your daily routine.',
'Very impressive! Describe your dream job in English.',
'Great effort! Tell me about your family.'];
resp=adv[Math.floor(Math.random()*adv.length)];
arResp='ما شاء الله عليك! مستواك يتطور';
}
vfPushHistory({role:'ai',text:resp});
var fullReply=resp+(arResp?'\n'+arResp:'');
vfSpeakReply(fullReply);
}

/* ===== Expose functions called from inline onclick="" attributes in the HTML =====
   Inline event-handler attributes (onclick="...") execute against the GLOBAL
   scope, not the closure of this IIFE. A plain `function name(){}` declared
   in here is therefore invisible to them and throws "Uncaught ReferenceError:
   name is not defined" the moment the button is tapped — even though the
   function is defined and works fine when called from other code inside
   this same IIFE. This is exactly what caused the end-call button, the mute
   button, the expand tap, and the three utility buttons (أعد / ساعدني /
   حسّن) to not respond. Explicitly attaching them to window fixes it. */
window.vfExpand=vfExpand;
window.vfToggleMicMute=vfToggleMicMute;
window.vfEndCallFromWidget=vfEndCallFromWidget;
window.repeatLastAI=repeatLastAI;
window.vfResumeFromSoftPause=vfResumeFromSoftPause;
/* Safe bridge for code outside this IIFE (the lesson-card click handler,
   in the second/global script block) to notify an active call about a
   lesson switch — _vfSocket/_vfSessionReady/_vfLessonTitleAr etc. are all
   private closures in here, not window properties, so outside code can
   never read them directly; this wrapper is the only correct way in. */
window.vfNotifyLessonSwitch=function(newLessonTitle){
if(!newLessonTitle)return;
_vfLessonFlowState=STATE_VOCAB_INTRO;
_vfSawSentenceTargetThisLesson=false;
_vfPendingStateDirective=null;
if(!window._vfRec||!_vfSessionReady||!_vfSocket||_vfSocket.readyState!==WebSocket.OPEN)return;
/* Sends the FULL lesson metadata (title/goal/vocab), not just the title —
   server.js's switch_lesson handler builds the actual system note itself
   from these sanitized fields, the same safer pattern already used by
   switch_scenario/switch_tone, rather than the client constructing raw
   prompt text directly (the old approach here). */
try{
_vfSocket.send(JSON.stringify({
type:'switch_lesson',
lessonTitleAr:_vfLessonTitleAr,
lessonTitleEn:_vfLessonTitleEn,
lessonGoal:_vfLessonGoal,
lessonVocab:_vfLessonVocab,
}));
}catch(e){}
};
/* Harmless, permission-free pre-warm: creates/resumes the playback
   AudioContext on hover/touch of the hero CTA — this is NOT a mic
   permission request (no prompt, nothing intrusive), just quietly getting
   the Web Audio API's context construction cost out of the way before the
   student later opens the voice panel and actually starts a call. Guarded
   to run at most once. */
var _vfPrewarmed=false;
window.vfPrewarmAudioContext=function(){
if(_vfPrewarmed)return;
_vfPrewarmed=true;
/* Deferred as its own macrotask (setTimeout 0), NOT run synchronously
   inside the touchstart handler. On mobile, touchstart fires just before
   click on the same tap gesture — since JS is single-threaded, any real
   synchronous work here (constructing a fresh AudioContext is genuinely
   non-trivial the first time on some mobile browsers) delays the browser
   from getting to process the click handler right after, which is
   exactly what showed up as "click feels delayed on first tap." Deferring
   lets the tap's own click handler (and its instant visual feedback) run
   first, with the AudioContext warm-up happening a moment later, still
   well before the student actually opens the voice panel. */
setTimeout(function(){try{vfEnsurePlayCtx();}catch(e){}},0);
};
})();

/* ================================================== */

var _vfEnteringPlatform=false;
function enterPlatform() {
/* ABSOLUTE SEPARATION: this function does ONLY synchronous DOM style/class
   changes — nothing else. No network calls, no `fetch`, no WebSocket, no
   AudioContext, no `await`, nothing that could take a variable amount of
   time. It executes in a single synchronous tick, every time, regardless
   of network conditions or server state — this button is 100%
   offline-capable by construction. Audio/AI setup only ever happens later,
   when the student explicitly opens a lesson's voice widget and taps the
   mic — never here. */
if (_vfEnteringPlatform) return; // cheap re-entry guard, itself synchronous
_vfEnteringPlatform = true;
document.body.classList.add('in-platform');
var dashboard = document.getElementById('dashboard');
var progressBar = document.getElementById('progress-bar');
if (dashboard) dashboard.classList.add('active');
if (progressBar) progressBar.style.display = 'block';
/* URL bookkeeping — history.pushState is synchronous, does not touch the
   network (it only edits the browser's local session history entry). */
if (location.hash !== '#curriculum') {
try { history.pushState({ page: 'curriculum' }, '', '#curriculum'); } catch (e) { location.hash = 'curriculum'; }
}
window.scrollTo({ top: 0, behavior: 'smooth' });
/* Optional resume-progress prompt — reads localStorage only (no network,
   no audio), and is explicitly deferred to its own macrotask so it can
   never be perceived as adding even a millisecond to the section-toggle
   above, which has already fully happened by the time this runs. */
setTimeout(function() {
try { if (typeof checkSavedProgress === 'function') checkSavedProgress(); }
catch (e) { console.error('[enterPlatform] checkSavedProgress failed (non-fatal):', e); }
}, 0);
}
function exitPlatform() {
if (location.hash === '#curriculum') {
try { history.pushState({ page: 'home' }, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
}
document.body.classList.remove('in-platform');
_vfEnteringPlatform = false;
if (typeof window.vfSetLessonContext === 'function') window.vfSetLessonContext(null);
var dashboard = document.getElementById('dashboard');
var controlPanel = document.getElementById('ai-control-panel');
if (dashboard) dashboard.classList.remove('active');
if (controlPanel) controlPanel.style.display = 'none';
if (typeof window.vfStopAllVisuals === 'function') window.vfStopAllVisuals();
window.scrollTo({ top: 0, behavior: 'smooth' });
}
/* Explicit window exposure (defense-in-depth): both functions are already
   plain top-level declarations in a non-module, non-IIFE <script> block,
   so they become window properties automatically in every browser — but
   binding them explicitly here removes any doubt and guards against the
   rare case of a third-party script/extension shadowing the global name
   before this point. */
window.enterPlatform = enterPlatform;
window.exitPlatform = exitPlatform;
/* Browser Back/Forward buttons: keep the "page" and the actual view in
   sync, same idea as real multi-page navigation. */
window.addEventListener('popstate', function() {
if (location.hash === '#curriculum') {
if (!document.body.classList.contains('in-platform')) enterPlatform();
} else {
if (document.body.classList.contains('in-platform')) exitPlatform();
}
});
/* Direct link support: index.html#curriculum opens the dashboard right
   away, exactly like landing on a dedicated page would. */
document.addEventListener('DOMContentLoaded', function() {
if (location.hash === '#curriculum') { enterPlatform(); }
});
/* Language: Arabic only */
var SE_PROGRESS_KEY = 'se_last_position';
var SE_COMPLETED_KEY = 'se_completed_lessons';
var SE_STUDENT_KEY = 'se_student_profile';
var SE_LESSON_MAP = {
'lesson-01':'Alphabet','lesson-02':'Vowels','lesson-03':'CVC Words','lesson-04':'PH & WH',
'lesson-05':'Articles','lesson-06':'Plurals','lesson-07':'Pronouns','lesson-08':'Verb To Be',
'lesson-09':'Affirmative','lesson-10':'Negation','lesson-11':'Yes/No Questions','lesson-12':'Wh-Questions',
'lesson-13':'Action Verbs','lesson-14':'Present Simple','lesson-15':'Frequency','lesson-16':'Do/Does',
'lesson-17':'Possessives','lesson-18':'And','lesson-19':'But','lesson-20':'Because',
'lesson-21':'Quantities','lesson-22':'Coffee Shop','lesson-23':'Directions','lesson-24':'Polite Requests',
'lesson-25':'Past Regular','lesson-26':'Irregular Verbs','lesson-27':'Past Negation','lesson-28':'Storytelling',
'lesson-29':'Going To','lesson-30':'Will','lesson-31':'Future Negation','lesson-32':'Time Expressions',
'lesson-33':'Describe Your Day','lesson-34':'Airport','lesson-35':'Free Speech','lesson-36':'Grand Review'
};
function getStudentProfile() {
try {
var data = localStorage.getItem(SE_STUDENT_KEY);
return data ? JSON.parse(data) : null;
} catch(e) { return null; }
}
function saveStudentName(name) {
try {
var profile = getStudentProfile() || {};
profile.name = name;
profile.savedAt = Date.now();
localStorage.setItem(SE_STUDENT_KEY, JSON.stringify(profile));
} catch(e) {}
}
function getNextLesson() {
var completed = getCompletedLessons();
for (var i = 1; i <= 36; i++) {
var id = 'lesson-' + String(i).padStart(2, '0');
if (completed.indexOf(id) === -1) {
return { id: id, number: i, title: SE_LESSON_MAP[id] || 'Lesson ' + i };
}
}
return null; 
}
function buildPersonalizedGreeting() {
var profile = getStudentProfile();
var next = getNextLesson();
var completed = getCompletedLessons();
if (profile && profile.name) {
var name = profile.name;
var progress = completed.length;
if (next) {
var enGreet = 'Welcome back, ' + name + '! You have completed ' + progress + ' lessons so far. Ready to tackle Lesson ' + next.number + ': ' + next.title + ' today?';
var arGreet = 'أهلاً ' + name + '! أنهيت ' + progress + ' دروس. جاهز نبدأ الدرس ' + next.number + ': ' + next.title + '؟';
} else {
var enGreet = 'Welcome back, ' + name + '! Amazing — you have completed all 36 lessons! Let us practise free conversation today.';
var arGreet = 'أهلاً ' + name + '! ما شاء الله أنهيت كل الـ 36 درس! يلا نتمرن محادثة حرة';
}
return { en: enGreet, ar: arGreet, isReturning: true };
}
return { en: null, ar: null, isReturning: false };
}
function getCompletedLessons() {
try {
var data = localStorage.getItem(SE_COMPLETED_KEY);
return data ? JSON.parse(data) : [];
} catch(e) { return []; }
}
function markLessonDone(lessonId) {
var completed = getCompletedLessons();
if (completed.indexOf(lessonId) === -1) {
completed.push(lessonId);
try { localStorage.setItem(SE_COMPLETED_KEY, JSON.stringify(completed)); } catch(e) {}
fireConfetti();
if (typeof addXP === 'function') addXP(500);
}
var el = document.getElementById(lessonId);
if (el) el.classList.add('lesson-done');
saveStreak();
updateProgressDash();
if (typeof checkBadgeUnlocks === 'function') checkBadgeUnlocks();
}
function fireConfetti() {
var container = document.createElement('div');
container.className = 'se-confetti-container';
document.body.appendChild(container);
var colors = ['#b794f4', '#e0b6ff', '#9d4edd', '#f1d2ff', '#c9a8f0', '#6d11ad', '#a5e7ff'];
var shapes = ['●', '◆', '★', '■', '▲'];
for (var i = 0; i < 30; i++) {
var particle = document.createElement('span');
particle.className = 'se-confetti-particle';
particle.textContent = shapes[Math.floor(Math.random() * shapes.length)];
particle.style.left = (10 + Math.random() * 80) + '%';
particle.style.color = colors[Math.floor(Math.random() * colors.length)];
particle.style.animationDuration = (1 + Math.random() * 1) + 's';
particle.style.animationDelay = (Math.random() * 0.4) + 's';
particle.style.fontSize = (8 + Math.random() * 14) + 'px';
container.appendChild(particle);
}
setTimeout(function() { container.remove(); }, 2000);
}
function restoreCompletedLessons() {
var completed = getCompletedLessons();
completed.forEach(function(id) {
var el = document.getElementById(id);
if (el) el.classList.add('lesson-done');
});
updateProgressDash();
var xpEl = document.getElementById('xp-counter-value');
if (xpEl && typeof getXP === 'function') xpEl.textContent = getXP().toLocaleString('en-US');
if (typeof checkBadgeUnlocks === 'function') checkBadgeUnlocks();
}
function updateProgressDash() {
var completed = getCompletedLessons();
var count = completed.length;
var pct = Math.round((count / 36) * 100);
var navTextEl = document.getElementById('nav-pd-text');
var streakEl = document.getElementById('se-pd-streak-text');
if (navTextEl) navTextEl.innerHTML = '<svg class="ic" style="font-size:16px;vertical-align:middle;color:#38bdf8;"><use href="#ic-bar-chart"/></svg> تقدمك: ' + pct + '% (' + count + '/36)';
if (streakEl) {
var streak = getStreak();
var flameIcon = '<svg class="ic se-flame-icon" style="font-size:13px;vertical-align:middle;color:#fb923c;"><use href="#ic-flame"/></svg> ';
if (count === 0) {
streakEl.textContent = 'ابدأ أول درس!';
} else if (count === 36) {
streakEl.innerHTML = '🏆 أنهيت كل الدروس! ' + flameIcon + streak + ' يوم متواصل';
} else if (streak > 0) {
streakEl.innerHTML = flameIcon + streak + ' يوم متواصل — واصل التعلم!';
} else {
streakEl.textContent = 'واصل التعلم!';
}
}

// Update current lesson pill in dashboard header
var next = getNextLesson();
var currentPillText = document.getElementById('current-lesson-text');
if (currentPillText) {
if (next) {
currentPillText.textContent = 'الدرس ' + next.number;
} else {
currentPillText.textContent = 'مراجعة شاملة';
}
}

// Calculate & update Month 1, 2, 3 progress badges
var m1Done = 0, m2Done = 0, m3Done = 0;
completed.forEach(function(id) {
var n = parseInt(id.replace('lesson-', ''), 10);
if (n >= 1 && n <= 12) m1Done++;
else if (n >= 13 && n <= 24) m2Done++;
else if (n >= 25 && n <= 36) m3Done++;
});
var z1Badge = document.getElementById('zone-1-progress');
var z2Badge = document.getElementById('zone-2-progress');
var z3Badge = document.getElementById('zone-3-progress');
if (z1Badge) z1Badge.textContent = m1Done + '/12 مكتمل';
if (z2Badge) z2Badge.textContent = m2Done + '/12 مكتمل';
if (z3Badge) z3Badge.textContent = m3Done + '/12 مكتمل';

// Highlight next uncompleted lesson card in the DOM
document.querySelectorAll('.lesson-card.is-current-lesson').forEach(function(c) {
c.classList.remove('is-current-lesson');
});
if (next) {
var curCard = document.getElementById(next.id);
if (curCard) curCard.classList.add('is-current-lesson');
}
}

window.toggleMobileNav = function() {
var menu = document.getElementById('mobile-nav-menu');
if (menu) menu.classList.toggle('hidden');
};

function updateBreadcrumb(viewState, data) {
var sepLesson = document.getElementById('se-crumb-sep-lesson');
var crumbMonth = document.getElementById('se-crumb-month');
var crumbLesson = document.getElementById('se-crumb-lesson');
if (!crumbMonth || !crumbLesson || !sepLesson) return;

if (viewState === 'home') {
crumbMonth.textContent = 'المستوى الشامل (3 أشهر)';
crumbMonth.classList.remove('active');
sepLesson.style.display = 'none';
crumbLesson.style.display = 'none';
} else if (viewState === 'month') {
var mNum = (data && data.month) ? data.month : 1;
var mNames = { '1': 'الشهر الأول (الأساسيات)', '2': 'الشهر الثاني (الجمل والروتين)', '3': 'الشهر الثالث (الطلاقة والمحادثة)' };
crumbMonth.textContent = mNames[String(mNum)] || ('الشهر ' + mNum);
crumbMonth.classList.remove('active');
sepLesson.style.display = 'none';
crumbLesson.style.display = 'none';
} else if (viewState === 'lesson') {
var mNum = (data && data.month) ? data.month : 1;
var mNames = { '1': 'الشهر الأول', '2': 'الشهر الثاني', '3': 'الشهر الثالث' };
crumbMonth.textContent = mNames[String(mNum)] || ('الشهر ' + mNum);
crumbMonth.classList.remove('active');
sepLesson.style.display = 'inline';
crumbLesson.style.display = 'inline';
crumbLesson.textContent = (data && data.title) ? data.title : ('الدرس ' + (data && data.number ? data.number : ''));
} else if (viewState === 'quiz') {
var mNum = (data && data.month) ? data.month : 1;
var mNames = { '1': 'الشهر الأول', '2': 'الشهر الثاني', '3': 'الشهر الثالث' };
crumbMonth.textContent = mNames[String(mNum)] || ('الشهر ' + mNum);
crumbMonth.classList.remove('active');
sepLesson.style.display = 'inline';
crumbLesson.style.display = 'inline';
crumbLesson.textContent = 'اختبار نهاية الشهر ' + mNum;
}
}
window.updateBreadcrumb = updateBreadcrumb;

window.jumpToCurrentLesson = function() {
var next = getNextLesson();
var targetId = next ? next.id : 'lesson-01';
var num = next ? next.number : 1;
var zoneId = num <= 12 ? 'zone-1' : (num <= 24 ? 'zone-2' : 'zone-3');

if (!document.body.classList.contains('in-platform')) {
enterPlatform();
}

toggleZone(zoneId);

setTimeout(function() {
var card = document.getElementById(targetId);
if (card) {
document.querySelectorAll('.lesson-card.rm-open').forEach(function(c) {
if (c !== card) c.classList.remove('rm-open');
});
card.classList.add('rm-open');
saveProgress(card.id, zoneId);
var title = card.querySelector('.lesson-title-ar') ? card.querySelector('.lesson-title-ar').textContent.trim() : '';
updateBreadcrumb('lesson', { month: zoneId.replace('zone-', ''), number: num, title: title });
setTimeout(function() {
card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}, 150);
}
}, 100);
};
window.continueCurrentLesson = window.jumpToCurrentLesson;
/* ===== Personal Student Error Memory (سجل الأخطاء) =====
   Lightweight, local-only, client-owned: a small array of English words/
   phrases the student has struggled with (per the Smart Patience "attempt
   3" friendly rollover — see server.js). Sent up in every start_session so
   Alexa can be aware of the student's history and warmly revisit ONE at a
   natural pause point. Capped at 12 entries (oldest dropped first) so this
   never grows unbounded or bloats the prompt — this is meant to be a
   short, living "review pool," not a permanent transcript. */
var SE_STRUGGLE_KEY = 'se_struggle_words';
function getStruggleWords() {
try {
var data = localStorage.getItem(SE_STRUGGLE_KEY);
var arr = data ? JSON.parse(data) : [];
return Array.isArray(arr) ? arr : [];
} catch(e) { return []; }
}
function saveStruggleWords(arr) {
try { localStorage.setItem(SE_STRUGGLE_KEY, JSON.stringify(arr)); } catch(e) {}
}
/* Lifetime "words mastered" tracking (Dashboard §B and the Fluency ring
   in §A) — deliberately honest about what this actually measures: this
   app has no per-utterance pronunciation score anywhere (evaluation
   happens entirely inside Gemini's own reasoning during the live call,
   never sent back to the client as a number), so a literal "accent
   accuracy %" would have to be fabricated. Instead, both the dashboard's
   "mastered words" count and its fluency ring are built from this real,
   defensible signal: how many words a student has struggled with, and
   how many of those they later mastered on review (see the "صارت متقنة"
   spoken-marker flow). se_words_ever_struggled only ever grows;
   se_words_mastered_lifetime only increments when removeStruggleWord()
   is called for a word that was ACTUALLY in the active list (i.e. a
   genuine recovery, not a random call). */
function vfGetWordsEverStruggled(){try{return parseInt(localStorage.getItem('se_words_ever_struggled')||'0',10)||0;}catch(e){return 0;}}
function vfGetWordsMasteredLifetime(){try{return parseInt(localStorage.getItem('se_words_mastered_lifetime')||'0',10)||0;}catch(e){return 0;}}
function addStruggleWord(word) {
if (!word) return;
var clean = word.trim();
if (!clean) return;
var arr = getStruggleWords();
// De-dupe case-insensitively — re-adding an already-tracked word just
// moves it to the end (most-recently-struggled) instead of duplicating.
var lower = clean.toLowerCase();
var wasAlreadyTracked = arr.some(function(w) { return w.toLowerCase() === lower; });
arr = arr.filter(function(w) { return w.toLowerCase() !== lower; });
arr.push(clean);
if (arr.length > 12) arr = arr.slice(arr.length - 12); // keep only the most recent 12
saveStruggleWords(arr);
if (!wasAlreadyTracked) {
try{localStorage.setItem('se_words_ever_struggled',String(vfGetWordsEverStruggled()+1));}catch(e){}
}
}
function removeStruggleWord(word) {
if (!word) return;
var lower = word.trim().toLowerCase();
var before = getStruggleWords();
var wasActuallyStruggling = before.some(function(w) { return w.toLowerCase() === lower; });
var arr = before.filter(function(w) { return w.toLowerCase() !== lower; });
saveStruggleWords(arr);
if (wasActuallyStruggling) {
try{localStorage.setItem('se_words_mastered_lifetime',String(vfGetWordsMasteredLifetime()+1));}catch(e){}
}
}
/* ===== Per-user local snapshot (syncDashboardData) =====
   Deliberately ADDITIVE, not a replacement for the ~37 existing flat
   localStorage.getItem/setItem call sites scattered across this file
   (XP, streak, completed lessons, badges, struggle words, scenario
   sessions, lifetime voice seconds, etc.) — those stay exactly as they
   are. Retrofitting every one of them to read/write a per-user-scoped
   key would be a large, high-risk rewrite touching dozens of call
   sites, and this app already has a real, working cross-device sync
   mechanism via Supabase (seSyncProgressToCloud()/
   seFetchAndMergeCloudProgress(), wired to onAuthStateChange below) —
   building a second, parallel user-scoping system on top of localStorage
   risks becoming a second, INCONSISTENT source of truth alongside that
   one, rather than a real improvement.
   What this DOES provide, safely: a single, well-defined snapshot
   key per user (`stylish_progress_<userId>`) that captures/restores all
   the same metrics the Dashboard displays, for the specific case this
   was actually asked for — reacting to login/logout — without touching
   how any of the underlying flat keys work day-to-day. Useful e.g. for
   multiple people sharing one browser without each necessarily using
   full Supabase accounts. */
var SE_DASHBOARD_METRIC_KEYS = [
  'totalXP', 'se_completed_lessons', 'se_streak', 'se_voice_sessions',
  'se_badges', 'se_struggle_words', 'se_lifetime_voice_seconds',
  'se_words_mastered_lifetime', 'se_words_ever_struggled',
  'se_scenario_sessions', 'se_had_5min_call', 'se_last_position',
];
function syncDashboardData(userId, mode) {
if (!userId) return false;
var snapshotKey = 'stylish_progress_' + userId;
try {
if (mode === 'save') {
var snapshot = {};
SE_DASHBOARD_METRIC_KEYS.forEach(function(k) {
var v = localStorage.getItem(k);
if (v !== null) snapshot[k] = v;
});
localStorage.setItem(snapshotKey, JSON.stringify(snapshot));
return true;
}
if (mode === 'load') {
var raw = localStorage.getItem(snapshotKey);
if (!raw) return false; // no snapshot yet for this user — nothing to restore
var data = JSON.parse(raw);
Object.keys(data).forEach(function(k) {
if (SE_DASHBOARD_METRIC_KEYS.indexOf(k) !== -1) localStorage.setItem(k, data[k]);
});
if (typeof seRenderDashboard === 'function') seRenderDashboard();
if (typeof updateProgressDisplay === 'function') updateProgressDisplay();
return true;
}
} catch (e) { console.error('[syncDashboardData] failed:', e); }
return false;
}
function getXP() {
try {
var v = parseInt(localStorage.getItem('totalXP') || '0', 10);
return isNaN(v) ? 0 : v;
} catch(e) { return 0; }
}
function saveXP(v) {
try { localStorage.setItem('totalXP', String(v)); } catch(e) {}
}
/* Two-step, one-time-each migration into the single unified `totalXP` key
   (the explicitly-requested storage key name). Step 1 (unchanged from
   before): scale any pre-existing balance under the old `se_xp` key by
   50x, exactly as already applied to earlier users, so nobody's history
   is silently lost or double-scaled. Step 2 (new): copy whatever `se_xp`
   now holds into `totalXP` exactly once, then `getXP()`/`saveXP()` only
   ever read/write `totalXP` from this point on — `se_xp` is never written
   to again after this. */
(function migrateXpToHighValueEconomy(){
try {
if (localStorage.getItem('se_xp_migrated_v2') === '1') return;
var old = parseInt(localStorage.getItem('se_xp') || '0', 10);
if (old > 0) localStorage.setItem('se_xp', String(old * 50));
localStorage.setItem('se_xp_migrated_v2', '1');
} catch(e) {}
})();
(function migrateXpKeyToTotalXP(){
try {
if (localStorage.getItem('totalXP_migrated_v3') === '1') return;
var legacyVal = parseInt(localStorage.getItem('se_xp') || '0', 10);
if (!isNaN(legacyVal) && legacyVal > 0 && getXP() === 0) {
saveXP(legacyVal);
}
localStorage.setItem('totalXP_migrated_v3', '1');
} catch(e) {}
})();
/* Awards XP, persists it, animates the header counter counting up smoothly
   (requestAnimationFrame, ~700ms), and checks whether any achievement
   badge newly unlocked as a result. No Supabase in this project (confirmed
   — everything here is plain localStorage), so that's the full persistence
   layer. */
function addXP(amount) {
var oldVal = getXP();
var newVal = oldVal + amount;
/* The actual saved value is the source of truth and must never be lost
   or skipped, no matter what happens below — saveXP() runs first, on its
   own, before any visual/badge side effect that could theoretically
   throw. */
saveXP(newVal);
/* Visual counter update and badge-unlock check are both wrapped
   independently: if either throws for any reason (a missing DOM element,
   a bad badge check), it must NEVER propagate up and abort whatever
   *caller* code runs after addXP() — e.g. markLessonDone()'s confetti,
   or the quiz-correct-answer handler's own follow-up UI — which would
   otherwise look exactly like "XP isn't updating" even though the value
   above was already saved correctly. */
try { vfAnimateXpCounter(oldVal, newVal); } catch(e) { console.error('[addXP] counter animation failed (XP still saved):', e); }
try { if (typeof checkBadgeUnlocks === 'function') checkBadgeUnlocks(); } catch(e) { console.error('[addXP] badge check failed (XP still saved):', e); }
/* Cloud dual-write: fire-and-forget, never awaited, never blocking this
   function's return — localStorage above already has the real, final
   value regardless of whether this succeeds. */
try { if (typeof seSyncProgressToCloud === 'function') seSyncProgressToCloud(); } catch(e) {}
return newVal;
}
function vfAnimateXpCounter(from, to) {
var el = document.getElementById('xp-counter-value');
if (!el) return;
var duration = 700;
var startTime = null;
function step(ts) {
if (!startTime) startTime = ts;
var progress = Math.min(1, (ts - startTime) / duration);
var eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
var current = Math.round(from + (to - from) * eased);
el.textContent = current.toLocaleString('en-US');
if (progress < 1) requestAnimationFrame(step);
}
requestAnimationFrame(step);
var pill = document.getElementById('xp-counter-pill');
if (pill) {
pill.classList.add('xp-pill-pulse');
setTimeout(function() { pill.classList.remove('xp-pill-pulse'); }, 500);
}
}

/* ===== Achievement Badges System ===== */
function getVoiceSessionCount() {
try { return parseInt(localStorage.getItem('se_voice_sessions') || '0', 10) || 0; } catch(e) { return 0; }
}
function incrementVoiceSessionCount() {
var v = getVoiceSessionCount() + 1;
try { localStorage.setItem('se_voice_sessions', String(v)); } catch(e) {}
if (typeof checkBadgeUnlocks === 'function') checkBadgeUnlocks();
return v;
}
/* Per-scenario session counts, stored as one object (not one localStorage
   key per scenario) — {coffee:2, hotel:1, ...}. Used by the scenario-
   mastery badges (Dashboard §D) and the curriculum/analytics dashboard. */
function getScenarioSessions() {
try { return JSON.parse(localStorage.getItem('se_scenario_sessions') || '{}'); } catch(e) { return {}; }
}
function vfIncrementScenarioSession(scenario) {
if (!scenario || scenario === 'free') return;
var counts = getScenarioSessions();
counts[scenario] = (counts[scenario] || 0) + 1;
try { localStorage.setItem('se_scenario_sessions', JSON.stringify(counts)); } catch(e) {}
if (typeof checkBadgeUnlocks === 'function') checkBadgeUnlocks();
}
function getUnlockedBadges() {
try { return JSON.parse(localStorage.getItem('se_badges') || '[]'); } catch(e) { return []; }
}
function saveUnlockedBadges(arr) {
try { localStorage.setItem('se_badges', JSON.stringify(arr)); } catch(e) {}
}

var BADGE_DEFS = [
{ id: 'first_step', icon: '<svg class="ic"><use href="#ic-flag"/></svg>', name: 'أول خطوة', desc: 'أكمل الدرس الأول', check: function(){ return getCompletedLessons().indexOf('lesson-01') !== -1; } },
{ id: 'week_streak', icon: '<svg class="ic"><use href="#ic-flame"/></svg>', name: 'درع الالتزام الأسبوعي', desc: 'تتابع 7 أيام متواصلة', check: function(){ return getStreak() >= 7; } },
{ id: 'voice_champion', icon: '<svg class="ic"><use href="#ic-mic"/></svg>', name: 'بطل المحادثة', desc: 'أكمل 5 محادثات صوتية', check: function(){ return getVoiceSessionCount() >= 5; } },
{ id: 'voice_courage', icon: '<svg class="ic"><use href="#ic-mic"/></svg>', name: 'وسام الشجاعة الصوتية', desc: 'أكمل مكالمة واحدة لمدة 5 دقائق متواصلة', check: function(){ try{return localStorage.getItem('se_had_5min_call')==='1';}catch(e){return false;} } },
{ id: 'coffee_barista', icon: '<svg class="ic"><use href="#ic-coffee"/></svg>', name: 'وسام باريستا المحترف', desc: 'أكمل 3 محادثات في سيناريو المقهى', check: function(){ var c=getScenarioSessions(); return (c.coffee||0) >= 3; } },
{ id: 'airport_traveler', icon: '<svg class="ic"><use href="#ic-plane"/></svg>', name: 'وسام المسافر الواثق', desc: 'أكمل 3 محادثات في سيناريو المطار', check: function(){ var c=getScenarioSessions(); return (c.airport||0) >= 3; } },
{ id: 'month_king', icon: '<svg class="ic"><use href="#ic-crown"/></svg>', name: 'ملك الأشهر', desc: 'أنهِ الشهر الأول كاملاً', check: function(){
var done = getCompletedLessons();
for (var i = 1; i <= 12; i++) { if (done.indexOf('lesson-' + String(i).padStart(2,'0')) === -1) return false; }
return true;
} },
{ id: 'graduate', icon: '<svg class="ic"><use href="#ic-graduation-cap"/></svg>', name: 'خريج Stylish', desc: 'أكمل الدروس الـ36 كاملة', check: function(){ return getCompletedLessons().length >= 36; } },
];

/* Called after any progress-changing event (lesson completion, streak
   update, voice session end) — checks all 5 badges, unlocks any newly
   earned one, persists it, and shows a brief unlock toast. Idempotent:
   re-checking an already-unlocked badge does nothing. */
function checkBadgeUnlocks() {
var unlocked = getUnlockedBadges();
var changed = false;
BADGE_DEFS.forEach(function(b) {
if (unlocked.indexOf(b.id) !== -1) return;
try {
if (b.check()) {
unlocked.push(b.id);
changed = true;
vfShowBadgeToast(b);
}
} catch(e) {}
});
if (changed) {
saveUnlockedBadges(unlocked);
/* Cloud dual-write here too (not just in addXP()) — a badge can unlock
   from streak/voice-session call sites that don't go through addXP() at
   all, so this is the one chokepoint that actually covers every path. */
try { if (typeof seSyncProgressToCloud === 'function') seSyncProgressToCloud(); } catch(e) {}
}
vfRenderBadgesModal();
}

function vfShowBadgeToast(badge) {
var toast = document.createElement('div');
toast.className = 'badge-toast';
toast.innerHTML = '<span class="badge-toast-icon">' + badge.icon + '</span><div><strong>شارة جديدة!</strong><br>' + badge.name + '</div>';
document.body.appendChild(toast);
requestAnimationFrame(function() { toast.classList.add('show'); });
setTimeout(function() {
toast.classList.remove('show');
setTimeout(function() { toast.remove(); }, 400);
}, 3500);
}

function vfRenderBadgesModal() {
var grid = document.getElementById('badges-grid');
if (!grid) return;
var unlocked = getUnlockedBadges();
grid.innerHTML = '';
BADGE_DEFS.forEach(function(b) {
var isUnlocked = unlocked.indexOf(b.id) !== -1;
var card = document.createElement('div');
card.className = 'badge-card' + (isUnlocked ? ' badge-unlocked' : ' badge-locked');
card.innerHTML = '<div class="badge-icon">' + b.icon + '</div><div class="badge-name">' + b.name + '</div><div class="badge-desc">' + b.desc + '</div>';
grid.appendChild(card);
});
}

/* ===== Full Student Dashboard rendering =====
   Every number here comes from real localStorage-backed data — nothing
   is fabricated. Level tiers are based on total XP (documented max
   theoretical XP across the whole 3-month curriculum is 38,250 — see
   CLAUDE.md — so these thresholds are calibrated against that range).
   The "Fluency Ring" is explicitly a mastery-RECOVERY-rate proxy
   (words mastered on review ÷ words ever struggled), not a literal
   measured pronunciation-accuracy percentage — this app has no
   per-utterance scoring signal anywhere to build a true accuracy score
   from (evaluation happens entirely inside Gemini's own reasoning
   during the live call, never sent back as a number). */
var SE_LEVEL_TIERS = [
{ min: 0, name: 'المبتدئ الطموح' },
{ min: 1000, name: 'المتحدث الواعد' },
{ min: 5000, name: 'المتحدث الواثق' },
{ min: 15000, name: 'المتقن المحترف' },
{ min: 30000, name: 'خبير Stylish English' },
];
function seGetLevelInfo(xp) {
var levelNum = 1, name = SE_LEVEL_TIERS[0].name;
for (var i = 0; i < SE_LEVEL_TIERS.length; i++) {
if (xp >= SE_LEVEL_TIERS[i].min) { levelNum = i + 1; name = SE_LEVEL_TIERS[i].name; }
}
return { level: levelNum, name: name };
}
function seRenderDashboard() {
// A: Hero & Speaking Analytics
var minutesEl = document.getElementById('se-dash-minutes');
var minutesSpoken = Math.floor((typeof vfGetLifetimeVoiceSeconds === 'function' ? vfGetLifetimeVoiceSeconds() : 0) / 60);
if (minutesEl) minutesEl.textContent = minutesSpoken;
var everStruggled = typeof vfGetWordsEverStruggled === 'function' ? vfGetWordsEverStruggled() : 0;
var masteredLifetime = typeof vfGetWordsMasteredLifetime === 'function' ? vfGetWordsMasteredLifetime() : 0;
var masteryPct;
if(minutesSpoken===0&&masteredLifetime===0){
/* Genuinely brand-new student, zero activity — showing "100% mastery"
   here would be actively misleading (they haven't spoken a single word
   yet), even though the underlying math (0/0) would otherwise default
   there. "--" signals "not enough data yet," not a real percentage. */
masteryPct=null;
}else{
masteryPct=everStruggled>0?Math.round((masteredLifetime/everStruggled)*100):100;
}
var pctEl = document.getElementById('se-dash-mastery-pct');
if (pctEl) pctEl.textContent = masteryPct===null ? '--' : masteryPct + '%';
var ringFg = document.getElementById('se-dash-ring-fg');
if (ringFg) {
var circumference = 264; // 2 * PI * r(42), matches the CSS stroke-dasharray
var ringPct = masteryPct===null ? 0 : masteryPct;
ringFg.style.strokeDashoffset = String(circumference - (circumference * ringPct / 100));
}
var xp = typeof getXP === 'function' ? getXP() : 0;
var levelInfo = seGetLevelInfo(xp);
var levelNumEl = document.getElementById('se-dash-level-num');
var levelNameEl = document.getElementById('se-dash-level-name');
if (levelNumEl) levelNumEl.textContent = 'Level ' + levelInfo.level;
if (levelNameEl) levelNameEl.textContent = levelInfo.name;

// B: Mastery & Struggle Words Hub
var masteredNumEl = document.getElementById('se-dash-mastered-num');
if (masteredNumEl) masteredNumEl.textContent = masteredLifetime;
var struggleList = document.getElementById('se-dash-struggle-list');
var struggleEmpty = document.getElementById('se-dash-struggle-empty');
var struggleWords = typeof getStruggleWords === 'function' ? getStruggleWords() : [];
if (struggleList) {
struggleList.innerHTML = '';
if (struggleWords.length === 0) {
if (struggleEmpty) struggleEmpty.style.display = 'block';
} else {
if (struggleEmpty) struggleEmpty.style.display = 'none';
struggleWords.forEach(function(w) {
var item = document.createElement('div');
item.className = 'se-dash-struggle-item';
var safeWord = w.replace(/'/g, "\\'");
item.innerHTML =
'<span class="se-dash-struggle-word">' +
'<span class="se-dash-struggle-play" onclick="speak(\'' + safeWord + '\')" title="استمع للنطق الصحيح">🔊</span>' +
w +
'</span>' +
'<button class="se-dash-struggle-review-btn" onclick="seReviewStruggleWord(\'' + safeWord + '\')">تصفية الكلمة مع Alexa</button>';
struggleList.appendChild(item);
});
}
}

// C: 3-Month Curriculum Progress Map
var monthMap = document.getElementById('se-dash-month-map');
if (monthMap) {
var completed = typeof getCompletedLessons === 'function' ? getCompletedLessons() : [];
monthMap.innerHTML = '';
var months = [
{ label: 'الشهر الأول', start: 1, end: 12, zoneId: 'zone-1' },
{ label: 'الشهر الثاني', start: 13, end: 24, zoneId: 'zone-2' },
{ label: 'الشهر الثالث', start: 25, end: 36, zoneId: 'zone-3' },
];
months.forEach(function(m) {
var count = 0;
for (var i = m.start; i <= m.end; i++) {
if (completed.indexOf('lesson-' + String(i).padStart(2, '0')) !== -1) count++;
}
var total = m.end - m.start + 1;
var pct = Math.round((count / total) * 100);
var storyUnlocked = count === total; // capstone story/exam gate unlocks once every lesson in the month is done
var row = document.createElement('div');
row.className = 'se-dash-month-row';
row.innerHTML =
'<span class="se-dash-month-label">' + m.label + '</span>' +
'<span class="se-dash-month-bar-track"><span class="se-dash-month-bar-fill" style="width:' + pct + '%"></span></span>' +
'<span class="se-dash-month-count">' + count + '/' + total + '</span>' +
'<span class="se-dash-month-story" title="' + (storyUnlocked ? 'القصة الختامية والاختبار مفتوحان' : 'أكمل كل دروس الشهر لفتح القصة الختامية') + '">' + (storyUnlocked ? '🔓' : '🔒') + '</span>';
monthMap.appendChild(row);
});
}

// D: Wall of Achievements & Badges
var badgesWall = document.getElementById('se-dash-badges-wall');
if (badgesWall) {
var unlockedBadges = typeof getUnlockedBadges === 'function' ? getUnlockedBadges() : [];
badgesWall.innerHTML = '';
BADGE_DEFS.forEach(function(b) {
var isUnlocked = unlockedBadges.indexOf(b.id) !== -1;
var tile = document.createElement('div');
tile.className = 'se-dash-badge-tile ' + (isUnlocked ? 'unlocked' : 'locked');
tile.title = b.desc;
tile.innerHTML = '<span class="se-dash-badge-icon">' + b.icon + '</span><span class="se-dash-badge-name">' + b.name + '</span>';
badgesWall.appendChild(tile);
});
}
}
/* "تصفية الكلمة مع Alexa" — starts a focused review call. Doesn't need any
   special server-side plumbing: struggleWords is already sent in every
   start_session payload (see the Personal Student Error Memory system),
   so simply closing the dashboard and starting/opening the voice panel
   already gives Alexa this exact word's context automatically. */
window.seReviewStruggleWord = function(word) {
seCloseDashboard();
if (typeof toggleVoiceFab === 'function' && !window._vfOpen) toggleVoiceFab();
/* Sends an explicit review note for this SPECIFIC word once the session
   connects — previously this button opened a generic session with no
   signal at all about which word (or that this was a review at all),
   relying entirely on Alexa's own initiative to guess from the general
   struggle-word list. Now the server prompt explicitly expects a
   session to "tell you from how the conversation opens" that it's a
   dedicated review — this is what actually sends that signal. Same
   safe retry pattern as vfPracticePhonetic()/vfPracticePhonetic. */
var safeWord = String(word || '').trim();
if (!safeWord) return;
var reviewNote = '[system note: the student explicitly opened a dedicated review session for one specific word/phrase from their personal struggle list: "' + safeWord + '". This IS the appropriate context to engage with reviewing it — warmly bring it up as the focus of this session (e.g. "قبل نكمل، تتذكر كلمة ' + safeWord + '؟ خلنا نجرب ننطقها"), then evaluate normally with the Strict Evaluation System. If correct, say the mastery phrase as usual so it graduates out of the review list.]';
function trySendReview(attemptsLeft) {
if (attemptsLeft <= 0) return;
if (window._vfRec && typeof window._vfSessionReady !== 'undefined' && window._vfSessionReady && typeof window._vfSocket !== 'undefined' && window._vfSocket && window._vfSocket.readyState === WebSocket.OPEN) {
try { window._vfSocket.send(JSON.stringify({ type: 'text', content: reviewNote })); } catch (e) {}
} else {
setTimeout(function () { trySendReview(attemptsLeft - 1); }, 800);
}
}
trySendReview(10); // retry for up to ~8s while the call connects
};
/* "🚀 تدرب الآن مع أليكسا" — smoothly closes the dashboard and opens the
   voice panel, exactly like seReviewStruggleWord() above but with no
   specific struggle word in mind — a general "start practicing" action. */
window.seDashboardStartPractice = function() {
seCloseDashboard();
if (typeof toggleVoiceFab === 'function' && !window._vfOpen) toggleVoiceFab();
};
window.seOpenDashboard = function() {
seRenderDashboard();
var modal = document.getElementById('se-dashboard-modal');
if (modal) {
modal.classList.add('show');
document.body.classList.add('modal-open');
}
};
window.seCloseDashboard = function() {
var modal = document.getElementById('se-dashboard-modal');
if (modal) {
modal.classList.remove('show');
document.body.classList.remove('modal-open');
}
};

/* ===== Phonetic Contrast Drills data + logic =====
   Real minimal pairs for the 3 most-documented Arabic-L1 interference
   sounds (no /p/ or /v/ phoneme in Standard Arabic; θ/ð commonly
   substituted with s/z/t/d). */
var PHONETIC_PAIRS = {
pb: [['Park','Bark'],['Pig','Big'],['Pen','Ben'],['Cap','Cab']],
vf: [['Van','Fan'],['Vine','Fine'],['Vest','Fest'],['Very','Ferry']],
th: [['Think','Sink'],['Thin','Tin'],['Three','Tree'],['They','Day']],
};
var PHONETIC_PRACTICE_NOTE = {
pb: '[system note: the student opened a dedicated P vs B pronunciation drill. For the next few turns, focus specifically on this contrast — pick 2-3 P/B minimal-pair words (e.g. Park/Bark, Pig/Big) and drill them one at a time using the normal Phase Gates and Shadowing technique, giving the same P/B-specific phonetic tip already in your instructions (lips closer together, more air for P) whenever the sound is off.]',
vf: '[system note: the student opened a dedicated V vs F pronunciation drill. For the next few turns, focus specifically on this contrast — pick 2-3 V/F minimal-pair words (e.g. Van/Fan, Vine/Fine) and drill them one at a time using the normal Phase Gates and Shadowing technique, giving a clear phonetic tip for V (upper teeth touch the bottom lip, voiced/buzzing) vs F (same mouth position, unvoiced/no buzzing) whenever the sound is off.]',
th: '[system note: the student opened a dedicated TH pronunciation drill. For the next few turns, focus specifically on this contrast — pick 2-3 TH minimal-pair words (e.g. Think/Sink, Three/Tree) and drill them one at a time using the normal Phase Gates and Shadowing technique, giving a clear phonetic tip (tongue tip lightly between the teeth, not touching the roof of the mouth like T/D or behind the teeth like S/Z) whenever the sound is off.]',
};
function vfRenderPhoneticPairs(){
Object.keys(PHONETIC_PAIRS).forEach(function(cat){
var grid=document.getElementById('phonetic-pairs-'+cat);
if(!grid||grid.children.length)return; // render once
PHONETIC_PAIRS[cat].forEach(function(pair){
var row=document.createElement('div');
row.className='phonetic-pair-row';
pair.forEach(function(word){
var wordBtn=document.createElement('button');
wordBtn.className='phonetic-pair-word';
wordBtn.innerHTML='<span class="phonetic-pair-play">🔊</span>'+word;
wordBtn.onclick=function(){speak(word)};
row.appendChild(wordBtn);
});
grid.appendChild(row);
});
});
}
window.openPhoneticDrills=function(){
vfRenderPhoneticPairs();
var modal=document.getElementById('phonetic-drills-modal');
if(modal){modal.classList.add('show');document.body.classList.add('modal-open');}
};
window.closePhoneticDrills=function(){
var modal=document.getElementById('phonetic-drills-modal');
if(modal){modal.classList.remove('show');document.body.classList.remove('modal-open');}
};
/* "تدرب مع أليكسا" — closes the drill modal and opens/starts the voice
   panel exactly like seReviewStruggleWord()/seDashboardStartPractice()
   already do. Once the session is confirmed ready, sends a targeted
   drill note via the existing vfSendText() — reuses established
   mechanisms end to end, no new WebSocket message type needed. */
window.vfPracticePhonetic=function(category){
closePhoneticDrills();
if(typeof toggleVoiceFab==='function'&&!window._vfOpen)toggleVoiceFab();
var note=PHONETIC_PRACTICE_NOTE[category];
if(!note)return;
function trySend(attemptsLeft){
if(attemptsLeft<=0)return;
/* Defensive existence checks before touching any of these — belt-and-
   suspenders on top of the window-level getters defined earlier, in
   case this function is ever copied somewhere those getters haven't
   run yet. */
if(window._vfRec&&typeof window._vfSessionReady!=='undefined'&&window._vfSessionReady&&typeof window._vfSocket!=='undefined'&&window._vfSocket&&window._vfSocket.readyState===WebSocket.OPEN){
try{window._vfSocket.send(JSON.stringify({type:'text',content:note}));}catch(e){}
}else{
setTimeout(function(){trySend(attemptsLeft-1)},800);
}
}
trySend(10); // retry for up to ~8s while the call connects
};

window.openBadgesModal = function() {
  vfRenderBadgesModal();
  var modal = document.getElementById('badges-modal');
  if (modal) {
    modal.classList.add('show');
    document.body.classList.add('modal-open');
  }
};
window.closeBadgesModal = function() {
  var modal = document.getElementById('badges-modal');
  if (modal) {
    modal.classList.remove('show');
    document.body.classList.remove('modal-open');
  }
};

window.seOpenAuthModal = function() {
  var modal = document.getElementById('se-auth-modal');
  if (!modal) return;
  var signedOutView = document.getElementById('se-auth-signed-out-view');
  var signedInView = document.getElementById('se-auth-signed-in-view');
  var errorBox = document.getElementById('se-auth-error');
  if (errorBox) errorBox.style.display = 'none';
  if (typeof _seCurrentUser !== 'undefined' && _seCurrentUser) {
    if (signedOutView) signedOutView.style.display = 'none';
    if (signedInView) signedInView.style.display = 'block';
    var emailEl = document.getElementById('se-auth-signed-in-email');
    if (emailEl) emailEl.textContent = _seCurrentUser.email;
  } else {
    if (signedOutView) signedOutView.style.display = 'block';
    if (signedInView) signedInView.style.display = 'none';
  }
  modal.classList.add('show');
  document.body.classList.add('modal-open');
};
window.seCloseAuthModal = function() {
  var modal = document.getElementById('se-auth-modal');
  if (modal) {
    modal.classList.remove('show');
    document.body.classList.remove('modal-open');
  }
};
function seShowAuthError(msg) {
var errorBox = document.getElementById('se-auth-error');
if (errorBox) { errorBox.textContent = msg; errorBox.style.display = 'block'; }
}
window.seHandleSignIn = async function() {
var email = (document.getElementById('se-auth-email') || {}).value || '';
var password = (document.getElementById('se-auth-password') || {}).value || '';
if (!email || !password) { seShowAuthError('يرجى إدخال البريد الإلكتروني وكلمة المرور'); return; }
var result = await seSignIn(email, password);
if (result.error) { seShowAuthError(result.error); return; }
window.seOpenAuthModal(); // refresh to the signed-in view
};
window.seHandleSignUp = async function() {
var fullName = (document.getElementById('se-auth-fullname') || {}).value || '';
var email = (document.getElementById('se-auth-email') || {}).value || '';
var password = (document.getElementById('se-auth-password') || {}).value || '';
if (!fullName.trim()) { seShowAuthError('يرجى إدخال الاسم الكامل'); return; }
if (!email || !password) { seShowAuthError('يرجى إدخال البريد الإلكتروني وكلمة المرور'); return; }
/* Audit addition: presence-only email check let obviously-malformed
   addresses ("asd", "a@a") reach Supabase and come back as an opaque
   server-side error. A simple format check (not a full RFC5322 parse —
   deliberately permissive) catches the common typo case with an
   immediate, specific message instead. */
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { seShowAuthError('يرجى إدخال بريد إلكتروني صحيح'); return; }
if (password.length < 6) { seShowAuthError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
var result = await seSignUp(email.trim(), password, fullName.trim());
if (result.error) { seShowAuthError(result.error); return; }
seShowAuthError('تم! تحقق من بريدك الإلكتروني لتفعيل الحساب (إذا كان مطلوبًا)، ثم سجّل دخولك.');
};
window.seHandleSignOut = async function() {
await seSignOut();
window.seCloseAuthModal();
};

/* Apple/Google: one tap, full-page redirect to the provider — the modal
   closing "instantly" here just means we don't leave any stale error/
   loading state visible during the (usually sub-second) redirect kickoff;
   the actual navigation away is what the browser does next. */
window.seHandleOAuth = async function(provider) {
var result = await seSignInWithOAuth(provider);
if (result.error) { seShowAuthError(result.error); return; }
// If we're still here, the browser is about to navigate to the provider.
};
function getStreak() {
try {
var data = localStorage.getItem('se_streak');
if (!data) { saveStreak(); return 1; }
var parsed = JSON.parse(data);
var today = new Date().toDateString();
var lastDay = parsed.lastDay;
if (lastDay === today) return parsed.count;
var yesterday = new Date(Date.now() - 86400000).toDateString();
if (lastDay === yesterday) {
parsed.count++;
parsed.lastDay = today;
localStorage.setItem('se_streak', JSON.stringify(parsed));
return parsed.count;
}
saveStreak();
return 1;
} catch(e) { return 1; }
}
function saveStreak() {
try {
localStorage.setItem('se_streak', JSON.stringify({
count: 1, lastDay: new Date().toDateString()
}));
} catch(e) {}
}
function saveProgress(lessonId, zoneId) {
try {
localStorage.setItem(SE_PROGRESS_KEY, JSON.stringify({
lesson: lessonId,
zone: zoneId,
timestamp: Date.now()
}));
} catch(e) {}
/* Keep Alexa's voice session aware of whichever lesson the student just
   opened, so start_session can include it as lessonId automatically. */
if (typeof vfSetLessonContext === 'function') vfSetLessonContext(lessonId);
}
function getSavedProgress() {
try {
var data = localStorage.getItem(SE_PROGRESS_KEY);
if (!data) return null;
var parsed = JSON.parse(data);
if (Date.now() - parsed.timestamp > 30 * 24 * 60 * 60 * 1000) {
localStorage.removeItem(SE_PROGRESS_KEY);
return null;
}
return parsed;
} catch(e) { return null; }
}
/* Powers the "متابعة الدرس الحالي" button: jumps to whatever lesson the
   student last opened (getSavedProgress(), the same source of truth used
   by the "continue learning" resume modal), falling back to Lesson 1 for a
   brand-new visitor with no saved progress yet. */
function continueCurrentLesson() {
var saved = getSavedProgress();
if (saved && saved.lesson && document.getElementById(saved.lesson)) {
resumeToLesson(saved.lesson, saved.zone);
} else {
resumeToLesson('lesson-01', 'zone-1');
}
}
function resumeToLesson(lessonId, zoneId) {
var zone = document.getElementById(zoneId);
if (zone && !zone.classList.contains('zone-open')) {
document.querySelectorAll('.rm-zone.zone-open').forEach(function(z) {
z.classList.remove('zone-open');
});
zone.classList.add('zone-open');
}
setTimeout(function() {
var lesson = document.getElementById(lessonId);
if (lesson) {
var path = lesson.closest('.rm-path');
if (path) {
path.querySelectorAll('.lesson-card.rm-open').forEach(function(c) {
c.classList.remove('rm-open');
});
}
lesson.classList.add('rm-open');
setTimeout(function() {
lesson.scrollIntoView({ behavior: 'smooth', block: 'start' });
}, 200);
}
}, 400);
}
/* Silent, frictionless auto-resume (no modal, no confirmation prompt):
   on every dashboard entry, if the student has saved progress from within
   the last 30 days (getSavedProgress()'s own expiry window), silently
   open the right month zone and scroll to their last lesson — exactly
   what accepting the old "continue from where you left off?" modal used
   to do, just automatic and non-blocking now. Reuses resumeToLesson()
   unchanged (also still used by the explicit "متابعة الدرس الحالي"
   button's continueCurrentLesson() — don't remove or rename it). A
   brand-new visitor with no saved progress simply sees the dashboard from
   the top, exactly as before. */
function checkSavedProgress() {
var saved = getSavedProgress();
if (!saved || !saved.lesson) return;
if (!document.getElementById(saved.lesson)) return;
resumeToLesson(saved.lesson, saved.zone);
}
document.addEventListener('DOMContentLoaded', function() {
restoreCompletedLessons();
document.querySelectorAll('.lesson-body .quiz-block').forEach(function(quiz) {
if (quiz.previousElementSibling && quiz.previousElementSibling.classList.contains('se-section-divider')) return;
var divider = document.createElement('div');
divider.className = 'se-section-divider';
divider.innerHTML = '<span><svg class="ic" style="font-size:15px"><use href="#ic-notebook-pen"/></svg> اختبر فهمك</span>';
quiz.parentNode.insertBefore(divider, quiz);
});
document.querySelectorAll('.lesson-body .table-wrap').forEach(function(table) {
var prev = table.previousElementSibling;
if (prev && prev.classList.contains('se-section-divider')) return;
if (prev && prev.classList.contains('section-title')) return;
var divider = document.createElement('div');
divider.className = 'se-section-divider';
divider.innerHTML = '<span><svg class="ic" style="font-size:15px"><use href="#ic-clipboard-list"/></svg> أمثلة تطبيقية</span>';
table.parentNode.insertBefore(divider, table);
});
/* Explicit completion trigger: viewing/opening a lesson (see the header
   click handler below) must NEVER by itself count as "completed" — only
   this button, or the AI voice conversation ending for this lesson (see
   vfStop() in the voice engine), marks progress. Injected once for all 36
   lessons here instead of hand-editing each lesson-card's markup. */
document.querySelectorAll('.rm-path .lesson-card').forEach(function(card) {
var body = card.querySelector('.lesson-body');
if (!body || body.querySelector('.se-complete-btn')) return;
var alreadyDone = card.classList.contains('lesson-done');
var btn = document.createElement('button');
btn.type = 'button';
btn.className = 'se-complete-btn' + (alreadyDone ? ' se-complete-btn-done' : '');
btn.innerHTML = alreadyDone ? '<svg class="ic" style="font-size:16px"><use href="#ic-party"/></svg> تم إكمال هذا الدرس' : '<svg class="ic" style="font-size:16px"><use href="#ic-check-circle"/></svg> تم إكمال الدرس';
if (alreadyDone) btn.disabled = true;
btn.addEventListener('click', function(e) {
e.stopPropagation();
markLessonDone(card.id);
btn.textContent = '🎉 تم إكمال هذا الدرس';
btn.classList.add('se-complete-btn-done');
btn.disabled = true;
});
body.appendChild(btn);
});
document.querySelectorAll('.rm-path .lesson-card .lesson-header').forEach(function(header) {
if (!header.querySelector('.rm-toggle')) {
var chevron = document.createElement('span');
chevron.className = 'rm-toggle';
chevron.textContent = '▶';
header.appendChild(chevron);
}
// Real memory-leak fix: this whole block runs every single time
// enterPlatform() -> checkSavedProgress() fires (browser back button,
// direct #curriculum link, the "start learning" button — at least 3
// separate call sites), but these .lesson-header elements are NEVER
// recreated — they persist in the DOM for the entire page session. Without
// this guard, every re-entry into the platform view stacked ANOTHER click
// listener onto the exact same header elements, so a student who
// navigated back and forth a few times would have each lesson-header
// firing its handler multiple times per click — a genuine, measurable,
// progressively worsening memory leak AND CPU cost that compounds with
// normal navigation, not just a theoretical one.
if (header.dataset.rmClickBound === '1') return;
header.dataset.rmClickBound = '1';
header.addEventListener('click', function(e) {
if (e.target.closest('.tts')) return;
var card = header.closest('.lesson-card');
var path = card.closest('.rm-path');
var wasOpen = card.classList.contains('rm-open');
var hadOtherOpen = false;
path.querySelectorAll('.lesson-card.rm-open').forEach(function(c) {
if (c !== card) { c.classList.remove('rm-open'); hadOtherOpen = true; }
});
if (wasOpen) {
card.classList.remove('rm-open');
/* Context-awareness: the student explicitly closed this lesson and is
   back to just browsing the lesson list — Alexa should no longer think
   she's "in" this specific lesson if opened from here. This was the one
   real gap: vfSetLessonContext(lessonId) was already called whenever a
   lesson *opens* (via saveProgress below), but nothing ever cleared it
   back to null on close. */
if (typeof window.vfSetLessonContext === 'function') window.vfSetLessonContext(null);
var zone = card.closest('.rm-zone');
var mNum = zone ? zone.id.replace('zone-', '') : '1';
updateBreadcrumb('month', { month: mNum });
} else {
var delay = hadOtherOpen ? 120 : 0;
setTimeout(function() {
card.classList.add('rm-open');
var zone = card.closest('.rm-zone');
saveProgress(card.id, zone ? zone.id : '');
var mNum = zone ? zone.id.replace('zone-', '') : '1';
var newTitleEl = card.querySelector('.lesson-title-ar');
var newTitle = newTitleEl ? newTitleEl.textContent.trim() : null;
updateBreadcrumb('lesson', { month: mNum, number: card.id.replace('lesson-', ''), title: newTitle });
setTimeout(function() {
card.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
}, 200);
/* Active-session context switching (replaces the earlier forced
   auto-start, which requested the mic and started a billed session on
   every single lesson open — removed per explicit request). Students now
   browse lessons quietly by default; nothing voice-related happens on a
   plain lesson open. The ONLY thing that happens here is: IF a call is
   ALREADY active, Alexa gets told about the new lesson context so she can
   acknowledge the switch naturally and ask if the student wants to review
   it — she does NOT auto-start teaching it, she waits for the student's
   reply. If no call is active, this is a harmless no-op beyond the
   vfSetLessonContext(card.id) that already ran inside saveProgress()
   above (silently ready for whenever a session does start).
   vfNotifyLessonSwitch() itself lives inside the voice-engine IIFE and
   owns the actual _vfSocket/_vfSessionReady checks — those are private
   closures, not window properties, so this wrapper is the only correct
   way to reach them from here. */
if (typeof window.vfNotifyLessonSwitch === 'function') {
window.vfNotifyLessonSwitch(newTitle);
}
}, delay);
}
});
});
});
function smartBack() {
var label = document.getElementById('smart-back-label');
if (document.body.classList.contains('quiz-mode')) {
if (typeof exitQuizMode === 'function') exitQuizMode();
updateBackLabel();
return;
}
if (document.body.classList.contains('month-view')) {
if (typeof exitMonthView === 'function') exitMonthView();
updateBackLabel();
return;
}
if (typeof exitPlatform === 'function') exitPlatform();
}
function updateBackLabel() {
var label = document.getElementById('smart-back-label');
if (!label) return;
if (document.body.classList.contains('month-view')) {
label.textContent = 'العودة للأشهر';
} else {
label.textContent = 'العودة للرئيسية';
}
}
var _allZones = null;
var _monthTitles = {
'zone-1': { title: 'الشهر الأول', sub: 'الأساسيات والانطلاقة — الدروس 01 إلى 12' },
'zone-2': { title: 'الشهر الثاني', sub: 'بناء الجُمَل والروتين اليومي — الدروس 13 إلى 24' },
'zone-3': { title: 'الشهر الثالث', sub: 'الطلاقة والماضي والمستقبل — الدروس 25 إلى 36' }
};
function toggleZone(zoneId) {
window.toggleZone = toggleZone;
window.continueCurrentLesson = continueCurrentLesson;
if (!_allZones) _allZones = document.querySelectorAll('.rm-zone');
var zone = document.getElementById(zoneId);
if (!zone) return;
_allZones.forEach(function(z) {
z.classList.remove('zone-open', 'zone-active');
});
zone.classList.add('zone-active', 'zone-open');
try {
zone.querySelectorAll('.reveal-armed').forEach(function(el) {
el.classList.remove('reveal-armed');
el.classList.add('revealed');
});
} catch(e) {}
document.body.classList.add('month-view');
updateBackLabel();
var mNum = zoneId.replace('zone-', '');
updateBreadcrumb('month', { month: mNum });
var titleEl = document.getElementById('month-view-title');
var meta = _monthTitles[zoneId] || { title: '', sub: '' };
if (titleEl) titleEl.innerHTML = meta.title + '<span class="mvt-sub">' + meta.sub + '</span>';
window.scrollTo({ top: 0, behavior: 'smooth' });
}
function exitMonthView() {
document.body.classList.remove('month-view');
if (!_allZones) _allZones = document.querySelectorAll('.rm-zone');
_allZones.forEach(function(z) {
z.classList.remove('zone-open', 'zone-active');
z.querySelectorAll('.lesson-card.rm-open').forEach(function(c) {
c.classList.remove('rm-open');
});
});
document.querySelectorAll('.rm-gate-content.rm-gate-open').forEach(function(g) {
g.classList.remove('rm-gate-open');
});
updateBackLabel();
updateBreadcrumb('home');
window.scrollTo({ top: 0, behavior: 'smooth' });
}
function exitToMonthOverview() {
exitMonthView();
}
window.exitToMonthOverview = exitToMonthOverview;

var _allGates = null;
var _activeGateId = null;
var _activeGateZone = null;
function toggleGate(id) {
if (!_allGates) _allGates = document.querySelectorAll('.rm-gate-content');
var gate = document.getElementById(id);
if (!gate) return;
_allGates.forEach(function(g) { g.classList.remove('rm-gate-open'); });
_activeGateId = id;
_activeGateZone = gate.closest('.rm-zone');
document.body.classList.add('quiz-mode');
gate.classList.add('rm-gate-open');
if (_activeGateZone) {
_activeGateZone.classList.add('zone-open');
var zoneBody = _activeGateZone.querySelector('.rm-zone-body');
if (zoneBody) {
zoneBody.style.maxHeight = 'none';
zoneBody.style.opacity = '1';
zoneBody.style.overflow = 'visible';
}
var mNum = _activeGateZone.id.replace('zone-', '');
updateBreadcrumb('quiz', { month: mNum });
}
window.scrollTo({ top: 0, behavior: 'smooth' });
}
function exitQuizMode() {
document.body.classList.remove('quiz-mode');
var mNum = _activeGateZone ? _activeGateZone.id.replace('zone-', '') : '1';
if (_activeGateZone) {
var zoneBody = _activeGateZone.querySelector('.rm-zone-body');
if (zoneBody) {
zoneBody.style.maxHeight = '';
zoneBody.style.opacity = '';
zoneBody.style.overflow = '';
}
}
if (_activeGateId) {
var gate = document.getElementById(_activeGateId);
if (gate) gate.classList.remove('rm-gate-open');
}
_activeGateId = null;
_activeGateZone = null;
restoreCompletedLessons();
updateBackLabel();
updateBreadcrumb('month', { month: mNum });
window.scrollTo({ top: 0, behavior: 'smooth' });
}
var _rafTick = false;
var _progressBar = null;
window.addEventListener('scroll', function() {
if (_rafTick) return;
_rafTick = true;
requestAnimationFrame(function() {
if (!_progressBar) _progressBar = document.getElementById('progress-bar');
var scrollTop = window.scrollY;
var docHeight = document.documentElement.scrollHeight - window.innerHeight;
var progress = docHeight > 0 ? scrollTop / docHeight : 0;
_progressBar.style.transform = 'scaleX(' + progress + ')';
_rafTick = false;
});
}, { passive: true });
/* ===== Lightweight synthesized SFX (zero external files) =====
   A tiny, dedicated AudioContext just for UI sound effects — kept
   separate from the voice-call playback context so quiz feedback sounds
   work immediately even when no voice call is active, and never interfere
   with the call's own audio graph (compressor/gain chain, playback queue).
   Both sounds are pure synthesis: a couple of oscillators + a short gain
   envelope, no audio files to download or manage. */
var _vfSfxCtx=null;
function vfEnsureSfxCtx(){
if(!_vfSfxCtx){
try{_vfSfxCtx=new(window.AudioContext||window.webkitAudioContext)();}catch(e){return null}
}
if(_vfSfxCtx.state==='suspended'){_vfSfxCtx.resume().catch(function(){});}
return _vfSfxCtx;
}
function vfPlaySfx(type){
var ctx=vfEnsureSfxCtx();
if(!ctx)return;
var now=ctx.currentTime;
if(type==='correct'){
/* Bright, pleasant two-tone chord (major third, C6+E6) — quick attack,
   gentle decay, ~280ms total. */
[1046.5,1318.5].forEach(function(freq,i){
var osc=ctx.createOscillator();
var gain=ctx.createGain();
osc.type='sine';
osc.frequency.setValueAtTime(freq,now);
var start=now+i*0.03;
gain.gain.setValueAtTime(0,start);
gain.gain.linearRampToValueAtTime(0.18,start+0.015);
gain.gain.exponentialRampToValueAtTime(0.0001,start+0.28);
osc.connect(gain);gain.connect(ctx.destination);
osc.start(start);osc.stop(start+0.3);
});
}else{
/* Subtle, low, damped square-wave thud — short and unobtrusive, not
   harsh or punishing. */
var osc=ctx.createOscillator();
var gain=ctx.createGain();
osc.type='square';
osc.frequency.setValueAtTime(140,now);
osc.frequency.exponentialRampToValueAtTime(90,now+0.15);
gain.gain.setValueAtTime(0.10,now);
gain.gain.exponentialRampToValueAtTime(0.0001,now+0.16);
osc.connect(gain);gain.connect(ctx.destination);
osc.start(now);osc.stop(now+0.18);
}
}

function speak(text) {
if (!window.speechSynthesis || !text) return;
try { window.speechSynthesis.cancel(); } catch(e) {}
var normalized = text.trim();
/* Some devices/voices announce a bare single uppercase letter by spelling
   out "capital X" instead of just the letter's sound (e.g. tapping the
   alphabet tile for "E" says "capital E"). Lowercasing a lone letter avoids
   this quirk everywhere we've tested, while leaving every other case
   (words, phrases, multi-letter text) completely untouched. */
if (/^[A-Za-z]$/.test(normalized)) {
normalized = normalized.toLowerCase();
}
const utterance = new SpeechSynthesisUtterance(normalized);
utterance.lang = 'en-US';
utterance.rate = 0.9;
utterance.pitch = 1.0;
utterance.volume = 1.0;
const voices = window.speechSynthesis.getVoices();
const preferred = voices.find(v =>
(v.name.includes('Samantha') || v.name.includes('Alex') ||
v.name.includes('Google US') || v.name.includes('en-US')) &&
v.lang.startsWith('en')
);
if (preferred) utterance.voice = preferred;
try { window.speechSynthesis.speak(utterance); } catch(e) {}
}
function tokenizeWords(text) {
if (!text.includes('/')) {
return '<span class="tts" onclick="event.stopPropagation();speak(\'' + text.trim().replace(/'/g, "\\'") + '\')">' + text.trim() + '</span>';
}
return text.split('/').map(function(w) {
var word = w.trim();
return '<span class="tts" onclick="event.stopPropagation();speak(\'' + word.replace(/'/g, "\\'") + '\')">' + word + '</span>';
}).join(' <span style="color:var(--text-muted);opacity:0.5;margin:0 2px;">/</span> ');
}
if (window.speechSynthesis) {
window.speechSynthesis.onvoiceschanged = () => {};
}
const alphabetData = [
{ cap:'A', low:'a', name:'إي', word:'Apple', ar:'تفاحة', note:'يُنطق مفتوحاً وممدوداً خفيفاً في الكلمات الثلاثية' },
{ cap:'B', low:'b', name:'بي', word:'Book', ar:'كتاب', note:'يخرج بانفجار هوائي خفيف من الشفتين (صوت مجهور)' },
{ cap:'C', low:'c', name:'سي', word:'Car / City', ar:'سيارة / مدينة', note:'لاحظ معي، هالحرف له صوتين: لو جا بعده a أو o أو u ينطق (كـ) زي Cat 🐱، لكن لو جا بعده e أو i أو y ينطق (سـ) زي City 🏙️' },
{ cap:'D', low:'d', name:'دي', word:'Door', ar:'باب', note:'حرف ساكن قياسي واضح ومستقر' },
{ cap:'E', low:'e', name:'إي', word:'Egg', ar:'بيضة', note:'حرف علة محرك، يمثل الكسرة الخفيفة جداً والخاطفة' },
{ cap:'F', low:'f', name:'إف', word:'Fish', ar:'سمكة', note:'يخرج بالتقاء الأسنان العلوية مع الشفة السفلية' },
{ cap:'G', low:'g', name:'جي', word:'Goat / Page', ar:'ماعز / صفحة', note:'هالحرف له صوتين أيضاً: الأول جيم عادية زي Goat 🐐، والثاني صوت (دج) معطّش لو جا بعده e أو i أو y زي Page 📄' },
{ cap:'H', low:'h', name:'إيتش', word:'House', ar:'منزل', note:'ينطق داخل الكلمات مثل حرف الهاء تماماً في العربية' },
{ cap:'I', low:'i', name:'آي', word:'Ice / Ink', ar:'ثلج / حبر', note:'حرف علة يمثل الكسرة العميقة والشديدة' },
{ cap:'J', low:'j', name:'جي', word:'Juice', ar:'عصير', note:'يُنطق دائماً مع دال خفيفة مدمجة في البداية (دْجِي)' },
{ cap:'K', low:'k', name:'كي', word:'Key', ar:'مفتاح', note:'حرف ساكن يعطي صوت الكاف النقي' },
{ cap:'L', low:'l', name:'إل', word:'Lion', ar:'أسد', note:'ينطق خفيفاً أو مفخماً حسب موقعه (اللام الإنجليزية)' },
{ cap:'M', low:'m', name:'إِم', word:'Moon', ar:'قمر', note:'حرف ساكن يخرج بانطباق الشفتين تماماً' },
{ cap:'N', low:'n', name:'إِن', word:'Net', ar:'شبكة', note:'حرف ساكن غنّي يخرج من الأنف واللسان' },
{ cap:'O', low:'o', name:'أو', word:'Orange', ar:'برتقالة', note:'حرف علة يمثل الضمة الدائرية الواسعة' },
{ cap:'P', low:'p', name:'پي', word:'Pen', ar:'قلم حبر', note:'هذا الحرف ما له مثيل بالعربية — أخرج هواء قوي من شفتيك بدون ما تطلع صوت — زي نفخة هوا خفيفة' },
{ cap:'Q', low:'q', name:'كيو', word:'Queen', ar:'ملكة', note:'يأتي بعده دائماً حرف U في الغالبية العظمى من الكلمات' },
{ cap:'R', low:'r', name:'آر', word:'Red', ar:'أحمر', note:'ينطق دون أن يلمس طرف اللسان سقف الحلق (التفاف اللسان)' },
{ cap:'S', low:'s', name:'إس', word:'Sun', ar:'شمس', note:'صوته الأساسي (سـ) زي السين، بس أحياناً ينقلب صوت (زـ) لو جا بين حرفين علة زي كلمة Rose 🌹' },
{ cap:'T', low:'t', name:'تي', word:'Tea', ar:'شاي', note:'حرف ساكن شديد ومهموس' },
{ cap:'U', low:'u', name:'يو', word:'Umbrella', ar:'مظلة', note:'ينطق أحياناً "آه" مكتومة خفيفة وأحياناً باسمه "يو"' },
{ cap:'V', low:'v', name:'ڤي', word:'Van', ar:'شاحنة صغيرة', note:'صوت الفاء المجهورة' },
{ cap:'W', low:'w', name:'دبل يو', word:'Window', ar:'نافذة', note:'ينطق داخل الكلمات مثل حرف الواو تماماً' },
{ cap:'X', low:'x', name:'إكس', word:'Box', ar:'صندوق', note:'هالحرف خلطة صوتين مع بعض: كاف + سين = (كس) زي Box 📦' },
{ cap:'Y', low:'y', name:'واي', word:'Yellow', ar:'أصفر', note:'ينطق مثل الياء تماماً في بداية الكلمات' },
{ cap:'Z', low:'z', name:'زِد / زي', word:'Zoo', ar:'حديقة حيوان', note:'صوت الزاي المجهور الصافي' }
];
const alphaGrid = document.getElementById('alpha-grid');
if (alphaGrid) {
const gridFrag = document.createDocumentFragment();
alphabetData.forEach(l => {
const tile = document.createElement('div');
tile.className = 'alpha-tile';
tile.onclick = () => speak(l.cap);
tile.innerHTML = `
<span class="letter-big">${l.cap}</span>
<span class="letter-small">${l.low}</span>
<div class="letter-name">${l.name}</div>
<div class="letter-word">${l.word.split('/')[0].trim()}</div>
`;
gridFrag.appendChild(tile);
});
alphaGrid.appendChild(gridFrag);
}
const tbody = document.getElementById('alphabet-tbody');
if (tbody) {
const tbodyFrag = document.createDocumentFragment();
alphabetData.forEach(l => {
const tr = document.createElement('tr');
tr.innerHTML = `
<td class="en-cell" style="text-align:center;cursor:pointer;" onclick="speak('${l.cap}')"><span style="font-size:20px;">${l.cap} ${l.low}</span><br/><small style="font-size:11px;color:var(--text-muted)">${l.name}</small></td>
<td class="ar-cell">${l.name}</td>
<td class="en-cell">${tokenizeWords(l.word)}</td>
<td class="ar-cell">${l.ar}</td>
<td class="ar-cell" style="font-size:13px;">${l.note}</td>
`;
tbodyFrag.appendChild(tr);
});
tbody.appendChild(tbodyFrag);
}
function applyAnswer(container, clickedIdx, correctIdx, answerId, examCallback) {
const allBtns = container.querySelectorAll('.quiz-option');
const clickedBtn = allBtns[clickedIdx];
const wasCorrect = clickedIdx === correctIdx;
if (typeof vfPlaySfx === 'function') vfPlaySfx(wasCorrect ? 'correct' : 'wrong');
if (wasCorrect) {
allBtns.forEach((b, bi) => {
b.classList.add('opt-locked');
b.classList.remove('opt-correct', 'opt-wrong');
if (bi === correctIdx) {
b.classList.add('opt-correct');
const badge = b.querySelector('.opt-badge');
if (badge) badge.innerHTML = '<svg class="ic" style="font-size:1em"><use href="#ic-check-circle"/></svg>';
}
});
const answerEl = document.getElementById(answerId);
if (answerEl) {
if (!answerEl.dataset.feedbackSet) {
const strongEl = answerEl.querySelector('strong');
if (strongEl) {
const originalText = strongEl.textContent.replace(/^✅\s*أحسنت!\s*/, '').replace(/^✅\s*/, '');
strongEl.innerHTML = '<svg class="ic" style="color:#e3b341"><use href="#ic-star"/></svg> كفوووووو! إجابة دقيقة وصحيحة: ' + originalText;
}
answerEl.dataset.feedbackSet = '1';
/* +250 XP for a correct answer, awarded only the first time this
   specific question is answered correctly — retries after a wrong
   attempt still count once they get it right, but re-viewing an
   already-answered question doesn't farm XP repeatedly. */
if (typeof addXP === 'function') addXP(250);
}
answerEl.classList.remove('qa-wrong');
answerEl.classList.add('show');
}
const correctText = allBtns[correctIdx].querySelector('span:first-child').textContent;
speak(correctText);
var lessonCard = container.closest('.lesson-card');
if (lessonCard) {
var zone = lessonCard.closest('.rm-zone');
saveProgress(lessonCard.id, zone ? zone.id : '');
}
} else {
clickedBtn.classList.add('opt-wrong');
const badge = clickedBtn.querySelector('.opt-badge');
if (badge) badge.innerHTML = '<svg class="ic" style="font-size:1em"><use href="#ic-lightbulb"/></svg>';
const answerEl = document.getElementById(answerId);
if (answerEl && !answerEl.dataset.feedbackSet) {
const strongEl = answerEl.querySelector('strong');
if (strongEl) {
const originalText = strongEl.textContent.replace(/^✅\s*أحسنت!\s*/, '').replace(/^✅\s*/, '');
strongEl.innerHTML = '<svg class="ic" style="color:#e3b341"><use href="#ic-coffee"/></svg> محاولة جيدة! ركز معاي في هذا التكنيك البسيط عشان تضمنها المرة الجاية: ' + originalText;
answerEl.classList.add('qa-wrong');
}
answerEl.dataset.feedbackSet = '1';
answerEl.classList.add('show');
}
clickedBtn.classList.add('opt-locked');
if (!container.querySelector('.quiz-retry')) {
var retryMsg = document.createElement('div');
retryMsg.className = 'quiz-retry';
retryMsg.innerHTML = '<svg class="ic" style="font-size:14px"><use href="#ic-refresh"/></svg> <span>حاول مرة ثانية — اختر إجابة أخرى</span>';
container.appendChild(retryMsg);
}
return;
}
if (typeof examCallback === 'function') examCallback(wasCorrect);
}
const quizzes = {
'quiz-01': { options: ['Cold', 'City', 'Cup'], correct: 1, answerId: 'qa-01' },
'quiz-02': { options: ['Sun', 'Top', 'Ten'], correct: 1, answerId: 'qa-02' },
'quiz-03': { options: ['Cat, Bat, Hat', 'Red, Bed, Net', 'Big, Dig, Pig'], correct: 1, answerId: 'qa-03' },
'quiz-05': { options: ['a', 'an', 'the'], correct: 1, answerId: 'qa-05' },
'quiz-06': { options: ['boxs', 'boxes', 'boxies'], correct: 1, answerId: 'qa-06' },
'quiz-04': { options: ['بـه (مثل حرف P)', 'ف (مثل حرف الفاء)', 'هـ (مثل حرف H)'], correct: 1, answerId: 'qa-04' },
'quiz-07': { options: ['He', 'She', 'It'], correct: 2, answerId: 'qa-07' },
'quiz-08': { options: ['am', 'is', 'are'], correct: 2, answerId: 'qa-08' },
'quiz-09': { options: ['They happy.', 'They is happy.', 'They are happy.'], correct: 2, answerId: 'qa-09' },
'quiz-10': { options: ["They not here.", "They isn't here.", "They aren't here."], correct: 2, answerId: 'qa-10' },
'quiz-11': { options: ["No, it isn't.", "No, it aren't.", "No, it not."], correct: 0, answerId: 'qa-11' },
'quiz-12': { options: ['What', 'Where', 'When'], correct: 2, answerId: 'qa-12' },
'quiz-13': { options: ['My wife wake up early.', 'My wife wakes up early.', 'My wife waking up early.'], correct: 1, answerId: 'qa-13' },
'quiz-14': { options: ['I eat breakfast at seven.', 'I eating breakfast at seven.', 'I eats breakfast at seven.'], correct: 0, answerId: 'qa-14' },
'quiz-15': { options: ['How much is this coffee?', 'How many is this coffee?', 'What price this coffee?'], correct: 0, answerId: 'qa-15' },
'quiz-16': { options: ['He drinks always coffee.', 'He always drinks coffee.', 'Always he drinks coffee.'], correct: 1, answerId: 'qa-16' },
'quiz-17': { options: ['He does not drinks coffee.', 'He not drink coffee.', 'He does not drink coffee.'], correct: 2, answerId: 'qa-17' },
'quiz-18': { options: ['His', 'Her', 'She'], correct: 1, answerId: 'qa-18' },
'quiz-19': { options: ['and', 'because', 'but'], correct: 2, answerId: 'qa-19' },
'quiz-20': { options: ['I have a headache and a fever.', 'I has a headache and a fever.', 'I have a headache or a fever.'], correct: 0, answerId: 'qa-20' },
'quiz-21': { options: ['much', 'many', 'some'], correct: 0, answerId: 'qa-21' },
'quiz-22': { options: ['I have a reservation.', 'I have reserve.', 'I am reservation.'], correct: 0, answerId: 'qa-22' },
'quiz-23': { options: ['Help me!', 'You help me now.', 'Could you help me, please?'], correct: 2, answerId: 'qa-23' },

'quiz-24': { options: ['worked', 'working', 'workes'], correct: 0, answerId: 'qa-24' },
'quiz-25': { options: ['goed', 'went', 'goned'], correct: 1, answerId: 'qa-25' },
'quiz-26': { options: ['I am a hard worker and a fast learner.', 'I am hard worker and fast learn.', 'I working hard and learn fast.'], correct: 0, answerId: 'qa-26' },
'quiz-27': { options: ['He did not bought a car.', 'He did not buy a car.', 'He not buy a car.'], correct: 1, answerId: 'qa-27' },
'quiz-28': { options: ['I went to market and buyed food.', 'I goed to market and bought food.', 'I went to the market and bought vegetables.'], correct: 2, answerId: 'qa-28' },
'quiz-29': { options: ['am', 'is', 'will'], correct: 0, answerId: 'qa-29' },
'quiz-30': { options: ['am going to', 'will', 'going'], correct: 1, answerId: 'qa-30' },
'quiz-31': { options: ['They will not come tomorrow.', 'They not will come tomorrow.', 'They do not will come.'], correct: 0, answerId: 'qa-31' },
'quiz-32': { options: ['How much is this?', 'How many this cost?', 'Give me the price.'], correct: 0, answerId: 'qa-32' },
'quiz-33': { options: ['Present Simple', 'Past Simple', 'Future Simple'], correct: 1, answerId: 'qa-33' },
'quiz-34': { options: ['Where is my flight?', 'Which gate is my flight?', 'What is my flight?'], correct: 1, answerId: 'qa-34' },
'quiz-35': { options: ['start', 'starting', 'started'], correct: 2, answerId: 'qa-35' },
'quiz-36': { options: ['I study hard last year, and I continue next year.', 'I studied hard last year, and I will continue next year.', 'I will study hard last year.'], correct: 1, answerId: 'qa-36' }
};
function buildQuiz(qId, data) {
const container = document.getElementById(qId);
if (!container) return;
const labels = ['A', 'B', 'C'];
data.options.forEach((opt, i) => {
const btn = document.createElement('div');
btn.className = 'quiz-option';
btn.innerHTML = `
<span style="direction:ltr">${opt}</span>
<span class="opt-badge" style="font-size:11px;color:var(--text-muted);flex-shrink:0;min-width:20px;text-align:center;">${labels[i]}</span>
`;
btn.addEventListener('click', () => {
if (btn.classList.contains('opt-locked')) return;
applyAnswer(container, i, data.correct, data.answerId, null);
});
container.appendChild(btn);
});
}
Object.entries(quizzes).forEach(([id, data]) => buildQuiz(id, data));
const EXAM_DATA = {
1: {
containerId: 'exam1-body',
questions: [
{ q: 'أيٌّ من الحروف التالية حرف علة (Vowel)؟', opts: ['B', 'E', 'G'], correct: 1 },
{ q: 'كيف يُنطق المقطع PH في Phone؟', opts: ['بـ', 'ف', 'هـ'], correct: 1 },
{ q: 'أيّ ضمير يُستخدم مع "is"؟', opts: ['We', 'They', 'She'], correct: 2 },
{ q: '"Ahmed ____ a student."', opts: ['are', 'am', 'is'], correct: 2 },
{ q: 'اختصار "I am not ready"؟', opts: ["I amn't ready.", "I'm not ready.", "I isn't ready."], correct: 1 },
{ q: 'سؤال عن مكان المطعم؟', opts: ['What is the restaurant?', 'Where is the restaurant?', 'When is the restaurant?'], correct: 1 },
{ q: 'أيّ كلمة فيها C بصوت الكاف؟', opts: ['City', 'Cycle', 'Cat'], correct: 2 },
{ q: 'أيّ جملة تعبّر عن حاجة ضرورية؟', opts: ['I want a new car.', 'I need medicine now.', 'I want to watch a movie.'], correct: 1 },
{ q: '"She is ___ engineer."', opts: ['a', 'an', 'the'], correct: 1 },
{ q: 'ضمير بديل لـ "The Books"؟', opts: ['It', 'He', 'They'], correct: 2 },
{ q: 'أيّ جملة صحيحة نحوياً؟', opts: ['She doctor.', 'She is a doctor.', 'She are a doctor.'], correct: 1 },
{ q: 'سؤال Yes/No لـ "He is a teacher"؟', opts: ['Is he a teacher?', 'Are he a teacher?', 'He is a teacher?'], correct: 0 },
{ q: 'كلمة من عائلة (-at)؟', opts: ['Bed', 'Pin', 'Bat'], correct: 2 },
{ q: 'معنى "We aren\'t ready"؟', opts: ['نحن مستعدون', 'لسنا مستعدين', 'أنتم لستم مستعدين'], correct: 1 },
{ q: 'ما جمع كلمة "child"؟', opts: ['childs', 'childes', 'children'], correct: 2 }
]
},
2: {
containerId: 'exam2-body',
questions: [
{ q: '"He ____ breakfast every morning."', opts: ['eat', 'eats', 'eating'], correct: 1 },
{ q: '"She ____ up at six."', opts: ['wake', 'wakes', 'waking'], correct: 1 },
{ q: '"They ____ to school by bus."', opts: ['goes', 'going', 'go'], correct: 2 },
{ q: 'أيّ أداة ربط للتناقض؟', opts: ['and', 'but', 'because'], correct: 1 },
{ q: '"I like coffee, ____ I do not like tea."', opts: ['and', 'because', 'but'], correct: 2 },
{ q: '"I study hard ____ I want to pass."', opts: ['but', 'because', 'and'], correct: 1 },
{ q: 'نفي "She eats breakfast"؟', opts: ['She does not eats breakfast.', 'She does not eat breakfast.', 'She not eat breakfast.'], correct: 1 },
{ q: '"____ husband works in a hospital." (هي)', opts: ['His', 'Her', 'Their'], correct: 1 },
{ q: 'اربط: "I drink tea" + "I eat bread"', opts: ['I drink tea and eat bread.', 'I drink tea but eat bread.', 'I drink tea because eat bread.'], correct: 0 },
{ q: 'كيف تسأل عن السعر؟', opts: ['How much is this?', 'How many is this?', 'What cost is this?'], correct: 0 },
{ q: 'كيف تطلب قهوة بأدب؟', opts: ['Give me coffee!', 'Can I have a coffee, please?', 'I want coffee now.'], correct: 1 },
{ q: '"Does she eat?" — الجواب المختصر؟', opts: ['Yes, she eat.', 'Yes, she does.', 'Yes, she do.'], correct: 1 },
{ q: 'أيّ ظرف تكرار يعني 0%؟', opts: ['always', 'sometimes', 'never'], correct: 2 },
{ q: '"He always ____ coffee." ← أكمل:', opts: ['drink', 'drinks', 'drinking'], correct: 1 },
{ q: 'كيف تسأل عن الفندق بأدب؟', opts: ['Where hotel?', 'Tell me hotel now.', 'Excuse me, where is the hotel?'], correct: 2 }
]
},
3: {
containerId: 'exam3-body',
questions: [
{ q: 'ما ماضي "go"؟', opts: ['goed', 'went', 'goned'], correct: 1 },
{ q: 'ما ماضي "buy"؟', opts: ['buyed', 'buyd', 'bought'], correct: 2 },
{ q: 'ما ماضي "eat"؟', opts: ['eated', 'ate', 'aten'], correct: 1 },
{ q: '"I ____ for 8 hours yesterday."', opts: ['work', 'worked', 'working'], correct: 1 },
{ q: '"She ____ a new car two days ago."', opts: ['buyed', 'buy', 'bought'], correct: 2 },
{ q: 'نفي "He went to school"؟', opts: ['He did not go to school.', 'He did not went to school.', 'He not went to school.'], correct: 0 },
{ q: '"Did she ____ breakfast?"', opts: ['ate', 'eat', 'eated'], correct: 1 },
{ q: 'أيّ جملة ماضي صحيحة؟', opts: ['We goed to Riyadh.', 'We went to Riyadh.', 'We wented to Riyadh.'], correct: 1 },
{ q: '"I ____ going to travel next summer."', opts: ['is', 'am', 'are'], correct: 1 },
{ q: 'الهاتف يرن — قرار فوري: "I ____ answer it."', opts: ['am going to', 'will', 'going'], correct: 1 },
{ q: 'خطة مسبقة: "She ____ visit her mother tomorrow."', opts: ['will', 'is going to', 'going'], correct: 1 },
{ q: 'نفي "I will travel"؟', opts: ['I will not travel.', 'I not will travel.', 'I do not will travel.'], correct: 0 },
{ q: 'أيّ ظرف زمان للمستقبل؟', opts: ['yesterday', 'last week', 'next month'], correct: 2 },
{ q: '"Three months ago, I ____ learning English."', opts: ['start', 'starting', 'started'], correct: 2 },
{ q: 'أيّ جملة تجمع الماضي والمستقبل؟', opts: ['I study and I will study.', 'I studied last year, and I will continue next year.', 'I will studied hard.'], correct: 1 }
]
}
};
function getScoreMeta(score, total) {
const pct = score / total;
if (pct === 1) return { grade: 'A+', color: '#1F8A57', msg: 'ممتاز جداً! أداء احترافي لا يصدق!' };
if (pct >= 0.87) return { grade: 'A', color: '#2563eb', msg: 'ممتاز! نتيجة رائعة تعكس استيعابك العميق.' };
if (pct >= 0.73) return { grade: 'B', color: '#0ea5a0', msg: 'جيد جداً! راجع ما أخطأت فيه لتصل للقمة.' };
if (pct >= 0.60) return { grade: 'C', color: '#d97706', msg: 'جيد! بعض المفاهيم تحتاج مراجعة. لا تستسلم!' };
if (pct >= 0.40) return { grade: 'D', color: '#e05c5c', msg: 'مقبول. تحتاج لمراجعة شاملة. الممارسة هي المفتاح!' };
return { grade: 'F', color: '#9b1c1c', msg: 'لا تيأس! أعد الدروس ثم حاول مجدداً. أنت قادر!' };
}
function buildExam(monthNum) {
const data = EXAM_DATA[monthNum];
const container = document.getElementById(data.containerId);
if (!container) return;
const QS = data.questions;
const TOTAL = QS.length;
let answered = 0, score = 0;
const examStorageKey = 'se_exam_month_' + monthNum;
let savedState = null;
try {
var rawState = localStorage.getItem(examStorageKey);
if (rawState) savedState = JSON.parse(rawState);
} catch(e) {}

const board = document.createElement('div');
board.className = 'scoreboard-card hidden';
board.innerHTML = `
<div style="font-family:'Tajawal';font-size:13px;font-weight:700;color:var(--text-muted);letter-spacing:1px;margin-bottom:20px;">نتائج اختبار الشهر ${monthNum === 1 ? 'الأول' : monthNum === 2 ? 'الثاني' : 'الثالث'}</div>
<div class="score-donut-wrap"><div class="score-donut"><span class="donut-num">—</span><span class="donut-total">/ ${TOTAL}</span></div></div>
<div class="score-grade">—</div>
<div class="score-message">—</div>
<div class="score-bars"></div>
<button class="btn-retry" onclick="try{localStorage.removeItem('${examStorageKey}');}catch(e){}window.location.reload()">🔄 إعادة الاختبار</button>`;
QS.forEach((q, idx) => {
const block = document.createElement('div');
block.className = 'exam-q-block';
const answerId = `e${monthNum}-qa-${idx}`;
const optsId = `e${monthNum}-opts-${idx}`;
block.innerHTML = `
<div class="exam-q-num">QUESTION ${String(idx+1).padStart(2,'0')} / ${TOTAL}</div>
<div class="exam-q-text">${q.q}</div>
<div class="quiz-options" id="${optsId}"></div>
<div class="quiz-answer" id="${answerId}"><strong><svg class="ic" style="color:#34d399"><use href="#ic-check-circle"/></svg> أحسنت! ${q.opts[q.correct]}</strong></div>`;
container.appendChild(block);
const optsCont = document.getElementById(optsId);
['A','B','C'].forEach((lbl, i) => {
if (i >= q.opts.length) return;
const btn = document.createElement('div');
btn.className = 'quiz-option';
btn.innerHTML = `<span>${q.opts[i]}</span><span class="opt-badge" style="font-size:11px;color:var(--text-muted)">${lbl}</span>`;
btn.addEventListener('click', () => {
if (btn.classList.contains('opt-locked')) return;
const ok = i === q.correct;
answered++; if (ok) score++;
board.dataset['q'+idx] = ok ? '1' : '0';
try {
var curSave = JSON.parse(localStorage.getItem(examStorageKey) || '{}');
curSave.answered = answered;
curSave.score = score;
if (!curSave.answers) curSave.answers = {};
curSave.answers['q'+idx] = { selected: i, ok: ok };
localStorage.setItem(examStorageKey, JSON.stringify(curSave));
} catch(e) {}
applyAnswer(optsCont, i, q.correct, answerId, null);
updateBtn();
});
optsCont.appendChild(btn);
});

// Restore saved answer if present
if (savedState && savedState.answers && savedState.answers['q'+idx]) {
var prevAns = savedState.answers['q'+idx];
answered++;
if (prevAns.ok) score++;
board.dataset['q'+idx] = prevAns.ok ? '1' : '0';
applyAnswer(optsCont, prevAns.selected, q.correct, answerId, null);
}
});
const showBtn = document.createElement('button');
showBtn.className = 'btn-show-score';
showBtn.disabled = true;
showBtn.textContent = `أجب على جميع الأسئلة أولاً (${answered} / ${TOTAL})`;
function updateBtn() {
if (answered >= TOTAL) {
showBtn.disabled = false;
showBtn.textContent = '📊 اعرض نتيجتي';

} else {
showBtn.textContent = `أجب على جميع الأسئلة أولاً (${answered} / ${TOTAL})`;
}
}
updateBtn();
showBtn.addEventListener('click', () => {
if (answered < TOTAL) return;
showBtn.style.display = 'none';
const meta = getScoreMeta(score, TOTAL);
const pct = Math.round((score / TOTAL) * 100);
board.querySelector('.donut-num').textContent = score;
board.querySelector('.donut-num').style.color = meta.color;
board.querySelector('.donut-total').textContent = `/ ${TOTAL}`;
board.querySelector('.score-donut').style.borderColor = meta.color;
board.querySelector('.score-grade').textContent = `${meta.grade} — ${pct}%`;
board.querySelector('.score-grade').style.color = meta.color;
board.querySelector('.score-message').textContent = meta.msg;
const barsWrap = board.querySelector('.score-bars');
barsWrap.innerHTML = '';
QS.forEach((_, i) => {
const ok = board.dataset['q'+i] === '1';
const item = document.createElement('div');
item.className = 'score-bar-item';
item.innerHTML = `<div class="bar-track"><div class="bar-fill" style="height:${ok?100:30}%;background:${ok?'#6d11ad':'#7f1d1d'}"></div></div><div class="bar-label">${i+1}</div>`;
barsWrap.appendChild(item);
});
board.classList.remove('hidden');
board.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
container.appendChild(showBtn);
container.appendChild(board);
var backBtn = document.createElement('button');
backBtn.className = 'btn-back-dashboard';
backBtn.innerHTML = '← العودة إلى المنصة';
backBtn.addEventListener('click', function() { exitQuizMode(); });
container.appendChild(backBtn);
}
buildExam(1);
buildExam(2);
buildExam(3);
/* Fixed, non-adjustable speech rate — calibrated for language learners:
   natural enough to not sound robotic, slightly under native pace (1.0) so
   words stay clear and easy to follow. No longer user-configurable (the
   speed slider UI was removed). */
var _aiVoiceSpeed = 0.95;
var _aiSessionActive = false;
var _aiCorrections = [];
var _aiTurnCount = 0;
function aiTapToSpeak() {
  var btn = document.getElementById('ai-mic-btn');
  if (!_aiSessionActive) {
    _aiSessionActive = true;
    if (btn) {
      btn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
      btn.innerHTML = '<svg class="ic text-xl animate-pulse"><use href="#ic-mic"/></svg> <span>جارِ الاستماع... اضغط للإيقاف</span>';
    }
    updateConnState(true);
    if (!_vfOpen) toggleVoiceFab();
    setTimeout(function() { if (!_vfRec) vfToggleSession(); }, 300);
  } else {
    aiMuteMic();
  }
}

function aiMuteMic() {
  _aiSessionActive = false;
  var btn = document.getElementById('ai-mic-btn');
  if (btn) {
    btn.style.background = '';
    btn.innerHTML = '<svg class="ic text-xl"><use href="#ic-mic"/></svg> <span>اضغط لبدء التحدث</span>';
  }
  updateConnState(false);
  if (_vfRec) vfToggleSession();
}

function updateConnState(active) {
  var dot = document.getElementById('ai-conn-dot');
  var txt = document.getElementById('ai-conn-text');
  var waveStatus = document.getElementById('ai-audio-status');
  var wave = document.getElementById('ai-audio-wave');
  
  if (dot) {
    dot.className = active ? 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping' : 'w-2.5 h-2.5 rounded-full bg-red-500';
  }
  if (txt) {
    txt.textContent = active ? ('متصلة بـ ' + (window.vfTutorName ? window.vfTutorName() : 'Alexa')) : 'غير متصل';
    txt.className = active ? 'text-emerald-300 font-bold text-xs' : 'text-purple-300/60 text-xs';
  }
  if (waveStatus) {
    waveStatus.textContent = active ? 'المعلمة Alexa تستمع إليك الآن...' : 'جاهزة لاستقبال صوتك';
    waveStatus.className = active ? 'text-[11px] text-emerald-300 font-bold text-center animate-pulse' : 'text-[11px] text-purple-200/60 font-medium text-center';
  }
  if (wave) {
    var bars = wave.querySelectorAll('span');
    bars.forEach(function(bar, idx) {
      if (active) {
        bar.style.animation = 'soundWavePulse 0.' + (4 + (idx % 3) * 2) + 's ease-in-out infinite alternate';
        bar.style.willChange = 'transform';
      } else {
        bar.style.animation = 'none';
        bar.style.willChange = 'auto';
      }
    });
  }
}

function updateAccentScore(score) {
  var el = document.getElementById('accent-score');
  var ring = document.getElementById('accent-ring');
  if (el) el.textContent = score + '%';
  if (ring) {
    var maxOffset = 339.29;
    var offset = maxOffset - (maxOffset * score / 100);
    ring.setAttribute('stroke-dashoffset', offset);
    ring.style.stroke = score >= 80 ? '#34d399' : score >= 50 ? '#38bdf8' : '#c084fc';
  }
}

function addCorrection(original, corrected) {
  _aiCorrections.push({ original: original, corrected: corrected });
  var list = document.getElementById('corrections-list');
  if (list) {
    var item = document.createElement('div');
    item.className = 'p-2.5 rounded-xl bg-purple-950/60 border border-purple-500/20 mb-2 flex items-center justify-between text-xs';
    item.innerHTML = '<span class="text-red-400 line-through">' + original + '</span> <svg class="ic text-sm text-purple-400"><use href="#ic-arrow-right"/></svg> <span class="text-emerald-400 font-bold">' + corrected + '</span>';
    list.appendChild(item);
  }
}

function showCorrections() {
  var panel = document.getElementById('corrections-panel');
  if (panel) panel.classList.toggle('hidden');
  if (_aiCorrections.length === 0) {
    var list = document.getElementById('corrections-list');
    if (list) list.innerHTML = '<div class="text-center text-purple-300/40 py-2">لا توجد تصحيحات بعد — تحدث مع Alexa أولاً</div>';
  }
}

var _aiCurrentMode = 'free';
function setAiMode(mode, btn) {
  _aiCurrentMode = mode;
  var group = document.getElementById('ai-mode-toggle-group');
  if (group) {
    var btns = group.querySelectorAll('.ai-mode-btn');
    btns.forEach(function(b) {
      b.classList.remove('active', 'border-cyan-400/50', 'bg-cyan-500/15', 'text-cyan-300', 'shadow-[0_0_15px_rgba(56,189,248,0.2)]');
      b.classList.add('border-white/10', 'bg-white/5', 'text-purple-200/60');
    });
  }
  if (btn) {
    btn.classList.add('active', 'border-cyan-400/50', 'bg-cyan-500/15', 'text-cyan-300', 'shadow-[0_0_15px_rgba(56,189,248,0.2)]');
    btn.classList.remove('border-white/10', 'bg-white/5', 'text-purple-200/60');
  }
}

/* ================================================== */

/* ===== Supabase integration (cloud progress sync + auth) =====
   Defensive by design: every single function here is wrapped so that if
   the SDK failed to load (ad-blocker, offline, corporate network), or the
   project URL/key turns out to be wrong, or a call simply fails, NOTHING
   here can ever throw into calling code or block the UI. localStorage
   remains the one true *synchronous, always-available* source of truth
   for the app's own instant reads (getXP(), getCompletedLessons(), etc.)
   — Supabase is purely an additional, best-effort async sync layer on
   top of it, never a replacement and never a blocking dependency. */
var SE_SUPABASE_URL = 'https://vrbgfwbgnxdsvatoxnrc.supabase.co';
var SE_SUPABASE_ANON_KEY = 'sb_publishable_Iu3_bT1iXvUNeHy0ebhhWA_J_nRrL_a';
var seSupabase = null;
try {
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    seSupabase = window.supabase.createClient(SE_SUPABASE_URL, SE_SUPABASE_ANON_KEY);
  }
} catch (e) { console.error('[Supabase] client init failed:', e); }

var _seCurrentUser = null; // { id, email } or null when signed out/offline

function seIsAvailable() { return !!seSupabase; }

/* ===== Auth state ===== */
async function seCheckAuthOnLoad() {
  if (!seSupabase) return;

  // Gracefully handle & clean any OAuth redirect errors from Google/Supabase
  try {
    var fullUrl = window.location.href;
    if (fullUrl.includes('error=') || fullUrl.includes('error_description=')) {
      var searchParams = new URLSearchParams(window.location.search);
      var hashParams = new URLSearchParams(window.location.hash ? window.location.hash.substring(1) : '');
      var rawErr = searchParams.get('error_description') || hashParams.get('error_description') || searchParams.get('error') || '';
      if (rawErr) {
        var cleanErr = decodeURIComponent(rawErr.replace(/\+/g, ' '));
        if (typeof vfShowDiagBanner === 'function') {
          vfShowDiagBanner('⚠️ تنبيه تسجيل الدخول: ' + cleanErr);
        }
      }
      var cleanUrl = window.location.origin + window.location.pathname + (window.location.hash && !window.location.hash.includes('error') ? window.location.hash : '');
      window.history.replaceState({}, document.title, cleanUrl);
    }
  } catch (e) {}

  try {
    var { data, error } = await seSupabase.auth.getSession();
    if (error) { console.error('[Supabase] getSession failed:', error); return; }
    if (data && data.session && data.session.user) {
      _seCurrentUser = { id: data.session.user.id, email: data.session.user.email, fullName: (data.session.user.user_metadata && data.session.user.user_metadata.full_name) || null };
      seUpdateAuthUI();
      await seFetchAndMergeCloudProgress();
    }
  } catch (e) { console.error('[Supabase] auth check failed (continuing offline):', e); }
  // Keep the UI in sync with any later sign-in/sign-out (e.g. magic link
  // completing in another tab, or session expiry).
  try {
    seSupabase.auth.onAuthStateChange(function(event, session) {
      if (session && session.user) {
        _seCurrentUser = { id: session.user.id, email: session.user.email, fullName: (session.user.user_metadata && session.user.user_metadata.full_name) || null };
        seFetchAndMergeCloudProgress();
      } else {
        _seCurrentUser = null;
      }
      seUpdateAuthUI();
    });
  } catch (e) {}
}

async function seSignUp(email, password, fullName) {
  if (!seSupabase) return { error: 'الخدمة السحابية غير متاحة حالياً' };
  try {
    var { data, error } = await seSupabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: { full_name: fullName }
      }
    });
    if (error) return { error: error.message };
    return { data: data };
  } catch (e) { return { error: 'تعذّر الاتصال بالخادم' }; }
}
async function seSignIn(email, password) {
  if (!seSupabase) return { error: 'الخدمة السحابية غير متاحة حالياً' };
  try {
    var { data, error } = await seSupabase.auth.signInWithPassword({ email: email, password: password });
    if (error) return { error: error.message };
    return { data: data };
  } catch (e) { return { error: 'تعذّر الاتصال بالخادم' }; }
}
/* Apple/Google OAuth — redirect-based flow (signInWithOAuth navigates the
   whole page away to the provider, then back to emailRedirectTo/the
   current URL once done; there is no "instant modal close" step to write
   here because the browser itself is leaving the page — the modal simply
   won't exist anymore once the redirect completes and the page reloads
   signed-in). Requires the provider to be enabled + configured with a
   real Client ID/secret in the Supabase dashboard's Auth > Providers
   settings — this call is correct regardless, but will return a
   provider-not-enabled error until that's done on the Supabase side. */
async function seSignInWithOAuth(provider) {
  if (!seSupabase) return { error: 'الخدمة السحابية غير متاحة حالياً' };
  try {
    var { data, error } = await seSupabase.auth.signInWithOAuth({ provider: provider, options: { redirectTo: window.location.href } });
    if (error) return { error: error.message };
    return { data: data };
  } catch (e) { return { error: 'تعذّر بدء تسجيل الدخول' }; }
}
async function seSignOut() {
  if (!seSupabase) return;
  // Save this user's local snapshot BEFORE clearing _seCurrentUser below,
  // so a later syncDashboardData(userId, 'load') for this same user can
  // restore it (e.g. if another person then uses this same browser).
  try { if (_seCurrentUser && _seCurrentUser.id) syncDashboardData(_seCurrentUser.id, 'save'); } catch(e) {}
  try { await seSupabase.auth.signOut(); } catch (e) {}
  _seCurrentUser = null;
  seUpdateAuthUI();
}

/* ===== Cloud fetch + merge (never destructive — always takes the union/max
   of local and cloud, so switching devices or a partial sync can never
   silently erase progress on either side). ===== */
async function seFetchAndMergeCloudProgress() {
  if (!seSupabase || !_seCurrentUser) return;
  try {
    var { data, error } = await seSupabase
      .from('user_progress')
      .select('xp, completed_lessons, badges, struggle_words')
      .eq('user_id', _seCurrentUser.id)
      .maybeSingle();
    if (error) { console.error('[Supabase] fetch progress failed:', error); return; }
    if (!data) { await seSyncProgressToCloud(); try { syncDashboardData(_seCurrentUser.id, 'save'); } catch(e) {} return; } // first sync for this account: push local up
    // XP: take the higher of local vs cloud.
    try {
      var localXp = (typeof getXP === 'function') ? getXP() : 0;
      var cloudXp = parseInt(data.xp, 10) || 0;
      if (cloudXp > localXp && typeof saveXP === 'function') saveXP(cloudXp);
    } catch (e) {}
    // Completed lessons: union of local + cloud.
    try {
      var localLessons = (typeof getCompletedLessons === 'function') ? getCompletedLessons() : [];
      var cloudLessons = Array.isArray(data.completed_lessons) ? data.completed_lessons : [];
      var mergedLessons = localLessons.slice();
      cloudLessons.forEach(function(id) { if (mergedLessons.indexOf(id) === -1) mergedLessons.push(id); });
      localStorage.setItem(SE_COMPLETED_KEY, JSON.stringify(mergedLessons));
      mergedLessons.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.add('lesson-done');
      });
    } catch (e) {}
    // Badges: union of local + cloud.
    try {
      var localBadges = (typeof getUnlockedBadges === 'function') ? getUnlockedBadges() : [];
      var cloudBadges = Array.isArray(data.badges) ? data.badges : [];
      var mergedBadges = localBadges.slice();
      cloudBadges.forEach(function(id) { if (mergedBadges.indexOf(id) === -1) mergedBadges.push(id); });
      if (typeof saveUnlockedBadges === 'function') saveUnlockedBadges(mergedBadges);
    } catch (e) {}
    // Struggle words ("weak points"): union of local + cloud, same
    // non-destructive pattern — a device switch should never silently
    // lose track of what a student was struggling with.
    try {
      var localStruggle = (typeof getStruggleWords === 'function') ? getStruggleWords() : [];
      var cloudStruggle = Array.isArray(data.struggle_words) ? data.struggle_words : [];
      var mergedStruggle = localStruggle.slice();
      cloudStruggle.forEach(function(w) {
        var lower = String(w).toLowerCase();
        if (!mergedStruggle.some(function(x) { return x.toLowerCase() === lower; })) mergedStruggle.push(w);
      });
      if (typeof saveStruggleWords === 'function') saveStruggleWords(mergedStruggle.slice(-12));
    } catch (e) {}
    if (typeof vfAnimateXpCounter === 'function' && typeof getXP === 'function') {
      vfAnimateXpCounter(0, getXP());
    }
    // Now push the merged result back up so both sides end up identical.
    await seSyncProgressToCloud();
    // Snapshot this now-merged, authoritative state locally per-user —
    // see syncDashboardData()'s comment for why this is additive, not a
    // replacement for the cloud sync above.
    try { syncDashboardData(_seCurrentUser.id, 'save'); } catch(e) {}
  } catch (e) { console.error('[Supabase] merge failed (local progress untouched):', e); }
}

/* Dual-write: called after every local XP/lesson/badge change. Debounced
   with a 400ms trailing timer to prevent rapid bursts of cloud upserts
   during fast quiz answers or badge unlocks. */
var _seCloudSyncTimer = null;
function seSyncProgressToCloud() {
  if (_seCloudSyncTimer) clearTimeout(_seCloudSyncTimer);
  _seCloudSyncTimer = setTimeout(function() {
    _seCloudSyncTimer = null;
    seSyncProgressToCloudImmediate();
  }, 400);
}
async function seSyncProgressToCloudImmediate() {
  if (!seSupabase || !_seCurrentUser) return;
  try {
    var payload = {
      user_id: _seCurrentUser.id,
      xp: (typeof getXP === 'function') ? getXP() : 0,
      completed_lessons: (typeof getCompletedLessons === 'function') ? getCompletedLessons() : [],
      badges: (typeof getUnlockedBadges === 'function') ? getUnlockedBadges() : [],
      // "Weak points" for AI personalization — this was tracked locally
      // (Personal Student Error Memory) but never actually reached the
      // cloud schema before; without this, a student's struggle words
      // wouldn't follow them to a new device the way XP/lessons/badges
      // already do.
      struggle_words: (typeof getStruggleWords === 'function') ? getStruggleWords() : [],
      updated_at: new Date().toISOString(),
    };
    var { error } = await seSupabase.from('user_progress').upsert(payload, { onConflict: 'user_id' });
    if (error) console.error('[Supabase] cloud sync failed (localStorage still has the real data):', error);
  } catch (e) { console.error('[Supabase] cloud sync threw (non-fatal):', e); }
}

function seUpdateAuthUI() {
  try {
    var trigger = document.getElementById('se-auth-trigger');
    var status = document.getElementById('se-auth-status-text');
    if (!trigger) return;
    if (_seCurrentUser) {
      trigger.classList.add('se-auth-signed-in');
      if (status) status.textContent = _seCurrentUser.email;
    } else {
      trigger.classList.remove('se-auth-signed-in');
      if (status) status.textContent = 'تسجيل الدخول';
    }
  } catch (e) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { seCheckAuthOnLoad(); });
} else {
  seCheckAuthOnLoad();
}

/* ================================================== */

(function() {
  function seForceRevealAll() {
    document.querySelectorAll('.reveal-armed, .reveal-init, .reveal-slide-right, .reveal-slide-left, .reveal-scale, .reveal-fade').forEach(function(el) {
      el.classList.remove('reveal-armed');
      el.classList.add('revealed');
    });
  }

  function initSmoothAnimations() {
    try {
      if (!('IntersectionObserver' in window)) {
        seForceRevealAll();
        return;
      }

      // Roadmap zone headers + welcome card join the reveal system FIRST,
      // so a single query below picks up every revealable element.
      document.querySelectorAll('.rm-zone-header, .welcome-card').forEach(function(el) {
        el.classList.add('reveal-init');
      });

      var reveals = document.querySelectorAll('.reveal-init, .reveal-slide-right, .reveal-slide-left, .reveal-scale, .reveal-fade');

      var observerOptions = {
        root: null,
        rootMargin: '0px 0px -40px 0px',
        threshold: 0.1
      };

      var revealObserver = new IntersectionObserver(function(entries, observer) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');

            // Animate stat counters if present inside target
            var counters = entry.target.querySelectorAll ? entry.target.querySelectorAll('.stat-counter') : [];
            if (entry.target.classList.contains('stat-counter')) {
              animateCounter(entry.target);
            } else {
              counters.forEach(function(c) { animateCounter(c); });
            }

            observer.unobserve(entry.target);
          }
        });
      }, observerOptions);

      // Arm (hide) each element ONLY now that the observer exists — this is
      // what guarantees content can never be stuck invisible.
      reveals.forEach(function(el) {
        if (!el.classList.contains('revealed')) el.classList.add('reveal-armed');
        revealObserver.observe(el);
      });

      // Absolute failsafe: if anything is still armed after 4s (observer
      // throttled/killed by the OS), reveal everything.
      setTimeout(function() {
        document.querySelectorAll('.reveal-armed:not(.revealed)').forEach(function(el) {
          var r = el.getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('revealed');
        });
      }, 4000);
    } catch (e) {
      seForceRevealAll();
    }
  }

  function animateCounter(el) {
    if (!el || el.dataset.animated === 'true') return;
    el.dataset.animated = 'true';
    var target = parseInt(el.getAttribute('data-target') || el.textContent, 10);
    if (isNaN(target)) return;
    
    var duration = 1200;
    var startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var easeProgress = 1 - Math.pow(1 - progress, 3);
      var current = Math.floor(easeProgress * target);
      el.textContent = current;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = target;
      }
    }
    requestAnimationFrame(step);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSmoothAnimations);
  } else {
    initSmoothAnimations();
  }
})();
