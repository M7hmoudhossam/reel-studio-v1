import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {ThinkFilter,parseScript,parseJSON} from '../lib/llm.mjs';
import {alignWords,elevenCharsToWords,normalizeChar} from '../lib/timing.mjs';
import {repairStoryboard,resolveIcon,usedIcons} from '../lib/storyboard.mjs';
import {createSfxWav} from '../lib/media.mjs';
const fixture=JSON.parse(fs.readFileSync('tools/fixtures/mock.json','utf8'));
test('stream filter never exposes think blocks, even when every byte is split',()=>{
 const text='أول<think>secret reasoning</think> آخر <think hidden="yes">more</think> تم';const f=new ThinkFilter();let out='';for(const char of text)out+=f.push(char);out+=f.push('',true);assert.equal(out,'أول آخر  تم');
 const open=new ThinkFilter();assert.equal(open.push('ok<think>hidden')+open.push('',true),'ok');
});
test('parses the required script format and JSON fenced by an LLM',()=>{
 const p=parseScript('TITLE: عنوان\nSCRIPT:\nعارف ليه؟\nSOURCES:\nhttps://example.com');assert.equal(p.script,'عارف ليه؟');assert.equal(p.title,'عنوان');assert.equal(parseScript('**TITLE:** عنوان\n**SCRIPT:**\nعارف ليه؟\n**SOURCES:**\nمصدر').title,'عنوان');assert.deepEqual(parseJSON('```json\n{"scenes":[]}\n```'),{scenes:[]});
});
test('character timing -> words -> LCS retains script spelling and exact onsets',()=>{
 const raw=elevenCharsToWords(fixture.alignment);const words=alignWords(fixture.script,raw,10);assert.equal(words.length,fixture.words.length);
 for(let i=0;i<words.length;i++){assert.equal(words[i].text,fixture.words[i].word);assert.ok(Math.abs(words[i].start-fixture.words[i].start)<.001);assert.equal(words[i].weak,false);}
 assert.equal(normalizeChar('إ'),normalizeChar('ا'));assert.equal(normalizeChar('ّ'),'');
});
test('ASR mismatch is flagged and unmatched words have monotonic estimated timings',()=>{
 const out=alignWords('قلبك بيضخ دم بسرعة', [{word:'قلبك',start:.2,end:.5,confidence:.98},{word:'دم',start:1,end:1.3,confidence:.98}],3);
 assert.equal(out[0].text,'قلبك');assert.equal(out[0].start,.2);assert.ok(out[1].weak);assert.ok(out[3].weak);assert.ok(out.every((w,i)=>!i||w.start>=out[i-1].start));
});
test('repair enforces valid sorted indices, intro at zero, and never three repeated templates',()=>{
 const x=repairStoryboard({scenes:[{type:'process',at:7,template:'flow'},{type:'process',at:2,template:'flow'},{type:'process',at:4,template:'flow'},{type:'bad',at:200,template:'flow'}],accents:[[99,'accent'],[2,'blue'],[-1,'accent'],[1,'garbage']]},10);
 assert.equal(x.scenes[0].type,'intro');assert.equal(x.scenes[0].at,0);assert.ok(x.scenes.every((s,i)=>s.at>=0&&s.at<10&&(!i||s.at>x.scenes[i-1].at)));assert.ok(x.scenes.every((s,i)=>i<2||s.template!==x.scenes[i-1].template||s.template!==x.scenes[i-2].template));assert.deepEqual(x.accents,[[2,'blue']]);
});
test('local icons carry license metadata and only requested icons are sent',()=>{
 const hit=resolveIcon('heart');assert.ok(hit.svg.includes('<svg'));const icons=usedIcons({scenes:[{icons:['heart','neuron']}]});assert.equal(Object.keys(icons).length,2);assert.ok(icons.heart.id.includes(':'));
});
test('synthesized sound effects are deterministic and confined to cuts',()=>{
 const a=createSfxWav([1,3],5),b=createSfxWav([1,3],5);assert.deepEqual(a,b);assert.equal(a.toString('ascii',0,4),'RIFF');assert.ok(a.subarray(44,44+10000).every(v=>v===0));assert.ok(a.subarray(44+48000*2,44+48000*2+1000).some(v=>v!==0));
});
