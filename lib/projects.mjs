import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {DATA_DIR} from './config.mjs';
export const STAGES=['script','voice','timing','storyboard','render'];
const projectsDir=path.join(DATA_DIR,'projects');fs.mkdirSync(projectsDir,{recursive:true});
const cache=new Map(),listeners=new Map();
export function directory(id){if(!/^[a-zA-Z0-9-]{1,64}$/.test(String(id)))throw Error('Invalid project id');return path.join(projectsDir,id);}
export function save(p){p.updatedAt=new Date().toISOString();const dir=directory(p.id);fs.mkdirSync(dir,{recursive:true});const tmp=path.join(dir,'project.json.tmp');fs.writeFileSync(tmp,JSON.stringify(p,null,2));fs.renameSync(tmp,path.join(dir,'project.json'));cache.set(p.id,p);}
export function get(id){directory(id);if(cache.has(id))return cache.get(id);const f=path.join(directory(id),'project.json');if(!fs.existsSync(f))return null;const p=JSON.parse(fs.readFileSync(f,'utf8'));
 for(const st of STAGES)if(p.stages?.[st]?.status==='running'){p.stages[st].status='idle';p.stages[st].logs.push('توقف التشغيل السابق؛ يمكنك المحاولة مجددًا.');}
 cache.set(id,p);return p;}
export function list(){return fs.readdirSync(projectsDir,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>{try{return get(d.name)}catch{return null}}).filter(Boolean).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(p=>({id:p.id,topic:p.topic,title:p.script?.title||p.topic,duration:p.duration,updatedAt:p.updatedAt,status:p.stages.render.status}));}
export function create(input){
 const topic=String(input.topic||'').trim();const duration=Number(input.duration);if(!topic||topic.length>300)throw Error('اكتب موضوعًا بطول مناسب.');if(![10,20,30,45,60].includes(duration))throw Error('مدة غير مدعومة.');
 const voiceMode=input.voiceMode==='upload'?'upload':'tts';const p={id:randomUUID(),topic,duration,voiceMode,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),stages:{}};
 for(const name of STAGES)p.stages[name]={status:'idle',auto:input.auto?.[name]===undefined?name!=='script':!!input.auto[name],logs:[]};save(p);return p;
}
export function send(p,event,data){for(const res of listeners.get(p.id)||[]){try{res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);}catch{}}}
export function update(p){save(p);send(p,'state',p);}
export function log(p,stage,message){const s=p.stages[stage];s.logs.push(String(message));if(s.logs.length>250)s.logs.splice(0,s.logs.length-250);save(p);send(p,'log',{stage,message});}
export function subscribe(p,res){let set=listeners.get(p.id);if(!set){set=new Set();listeners.set(p.id,set);}set.add(res);res.write(`event: state\ndata: ${JSON.stringify(p)}\n\n`);const timer=setInterval(()=>{try{res.write(': heartbeat\n\n');}catch{}},20000);res.on('close',()=>{clearInterval(timer);set.delete(res);if(!set.size)listeners.delete(p.id);});}
const filesByStage={voice:['voice.mp3','voice-original.mp3','tts-timings.json'],timing:['words.json','deepgram.json'],storyboard:['storyboard.json'],render:['video.mp4','video.tmp.mp4','sfx.wav','mix.tmp.m4a']};
export function invalidate(p,from,{include=true}={}){
 let start=STAGES.indexOf(from)+(include?0:1);if(start<0)throw Error('Unknown stage');
 for(let i=start;i<STAGES.length;i++){
  const name=STAGES[i];p.stages[name].status='idle';p.stages[name].logs=[];delete p.stages[name].error;
  if(name==='script')delete p.script;if(name==='voice')delete p.voice;if(name==='timing')delete p.words;if(name==='storyboard')delete p.storyboard;if(name==='render')delete p.render;
  for(const f of filesByStage[name]||[])try{fs.unlinkSync(path.join(directory(p.id),f));}catch{}
 }
}
export function remove(id){const p=get(id);if(!p)return;fs.rmSync(directory(id),{recursive:true,force:true});cache.delete(id);}
