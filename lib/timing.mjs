/** Align script-owned spelling to timed ASR/TTS words using a character LCS. */
export function tokenizeScript(text){return String(text||'').trim().split(/\s+/u).filter(x=>/[\p{L}\p{N}]/u.test(x));}
export function normalizeChar(c){return c.normalize('NFKD').toLowerCase().replace(/[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/gu,'').replace(/[أإآٱ]/gu,'ا').replace(/ى/gu,'ي').replace(/ؤ/gu,'و').replace(/ئ/gu,'ي').replace(/ة/gu,'ه').replace(/[^\p{L}\p{N}]/gu,'');}
export function elevenCharsToWords(a){
 if(!a||!Array.isArray(a.characters)||!Array.isArray(a.character_start_times_seconds)||!Array.isArray(a.character_end_times_seconds)) throw new Error('ElevenLabs did not return character timings.');
 const out=[]; let cur=null;
 for(let i=0;i<a.characters.length;i++){
  const c=String(a.characters[i]??''), st=Number(a.character_start_times_seconds[i]), en=Number(a.character_end_times_seconds[i]);
  if(!Number.isFinite(st)||!Number.isFinite(en)||en<st) throw new Error('Invalid character timing.');
  if(/\s/u.test(c)){if(cur){out.push(cur); cur=null;} continue;}
  if(!cur) cur={word:'',start:st,end:en,confidence:1};
  cur.word+=c; cur.end=en;
 }
 if(cur)out.push(cur); return out.filter(w=>normalizeChar(w.word));
}
function flatten(words){const arr=[]; words.forEach((w,wi)=>{for(const c of [...String(w.word??w.text??'')]) for(const n of [...normalizeChar(c)]) arr.push({char:n,word:wi});});return arr;}
export function alignWords(script, rawWords, duration){
 const tokens=tokenizeScript(script); if(!tokens.length) throw new Error('The script has no words.');
 const raw=(rawWords||[]).filter(w=>normalizeChar(String(w.word??w.text??'')) && Number.isFinite(Number(w.start)) && Number.isFinite(Number(w.end)) && Number(w.end)>=Number(w.start)).map(w=>({...w,start:Math.max(0,Number(w.start)),end:Math.max(0,Number(w.end))}));
 if(!raw.length) throw new Error('No timed words were returned.');
 const A=flatten(tokens.map(word=>({word}))), B=flatten(raw), n=A.length,m=B.length;
 if(n>10000||m>10000||n*m>8000000) throw new Error('Alignment text is too large; shorten the script.');
 const cols=m+1, dp=new Uint16Array((n+1)*cols);
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i*cols+j]=A[i].char===B[j].char?1+dp[(i+1)*cols+j+1]:Math.max(dp[(i+1)*cols+j],dp[i*cols+j+1]);
 const matches=tokens.map(()=>[]), totals=tokens.map(()=>0); for(const a of A) totals[a.word]++;
 let i=0,j=0;while(i<n&&j<m){if(A[i].char===B[j].char){matches[A[i].word].push(B[j].word);i++;j++;}else if(dp[(i+1)*cols+j]>=dp[i*cols+j+1])i++;else j++;}
 const out=tokens.map((text,idx)=>{const ids=[...new Set(matches[idx])], score=totals[idx]?matches[idx].length/totals[idx]:0;
  const first=ids.length?raw[ids[0]]:null,last=ids.length?raw[ids.at(-1)]:null;
  const confidence=ids.length?Math.min(...ids.map(id=>Number.isFinite(Number(raw[id].confidence))?Number(raw[id].confidence):1)):0;
  return {index:idx,text,start:first?.start??null,end:last?.end??null,match:Number(score.toFixed(3)),weak:score<0.7||confidence<0.6,estimated:!ids.length};
 });
 // Estimate unmatched spans between the closest neighboring matched words; never hide uncertainty.
 const limit=Math.max(0.01,Number(duration)||raw.at(-1).end);
 for(let k=0;k<out.length;){if(out[k].start!=null){k++;continue;}const from=k;while(k<out.length&&out[k].start==null)k++;const left=from?out[from-1].end:0,right=k<out.length?out[k].start:limit;const available=Math.max(0,right-left), count=k-from;
  for(let q=0;q<count;q++){out[from+q].start=left+available*q/count;out[from+q].end=left+available*(q+1)/count;}
 }
 // Several script words can map to the same ASR word. Divide that span instead of overlapping highlights.
 for(let k=0;k<out.length;){let z=k+1;while(z<out.length&&out[z].start===out[k].start&&out[z].end===out[k].end)z++;if(z-k>1){const a=out[k].start,b=out[k].end;for(let q=k;q<z;q++){out[q].start=a+(b-a)*(q-k)/(z-k);out[q].end=a+(b-a)*(q-k+1)/(z-k);out[q].weak=true;}}k=z;}
 let prev=0;for(const w of out){w.start=Math.max(prev,Math.min(limit,Number(w.start)));w.end=Math.max(w.start,Math.min(limit,Number(w.end)));w.start=+w.start.toFixed(3);w.end=+w.end.toFixed(3);prev=w.start;}
 return out;
}
