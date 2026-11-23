import {spawnSync} from 'node:child_process';import fs from 'node:fs';
if(Number(process.versions.node.split('.')[0])<18){console.error('Node.js 18+ is required.');process.exit(1);}
const win=process.platform==='win32';
function run(command,args){return spawnSync(win?command+'.cmd':command,args,{stdio:'inherit',shell:win,windowsHide:false}).status===0;}
console.log('Installing dependencies…');if(!run('npm',['install']))process.exit(1);
console.log('Installing Playwright Chromium…');const installed=run('npx',['playwright','install','chromium']);
if(!installed){console.warn('Chromium download failed; checking for installed Google Chrome…');try{const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox']});await browser.close();console.log('System Google Chrome will be used.');}catch(e){console.error('Neither Playwright Chromium nor system Chrome is available. Install Google Chrome and retry.');process.exit(1);}}
fs.writeFileSync('.setup-complete','Reel Studio dependencies installed\n');console.log('Setup complete. Run npm start.');
