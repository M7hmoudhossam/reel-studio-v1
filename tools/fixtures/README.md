# Offline voice fixture

`mock-voice.mp3` is a synthetic, continuous Arabic eSpeak NG voice recording; `mock.json` includes the script and the native eSpeak word-start events, transformed into the mock ElevenLabs character-timing format. It is a test double, not an ElevenLabs recording and not a representation of ElevenLabs voice quality. The sample can be regenerated with `python3 tools/build-mock-fixture.py` if libespeak-ng and ffmpeg are installed. Regeneration is not required for running the app or tests.
