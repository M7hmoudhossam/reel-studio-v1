import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = ROOT_DIR;
export const DATA_DIR = path.resolve(process.env.REEL_DATA_DIR || path.join(root, 'data')); 
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
export const SECRET_FIELDS = ['llmApiKey','elevenApiKey','deepgramApiKey'];
const envNames = {
  llmBaseUrl:'LLM_BASE_URL', llmModel:'LLM_MODEL', llmApiKey:'LLM_API_KEY',
  elevenBaseUrl:'ELEVENLABS_BASE_URL', elevenApiKey:'ELEVENLABS_API_KEY', elevenVoiceId:'ELEVENLABS_VOICE_ID',
  deepgramBaseUrl:'DEEPGRAM_BASE_URL', deepgramApiKey:'DEEPGRAM_API_KEY',
  fontFolder:'FONT_FOLDER', ffmpegPath:'FFMPEG_PATH', ffprobePath:'FFPROBE_PATH'
};
export const defaults = {
  llmBaseUrl:'http://127.0.0.1:31415/v1', llmModel:'auto', llmApiKey:'',
  elevenBaseUrl:'https://api.elevenlabs.io/v1', elevenApiKey:'', elevenVoiceId:'',
  deepgramBaseUrl:'https://api.deepgram.com/v1', deepgramApiKey:'',
  fontFolder:'', ffmpegPath:'', ffprobePath:''
};
function dotenv(){
  try { const out={}; for(const line of fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/)) {
    const m=line.match(/^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/); if(!m) continue;
    let value=m[2]; if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))) value=value.slice(1,-1); else value=value.replace(/\s+#.*$/,'');
    out[m[1]]=value;
  } return out; } catch {return {};}
}
export function readSettings(){
  const env={...(process.env.REEL_TEST_MODE ? {} : dotenv()),...process.env}, v={...defaults};
  for(const [field,key] of Object.entries(envNames)) if(env[key]!==undefined && env[key]!=='') v[field]=String(env[key]);
  if(!process.env.REEL_TEST_MODE) try { const saved=JSON.parse(fs.readFileSync(SETTINGS_FILE,'utf8')); for(const k of Object.keys(defaults)) if(typeof saved[k]==='string' && saved[k] !== '') v[k]=saved[k]; } catch {}
  return v;
}
export function publicSettings(){const s=readSettings(); for(const k of SECRET_FIELDS){ const key=s[k]; s[k]=key?`••••${key.slice(-4)}`:''; } return s;}
export function saveSettings(input){
  let saved={}; try {saved=JSON.parse(fs.readFileSync(SETTINGS_FILE,'utf8'));} catch {}
  for(const [k,v] of Object.entries(input||{})){
    if(!(k in defaults) || typeof v!=='string') continue;
    if(v.length>2000) throw new Error(`Value too long: ${k}`);
    // An empty field removes the saved override and restores its .env value.
    if(!v.trim()) delete saved[k]; else saved[k]=v.trim();
  }
  for(const k of ['llmBaseUrl','elevenBaseUrl','deepgramBaseUrl']) if(saved[k]){const u=new URL(saved[k]); if(!['http:','https:'].includes(u.protocol)||u.username||u.password) throw new Error('Base URL must be HTTP(S), without credentials.');}
  if(saved.fontFolder && !fs.statSync(saved.fontFolder,{throwIfNoEntry:false})?.isDirectory()) throw new Error('Font folder does not exist.');
  fs.mkdirSync(DATA_DIR,{recursive:true});
  const tmp=SETTINGS_FILE+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(saved,null,2),{mode:0o600}); fs.renameSync(tmp,SETTINGS_FILE);
  return publicSettings();
}
export function scrub(value, settings=readSettings()){
  let s=String(value||''); for(const k of SECRET_FIELDS){const key=settings[k]; if(key) s=s.split(key).join('[secret]');} return s.slice(0,1000);
}
export function endpoint(base, suffix){return `${String(base).replace(/\/+$/,'')}/${suffix.replace(/^\/+/, '')}`;}
