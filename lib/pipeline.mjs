import fs from 'node:fs';import path from 'node:path';
import {readSettings,endpoint,scrub,ROOT_DIR} from './config.mjs';
import {STAGES,directory,save,send,update,log,invalidate} from './projects.mjs';
import {chatStream,parseScript,parseJSON} from './llm.mjs';import {elevenCharsToWords,alignWords,tokenizeScript} from './timing.mjs';
import {repairStoryboard,TYPES,TEMPLATES} from './storyboard.mjs';import {prepareVoice} from './media.mjs';import {renderProject} from './render.mjs';
const jobs=new Map();
const style=fs.readFileSync(path.join(ROOT_DIR,'references/script-style.md'),'utf8');
const write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2));
const streaming=(p,stage,text)=>send(p,'llm',{stage,text});
const fetchError=async(r,s,label)=>{throw Error(`${label} HTTP ${r.status}: ${scrub((await r.text()).slice(0,500),s)}`);};
async function scriptStage(p,s,signal){
 log(p,'script',`كتابة نص مدته ${p.duration} ثانية، حوالي ${Math.round(p.duration*2.6)} كلمة.`);
 const answer=await chatStream(s,[{role:'system',content:`TASK:SCRIPT\n${style}\nاكتب نصًا علميًا موثوقًا. أخرج فقط TITLE: ثم SCRIPT: ثم SOURCES:. اكتب النص المنطوق دون تعليمات أو عناوين في SCRIPT، وأورد روابط حقيقية إن كنت واثقًا منها؛ لا تختلقها.`},
 {role:'user',content:`الموضوع: ${p.topic}\nالمدة: ${p.duration} ثانية. الهدف حوالي ${Math.round(p.duration*2.6)} كلمة. الجملة «عارف ليه؟» ضرورية.`}],{signal,onText:t=>streaming(p,'script',t)});
 p.script=parseScript(answer);const count=tokenizeScript(p.script.script).length;log(p,'script',`النص جاهز: ${count} كلمة. راجع الدقة والمصادر قبل النشر.`);
}
async function voiceStage(p,s,signal){
 if(!p.script?.script)throw Error('النص غير جاهز.');const dir=directory(p.id);let src;
 if(p.voiceMode==='upload'){
  src=path.join(dir,'upload.bin');if(!fs.existsSync(src))throw Error('ارفع ملف التعليق الصوتي أولًا.');log(p,'voice','تجهيز الملف الصوتي المرفوع.');
 }else{
  const voiceId=p.voiceConfig?.voiceId||s.elevenVoiceId;if(!voiceId)throw Error('اختر صوتًا في الإعدادات، ثم أعد المحاولة.');
  log(p,'voice','طلب صوت ElevenLabs مع توقيت كل حرف.');
  const res=await fetch(endpoint(s.elevenBaseUrl,`text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`),{method:'POST',headers:{'Content-Type':'application/json','xi-api-key':s.elevenApiKey||''},body:JSON.stringify({text:p.script.script,model_id:'eleven_multilingual_v2'}),signal});
  if(!res.ok)await fetchError(res,s,'ElevenLabs');const j=await res.json();if(!j.audio_base64)throw Error('ElevenLabs returned no audio.');
  const timing=j.alignment||j.normalized_alignment;if(!timing)throw Error('ElevenLabs returned no character timings.');
  src=path.join(dir,'voice-original.mp3');fs.writeFileSync(src,Buffer.from(j.audio_base64,'base64'));write(path.join(dir,'tts-timings.json'),timing);
 }
 const prepared=await prepareVoice(src,path.join(dir,'voice.mp3'),p.duration,s,signal,m=>log(p,'voice',m));
 p.voice={mode:p.voiceMode,voiceId:p.voiceMode==='tts'?(p.voiceConfig?.voiceId||s.elevenVoiceId):'',speed:prepared.speed,duration:prepared.duration};
 log(p,'voice',`الصوت جاهز (${prepared.duration.toFixed(2)} ث).`);
}
async function timingStage(p,s,signal){
 const dir=directory(p.id);let raw;
 if(p.voiceMode==='tts'){
  const chars=JSON.parse(fs.readFileSync(path.join(dir,'tts-timings.json'),'utf8'));raw=elevenCharsToWords(chars).map(w=>({...w,start:w.start/p.voice.speed,end:w.end/p.voice.speed}));
  log(p,'timing','تحويل توقيت الحروف إلى كلمات ومحاذاته بالنص.');
 }else{
  log(p,'timing','إرسال الصوت المرفوع إلى Deepgram لتوقيت الكلمات (nova-3 / ar).');
  const response=await fetch(`${endpoint(s.deepgramBaseUrl,'listen')}?model=nova-3&language=ar&punctuate=true`,{method:'POST',headers:{Authorization:`Token ${s.deepgramApiKey||''}`,'Content-Type':'audio/mpeg'},body:fs.readFileSync(path.join(dir,'voice.mp3')),signal});
  if(!response.ok)await fetchError(response,s,'Deepgram');const j=await response.json();write(path.join(dir,'deepgram.json'),j);
  raw=(j.results?.channels?.[0]?.alternatives?.[0]?.words||[]).map(w=>({word:w.punctuated_word||w.word,start:w.start,end:w.end,confidence:w.confidence}));
 }
 p.words=alignWords(p.script.script,raw,p.duration);if(p.voiceMode==='tts'&&p.voice.speed>1.001){p.words=p.words.map(w=>({...w,weak:true,retimed:true}));log(p,'timing','بسبب تسريع الصوت، توقيتات الكلمات تقريبية وتحتاج مراجعة.');}write(path.join(dir,'words.json'),p.words);
 const weak=p.words.filter(w=>w.weak).length;log(p,'timing',`تمت محاذاة ${p.words.length} كلمة؛ ${weak} تحتاج مراجعة.`);
}
async function storyboardStage(p,s,signal){
 if(!p.words?.length)throw Error('توقيت الكلمات غير جاهز.');
 const wordList=p.words.map(w=>`${w.index}:${w.text}`).join(' ');
 const specs=`TASK:STORYBOARD\nCreate a visual plan for a 9:16 Egyptian Arabic science reel. Return only valid JSON, no markdown: {"scenes":[{"type":"intro|question|concept|process|compare|stat|recap","at":0,"template":"body|zoom|flow|cycle|timeline|chart|layers|cards|meter","title":"عنوان قصير","subtitle":"شرح مصري قصير","icons":["heart","cell"],"items":["قصير","قصير"],"value":null}],"accents":[[wordIndex,"accent|blue|success|underline"]]}. at is a zero-based WORD INDEX, never seconds. The first scene must be intro at 0. Use 3–7 meaningful scenes based on word onsets; no three consecutive scenes share a template. Choose English simple noun icon names. Use visual templates appropriate to the idea, vary the compositions. Use a numeric value only for genuine sourced statistics; otherwise use null and draw a decorative gauge. Never invent statistics. The script is: ${p.script.script}\nSources (unverified): ${p.script.sources}\nWords: ${wordList}.`;
 log(p,'storyboard','اقتراح المشاهد وتوزيع القوالب على الكلمات.');
 const first=parseJSON(await chatStream(s,[{role:'system',content:specs},{role:'user',content:`الموضوع: ${p.topic}. المدة: ${p.duration} ثانية.`}],{signal,onText:t=>streaming(p,'storyboard',t)}));
 const initial=repairStoryboard(first,p.words.length);log(p,'storyboard','مراجعة ذاتية ثانية لتحسين اختيارات المشاهد.');
 let reviewed=initial;
 try{
  const answer=await chatStream(s,[{role:'system',content:`TASK:SELF_REVIEW\nReview this science storyboard for weak or repetitive scene choices. Improve scene-template fit, maintain exactly correct word indices, and do not invent facts. Allowed types: ${TYPES.join(', ')}. Allowed templates: ${TEMPLATES.join(', ')}. Return the entire improved JSON object only. Script: ${p.script.script}\nSources (unverified): ${p.script.sources}\nIndexed words: ${wordList}`},{role:'user',content:JSON.stringify(initial)}],{signal,onText:t=>streaming(p,'storyboard',t)});
  const candidate=repairStoryboard(parseJSON(answer),p.words.length);if(candidate.scenes.length<Math.max(1,Math.ceil(initial.scenes.length/2))){log(p,'storyboard','المراجعة الثانية حذفت مشاهد كثيرة؛ احتُفظ بالاقتراح الأول.');}else reviewed=candidate;
 }catch(e){if(signal.aborted)throw e;log(p,'storyboard','تعذرت المراجعة الثانية؛ احتُفظ بالنسخة الأولى بعد إصلاحها. '+scrub(e.message,s));}
 p.storyboard=reviewed;write(path.join(directory(p.id),'storyboard.json'),reviewed);log(p,'storyboard',`${reviewed.scenes.length} مشاهد جاهزة${reviewed.warnings.length?'؛ أُصلحت بعض الاختيارات':''}.`);
}
async function renderStage(p,s,signal){
 if(!p.words?.length||!p.storyboard?.scenes?.length)throw Error('المشاهد أو التوقيت غير جاهزين.');
 const result=await renderProject(p,directory(p.id),s,{signal,log:m=>log(p,'render',m),emit:(e,d)=>send(p,e,d)});p.render={file:'video.mp4',width:1080,height:1920,fps:30,duration:p.duration,lufs:result.loudness};
}
const handlers={script:scriptStage,voice:voiceStage,timing:timingStage,storyboard:storyboardStage,render:renderStage};
export function running(p){return jobs.has(p.id);}
export function start(p){
 if(jobs.has(p.id))throw Error('المشروع قيد التشغيل بالفعل.');const controller=new AbortController();const job={controller,promise:null};jobs.set(p.id,job);
 job.promise=(async()=>{
  for(const stage of STAGES){
   if(controller.signal.aborted)break;const state=p.stages[stage];if(state.status==='done')continue;if(state.status==='review')break;
   state.status='running';delete state.error;update(p);
   try{await handlers[stage](p,readSettings(),controller.signal);if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');state.status=state.auto?'done':'review';update(p);if(state.status==='review'){log(p,stage,'بانتظار موافقتك للمتابعة.');break;}}
   catch(e){if(controller.signal.aborted||e.name==='AbortError'){state.status='idle';delete state.error;log(p,stage,'تم إلغاء التشغيل.');}else{state.status='error';state.error=scrub(e.message);log(p,stage,`خطأ: ${state.error}`);}update(p);break;}
  }
 })().finally(()=>{jobs.delete(p.id);});return job.promise;
}
export async function cancel(p){const j=jobs.get(p.id);if(j){j.controller.abort();await j.promise;}return p;}
export async function rerun(p,stage){if(!STAGES.includes(stage))throw Error('مرحلة غير معروفة.');await cancel(p);invalidate(p,stage);update(p);start(p);}
export function approve(p,stage){if(jobs.has(p.id))throw Error('المشروع قيد التشغيل.');if(!STAGES.includes(stage)||p.stages[stage].status!=='review')throw Error('هذه المرحلة ليست بانتظار الموافقة.');p.stages[stage].status='done';log(p,stage,'تمت الموافقة.');update(p);start(p);}
export async function edit(p,stage,input){
 if(!STAGES.includes(stage))throw Error('مرحلة غير معروفة.');await cancel(p);
 if(stage==='script'){
  const title=String(input.title||'').trim().slice(0,160),script=String(input.script||'').trim().slice(0,12000),sources=String(input.sources||'').trim().slice(0,4000);
  if(!script||!title)throw Error('العنوان والنص مطلوبان.');p.script={title,script,sources};invalidate(p,'script',{include:false});p.stages.script.status='review';
 }else if(stage==='voice'){
  if(input.voiceMode==='tts'||input.voiceMode==='upload')p.voiceMode=input.voiceMode;p.voiceConfig={voiceId:String(input.voiceId||'').trim().slice(0,200)};invalidate(p,'voice');
 }else if(stage==='timing'){
  if(!p.words||!Array.isArray(input.words)||input.words.length!==p.words.length)throw Error('قائمة التوقيتات لا تطابق النص.');let prev=-1;
  const revised=p.words.map((w,i)=>{const st=Number(input.words[i].start),en=Number(input.words[i].end);if(!Number.isFinite(st)||!Number.isFinite(en)||st<prev||st<0||en<st||en>p.duration)throw Error('تحقق من ترتيب التوقيتات وحدود المدة.');prev=st;return {...w,start:+st.toFixed(3),end:+en.toFixed(3),weak:!!input.words[i].weak,estimated:false};});
  p.words=revised;invalidate(p,'timing',{include:false});p.stages.timing.status='review';write(path.join(directory(p.id),'words.json'),revised);
 }else if(stage==='storyboard'){
  if(!p.words?.length)throw Error('أكمل التوقيت أولًا.');p.storyboard=repairStoryboard(input.storyboard,p.words.length);invalidate(p,'storyboard',{include:false});p.stages.storyboard.status='review';write(path.join(directory(p.id),'storyboard.json'),p.storyboard);
 }else if(stage==='render'){
  p.renderOptions={sfxGain:Math.max(.2,Math.min(1.5,Number(input.sfxGain)||1))};invalidate(p,'render');
 }
 update(p);return p;
}
