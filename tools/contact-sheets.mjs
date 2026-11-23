// Generates one real mock-backed project for each template, then samples its
// deterministic renderer at four times. No full nine-video render required.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {startHarness,request,waitProject,testData,base} from './harness.mjs';import {TEMPLATES} from '../lib/storyboard.mjs';import {binary} from '../lib/media.mjs';
const stop=await startHarness();let browser;const sheetDir=path.resolve('tests/contact-sheets'),temp=path.resolve(testData,'contact-frames');fs.mkdirSync(sheetDir,{recursive:true});fs.mkdirSync(temp,{recursive:true});
const exportDir=path.resolve('tests/template-projects');fs.rmSync(exportDir,{recursive:true,force:true});fs.mkdirSync(exportDir,{recursive:true});
const manifest=[];try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage({viewport:{width:360,height:640},deviceScaleFactor:1});
 for(const template of TEMPLATES){
  const p=await request('/api/projects',{method:'POST',body:{topic:`اختبار قالب ${template} — القلب والحركة`,duration:10,voiceMode:'tts',auto:{script:true,voice:true,timing:true,storyboard:false,render:false}}});await request(`/api/projects/${p.id}/start`,{method:'POST'});
  const ready=await waitProject(p.id,x=>x.stages.storyboard.status==='review',60000);
  const scene={type:'intro',at:0,template,title:'القلب والحركة',subtitle:'اختبار بصري للقالب',icons:['heart','lungs','muscle','pulse'],items:['القلب','Oxygen','الدم','العضلات'],value:65};
  const updated=await request(`/api/projects/${p.id}/stages/storyboard`,{method:'PATCH',body:{storyboard:{scenes:[scene],accents:[[1,'accent'],[8,'blue']]}}});assert.equal(updated.storyboard.scenes[0].template,template);assert.equal(updated.stages.storyboard.status,'review');
  const renderData=await request(`/api/projects/${p.id}/render-data`);assert.equal(Object.keys(renderData.icons).length,4,'renderer should receive only four requested icons');
  await page.goto(`${base}/render.html?id=${p.id}`);await page.evaluate(()=>window.ready);const times=[0,.8,4.2,8.7],files=[];
  for(let i=0;i<times.length;i++){await page.evaluate(t=>window.drawFrame(t),times[i]);const f=path.join(temp,`${template}-${i}.png`);await page.screenshot({path:f});files.push(f);}
  const dest=path.join(sheetDir,`${template}.jpg`),args=['-hide_banner','-loglevel','error','-y'];for(const f of files)args.push('-i',f);args.push('-filter_complex','[0:v][1:v][2:v][3:v]hstack=inputs=4[out]','-map','[out]','-frames:v','1','-q:v','3','-update','1',dest);const proc=spawnSync(binary('ffmpeg',{}),args,{encoding:'utf8'});if(proc.status!==0)throw Error(proc.stderr);
  fs.cpSync(path.join(testData,'projects',p.id),path.join(exportDir,p.id),{recursive:true});manifest.push({template,projectId:p.id,statuses:Object.fromEntries(Object.entries(updated.stages).map(([k,v])=>[k,v.status])),samples:times,sheet:path.relative(process.cwd(),dest),weakWords:ready.words.filter(w=>w.weak).length});console.log(`✓ ${template.padEnd(8)} project ${p.id} · 4 frames`);
 }
 fs.writeFileSync(path.join(sheetDir,'manifest.json'),JSON.stringify(manifest,null,2));console.log(`PASS — ${manifest.length} project contact sheets in tests/contact-sheets/`);
}catch(e){console.error('CONTACT SHEETS FAILED:',e.stack||e);process.exitCode=1;}
finally{await browser?.close().catch(()=>{});await stop();}
