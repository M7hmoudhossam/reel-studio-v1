import fs from 'node:fs';import path from 'node:path';import {ROOT_DIR} from './config.mjs';
export const TYPES=['intro','question','concept','process','compare','stat','recap'];
export const TEMPLATES=['body','zoom','flow','cycle','timeline','chart','layers','cards','meter'];
const choice={intro:'zoom',question:'body',concept:'layers',process:'flow',compare:'cards',stat:'meter',recap:'cycle'};
const tones=['accent','blue','success','underline'];
let cache;
export function library(){return cache ||= JSON.parse(fs.readFileSync(path.join(ROOT_DIR,'assets/icons/library.json'),'utf8'));}
const aliases={oxygen:'lungs',air:'lungs',blood:'drop',water:'drop',electricity:'energy',lightning:'energy',electric:'energy',cardiac:'heart',heartbeat:'pulse',exercise:'running',run:'running',skeleton:'bone',neuron:'nerve',cells:'cell',virus:'virus',person:'body',human:'body',atom:'atom',chemical:'molecule'};
export function resolveIcon(query){
 const q=String(query||'spark').toLowerCase().replace(/[^a-z0-9 -]/g,'').trim().replace(/\s+/g,'-').slice(0,45)||'spark';
 const q2=aliases[q]||q, list=library().icons;
 let hit=list.find(x=>x.source==='hand'&&x.name===q2)||list.find(x=>x.source==='health'&&x.name===q2)||list.find(x=>x.source==='tabler'&&x.name===q2)||list.find(x=>x.name.startsWith(q2+'-'))||list.find(x=>x.source==='hand'&&x.name==='spark');
 return hit;
}
const limitText=(s,n=48)=>String(s??'').replace(/[\x00-\x1f]/g,' ').trim().slice(0,n);
export function repairStoryboard(input, wordCount){
 const max=Math.max(0,wordCount-1); const warnings=[];
 let raw=Array.isArray(input?.scenes)?input.scenes:[];
 let scenes=raw.slice(0,32).map((s,i)=>{
  let type=TYPES.includes(s?.type)?s.type:'concept'; let at=Math.round(Number(s?.at)); if(!Number.isFinite(at))at=0;at=Math.max(0,Math.min(max,at));
  const template=TEMPLATES.includes(s?.template)?s.template:choice[type];
  const icons=(Array.isArray(s?.icons)?s.icons:[s?.icon]).filter(Boolean).map(v=>limitText(v,45)).slice(0,4);
  const items=(Array.isArray(s?.items)?s.items:[]).slice(0,4).map(x=>typeof x==='string'?limitText(x,28):limitText(x?.label,28));
  return {type,at,template,title:limitText(s?.title||'',45),subtitle:limitText(s?.subtitle||'',70),icons:icons.length?icons:['spark'],items,value:s?.value===null||s?.value===undefined||!Number.isFinite(Number(s.value))?null:Math.max(0,Math.min(100,Number(s.value))),_i:i};
 }).sort((a,b)=>a.at-b.at||a._i-b._i);
 // Keep only one cut at each word index. A duplicate cannot be displayed and is removed.
 scenes=scenes.filter((s,i,a)=>i===0||s.at!==a[i-1].at);
 if(!scenes.length||scenes[0].at!==0){scenes.unshift({type:'intro',at:0,template:'zoom',title:'',subtitle:'',icons:['spark'],items:[],value:65,_i:-1});warnings.push('Added intro at word 0');}
 if(scenes[0].type!=='intro'){scenes[0].type='intro';warnings.push('First scene changed to intro');}
 for(let i=0;i<scenes.length;i++){
  if(i>=2&&scenes[i].template===scenes[i-1].template&&scenes[i].template===scenes[i-2].template){scenes[i].template=TEMPLATES.find(x=>x!==scenes[i-1].template);warnings.push('Changed third repeated template');}
  delete scenes[i]._i;
 }
 const accents=(Array.isArray(input?.accents)?input.accents:[]).slice(0,100).map(a=>[Math.round(Number(Array.isArray(a)?a[0]:a?.at)),Array.isArray(a)?a[1]:a?.tone]).filter(([i,t])=>Number.isInteger(i)&&i>=0&&i<=max&&tones.includes(t));
 const unique=[];for(const a of accents.sort((a,b)=>a[0]-b[0]))if(!unique.some(x=>x[0]===a[0]))unique.push(a);
 return {scenes,accents:unique,warnings};
}
export function usedIcons(storyboard){const out={};for(const scene of storyboard.scenes)for(const name of scene.icons){const hit=resolveIcon(name); if(hit)out[name]={id:hit.id,svg:hit.svg,source:hit.source};}return out;}
