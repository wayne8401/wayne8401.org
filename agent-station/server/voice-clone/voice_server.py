"""
Agent Station voice server: free, open-source voices for your agents.

  Studio voices: Kokoro-82M (Apache-2.0), natural preset voices, fast even on CPU
  Cloned voices: Chatterbox (MIT, by Resemble AI), clones a consented voice sample

    pip install -r requirements.txt     # or just: pip install kokoro   (studio voices only)
    python voice_server.py              # http://127.0.0.1:8890

Engines load the first time they're used, so studio voices start quickly even if
Chatterbox is installed. Only the Agent Station server talks to this, so it listens
on localhost. Cloned voice samples are recorded in the app with a spoken consent
statement and stored by the station in DATA_DIR/voices/<id>.wav. Chatterbox output
carries its built-in (inaudible) Perth watermark.
"""
import argparse
import io
import json
import os
import re
import importlib.util
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description="Agent Station voice server (Kokoro studio voices + Chatterbox cloning)")
parser.add_argument("--port", type=int, default=int(os.environ.get("CLONE_PORT", 8890)))
parser.add_argument("--voices-dir", default=os.environ.get("VOICES_DIR", str(HERE.parent / "data" / "voices")))
parser.add_argument("--multilingual", action="store_true", default=os.environ.get("CLONE_MULTILINGUAL") == "1",
                    help="cloning: use Chatterbox's multilingual model (23 languages) instead of the English one")
parser.add_argument("--preload", action="store_true", help="load the engines at startup instead of on first use")
args = parser.parse_args()
VOICES = Path(args.voices_dir).resolve()

device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
HAS_STUDIO = importlib.util.find_spec("kokoro") is not None
HAS_CLONE = importlib.util.find_spec("chatterbox") is not None

# Studio voices (Kokoro-82M, Apache-2.0). Friendly names are ours; ids are Kokoro's.
STUDIO_VOICES = [
    {"id": "af_heart", "name": "Heart", "accent": "American", "gender": "female", "style": "warm and friendly"},
    {"id": "af_bella", "name": "Bella", "accent": "American", "gender": "female", "style": "bright and upbeat"},
    {"id": "af_nicole", "name": "Nicole", "accent": "American", "gender": "female", "style": "soft and calm"},
    {"id": "af_sarah", "name": "Sarah", "accent": "American", "gender": "female", "style": "clear and helpful"},
    {"id": "af_sky", "name": "Sky", "accent": "American", "gender": "female", "style": "light and youthful"},
    {"id": "am_adam", "name": "Adam", "accent": "American", "gender": "male", "style": "deep and steady"},
    {"id": "am_michael", "name": "Michael", "accent": "American", "gender": "male", "style": "friendly and natural"},
    {"id": "am_eric", "name": "Eric", "accent": "American", "gender": "male", "style": "confident"},
    {"id": "am_puck", "name": "Puck", "accent": "American", "gender": "male", "style": "playful and quick"},
    {"id": "bf_emma", "name": "Emma", "accent": "British", "gender": "female", "style": "polished and warm"},
    {"id": "bf_isabella", "name": "Isabella", "accent": "British", "gender": "female", "style": "elegant"},
    {"id": "bf_lily", "name": "Lily", "accent": "British", "gender": "female", "style": "gentle storyteller"},
    {"id": "bm_george", "name": "George", "accent": "British", "gender": "male", "style": "wise and measured"},
    {"id": "bm_lewis", "name": "Lewis", "accent": "British", "gender": "male", "style": "relaxed and modern"},
]
STUDIO_IDS = {v["id"] for v in STUDIO_VOICES}

lock = threading.Lock()   # one generation at a time (GPU/CPU memory)
_kokoro = {}              # lang code -> KPipeline
_clone = {"model": None, "voice": None}


def kokoro_pipeline(lang):
    if lang not in _kokoro:
        from kokoro import KPipeline
        print(f"Loading Kokoro studio voices ({'British' if lang == 'b' else 'American'} English)...", flush=True)
        _kokoro[lang] = KPipeline(lang_code=lang, device=device if device != "mps" else "cpu")
    return _kokoro[lang]


def clone_model():
    if _clone["model"] is None:
        print(f"Loading Chatterbox ({'multilingual' if args.multilingual else 'English'}) on {device}. "
              "The first run downloads the model, which takes a while...", flush=True)
        if args.multilingual:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS as Model
        else:
            from chatterbox.tts import ChatterboxTTS as Model
        _clone["model"] = Model.from_pretrained(device=device)
    return _clone["model"]


def to_wav(audio, sr):
    if hasattr(audio, "detach"):
        audio = audio.squeeze(0).detach().cpu().numpy()
    pcm = np.clip(np.asarray(audio, dtype="float32").reshape(-1), -1, 1)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((pcm * 32767).astype("<i2").tobytes())
    return buf.getvalue()


def speak_studio(text, voice, speed=1.0):
    if not HAS_STUDIO:
        raise ValueError("Studio voices need Kokoro: pip install kokoro")
    if voice not in STUDIO_IDS:
        raise ValueError("unknown studio voice")
    with lock:
        pipe = kokoro_pipeline(voice[0])  # 'a' American, 'b' British
        parts = [np.asarray(a.detach().cpu().numpy() if hasattr(a, "detach") else a, dtype="float32").reshape(-1)
                 for _, _, a in pipe(text, voice=voice, speed=speed) if a is not None]
    if not parts:
        raise ValueError("nothing to say")
    return to_wav(np.concatenate(parts), 24000)


def speak_clone(text, voice, language="en", exaggeration=0.5):
    if not HAS_CLONE:
        raise ValueError("Cloned voices need Chatterbox: pip install chatterbox-tts")
    if not re.fullmatch(r"[a-z0-9_-]{1,64}", voice or ""):
        raise ValueError("bad voice id")
    ref = VOICES / f"{voice}.wav"
    if not ref.is_file():
        raise FileNotFoundError("voice sample not found")
    with lock:
        model = clone_model()
        if _clone["voice"] != voice:
            model.prepare_conditionals(str(ref), exaggeration=exaggeration)
            _clone["voice"] = voice
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
            return self._send(200, {
                "ok": True, "device": device, "multilingual": args.multilingual,
                "studio": HAS_STUDIO, "clone": HAS_CLONE,
                "studioVoices": STUDIO_VOICES if HAS_STUDIO else [],
            })
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
            voice = str(body.get("voice", ""))
            if voice.startswith("studio:"):
                speed = max(0.5, min(float(body.get("speed", 1.0)), 2.0))
                audio = speak_studio(text, voice[7:], speed)
            else:
                exag = max(0.25, min(float(body.get("exaggeration", 0.5)), 2.0))
                audio = speak_clone(text, voice, str(body.get("language", "en"))[:5], exag)
            self._send(200, audio, "audio/wav")
        except (ValueError, FileNotFoundError) as e:
            self._send(400, {"error": str(e)})
        except Exception as e:  # keep serving after a bad request
            self._send(500, {"error": f"generation failed: {e}"})

    def log_message(self, fmt, *a):
        pass


if args.preload:
    if HAS_STUDIO:
        kokoro_pipeline("a")
    if HAS_CLONE:
        clone_model()
print(f"Voice server ready on http://127.0.0.1:{args.port} on {device} | studio voices: {'on' if HAS_STUDIO else 'off (pip install kokoro)'} | "
      f"cloning: {'on' if HAS_CLONE else 'off (pip install chatterbox-tts)'} | samples: {VOICES}", flush=True)
ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
