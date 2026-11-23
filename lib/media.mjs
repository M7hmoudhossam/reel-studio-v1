import fs from 'node:fs'; import path from 'node:path'; import {spawn,spawnSync} from 'node:child_process'; import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function inPath(name){const p=spawnSync(name,['-version'],{stdio:'ignore',windowsHide:true});return p.status===0;}
export function binary(kind,settings){
 const explicit=kind==='ffmpeg'?settings.ffmpegPath:settings.ffprobePath;if(explicit)return explicit;
 if(inPath(kind))return kind;
 try{return require(kind==='ffmpeg'?'@ffmpeg-installer/ffmpeg':'@ffprobe-installer/ffprobe').path;}catch{throw new Error(`${kind} not found. Install it or set its executable path in Settings.`);}
}
export function run(command,args,{signal,stdin=null,onStderr=()=>{}}={}){return new Promise((resolve,reject)=>{
 const p=spawn(command,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});let stdout='',stderr='';let stopped=false;
 const abort=()=>{stopped=true;p.kill('SIGKILL');};if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 p.stdout.on('data',d=>{stdout+=d.toString();if(stdout.length>100000)stdout=stdout.slice(-100000);});p.stderr.on('data',d=>{const text=d.toString();stderr+=text;if(stderr.length>30000)stderr=stderr.slice(-30000);onStderr(text);});
 p.on('error',e=>{signal?.removeEventListener('abort',abort);reject(e)});p.on('close',code=>{signal?.removeEventListener('abort',abort);if(stopped)return reject(new DOMException('Cancelled','AbortError'));if(code!==0)return reject(new Error(`${path.basename(command)} exited ${code}: ${stderr.slice(-1000)}`));resolve({stdout,stderr});});
 if(stdin!==null)p.stdin.end(stdin);else p.stdin.end();
 });}
export async function probe(file,settings,signal){const x=await run(binary('ffprobe',settings),['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file],{signal});const n=Number(x.stdout.trim());if(!Number.isFinite(n)||n<=0)throw Error('Cannot determine audio duration.');return n;}
export async function prepareVoice(src,dst,target,settings,signal,log){
 const length=await probe(src,settings,signal), max=Math.max(.5,target-.25);const speed=Math.max(1,length/max);
 if(speed>1.6)throw Error(`الصوت أطول من المدة (${length.toFixed(1)} ث). اختصر النص أو اختر مدة أكبر؛ التسريع المطلوب غير طبيعي.`);
 if(speed>1.001)log(`تسريع الصوت ×${speed.toFixed(2)} ليلائم المدة، مع تعديل التوقيتات.`);
 const filter=speed>1.001?['-af',`atempo=${speed.toFixed(8)}`]:[];
 await run(binary('ffmpeg',settings),['-hide_banner','-loglevel','error','-y','-i',src,'-vn',...filter,'-ar','44100','-ac','1','-codec:a','libmp3lame','-q:a','3',dst],{signal});
 return {speed,duration:await probe(dst,settings,signal)};
}
export function createSfxWav(cuts,duration,gain=1){
 const rate=48000,len=Math.ceil(rate*duration), samples=new Float32Array(len);
 // Deterministic filtered noise and descending sine whooshes; deliberately quiet under narration.
 for(const [n,cut] of cuts.entries()){
  let seed=(n+1)*991;const start=Math.max(0,Math.round(cut*rate)), length=Math.min(Math.round(rate*.18),len-start);
  for(let i=0;i<length;i++){const x=i/rate;seed=(seed*1664525+1013904223)>>>0;const noise=(seed/2147483648-1);const env=Math.pow(1-i/length,3);const whoosh=Math.sin(2*Math.PI*(950*x-1500*x*x))*env*.028;const tick=(i<rate*.018?noise*Math.pow(1-i/(rate*.018),3)*.018:0);samples[start+i]+=(whoosh+tick)*gain;}
 }
 const header=Buffer.alloc(44);header.write('RIFF',0);header.writeUInt32LE(36+len*2,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(len*2,40);
 const pcm=Buffer.alloc(len*2);for(let i=0;i<len;i++)pcm.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(samples[i]*32767))),i*2);return Buffer.concat([header,pcm]);
}
