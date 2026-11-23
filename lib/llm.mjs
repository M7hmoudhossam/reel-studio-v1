import { endpoint, scrub } from './config.mjs';

// Holds partial tags between network chunks so neither a split <think> nor its content leaks.
export class ThinkFilter {
 constructor(){this.buffer='';this.thinking=false;}
 push(part,final=false){
  this.buffer+=part;let out='';
  while(this.buffer){
   if(this.thinking){const m=/<\/think\s*>/i.exec(this.buffer);if(m){this.buffer=this.buffer.slice(m.index+m[0].length);this.thinking=false;continue;}if(final){this.buffer='';break;}if(this.buffer.length>32)this.buffer=this.buffer.slice(-32);break;}
   const m=/<think(?:\s[^>]*)?>/i.exec(this.buffer);if(m){out+=this.buffer.slice(0,m.index);this.buffer=this.buffer.slice(m.index+m[0].length);this.thinking=true;continue;}
   if(final){out+=this.buffer;this.buffer='';break;}
   const ix=this.buffer.lastIndexOf('<'), tail=ix<0?'':this.buffer.slice(ix);
   if(ix>=0 && /^<(?:t(?:h(?:i(?:n(?:k(?:\s[^>]*)?)?)?)?)?)?$/i.test(tail)){out+=this.buffer.slice(0,ix);this.buffer=tail;break;}
   out+=this.buffer;this.buffer='';break;
  }
  return out;
 }
}
export async function chatStream(settings,messages,{signal,onText=()=>{}}={}){
 const headers={'Content-Type':'application/json','Accept':'text/event-stream'};
 if(settings.llmApiKey)headers.Authorization=`Bearer ${settings.llmApiKey}`;
 const response=await fetch(endpoint(settings.llmBaseUrl,'chat/completions'),{method:'POST',headers,body:JSON.stringify({model:settings.llmModel||'auto',messages,stream:true,temperature:0.65}),signal});
 if(!response.ok) throw new Error(`LLM HTTP ${response.status}: ${scrub((await response.text()).slice(0,400),settings)}`);
 let result='',filter=new ThinkFilter();
 const append=(txt,final=false)=>{const clean=filter.push(txt,final);if(clean){result+=clean;onText(clean);}};
 if(!response.body)throw new Error('Empty LLM stream');
 if(!(response.headers.get('content-type')||'').includes('text/event-stream')){
  const j=await response.json();append(j.choices?.[0]?.message?.content||'');append('',true);return result;
 }
 const decoder=new TextDecoder();let buffer='';
 const consume=(event)=>{for(const line of event.split(/\r?\n/)){if(!line.startsWith('data:'))continue;const data=line.slice(5).trim();if(!data||data==='[DONE]')continue;let parsed;try{parsed=JSON.parse(data);}catch{continue;}
  const c=parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? '';
  if(typeof c==='string')append(c);else if(Array.isArray(c))append(c.map(x=>x.text||'').join(''));
 }};
 for await(const chunk of response.body){buffer+=decoder.decode(chunk,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');let ix;while((ix=buffer.indexOf('\n\n'))>=0){consume(buffer.slice(0,ix));buffer=buffer.slice(ix+2);}}
 buffer+=decoder.decode();if(buffer.trim())consume(buffer);append('',true);return result.trim();
}
export function parseScript(s){
 s=String(s).replace(/```(?:text)?/gi,'').replace(/```/g,'').replace(/^\s*#{1,6}\s*/gm,'').replace(/^\s*\*\*\s*(TITLE|SCRIPT|SOURCES)\s*[:：]?\s*\*\*\s*[:：]?/gim,'$1:').trim();
 const m=s.match(/(?:^|\n)\s*(?:#+\s*)?TITLE\s*[:：]?\s*([^\n]+)[\s\S]*?(?:^|\n)\s*(?:#+\s*)?SCRIPT\s*[:：]?\s*([\s\S]*?)(?:^|\n)\s*(?:#+\s*)?SOURCES\s*[:：]?\s*([\s\S]*)/im);
 if(!m)throw new Error('LLM did not return TITLE / SCRIPT / SOURCES. Re-run or edit the script.');
 const title=m[1].trim().slice(0,160),script=m[2].trim().slice(0,12000),sources=m[3].trim().slice(0,4000);
 if(!script)throw new Error('The generated script is empty.');return{title,script,sources};
}
export function parseJSON(s){
 let text=String(s).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 try{return JSON.parse(text);}catch{}
 const a=text.indexOf('{'),b=text.lastIndexOf('}');if(a>=0&&b>a)return JSON.parse(text.slice(a,b+1));throw Error('LLM storyboard did not contain JSON.');
}
