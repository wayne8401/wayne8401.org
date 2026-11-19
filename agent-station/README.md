# Agent Station

A mobile app that **runs a team of AI agents on your phone**. Give them real tasks, chain them into workflows, and watch them remember and learn. No computer is needed: the agents, their memory, skills, files and workflows all live inside the app (an installable web app for iPhone and Android).

## Run agents on your phone (no computer)
Open the app, choose **Run them on this phone**, and give your agents a brain:

| Brain | Cost | Notes |
|---|---|---|
| **On-device models** via [wllama](https://github.com/ngxson/wllama) (llama.cpp in the browser, MIT). 🛠 With tools: Qwen2.5 0.5B / 1.5B, Llama 3.2 1B / 3B, Qwen3 1.7B. 💬 Chat only: Gemma 3 1B, SmolLM2 1.7B, DeepSeek R1 Distill 1.5B, TinyLlama 1.1B | Free, private, works offline | One-time 0.5–2 GB download. Runs on the phone's processor in any modern browser (graphics chip used automatically when available) |
| **OpenRouter** `:free` models | Free (rate-limited) | Paste a free key from openrouter.ai |
| **Groq** | Free tier | Paste a free key from console.groq.com |
| **Claude** | Paid per use | Paste a key from console.anthropic.com; adds real web search. Uses the official Anthropic SDK (`vendor/`, MIT) |
| **Custom** OpenAI-compatible server | Free | Any https endpoint |

Models are labelled 🛠 (uses tools: files, memory, skills, plugins) or 💬 (chat only: answers directly). The default brain is always a 🛠 model. Keys are stored only on the phone and sent only to that service. Keep the app open while agents work: phones pause web apps in the background, so the app keeps the screen awake during tasks. On the phone, agents have memory, skills, files, workflows, voice chat, characters, and the calculator/weather/Wikipedia plugins plus store profit, drop countdown, Chicago time and best-time-to-post. MCP connectors, studio voices and voice cloning need the optional computer server (below).

### Get the app onto your phone
The app is a set of static files, so any free static host works:
1. Put the `agent-station` folder online, for example by dragging it onto **netlify.com/drop** (or using GitHub Pages or Cloudflare Pages). You'll get an `https://` link.
2. Open the link on your phone. On **iPhone**, use Safari → Share → **Add to Home Screen**. On **Android**, use Chrome → ⋮ → **Install app**.
3. It opens full-screen like a native app. Choose **Run them on this phone** and set up a brain.

### Paid brains
Paste a key in **🧠 → Set up brains → 💳 Paid brains** for **OpenAI (GPT)**, **Google Gemini**, **xAI Grok**, **Mistral**, **DeepSeek** or **Perplexity** (live web search, chat only), alongside Claude. Keys stay on the phone. If a provider doesn't let a phone browser list its models, type the model name under *Model names*.

### Work connectors (real actions in your apps)
**Brain → Connect → 🔌 Work connectors**: **Zapier** (8,000+ apps; also the route for **Gmail, Google Calendar, Drive, Notion and Slack**), **GitHub** (official MCP server + personal access token), or **any MCP server** by URL. With a **Claude** brain, Anthropic connects to the servers for you (every connector works). Other brains connect straight from the phone, which works when the service allows browser requests; the app shows which ones do.

### 🤝 Muse Bridge
Connect your **Muse** agent so it works alongside your agents: give Muse tasks from the app (they come back with Muse's answer), let Muse give *your* agents tasks and run your workflows, and watch Muse's activity at its own desk on the floor.

How it works: a small Netlify Function (`netlify/functions/bridge.mjs`, logic in `bridge/core.mjs`) hosts an MCP endpoint at `/bridge/mcp` for Muse and a sync endpoint the app talks to while it's open. State lives in Netlify Blobs.

Setup:
1. In the app: **Brain → Connect → 🤝 Muse → 🎲 New** (makes and copies a token).
2. In Netlify: **Site configuration → Environment variables**, add `BRIDGE_TOKEN` = that token, then **Deploys → Trigger deploy**. Make the site **public** so Muse can reach it (the token keeps the bridge locked).
3. In Muse: add a connector (MCP server) with URL `https://<your-site>.netlify.app/bridge/mcp` and header `Authorization: Bearer <token>`.
4. Back in the app: paste the token and tap **Turn on Muse Bridge**.

Muse gets these tools: `station_overview`, `give_task`, `check_task`, `run_workflow`, `report_activity`, `get_my_tasks`, `complete_my_task`. Your agents run in the app, so Muse's requests start while the app is open. To run the bridge elsewhere: `BRIDGE_TOKEN=… node bridge/dev-server.mjs`.

## Optional: computer server (power mode)
Everything in this section needs the station server (`server/`) running on a computer. It adds Ollama and other local models, MCP connectors, studio voices and voice cloning. The phone connects to it from ⚙️ → *On my computer*.

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

**Plugins** are single-file tools in `server/plugins/`. Three free ones are included: 🧮 calculator, ⛅ weather (Open-Meteo), 📚 Wikipedia, plus 💵 store profit, ⏳ drop countdown, 🕒 current time (Chicago) and 📅 best time to post. See `server/plugins/README.md` to write your own.

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

### Run the computer server (5 minutes)
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
- `index.html`, `app.js`, `styles.css`, `characters.js` (CC0 characters and avatar art): the mobile app (no build step).
- `bridge/`, `netlify/functions/`, `netlify.toml`, `package.json`: the Muse Bridge (Netlify Function + Netlify Blobs).
- `engine.js`: the on-phone agent engine (agent loop with native tool calling, storage in IndexedDB, wllama on-device models, OpenRouter/Groq/Claude brains). `_headers`: enables multi-core on-device inference on Netlify/Cloudflare Pages. `vendor/anthropic-sdk.mjs`: the official Anthropic SDK bundled for browsers. `sw.js` and `manifest.webmanifest` make it installable.
- `server/server.mjs`: runs each task as a tool-use loop (memory, skills, files, web, plugins, connectors), serves the app, and exposes an API under `/api/` that the app polls.
- `server/providers.mjs`: Claude plus OpenAI-compatible providers (Ollama, OpenRouter, Groq, custom) and model discovery.
- `server/connectors.mjs`: MCP client and connector catalog. `server/plugins.mjs` and `server/plugins/`: plugin loader and built-in plugins. `server/webtools.mjs`: free web search and fetch. `server/voice.mjs`: Whisper transcription for voice chat.


## Factory floor, production lines and approvals

- **Factory floor** (Station tab): rooms sit on a grid. Press and drag a room to move it. **➕ Room** builds a new room; **🔗 Line** chains agents into a production line (it appears in Flows and as belts between rooms).
- **Approvals**: agents can only *propose* posts (the `queue_post` tool). You review, edit, approve or reject them. Approving never publishes anything: you copy the text and post it yourself.
- Approvals and rooms run on the phone and in demo mode. Posting and reading social/Canva/Shopify/Etsy through connectors needs the computer server (MCP) and is not built in yet.
