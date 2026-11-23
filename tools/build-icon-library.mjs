// Rebuild only when upstream packages are available; the resulting library is committed.
import fs from 'node:fs'; import path from 'node:path';
const [health,tabler] = process.argv.slice(2);
if(!health || !tabler) throw Error('Usage: node tools/build-icon-library.mjs <healthicons package dir> <tabler package dir>');
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const drawings = {
  heart:'<path d="M50 82 C44 76 18 60 17 40 C16 24 37 18 50 33 C63 18 84 24 83 40 C82 60 58 76 50 82Z"/><path d="M20 49h16l6-10 8 20 6-10h23"/>',
  body:'<circle cx="50" cy="17" r="11"/><path d="M36 33 Q50 28 64 33 L73 51 M36 33L27 51 M38 35L40 60 33 84 M62 35L60 60 67 84 M40 60H60"/>',
  cell:'<circle cx="50" cy="50" r="35"/><circle cx="50" cy="50" r="13"/><path d="M27 37l5 3 M69 33l-4 5 M30 64l5-3 M67 65l-5-4"/>',
  brain:'<path d="M50 24c-8-11-22-4-20 7-12 0-15 13-9 19-8 12 2 20 12 19 4 10 13 8 17 3 4 5 13 7 17-3 10 1 20-7 12-19 6-6 3-19-9-19 2-11-12-18-20-7v48"/><path d="M30 31q8 1 9 8 M70 31q-8 1-9 8 M21 50q9-2 14 5 M79 50q-9-2-14 5"/>',
  lungs:'<path d="M50 16v31 M45 36l-7 8 M55 36l7 8 M38 42c-8-7-15 0-19 22-3 14 6 17 17 12 8-4 9-14 9-28 M62 42c8-7 15 0 19 22 3 14-6 17-17 12-8-4-9-14-9-28"/>',
  molecule:'<circle cx="50" cy="50" r="9"/><circle cx="21" cy="28" r="7"/><circle cx="79" cy="28" r="7"/><circle cx="20" cy="75" r="7"/><circle cx="80" cy="75" r="7"/><path d="M28 33l15 12 M72 33L57 45 M27 71l16-15 M73 71L57 56"/>',
  drop:'<path d="M50 15C44 27 27 44 27 60a23 23 0 0 0 46 0C73 44 56 27 50 15Z"/><path d="M38 62c1 7 6 11 12 12"/>',
  energy:'<path d="M54 13L29 55h20l-4 32 27-45H53Z"/>',
  eye:'<path d="M12 50Q28 25 50 25T88 50Q72 75 50 75T12 50Z"/><circle cx="50" cy="50" r="11"/>',
  sun:'<circle cx="50" cy="50" r="19"/><path d="M50 13v9 M50 78v9 M13 50h9 M78 50h9 M24 24l7 7 M69 69l7 7 M76 24l-7 7 M31 69l-7 7"/>',
  atom:'<circle cx="50" cy="50" r="4"/><ellipse cx="50" cy="50" rx="34" ry="13"/><ellipse cx="50" cy="50" rx="34" ry="13" transform="rotate(60 50 50)"/><ellipse cx="50" cy="50" rx="34" ry="13" transform="rotate(120 50 50)"/>',
  clock:'<circle cx="50" cy="50" r="34"/><path d="M50 29v23l15 9"/>',
  muscle:'<path d="M18 63l8-17 13 5 5-17 13-4 4 7-8 5-1 9c10-6 22-3 28 6l-1 15c-18 10-42 12-61-1Z"/><path d="M52 51c-4 2-7 5-8 9"/>',
  pulse:'<path d="M12 51h20l7-15 9 31 9-30 8 14h23"/>',
  spark:'<path d="M50 12l5 27 27 11-27 8-5 30-7-30-26-8 26-11Z"/>'
};
const icons=[];
for (const [name,body] of Object.entries(drawings)) icons.push({id:`hand:${name}`,name,source:'hand',svg:svg(body)});
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const f of walk(path.join(health,'public/icons/svg/outline')).filter(f=>f.endsWith('.svg'))) {
 const name=path.basename(f,'.svg').replaceAll('_','-');
 icons.push({id:`health:${name}`,name,source:'health',svg:fs.readFileSync(f,'utf8')});
}
for(const f of walk(path.join(tabler,'icons/outline')).filter(f=>f.endsWith('.svg'))) {
 const name=path.basename(f,'.svg');
 icons.push({id:`tabler:${name}`,name,source:'tabler',svg:fs.readFileSync(f,'utf8')});
}
const licenses={hand:{name:'Original hand-drawn icons',license:'CC0-1.0',text:'Original artwork dedicated to the public domain under CC0 1.0.',url:'https://creativecommons.org/publicdomain/zero/1.0/'},health:{name:'Health Icons',license:'CC0-1.0',url:'https://github.com/resolvetosavelives/healthicons',text:fs.readFileSync(path.join(health,'LICENSE'),'utf8')},tabler:{name:'Tabler Icons',license:'MIT',url:'https://github.com/tabler/tabler-icons',text:fs.readFileSync(path.join(tabler,'LICENSE'),'utf8')}};
fs.writeFileSync('assets/icons/library.json',JSON.stringify({licenses,icons}));
console.log(`Bundled ${icons.length} icons`);
