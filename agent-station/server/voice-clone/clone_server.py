"""
Agent Station voice cloner: a small local service around Chatterbox
(open-source, MIT, by Resemble AI) that speaks text in a cloned voice.

    pip install chatterbox-tts
    python clone_server.py            # http://127.0.0.1:8890

Only the Agent Station server talks to this, so it listens on localhost.
Voice samples are recorded in the app with a spoken consent statement and
stored by the station in DATA_DIR/voices/<id>.wav. Every generated clip
carries Chatterbox's built-in (inaudible) Perth watermark, so cloned audio
can be identified as AI-generated.
"""
import argparse
import io
import json
import os
import re
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description="Agent Station voice cloner (Chatterbox)")
parser.add_argument("--port", type=int, default=int(os.environ.get("CLONE_PORT", 8890)))
parser.add_argument("--voices-dir", default=os.environ.get("VOICES_DIR", str(HERE.parent / "data" / "voices")))
parser.add_argument("--multilingual", action="store_true", default=os.environ.get("CLONE_MULTILINGUAL") == "1",
                    help="use the multilingual model (23 languages) instead of the English one")
args = parser.parse_args()
VOICES = Path(args.voices_dir).resolve()

device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
print(f"Loading Chatterbox ({'multilingual' if args.multilingual else 'English'}) on {device}. "
      "The first run downloads the model, which takes a while...", flush=True)
if args.multilingual:
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS as Model
else:
    from chatterbox.tts import ChatterboxTTS as Model
model = Model.from_pretrained(device=device)
lock = threading.Lock()  # one generation at a time (GPU/CPU memory)
loaded_voice = None       # conditionals are cached per voice


def to_wav(tensor, sr):
    pcm = np.clip(tensor.squeeze(0).detach().cpu().numpy(), -1, 1)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((pcm * 32767).astype("<i2").tobytes())
    return buf.getvalue()


def speak(text, voice, language="en", exaggeration=0.5):
    global loaded_voice
    if not re.fullmatch(r"[a-z0-9_-]{1,64}", voice or ""):
        raise ValueError("bad voice id")
    ref = VOICES / f"{voice}.wav"
    if not ref.is_file():
        raise FileNotFoundError("voice sample not found")
    with lock:
        if loaded_voice != voice:
            model.prepare_conditionals(str(ref), exaggeration=exaggeration)
            loaded_voice = voice
        if args.multilingual:
            wav = model.generate(text, language_id=language or "en", exaggeration=exaggeration)
        else:
            wav = model.generate(text, exaggeration=exaggeration)
    return to_wav(wav, model.sr)


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ok": True, "engine": "chatterbox", "device": device, "multilingual": args.multilingual})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/speak":
            return self._send(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(min(n, 100_000)) or b"{}")
            text = str(body.get("text", "")).strip()[:1000]
            if not text:
                return self._send(400, {"error": "no text"})
            exag = float(body.get("exaggeration", 0.5))
            audio = speak(text, body.get("voice"), str(body.get("language", "en"))[:5], max(0.25, min(exag, 2.0)))
            self._send(200, audio, "audio/wav")
        except (ValueError, FileNotFoundError) as e:
            self._send(400, {"error": str(e)})
        except Exception as e:  # keep serving after a bad request
            self._send(500, {"error": f"generation failed: {e}"})

    def log_message(self, fmt, *a):
        pass


print(f"Voice cloner ready on http://127.0.0.1:{args.port} (voices: {VOICES})", flush=True)
ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
