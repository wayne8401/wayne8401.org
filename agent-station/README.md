# Agent Station

A mobile app (installable PWA) for watching your AI agents, their workflows and the stations they run on, live.

## Screens
- **Station**: headline stats, an orbital map of stations and their agents, and the agent list with a filter per station. Tap an agent to see its details.
- **Workflows**: each pipeline step by step, showing which agent runs each step, its status and how long it has taken.
- **Activity**: a live event feed (info / success / warn / error).
- **Setup**: switch from the demo simulator to your own agent API.

## Run it
It's plain static files with no build step:

```bash
cd agent-station && python3 -m http.server 8080
```

Open `http://<your-computer-ip>:8080` on your phone. Once it's hosted over HTTPS (GitHub Pages, Netlify, etc.), use **Add to Home Screen** (iPhone) or **Install app** (Android).

## Connect your agents
In **Setup**, choose "My agent API" and enter a URL that returns JSON in the format shown on that screen (`stations`, `agents`, `workflows`, `events`; every field is optional). The app polls that URL at the interval you set and sends an optional Bearer token. The endpoint must allow CORS from the app's origin.
