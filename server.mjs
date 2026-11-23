import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {readSettings,publicSettings,saveSettings,endpoint,scrub} from './lib/config.mjs';
import {STAGES,get,list,create,directory,update,subscribe,remove,invalidate} from './lib/projects.mjs';
import {start,cancel,rerun,approve,edit,running} from './lib/pipeline.mjs';import {usedIcons} from './lib/storyboard.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));process.chdir(ROOT);
const HOST='127.0.0.1',PORT=4301,MAX_UPLOAD=50*1024*1024;
function reply(res,status,obj){if(res.headersSent)return res.end();res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));}
function parseBody(req,limit=1024*1024){return new Promise((resolve,reject)=>{let size=0,a=[];req.on('data',d=>{size+=d.length;if(size>limit){reject(Error('الملف أكبر من الحد المسموح'));req.destroy();return;}a.push(d)});req.on('end',()=>resolve(Buffer.concat(a)));req.on('error',reject);});}
async function jsonBody(req){const x=await parseBody(req);if(!x.length)return {};try{return JSON.parse(x.toString('utf8'))}catch{throw Error('JSON غير صالح.');}}
function serve(res,file,mime,req){
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())return reply(res,404,{error:'Not found'});const size=fs.statSync(file).size;const h={'Content-Type':mime,'Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};let start=0,end=size-1,status=200;
 if(req.headers.range){const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!m){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}if(m[1])start=Number(m[1]);if(m[2])end=Number(m[2]);if(!m[1]&&m[2]){start=Math.max(0,size-Number(m[2]));end=size-1;}if(start>=size||end<start){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}end=Math.min(end,size-1);status=206;h['Content-Range']=`bytes ${start}-${end}/${size}`;}
 h['Content-Length']=end-start+1;res.writeHead(status,h);if(req.method==='HEAD')return res.end();fs.createReadStream(file,{start,end}).pipe(res);
}
function fontPath(weight){
 const folder=readSettings().fontFolder;if(folder){try{const entries=fs.readdirSync(folder).filter(x=>/\.(ttf|otf|woff2?)$/i.test(x)).sort();const key=weight==='700'?/bold/i:weight==='500'?/medium|semibold/i:/regular|normal/i;const found=entries.find(x=>key.test(x))||entries[0];if(found)return path.join(folder,found);}catch{}}
 return path.join(ROOT,'assets/fonts',weight==='700'?'IBMPlexSansArabic-Bold.ttf':weight==='500'?'IBMPlexSansArabic-Medium.ttf':'IBMPlexSansArabic-Regular.ttf');
}
function okayHost(req){return /^(127\.0\.0\.1|localhost)(:4301)?$/i.test(req.headers.host||'');}
function okayOrigin(req){const x=req.headers.origin;if(!x)return true;try{const u=new URL(x);return u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)&&u.port==='4301';}catch{return false;}}
const server=http.createServer(async(req,res)=>{
 try{
  if(!okayHost(req)||!okayOrigin(req))return reply(res,403,{error:'Local requests only.'});const url=new URL(req.url,`http://${HOST}:${PORT}`),p=url.pathname,method=req.method||'GET';
  if(p==='/api/font'&&(method==='GET'||method==='HEAD')){const f=fontPath(url.searchParams.get('weight'));const ext=path.extname(f).toLowerCase();return serve(res,f,ext==='.woff2'?'font/woff2':ext==='.woff'?'font/woff':'font/ttf',req);}
  if(p==='/api/settings'&&method==='GET')return reply(res,200,publicSettings());
  if(p==='/api/settings'&&method==='PUT')return reply(res,200,saveSettings(await jsonBody(req)));
  if(p==='/api/voices'&&method==='GET'){
   const s=readSettings();const r=await fetch(endpoint(s.elevenBaseUrl,'voices'),{headers:{'xi-api-key':s.elevenApiKey||''}});if(!r.ok)throw Error(`ElevenLabs HTTP ${r.status}: ${scrub((await r.text()).slice(0,400),s)}`);const j=await r.json();return reply(res,200,{voices:(j.voices||[]).map(v=>({id:v.voice_id,name:v.name,labels:v.labels||{}}))});
  }
  if(p==='/api/projects'&&method==='GET')return reply(res,200,{projects:list()});
  if(p==='/api/projects'&&method==='POST')return reply(res,201,create(await jsonBody(req)));
  const m=p.match(/^\/api\/projects\/([a-zA-Z0-9-]{1,64})(?:\/(.*))?$/);
  if(m){const project=get(m[1]);if(!project)return reply(res,404,{error:'المشروع غير موجود.'});const tail=m[2]||'';
   if(!tail&&method==='GET')return reply(res,200,project);
   if(!tail&&method==='DELETE'){await cancel(project);remove(project.id);return reply(res,200,{ok:true});}
   if(tail==='events'&&method==='GET'){res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});subscribe(project,res);return;}
   if(tail==='render-data'&&method==='GET'){if(!project.words?.length||!project.storyboard?.scenes?.length)return reply(res,409,{error:'Not ready'});return reply(res,200,{id:project.id,topic:project.topic,title:project.script?.title||project.topic,duration:project.duration,words:project.words,storyboard:project.storyboard,icons:usedIcons(project.storyboard)});}
   if((tail==='audio'||tail==='video')&&(method==='GET'||method==='HEAD'))return serve(res,path.join(directory(project.id),tail==='audio'?'voice.mp3':'video.mp4'),tail==='audio'?'audio/mpeg':'video/mp4',req);
   if(tail==='upload'&&method==='PUT'){await cancel(project);const buffer=await parseBody(req,MAX_UPLOAD);if(!buffer.length)throw Error('الملف فارغ.');invalidate(project,'voice');fs.writeFileSync(path.join(directory(project.id),'upload.bin'),buffer);project.voiceMode='upload';project.upload={name:String(url.searchParams.get('name')||'voice').slice(0,160),bytes:buffer.length};update(project);return reply(res,200,project);}
   if(tail==='policies'&&method==='PATCH'){const b=await jsonBody(req);for(const st of STAGES)if(typeof b.auto?.[st]==='boolean')project.stages[st].auto=b.auto[st];update(project);return reply(res,200,project);}
   if(tail==='start'&&method==='POST'){start(project);return reply(res,202,{ok:true});}
   if(tail==='cancel'&&method==='POST'){await cancel(project);return reply(res,200,project);}
   const stageMatch=tail.match(/^stages\/(script|voice|timing|storyboard|render)(?:\/(approve|rerun))?$/);
   if(stageMatch){const stage=stageMatch[1],action=stageMatch[2];if(method==='POST'&&action==='approve'){approve(project,stage);return reply(res,202,{ok:true});}if(method==='POST'&&action==='rerun'){await rerun(project,stage);return reply(res,202,{ok:true});}if(method==='PATCH'&&!action)return reply(res,200,await edit(project,stage,await jsonBody(req)));}
   return reply(res,404,{error:'Not found'});
  }
  if(method==='GET'||method==='HEAD'){
   const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css','/render.html':'render.html','/renderer.js':'renderer.js'};const f=files[p];if(f){const ext=path.extname(f);return serve(res,path.join(ROOT,'public',f),({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[ext],req);}
  }
  return reply(res,404,{error:'Not found'});
 }catch(e){if(!res.headersSent)reply(res,400,{error:scrub(e.message)});else res.end();}
});
server.listen(PORT,HOST,()=>console.log(`Reel Studio → http://${HOST}:${PORT} (localhost only)`));
server.on('error',err=>{console.error(scrub(err.message));process.exitCode=1;});
