# Agent Station

A mobile app for running a team of AI agents: give them real tasks, chain them into workflows, and watch them learn. It works on any phone as an installable web app.

## What your agents can do
- **Real work:** search the web, read pages, and save deliverables (reports, drafts, plans) as files you open in the app.
- **Remember:** they read their memories before every task and save new facts (your preferences, decisions, results). You can view and delete these under **Brain → Memory**.
- **Learn skills:** they save reusable playbooks ("skills") and load the right one when a task fits. Ask them to *"learn a skill"*, or write one yourself under **Brain → Skills**.
- **Work as a team:** workflows run agents one after another, and each step gets the earlier steps' results.

## Made for beginners
- **Guided tour** on first launch (replay it from Guide or ⚙️).
- **Templates** with `[blanks]` to fill in: research, compare, summarize a link, email, social posts, plan a goal, plan my day, remember me, teach a skill.
- **Prompt coach** that lights up Goal / Context / Format / Done when as you type, plus **✨ Improve my prompt**, which rewrites a rough idea into a clear brief.
- **Lessons** on agents, prompts, workflows, memory, skills, connecting real agents, and safety & costs.
- **Demo mode** that simulates everything, so you can learn before you have an API key.

## Run it for real (5 minutes)
You need Node.js 18+ and an Anthropic API key from console.anthropic.com.

```bash
cd agent-station/server
npm install
ANTHROPIC_API_KEY=your-key npm start
```

Open the address it prints. On your phone, use your computer's Wi-Fi IP, e.g. `http://192.168.1.20:8787`. The app detects the server and connects on its own. To install it: Safari → Share → **Add to Home Screen** on iPhone, or Chrome → **Install app** on Android.

### Server settings (environment variables)
| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Required for real tasks |
| `PORT` | `8787` | Port to listen on |
| `STATION_TOKEN` | none | Require this token from the app. Set it if the server is reachable from the internet, and enter the same token in ⚙️ Settings |
| `AGENT_MODEL` | `claude-opus-5-5` | Claude model the agents use |
| `AGENT_EFFORT` | `medium` | `low` / `medium` / `high`: how hard agents think. Higher costs more |
| `MAX_TURNS` | `30` | Safety cap on tool rounds per task |
| `DATA_DIR` | `server/data` | Where tasks, memory, skills and files are stored |

### Costs and safety
- Every real task uses tokens billed to your API key. The Spend tile shows an estimate.
- Agents can only write files inside `DATA_DIR/files`. They can't send email, spend money or run commands.
- Agents are told not to save secrets in memory. Don't paste passwords or card numbers into prompts.

## How it fits together
- `index.html`, `app.js`, `styles.css`: the mobile app (no build step). `sw.js` and `manifest.webmanifest` make it installable.
- `server/server.mjs`: runs each task as a Claude tool-use loop with web search, web fetch, memory, skill and file tools. It also serves the app and an API under `/api/` that the app polls for live status.
