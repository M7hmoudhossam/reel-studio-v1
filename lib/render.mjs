import fs from 'node:fs'; import path from 'node:path'; import {spawn} from 'node:child_process'; import {once} from 'node:events';
import {chromium} from 'playwright'; import {binary,createSfxWav,run} from './media.mjs';
export async function launchBrowser(){
 const base={headless:true,args:['--no-sandbox','--disable-dev-shm-usage']};
 try{return await chromium.launch(base);}catch(first){try{return await chromium.launch({...base,channel:'chrome'});}catch(second){throw new Error('Chromium/Chrome not found. Run npm run setup or install Google Chrome. '+second.message.split('\n')[0]);}}
}
export async function renderProject(project,dir,settings,{signal,log,emit}){
 const fps=30,total=Math.round(project.duration*fps),output=path.join(dir,'video.mp4'),tmp=path.join(dir,'video.tmp.mp4'),sfx=path.join(dir,'sfx.wav'),mixed=path.join(dir,'mix.tmp.m4a');
 const cuts=project.storyboard.scenes.slice(1).map(s=>project.words[s.at]?.start??0);fs.writeFileSync(sfx,createSfxWav(cuts,project.duration,project.renderOptions?.sfxGain||1));
 // Pre-mix before video encoding so the actual AAC loudness can be measured.
 // Short speech with high peaks sometimes cannot reach the requested LUFS under
 // the true-peak ceiling; retry with speech compression only when needed.
 let loudness=null;
 try { for(const [attempt,compression] of ['', 'acompressor=threshold=0.006:ratio=20:attack=0.1:release=150,'].entries()){
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  if(attempt)log('تسوية ديناميكية للوصول للمستوى المستهدف دون قصّ القمم.');
  const filter=`[0:a]apad,atrim=duration=${project.duration}[voice];[1:a]apad,atrim=duration=${project.duration}[sfx];[voice][sfx]amix=inputs=2:duration=longest:dropout_transition=0,volume=2,${compression}loudnorm=I=-14:TP=-1.5:LRA=11[a]`;
  await run(binary('ffmpeg',settings),['-hide_banner','-loglevel','error','-y','-i',path.join(dir,'voice.mp3'),'-i',sfx,'-filter_complex',filter,'-map','[a]','-ar','48000','-c:a','aac','-b:a','192k',mixed],{signal});
  const measured=await run(binary('ffmpeg',settings),['-hide_banner','-nostats','-i',mixed,'-af','loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json','-f','null','-'],{signal});
  const match=measured.stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);if(match){try{loudness=Number(JSON.parse(match[0]).input_i);}catch{}}
  if(Number.isFinite(loudness)&&Math.abs(loudness+14)<=.5)break;
 }
 if(!Number.isFinite(loudness))throw Error('تعذّر قياس مستوى الصوت؛ تأكد أن الملف يحتوي على كلام مسموع.');
 log(`المستوى المقاس بعد المزج: ${loudness.toFixed(1)} LUFS (المستهدف −14).`);
 } catch(e) { try{fs.unlinkSync(mixed)}catch{} throw e; }
 let browser;try{browser=await launchBrowser();}catch(e){try{fs.unlinkSync(mixed)}catch{}throw e;}let proc,stderr='',aborted=false,procError;
 const abort=()=>{aborted=true;proc?.kill('SIGKILL');browser.close().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{
  const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
  page.on('pageerror',e=>{procError=e;});
  await page.goto(`http://127.0.0.1:4301/render.html?id=${encodeURIComponent(project.id)}`,{waitUntil:'load',timeout:30000});
  await page.evaluate(()=>window.ready);
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  const args=['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-i',mixed,
   '-map','0:v:0','-map','1:a:0','-t',String(project.duration),'-vf','scale=in_range=pc:out_range=tv,format=yuv420p','-color_range','tv',
   '-c:v','libx264','-preset','veryfast','-crf','20','-threads','2','-pix_fmt','yuv420p','-r',String(fps),'-c:a','copy','-movflags','+faststart',tmp];
  proc=spawn(binary('ffmpeg',settings),args,{stdio:['pipe','ignore','pipe'],windowsHide:true});
  proc.stderr.on('data',d=>{stderr+=d.toString();if(stderr.length>10000)stderr=stderr.slice(-10000);});
  proc.on('error',e=>{procError=e;});proc.stdin.on('error',e=>{procError=e;});
  const finished=new Promise((resolve,reject)=>{proc.on('error',reject);proc.on('close',code=>{if(code===0)resolve();else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));});});
  // Attach rejection immediately while frames are fed, to avoid unhandled rejections.
  finished.catch(()=>{});
  log(`بدء الرسم: ${total} إطار، 30 إطار/ث، 1080×1920.`);
  for(let i=0;i<total;i++){
   if(signal?.aborted||aborted)throw new DOMException('Cancelled','AbortError');if(procError)throw procError;
   await page.evaluate(t=>window.drawFrame(t),i/fps);
   const frame=await page.screenshot({type:'jpeg',quality:83});
   if(i%30===0||i===total-1){const progress=Math.round((i+1)/total*100);emit('progress',{stage:'render',frame:i+1,total,percent:progress});emit('preview',{stage:'render',at:i/fps,image:`data:image/jpeg;base64,${frame.toString('base64')}`});}
   if(!proc.stdin.write(frame))await Promise.race([once(proc.stdin,'drain'),finished.then(()=>{throw Error('ffmpeg ended before all frames were sent');})]);
  }
  proc.stdin.end();log('مزج الصوت والمؤثرات وضبط مستوى الصوت…');await finished;
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');fs.renameSync(tmp,output);log('اكتمل الفيديو.');return {loudness};
 }catch(e){proc?.kill('SIGKILL');try{fs.unlinkSync(tmp);}catch{}if(aborted||signal?.aborted)throw new DOMException('Cancelled','AbortError');throw e;}
 finally{signal?.removeEventListener('abort',abort);await browser.close().catch(()=>{});try{fs.unlinkSync(mixed)}catch{}}
}
