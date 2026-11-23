#!/usr/bin/env python3
"""Developer-only fixture generator: requires libespeak-ng and ffmpeg.
Synthesize the whole utterance and read eSpeak's native word-start events, so
mock API word onsets are genuine rather than uniformly estimated. The app and
its offline tests use the already-bundled fixture; Python/eSpeak aren't needed.
"""
import ctypes, ctypes.util, json, re, subprocess, tempfile, wave
from pathlib import Path
HERE=Path(__file__).resolve().parent/'fixtures'
SCRIPT='''قلبك بيسرّع لما تجري.
عارف ليه؟
عضلاتك بتطلب Oxygen أكتر، فيشتغل قلبك زي مضخة بتزوّد توصيل الدم.
باختصار، النبض السريع بيساعد جسمك يواكب المجهود.'''
TITLE='ليه قلبك بيدق أسرع لما تجري؟'
SOURCES='https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse'
class EventId(ctypes.Union):
 _fields_=[('number',ctypes.c_int),('name',ctypes.c_char_p),('string',ctypes.c_char*8)]
class Event(ctypes.Structure):
 _fields_=[('type',ctypes.c_int),('unique_identifier',ctypes.c_uint),('text_position',ctypes.c_int),('length',ctypes.c_int),('audio_position',ctypes.c_int),('sample',ctypes.c_int),('user_data',ctypes.c_void_p),('id',EventId)]
Callback=ctypes.CFUNCTYPE(ctypes.c_int,ctypes.POINTER(ctypes.c_short),ctypes.c_int,ctypes.POINTER(Event))
audio=[]; events=[]
@Callback
def callback(wav,count,ev):
 if wav and count: audio.append(ctypes.string_at(wav,count*2))
 i=0
 while ev[i].type:
  e=ev[i]
  if e.type==1: events.append({'position':e.text_position,'length':e.length,'start':e.audio_position/1000})
  i+=1
 return 0
libname=ctypes.util.find_library('espeak-ng')
if not libname: raise SystemExit('Install libespeak-ng first.')
lib=ctypes.CDLL(libname)
lib.espeak_Initialize.argtypes=[ctypes.c_int,ctypes.c_int,ctypes.c_char_p,ctypes.c_int]
rate=lib.espeak_Initialize(2,0,None,0) # synchronous retrieval
lib.espeak_SetSynthCallback.argtypes=[Callback];lib.espeak_SetSynthCallback(callback)
lib.espeak_SetVoiceByName.argtypes=[ctypes.c_char_p]
if lib.espeak_SetVoiceByName(b'ar')!=0: raise SystemExit('Arabic eSpeak voice unavailable.')
lib.espeak_SetParameter(1,260,0);lib.espeak_SetParameter(2,110,0);lib.espeak_SetParameter(3,44,0)
lib.espeak_Synth.argtypes=[ctypes.c_char_p,ctypes.c_size_t,ctypes.c_uint,ctypes.c_int,ctypes.c_uint,ctypes.c_uint,ctypes.POINTER(ctypes.c_uint),ctypes.c_void_p]
source=SCRIPT.encode('utf8');assert lib.espeak_Synth(source,len(source)+1,0,1,0,1,None,None)==0
lib.espeak_Synchronize()
initial_silence=round(.16*rate);pcm=b'\0\0'*initial_silence+b''.join(audio);duration=len(pcm)/2/rate
matches=list(re.finditer(r'\S+',SCRIPT));assert len(matches)==len(events),(len(matches),len(events))
words=[]
for i,(m,e) in enumerate(zip(matches,events)):
 # The native event positions count Unicode characters, start at 1 and omit punctuation.
 assert e['position']-1==m.start(),(e,m.group(),m.start())
 start=initial_silence/rate+e['start'];end=initial_silence/rate+events[i+1]['start'] if i+1<len(events) else duration
 words.append({'word':m.group(),'start':round(start,5),'end':round(end,5),'confidence':1.0})
characters=list(SCRIPT);starts=[0.0]*len(characters);ends=[0.0]*len(characters)
for m,w in zip(matches,words):
 for j in range(m.end()-m.start()):
  n=m.end()-m.start();starts[m.start()+j]=round(w['start']+(w['end']-w['start'])*j/n,5);ends[m.start()+j]=round(w['start']+(w['end']-w['start'])*(j+1)/n,5)
for i,c in enumerate(characters):
 if c.isspace():starts[i]=ends[i-1] if i else 0;ends[i]=starts[i]
HERE.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
 raw=Path(tmp)/'fixture.wav'
 with wave.open(str(raw),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(pcm)
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(raw),'-codec:a','libmp3lame','-q:a','3',str(HERE/'mock-voice.mp3')],check=True)
fixture={'title':TITLE,'script':SCRIPT,'sources':SOURCES,'voice':'continuous eSpeak NG Arabic, native word-start events (offline mock, not ElevenLabs)','sample_rate':rate,'duration_seconds':round(duration,4),'words':words,'alignment':{'characters':characters,'character_start_times_seconds':starts,'character_end_times_seconds':ends}}
(HERE/'mock.json').write_text(json.dumps(fixture,ensure_ascii=False,indent=2),encoding='utf8')
print(f'{len(words)} native word events; audio {duration:.3f} s; first onset {words[0]["start"]:.3f} s')
