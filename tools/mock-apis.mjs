// Local, deterministic test doubles. No provider calls are made.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const root=path.resolve('tools/fixtures');const fixture=JSON.parse(fs.readFileSync(path.join(root,'mock.json'),'utf8'));
const audio=fs.readFileSync(path.join(root,'mock-voice.mp3')).toString('base64');
const storyboard={scenes:[
 {type:'intro',at:0,template:'zoom',title:'نبض أسرع',subtitle:'قلبك وقت الحركة',icons:['heart','pulse'],items:['القلب','النبض']},
 {type:'question',at:4,template:'body',title:'عارف ليه؟',subtitle:'القلب جزء من منظومة',icons:['heart']},
 {type:'process',at:6,template:'flow',title:'طلب أعلى',subtitle:'العضلات تحتاج أكسجينًا أكثر',icons:['muscle','lungs','heart'],items:['عضلات','Oxygen','قلب']},
 {type:'concept',at:10,template:'layers',title:'مضخة الجسم',subtitle:'الدم يحمل الأكسجين للعضلات',icons:['heart','drop','muscle'],items:['القلب','الدم','العضلات']},
 {type:'recap',at:17,template:'cycle',title:'الخلاصة',subtitle:'استجابة طبيعية للمجهود',icons:['heart','pulse','running'],items:['نبض','حركة','دم']}
 ],accents:[[1,'accent'],[4,'underline'],[8,'blue'],[13,'accent'],[18,'success']]};
const port=Number(process.env.MOCK_PORT||4399);
function body(req){return new Promise((resolve,reject)=>{const chunks=[];let size=0;req.on('data',x=>{size+=x.length;if(size>70*1024*1024){req.destroy();return;}chunks.push(x)});req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject);});}
function json(res,obj,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(req.method==='GET'&&url.pathname==='/v1/voices')return json(res,{voices:[{voice_id:'mock-ar',name:'صوت اختبار محلي',labels:{language:'ar',description:'صوت تجريبي آلي'}}]});
 if(req.method==='POST'&&url.pathname==='/v1/chat/completions'){
  const data=JSON.parse((await body(req)).toString('utf8'));const messages=(data.messages||[]).map(x=>x.content).join('\n');
  let answer;if(messages.includes('TASK:SCRIPT'))answer=`TITLE: ${fixture.title}\nSCRIPT:\n${fixture.script}\nSOURCES:\n${fixture.sources}`;else answer=JSON.stringify(storyboard);
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','Connection':'keep-alive'});
  // Deliberately split the think tags across chunks to exercise the streaming filter.
  const pieces=['<thi','nk>private mock reasoning</th','ink>',...answer.match(/[\s\S]{1,28}/gu)];let i=0;
  const timer=setInterval(()=>{if(res.destroyed){clearInterval(timer);return;}if(i>=pieces.length){res.write('data: [DONE]\n\n');res.end();clearInterval(timer);return;}res.write('data: '+JSON.stringify({choices:[{delta:{content:pieces[i++]}}]})+'\n\n');},5);return;
 }
 if(req.method==='POST'&&/^\/v1\/text-to-speech\/[^/]+\/with-timestamps$/.test(url.pathname)){
  const request=JSON.parse((await body(req)).toString('utf8'));
  if(String(request.text||'').replace(/\s+/g,' ').trim()!==fixture.script.replace(/\s+/g,' ').trim()) return json(res,{error:'Mock speech fixture supports only the mock script; real ElevenLabs supports your edited text.'},422);
  return json(res,{audio_base64:audio,alignment:fixture.alignment,normalized_alignment:fixture.alignment});
 }
 if(req.method==='POST'&&url.pathname==='/v1/listen'){
  await body(req);return json(res,{results:{channels:[{alternatives:[{transcript:fixture.script,words:fixture.words.map(w=>({word:w.word,punctuated_word:w.word,start:w.start,end:w.end,confidence:w.confidence}))}]}]}});
 }
 if(req.method==='GET'&&url.pathname==='/health')return json(res,{ok:true});
 json(res,{error:'Unknown mock endpoint'},404);
 }catch(e){json(res,{error:e.message},500);}});
server.listen(port,'127.0.0.1',()=>console.log(`Mock APIs: http://127.0.0.1:${port}/v1 (local only)`));
