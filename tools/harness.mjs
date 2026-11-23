import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';import path from 'node:path';import net from 'node:net';import fs from 'node:fs';
export const root=process.cwd(),base='http://127.0.0.1:4301';
export const testData=path.resolve(process.env.REEL_E2E_DIR||path.join(root,'data/e2e'));
export async function request(url,{method='GET',body,headers={}}={}){const o={method,headers:{...headers}};if(body!==undefined){if(Buffer.isBuffer(body))o.body=body;else{o.headers['Content-Type']='application/json';o.body=JSON.stringify(body);}}const r=await fetch(url.startsWith('http')?url:base+url,o);let j;try{j=await r.json();}catch{j=null;}if(!r.ok)throw Error(`${method} ${url}: ${r.status} ${JSON.stringify(j)}`);return j;}
export async function waitUntil(fn,{timeout=30000,interval=150,description='condition'}={}){const start=Date.now();while(Date.now()-start<timeout){const v=await fn();if(v)return v;await delay(interval);}throw Error(`Timed out waiting for ${description}`);}
export async function waitProject(id,check,timeout=120000){return waitUntil(async()=>{const p=await request(`/api/projects/${id}`);const failed=Object.entries(p.stages).find(([,s])=>s.status==='error');if(failed)throw Error(`${failed[0]} failed: ${failed[1].error}`);return check(p)?p:null;},{timeout,description:`project ${id}`});}
async function portOpen(port){return new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();resolve(true)});s.on('error',()=>resolve(false));s.setTimeout(500,()=>{s.destroy();resolve(false)});});}
export async function startHarness(){
 if(process.env.REEL_E2E_USE_EXISTING==='1'){console.log('Using explicitly requested existing local mock and app servers.');return async()=>{};}
 if(await portOpen(4301)||await portOpen(4399))throw Error('Ports 4301 and 4399 must be free. Stop running servers before offline tests.');
 fs.mkdirSync(testData,{recursive:true});const env={...process.env,REEL_TEST_MODE:'1',REEL_DATA_DIR:testData,LLM_BASE_URL:'http://127.0.0.1:4399/v1',LLM_MODEL:'auto',LLM_API_KEY:'mock-llm-1234',ELEVENLABS_BASE_URL:'http://127.0.0.1:4399/v1',ELEVENLABS_API_KEY:'mock-eleven-5678',ELEVENLABS_VOICE_ID:'mock-ar',DEEPGRAM_BASE_URL:'http://127.0.0.1:4399/v1',DEEPGRAM_API_KEY:'mock-deepgram-9012'};
 let logs='';const spawnNode=script=>{const p=spawn(process.execPath,[script],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true});for(const stream of [p.stdout,p.stderr])stream.on('data',d=>{logs+=d.toString();if(logs.length>20000)logs=logs.slice(-20000)});return p;};
 const mock=spawnNode('tools/mock-apis.mjs'),app=spawnNode('server.mjs');
 const stop=async()=>{mock.kill();app.kill();await Promise.all([mock,app].map(p=>new Promise(r=>{if(p.exitCode!==null)return r();p.once('close',r);setTimeout(r,1000)})));};
 try{await waitUntil(async()=>await portOpen(4301)&&await portOpen(4399),{timeout:20000,description:'local test servers'});}catch(e){await stop();throw Error(e.message+'\n'+logs);}
 return stop;
}
