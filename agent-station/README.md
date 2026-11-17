# Agent Station

A mobile app for running a team of AI agents: give them real tasks, chain them into workflows, and watch them learn. It works on any phone as an installable web app.

## Free & open-source models
Every agent can use a different AI model, and many of them are free:

| Provider | Cost | How to turn it on |
|---|---|---|
| **Ollama** (Qwen, Llama, Mistral, Gemma, DeepSeek… on your computer) | Free, private | Install from ollama.com, run `ollama pull qwen3:8b`. Detected automatically |
| **OpenRouter** (`:free` models) | Free with rate limits | Free key from openrouter.ai, set `OPENROUTER_API_KEY` |
| **Groq** (fast open models) | Free tier | Free key from console.groq.com, set `GROQ_API_KEY` |
| **LM Studio / vLLM / llama.cpp / LocalAI / Jan** | Free | Set `OPENAI_COMPAT_URL` (e.g. `http://localhost:1234/v1`) |
| **Claude** (Anthropic) | Paid per token | Set `ANTHROPIC_API_KEY` |

Pick the default model and each agent's model in **Brain → Connect** (or tap an agent). Choose models that support *tool calling* (qwen3, llama3.1, mistral-small…). Agents on non-Claude models get free web search (DuckDuckGo, or your own SearXNG via `SEARXNG_URL`) and page reading built in.

## Connectors (MCP) & plugins
**Connectors** plug apps into every agent using the open Model Context Protocol. Switch them on in **Brain → Connect**:

| Connector | Needs |
|---|---|
| 🗂️ Files (`@modelcontextprotocol/server-filesystem`, limited to the station files folder) | Node.js |
| 🌐 Web browser (`@playwright/mcp`, headless) | Node.js |
| 🧩 Step-by-step thinking (`@modelcontextprotocol/server-sequential-thinking`) | Node.js |
| 🕸️ Knowledge graph (`@modelcontextprotocol/server-memory`) | Node.js |
| 📰 Web page reader (`mcp-server-fetch`) · 🕒 Time (`mcp-server-time`) | Python [uv](https://docs.astral.sh/uv/) |
| 🐙 GitHub (official remote server) | A personal access token |
| 📒 Notion (`@notionhq/notion-mcp-server`) | A Notion integration token |
| 🔗 Any remote MCP server | Its URL (+ token) |

Tokens are stored only on the server, in `DATA_DIR/connectors.json` (owner-read-only). To protect your computer, the app can't start arbitrary programs. Connectors that run a custom local command can only be added by editing that file on the server:

```json
{ "local": [ { "id": "git", "name": "Git", "command": "uvx", "args": ["mcp-server-git", "--repository", "/path/to/your/repo"] } ] }
```
After restarting, switch it on in the app.

**Plugins** are single-file tools in `server/plugins/`. Three free ones are included: 🧮 calculator, ⛅ weather (Open-Meteo), 📚 Wikipedia. See `server/plugins/README.md` to write your own.

## Voice chat
Tap **🎙️** at the top of the app (or **Talk** on an agent) and just speak. The agent works on what you said and **reads its answer aloud** in a few short sentences; longer details go into a file. **Hands-free** mode listens again after every answer, and saying "goodbye" ends the chat. The **🎤** in the task box dictates a prompt instead of typing. Language, voice and speed are under **Brain → Connect → Voice**.

It's free. Speech is recognized by your phone (Safari, Chrome, Edge) and spoken with its built-in voices. For browsers without speech recognition (e.g. Firefox), the server can transcribe with open-source **Whisper**: set `WHISPER_URL` to your own Whisper server (e.g. [Speaches](https://github.com/speaches-ai/speaches), free and private), or set `GROQ_API_KEY` to use Groq's free Whisper tier.

### Characters & free voices
Tap **✨ Add from gallery** on the Station tab for 12 ready-made **original characters** (Novi, Zipp, Professor Hootley, Kit, Confetti, Luma, Pip, Mira, Wrenna, Rova, Basil, Calma), each with its own personality, avatar and suggested voice. The characters and their avatar art (`characters.js`) were made for this project and are released under **CC0**: use, change and share them freely, even commercially.

**Studio voices:** 14 natural voices from [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0, free for personal and commercial use). They run on your computer, quickly even on CPU.

**Voice cloning:** clone a consented voice with [Chatterbox](https://github.com/resemble-ai/chatterbox) (MIT). A voice can only be created from a live in-app recording of the speaker reading a consent statement; the station stores who consented and when; Chatterbox watermarks its output; and voices can be deleted anytime. Only clone your own voice or someone who agreed, and never use it to impersonate or deceive.

Both run in one small service (setup in `server/voice-clone/README.md`):
```bash
cd agent-station/server/voice-clone
pip install kokoro                  # studio voices (add: pip install -r requirements.txt for cloning)
python voice_server.py
```
Then pick voices in **Brain → Connect → Voice**, or per agent (tap the agent → Speaking voice). Without the voice server, agents use the device's voice at their character's pitch.

## What your agents can do
- **Real work:** search the web, read pages, and save deliverables (reports, drafts, plans) as files you open in the app.
- **Remember:** they read their memories before every task and save new facts (your preferences, decisions, results). You can view and delete these under **Brain → Memory**.
- **Learn skills:** they save reusable playbooks ("skills") and load the right one when a task fits. Ask them to *"learn a skill"*, or write one yourself under **Brain → Skills**.
- **Work as a team:** workflows run agents one after another, and each step gets the earlier steps' results.

## Made for beginners
- **Guided tour** on first launch (replay it from Guide or ⚙️).
- **Templates** with `[blanks]` to fill in: research, compare, summarize a link, email, social posts, plan a goal, plan my day, remember me, teach a skill.
- **Prompt coach** that lights up Goal / Context / Format / Done when as you type, plus **✨ Improve my prompt**, which rewrites a rough idea into a clear brief.
- **Lessons** on agents, prompts, workflows, memory, skills, free models, connectors, voice, connecting real agents, and safety & costs.
- **Demo mode** that simulates everything, so you can learn before you have an API key.

## Run it for real (5 minutes)
You need Node.js 18+ and at least one AI model: free Ollama, a free OpenRouter/Groq key, or a Claude key.

```bash
cd agent-station/server
npm install
npm start                                   # uses Ollama if it's running
# or: OPENROUTER_API_KEY=… npm start         # free hosted models
# or: ANTHROPIC_API_KEY=… npm start          # Claude
```
The startup log lists which model providers it found. Copy `.env.example` for all the options.

Open the address it prints. On your phone, use your computer's Wi-Fi IP, e.g. `http://192.168.1.20:8787`. The app detects the server and connects on its own. To install it: Safari → Share → **Add to Home Screen** on iPhone, or Chrome → **Install app** on Android.

### Server settings (environment variables)
| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Turns on Claude models |
| `OLLAMA_URL` | `http://localhost:11434/v1` | Where Ollama runs |
| `OPENROUTER_API_KEY` / `GROQ_API_KEY` | none | Turn on free hosted models |
| `OPENAI_COMPAT_URL` / `OPENAI_COMPAT_KEY` | none | Any other OpenAI-compatible server |
| `DEFAULT_MODEL` | auto | e.g. `ollama:qwen3:8b` (you can also choose in the app) |
| `WHISPER_URL` / `WHISPER_MODEL` | none | Your OpenAI-compatible Whisper server for voice transcription (otherwise Groq if `GROQ_API_KEY` is set) |
| `VOICE_URL` | `http://127.0.0.1:8890` | Where the voice server (`voice-clone/voice_server.py`) runs |
| `SEARXNG_URL` | none | Your SearXNG instance for free web search (otherwise DuckDuckGo) |
| `PORT` | `8787` | Port to listen on |
| `STATION_TOKEN` | none | Require this token from the app. Set it if the server is reachable from the internet, and enter the same token in ⚙️ Settings |
| `AGENT_EFFORT` | `medium` | Claude only: `low` / `medium` / `high`. How hard agents think; higher costs more |
| `MAX_TURNS` | `30` | Safety cap on tool rounds per task |
| `DATA_DIR` | `server/data` | Where tasks, memory, skills and files are stored |

### Costs and safety
- Free models cost nothing. Claude tasks use tokens billed to your key; the Spend tile shows an estimate.
- Built-in tools only write inside `DATA_DIR/files`, and web fetching refuses private-network addresses. Connectors can do whatever their tools allow (e.g. GitHub can open issues), so only switch on connectors you trust and give tokens the least access they need.
- Agents are told not to save secrets in memory. Don't paste passwords or card numbers into prompts.

## How it fits together
- `index.html`, `app.js`, `styles.css`, `characters.js` (CC0 characters and avatar art): the mobile app (no build step). `sw.js` and `manifest.webmanifest` make it installable.
- `server/server.mjs`: runs each task as a tool-use loop (memory, skills, files, web, plugins, connectors), serves the app, and exposes an API under `/api/` that the app polls.
- `server/providers.mjs`: Claude plus OpenAI-compatible providers (Ollama, OpenRouter, Groq, custom) and model discovery.
- `server/connectors.mjs`: MCP client and connector catalog. `server/plugins.mjs` and `server/plugins/`: plugin loader and built-in plugins. `server/webtools.mjs`: free web search and fetch. `server/voice.mjs`: Whisper transcription for voice chat.
