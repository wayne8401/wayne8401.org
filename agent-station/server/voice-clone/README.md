# Free voice cloner

Lets your agents speak in a cloned voice, using **Chatterbox** (open-source, MIT
license, by Resemble AI). It runs on your own computer, costs nothing, and copies
a voice from about 20 seconds of speech.

## Set up (once)
Python 3.10–3.12 is recommended. The first start downloads the model (a few GB).

```bash
cd agent-station/server/voice-clone
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python clone_server.py             # keep this running next to the station server
```

Then in the app, open **Brain → Connect → Voice → Clone a voice**.

- **Speed:** an NVIDIA GPU or Apple Silicon (M1+) is fast. On CPU only, each sentence
  takes several seconds, which works but is slow.
- **Other languages:** start with `python clone_server.py --multilingual` (23 languages).
- **Different port:** `--port 8891`, and set `CLONE_URL=http://127.0.0.1:8891` for the station server.

## Consent and safety
- A voice can only be created by **recording live in the app** while reading a consent
  statement aloud. There's no upload of existing clips, so it can't be pointed at
  recordings of someone who hasn't agreed.
- Only clone your own voice, or the voice of someone who has said yes.
- Never use a cloned voice to deceive or impersonate anyone (calls, messages, posts).
  In many places that's illegal.
- Every clip Chatterbox generates carries an inaudible **watermark** that identifies it
  as AI-made.
- Delete a voice in the app at any time. That removes the recording from the station.
