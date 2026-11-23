/* Pure, deterministic renderer: project data + t are the only visual inputs. */
(() => {
 'use strict';
 const C={bg:'#0C1014',card:'#161C22',elev:'#202830',text:'#F4F3EE',muted:'#9AA5AE',cyan:'#27B8C7',blue:'#5978FF',green:'#36C98F',orange:'#F28A30'};
 const canvas=document.getElementById('reel'),ctx=canvas.getContext('2d',{alpha:false});
 let data, icons={}; const W=720,H=1280;
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
 const ease=x=>{x=clamp(x);return 1-Math.pow(1-x,3)};
 const overshoot=x=>{x=clamp(x);const c=1.70158;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
 function rr(x,y,w,h,r,fill,stroke,width=1){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();}}
 function line(x1,y1,x2,y2,color='#30434a',width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
 function circle(x,y,r,fill,stroke,width=1){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();}}
 function text(str,x,y,size=24,color=C.text,align='right',weight=500){ctx.font=`${weight} ${size}px Plex, sans-serif`;ctx.direction=align==='right'?'rtl':'ltr';ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillStyle=color;ctx.fillText(String(str||''),x,y);}
 function fitted(str,x,y,max,size=32,color=C.text,align='right',weight=700){ctx.font=`${weight} ${size}px Plex,sans-serif`;while(ctx.measureText(str||'').width>max&&size>17){size--;ctx.font=`${weight} ${size}px Plex,sans-serif`;}text(str,x,y,size,color,align,weight);}
 function icon(name,x,y,size=70,opacity=1){const img=icons[name]||icons[Object.keys(icons)[0]];if(img?.complete&&img.naturalWidth){ctx.save();ctx.globalAlpha*=opacity;ctx.drawImage(img,x-size/2,y-size/2,size,size);ctx.restore();}else{ctx.save();ctx.globalAlpha*=opacity;circle(x,y,size*.2,null,C.cyan,3);ctx.restore();}}
 function plate(x,y,r,accent=C.cyan){circle(x,y,r,'#19252B','#2A4850',1.5);circle(x,y,r-10,null,'#304147',1);ctx.save();ctx.globalAlpha*=.10;circle(x,y,r*.7,accent);ctx.restore();}
 function iconNode(name,x,y,r,p=1,label='') {ctx.save();ctx.translate(x,y);ctx.scale(.90+.10*overshoot(p),.90+.10*overshoot(p));plate(0,0,r);icon(name,0,0,r*1.02);ctx.restore();if(label)fitted(label,x,y+r+31,140,18,C.muted,'center',500);}
 function arrow(x1,y1,x2,y2,p,color=C.cyan){const q=ease(p),x=x1+(x2-x1)*q,y=y1+(y2-y1)*q;line(x1,y1,x,y,color,2);if(q>.96){const a=Math.atan2(y2-y1,x2-x1);line(x2,y2,x2-9*Math.cos(a-.5),y2-9*Math.sin(a-.5),color,2);line(x2,y2,x2-9*Math.cos(a+.5),y2-9*Math.sin(a+.5),color,2);}}
 function microLabel(str,x,y,align='left',color='#6E858B'){text(str,x,y,12,color,align,700);}
 function background(){ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);ctx.save();ctx.globalAlpha=.17;for(let x=0;x<W;x+=36)line(x,0,x,H,'#384650',.6);for(let y=0;y<H;y+=36)line(0,y,W,y,'#384650',.6);ctx.restore();
  // top rule and corner registration marks
  line(42,39,678,39,'#314048',1);circle(47,39,3,C.cyan);line(42,1188,678,1188,'#2C3A42');
 }
 function header(){
  rr(42,61,84,31,8,'#1B2930','#2A4147');text('REEL / 01',84,82,11,C.cyan,'center',700);
  text('سلسلة علمية مبسّطة',678,78,16,C.muted,'right',500);
  text('عارف ليه؟',678,125,31,C.text,'right',700);
  rr(42,104,103,27,14,'#132229','#254852');text('SCIENCE',94,123,11,C.cyan,'center',700);
  fitted(data.title||data.topic,678,188,630,36,C.text,'right',700);
 }
 function cardBase(scene,idx){
  rr(40,222,640,617,33,C.card,'#2B3A41',1.4);
  ctx.save();ctx.beginPath();ctx.roundRect(40,222,640,617,33);ctx.clip();
  ctx.globalAlpha=.10;for(let x=60;x<680;x+=30)line(x,285,x,779,'#59727b',.6);for(let y=300;y<780;y+=30)line(40,y,680,y,'#59727b',.6);ctx.globalAlpha=1;
  const g=ctx.createRadialGradient(360,520,30,360,520,310);g.addColorStop(0,'rgba(39,184,199,.075)');g.addColorStop(1,'rgba(39,184,199,0)');ctx.fillStyle=g;ctx.fillRect(40,285,640,505);
  line(65,289,655,289,'#2D3A40',1);line(65,785,655,785,'#2D3A40',1);
  ctx.restore();
  text(String(idx+1).padStart(2,'0')+' / '+String(data.storyboard.scenes.length).padStart(2,'0'),67,266,14,C.cyan,'left',700);
  const typeNames={intro:'المشهد الافتتاحي',question:'السؤال',concept:'الفكرة',process:'كيف يحدث؟',compare:'المقارنة',stat:'بالأرقام',recap:'الخلاصة'};
  text(typeNames[scene.type]||'الفكرة',651,267,16,C.muted,'right',500);
  microLabel('VISUAL NOTE',66,816);text(scene.subtitle||'العلم، ببساطة',650,816,16,'#A1B1B4','right',500);
 }
 function art(scene,elapsed){
  let p=ease(elapsed/.55); const icons0=scene.icons?.length?scene.icons:['spark'];const names=[...icons0,...icons0,...icons0,...icons0];const items=scene.items||[];
  // Tiny pre-existing scaffold keeps every frame informative, even at a cut.
  ctx.save();ctx.beginPath();ctx.roundRect(41,290,638,494,0);ctx.clip();
  ctx.globalAlpha*=.45+.55*p;ctx.translate(360,538);const push=1+.018*clamp(elapsed/3);ctx.scale(push,push);ctx.translate(-360,-538);
  // corner brackets
  ctx.strokeStyle='#385159';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(79,335);ctx.lineTo(79,316);ctx.lineTo(98,316);ctx.moveTo(641,335);ctx.lineTo(641,316);ctx.lineTo(622,316);ctx.moveTo(79,741);ctx.lineTo(79,760);ctx.lineTo(98,760);ctx.moveTo(641,741);ctx.lineTo(641,760);ctx.lineTo(622,760);ctx.stroke();
  const type=scene.template;
  if(type==='body'){
   ctx.save();ctx.lineWidth=3;ctx.strokeStyle='#6A969A';ctx.globalAlpha*=.9;
   circle(360,359,39,null,'#6A969A',3);ctx.beginPath();ctx.moveTo(309,404);ctx.bezierCurveTo(270,415,251,445,255,490);ctx.lineTo(275,553);ctx.lineTo(297,547);ctx.lineTo(295,490);ctx.lineTo(302,589);ctx.lineTo(287,699);ctx.lineTo(321,699);ctx.lineTo(353,598);ctx.lineTo(367,598);ctx.lineTo(399,699);ctx.lineTo(433,699);ctx.lineTo(418,589);ctx.lineTo(425,490);ctx.lineTo(423,547);ctx.lineTo(445,553);ctx.lineTo(465,490);ctx.bezierCurveTo(469,445,450,415,411,404);ctx.quadraticCurveTo(360,422,309,404);ctx.stroke();ctx.restore();
   circle(360,480,75,'rgba(39,184,199,.08)','#396C72',1);circle(360,480,54,'#1B3034','#27B8C7',1.5);icon(names[0],360,480,69);
   line(414,478,510,478,'#3F767B',1);circle(510,478,3,C.cyan);microLabel('BODY / SYSTEM',510,463);microLabel('01',192,490);line(198,499,270,499,'#38535B');
  }else if(type==='zoom'){
   circle(208,526,104,'#19282D','#42636B',2);circle(208,526,88,null,'#2C4A51',1);icon(names[0],208,526,96);
   circle(493,526,141,'#1A2A31','#4A6B74',2);circle(493,526,125,null,'#39525C',1);circle(493,526,100,'rgba(39,184,199,.06)','#31525C',1);icon(names[1],493,526,130);
   ctx.setLineDash([5,7]);line(303,480,379,430,'#4D868D');line(303,572,379,622,'#4D868D');ctx.setLineDash([]);
   microLabel('01  /  MACRO',157,666);microLabel('02  /  MICRO',441,696);circle(303,480,4,C.cyan);circle(303,572,4,C.cyan);
  }else if(type==='flow'){
   const xs=[162,360,558];for(let i=0;i<2;i++)arrow(xs[i]+60,520,xs[i+1]-60,520,(elapsed-.2*i)/.65,'#397D87');
   xs.forEach((x,i)=>{iconNode(names[i],x,520,59,(elapsed-i*.13)/.5,items[i]);microLabel('0'+(i+1),x,430,'center',C.cyan)});
   line(130,674,590,674,'#2A4147');microLabel('INPUT',130,699);microLabel('OUTPUT',590,699,'right');
  }else if(type==='cycle'){
   circle(360,518,152,null,'#2A4B52',2);ctx.strokeStyle=C.cyan;ctx.lineWidth=3;ctx.beginPath();ctx.arc(360,518,152,-Math.PI/2,-Math.PI/2+Math.PI*1.78*ease(elapsed/.8));ctx.stroke();
   [[360,366],[491,594],[229,594]].forEach(([x,y],i)=>iconNode(names[i],x,y,45,(elapsed-i*.12)/.5,items[i]));
   circle(360,518,86,'#1B2B30','#34545A',1);icon(names[0],360,500,78);microLabel('CYCLE / SYSTEM',360,575,'center','#77959B');
  }else if(type==='timeline'){
   line(140,520,580,520,'#304A50',3);arrow(140,520,580,520,elapsed/.9,'#46A8AE');
   [148,289,430,572].forEach((x,i)=>{circle(x,520,43,'#20343A','#4D858B',2);icon(names[i],x,520,51);microLabel('0'+(i+1),x,448,'center',C.cyan);if(items[i])fitted(items[i],x,599,125,18,C.muted,'center',500);});
   microLabel('START',145,679);microLabel('END',576,679,'right');
  }else if(type==='chart'){
   line(140,669,590,669,'#53717A',2);line(140,400,140,669,'#53717A',2);
   [0,1,2,3].forEach(i=>{line(140,420+i*75,590,420+i*75,'#2B4149');});
   [215,360,505].forEach((x,i)=>{const h=[140,230,190][i]*(.18+.82*p);rr(x-40,669-h,80,h,12,i===1?'#297F8D':'#344B5A');icon(names[i],x,669-h-38,42);if(items[i])fitted(items[i],x,707,125,17,C.muted,'center',500);});
   microLabel('SCHEMATIC / NOT TO SCALE',145,380);
  }else if(type==='layers'){
   const labels=[items[0]||'١',items[1]||'٢',items[2]||'٣'];
   [0,1,2].forEach(i=>{const y=402+i*94;rr(145,y,430,70,17,['#20363C','#223039','#292F42'][i],'#42616B',1.5);rr(160,y+12,45,45,12,'#16262B');icon(names[i],182,y+34,32);fitted(labels[i],535,y+45,290,22,C.text,'right',500);microLabel('0'+(i+1),515,y+26,'left',C.cyan);});
   microLabel('LAYERED SYSTEM',147,730);
  }else if(type==='cards'){
   [[194,432],[526,432],[194,625],[526,625]].forEach(([x,y],i)=>{rr(x-125,y-78,250,156,22,'#1D292F','#38515A',1.5);plate(x-55,y,44,i%2?C.blue:C.cyan);icon(names[i],x-55,y,51);fitted(items[i]||`0${i+1}`,x+90,y+7,99,20,C.text,'right',700);});
  }else if(type==='meter'){
   circle(360,520,166,'#18272C','#34555C',1);circle(360,520,140,null,'#2C444B',17);
   ctx.beginPath();ctx.lineWidth=17;ctx.lineCap='round';ctx.strokeStyle=C.cyan;ctx.arc(360,520,140,Math.PI*.75,Math.PI*.75+Math.PI*1.5*clamp((scene.value??65)/100)*p);ctx.stroke();ctx.lineCap='butt';
   for(let i=0;i<9;i++){const a=Math.PI*.75+i*Math.PI*1.5/8;circle(360+Math.cos(a)*115,520+Math.sin(a)*115,2,'#6B9298');}
   icon(names[0],360,500,92);if(scene.type==='stat' && scene.value!==null && scene.value!==undefined)text(String(scene.value)+'%',360,596,34,C.text,'center',700);else microLabel('SYSTEM / LEVEL',360,598,'center');
  }
  ctx.restore();
 }
 function chunks(words){
  const out=[];let cur=[],lines=1,width=0;ctx.font='700 45px Plex,sans-serif';
  for(const w of words){const len=ctx.measureText(w.text).width+(cur.length?18:0);if(cur.length&&(cur.length>=5||(width+len>570&&lines>=2))){out.push(cur);cur=[];width=0;lines=1;}
   if(cur.length&&width+len>570){lines++;width=0;}
   cur.push(w);width+=len;
   // Keep sentence-ending questions and their punctuation in the same chunk.
   if(/[.!?؟]+[”’»"']*$/u.test(w.text)){out.push(cur);cur=[];width=0;lines=1;}
  }if(cur.length)out.push(cur);return out;
 }
 function caption(t){
  const all=chunks(data.words);let chunk=all[0]||[];for(const c of all)if(t>=c[0].start)chunk=c;else break;
  text('النص المسموع',675,895,16,C.muted,'right',500);text('●  LIVE CAPTION',44,895,11,C.cyan,'left',700);
  const lines=[];let row=[],width=0;ctx.font='700 45px Plex,sans-serif';
  for(const word of chunk){const w=ctx.measureText(word.text).width;const add=w+(row.length?18:0);if(row.length&&width+add>570){lines.push(row);row=[];width=0;}row.push({word,width:w});width+=w+(row.length>1?18:0);}if(row.length)lines.push(row);
  lines.forEach((ln,li)=>{
   const total=ln.reduce((a,v)=>a+v.width,0)+18*(ln.length-1);let x=360+total/2;const y=990+li*67;
   for(const it of ln){const word=it.word,active=t>=word.start&&t<Math.max(word.end,word.start+.04),spoken=t>=word.start;
    const accent=data.storyboard.accents.find(a=>a[0]===word.index)?.[1];let color=spoken?C.text:'#6F7D83';if(active)color=accent==='blue'?C.blue:accent==='success'?C.green:C.cyan;
    ctx.save();if(active){ctx.shadowColor='rgba(39,184,199,.32)';ctx.shadowBlur=13;}text(word.text,x,y,45,color,'right',700);ctx.restore();
    if(accent&&spoken){line(x-it.width,y+10,x,y+10,accent==='blue'?C.blue:accent==='success'?C.green:C.cyan,2.5);}
    x-=it.width+18;
   }
  });
 }
 function footer(t){
  const progress=clamp(t/data.duration);rr(42,1212,636,3,2,'#28353B');rr(42,1212,Math.max(2,636*progress),3,2,C.cyan);
  text('عِلْم في دقيقة',678,1253,15,C.muted,'right',500);const sec=Math.floor(t);const dur=Math.round(data.duration);text(`${String(sec).padStart(2,'0')} / ${String(dur).padStart(2,'0')} SEC`,42,1253,12,'#7E959A','left',700);
  circle(360,1245,3,C.cyan);circle(373,1245,3,'#42575D');circle(386,1245,3,'#42575D');
 }
 // Exposes the same onset rule for reproducible automated sync checks.
 window.inspectFrame=function(t){if(!data)return null;t=Math.max(0,Math.min(data.duration,Number(t)||0));let chosen=(chunks(data.words)[0]||[]);for(const group of chunks(data.words))if(t>=group[0].start)chosen=group;else break;let sceneIndex=0;for(let i=0;i<data.storyboard.scenes.length;i++){const onset=data.words[data.storyboard.scenes[i].at]?.start??0;if(t>=onset)sceneIndex=i;else break;}return {sceneIndex,captionIndices:chosen.map(w=>w.index),activeIndices:chosen.filter(w=>t>=w.start&&t<Math.max(w.end,w.start+.04)).map(w=>w.index)};};
 window.drawFrame=function(t){if(!data)return;t=Math.max(0,Math.min(data.duration,Number(t)||0));ctx.setTransform(1.5,0,0,1.5,0,0);ctx.clearRect(0,0,W,H);background();header();let idx=0;
  for(let i=0;i<data.storyboard.scenes.length;i++){const sc=data.storyboard.scenes[i],onset=data.words[sc.at]?.start??0;if(t>=onset)idx=i;else break;}
  const scene=data.storyboard.scenes[idx],at=data.words[scene.at]?.start??0;cardBase(scene,idx);const next=data.storyboard.scenes[idx+1],nextAt=next?(data.words[next.at]?.start??Infinity):Infinity;if(next&&t<nextAt&&nextAt-t<.28){ctx.save();ctx.globalAlpha=.25*ease(1-(nextAt-t)/.28);art(next,0);ctx.restore();}art(scene,Math.max(0,t-at));caption(t);footer(t);
 };
 window.ready=(async()=>{data=await fetch('/api/projects/'+encodeURIComponent(new URLSearchParams(location.search).get('id'))+'/render-data').then(r=>{if(!r.ok)throw Error('Project is not ready to render');return r.json()});
  await Promise.all(['400 24px Plex','500 24px Plex','700 24px Plex'].map(f=>document.fonts.load(f)));await document.fonts.ready;await Promise.all(Object.entries(data.icons).map(([name,entry])=>new Promise(resolve=>{const im=new Image();im.onload=resolve;im.onerror=resolve;let svg=entry.svg.replace(/currentColor/g,'#68CED2').replace(/#000000\b/gi,'#68CED2').replace(/#000\b/gi,'#68CED2').replace(/fill="black"/gi,'fill="#68CED2"');im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);icons[name]=im;})));window.drawFrame(0);return true;})();
})();
