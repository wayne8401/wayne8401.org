# Voice server: free studio voices + voice cloning

Gives your agents natural voices, all open source, running on your own computer:

| Engine | What it does | License | Size / speed |
|---|---|---|---|
| **Kokoro-82M** | 14 ready-made **studio voices** (American & British English) | Apache-2.0: free for personal and commercial use | Small, fast even on CPU |
| **Chatterbox** (Resemble AI) | **Clones** a consented voice from ~20 s of speech | MIT | Larger; GPU or Apple Silicon recommended |

## Set up (once)
Python 3.10–3.12 is recommended. Engines download their model the first time they're used.

```bash
cd agent-station/server/voice-clone
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install kokoro                 # studio voices only (small)
pip install -r requirements.txt    # ...or studio voices + cloning
python voice_server.py             # keep this running next to the station server
```

Then in the app: **Brain → Connect → Voice**. Preview the studio voices, clone a voice, and pick a
speaking voice per agent (tap the agent → Speaking voice). Characters from the gallery get
their suggested studio voice automatically.

Options: `--port 8891` (and set `VOICE_URL=http://127.0.0.1:8891` for the station server),
`--multilingual` for cloning in 23 languages, `--preload` to load engines at startup.
For better pronunciation of unusual words, install `espeak-ng` (Kokoro's fallback).

## Licenses in plain words
- **Studio voices (Kokoro-82M):** model and voices are Apache-2.0, so you may use the audio in personal and commercial projects. See the model card: https://huggingface.co/hexgrad/Kokoro-82M
- **Characters and avatars** in the app (`characters.js`) are original and released under CC0.
- **Cloned voices** belong to the person whose voice it is. Use them only with their permission.

## Consent and safety for cloning
- A voice can only be created by **recording live in the app** while reading a consent statement
  aloud. There's no upload of existing clips.
- Only clone your own voice or someone who has said yes; never use a cloned voice to deceive or
  impersonate anyone (in many places that's illegal).
- Every Chatterbox clip carries an inaudible **watermark** identifying it as AI-made.
- Deleting a voice in the app removes its recording from the station.
