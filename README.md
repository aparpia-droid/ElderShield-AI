# ElderShield

ElderShield is a fraud-resilience training tool. It places a real phone call to a
consenting user, an ElevenLabs voice agent plays a scammer in a live, unscripted
conversation, and the call transcript streams to the browser in real time. When the
call ends, a language model scores what the user disclosed, and the browser shows a
debrief: a letter grade, a risk tier, a short explanation, and the transcript with
each line highlighted by how risky or protective it was.

## How a session works

1. The user opens the site, enters their study participant code, picks a scenario, and
   enters a phone number.
2. The backend places an outbound call through Twilio.
3. An ElevenLabs conversational agent answers as the scammer and improvises. Call audio
   is bridged between Twilio and ElevenLabs in both directions.
4. The transcript streams to the browser over a WebSocket during the call.
5. When the user hangs up, the backend sends the transcript to Groq, which returns a
   score, a risk tier, and an explanation. A second Groq call labels each line with a
   severity for the debrief highlighting.
6. The debrief page shows the letter grade, the numeric score, the explanation, and the
   highlighted transcript.

## Tech stack

- Backend: `server.js` at the repo root. Node and Express, plain JavaScript. This is the
  production backend. It serves the API, bridges call audio, runs scoring, and serves the
  built frontend.
- Frontend: `frontend/`. React 18, TypeScript, and Vite. The production build is written
  to `frontend/dist` and served by `server.js`.
- Telephony: Twilio Programmable Voice for the outbound call and the media stream.
- Voice AI: ElevenLabs conversational agents, one agent per scenario.
- Scoring: Groq, used for both the transcript score and the per-line severity labels.
- Realtime: WebSockets for the Twilio media stream and for the live browser transcript.
- Hosting: Railway, with a persistent volume for the session store.

## Repo layout

- `server.js` (root): the production backend described above.
- `frontend/`: the production web app (React 18, TypeScript, Vite).
- `backend/`: an earlier TypeScript scaffold. It is not used in production and is kept
  for reference only.
- `src/` (root): a legacy prototype of the app, kept for history. It is not used in
  production.
- `docs/`: project notes.

## Study instrumentation

ElderShield is used in pilot usability testing. Each call is recorded for later analysis,
with no account system and no personal data beyond the phone number needed to place the
call.

- Participant codes: anonymous codes P01 through P20, entered on first visit and kept in
  the browser. The code is the only identifier tied to a session.
- Run numbering: each participant's calls are numbered in order, so a first and second
  call can be compared.
- Per-line timestamps: every transcript line is timestamped, which allows measures such
  as time to first disclosure.
- Session store: completed calls are appended as JSON Lines to the file under `DATA_DIR`,
  so data survives a restart. Phone numbers are not written to this store.
- Export: a token-protected endpoint returns all session records as JSON or CSV. The
  token is set in `EXPORT_TOKEN` and is never committed.

## Configuration

The server reads configuration from environment variables. Copy `.env.example` to `.env`
and fill in values. The variables the server actually uses are listed below. Do not put
real secrets in the README or in any committed file. Keep them in `.env` and in the
host's variable settings.

Server

- `PORT`: port to listen on. Defaults to 3000.

Twilio

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`: the number calls are placed from.

Public URL, so Twilio can reach the server

- `BASE_URL`: the public HTTPS base URL of the server, used for the voice webhook.
- `WSS_URL`: the public WSS base URL, used for the Twilio media stream.

ElevenLabs

- `ELEVENLABS_API_KEY`
- `AGENT_SOCIAL_SECURITY`, `AGENT_APPLE_SUPPORT`, `AGENT_LOTTERY`: the agent id for each
  scenario.
- `ELEVEN_AGENT_ID_DEFAULT`: a fallback agent id.
- Additional scenarios use `AGENT_FINANCIAL_AID`, `AGENT_CAMPUS_IT`, and `AGENT_INTERNSHIP`.
- A scenario only appears in the app when its agent id is set.

Groq

- `GROQ_API_KEY`

Study

- `DATA_DIR`: directory for the JSON Lines session store. On Railway this is a mounted
  volume.
- `EXPORT_TOKEN`: the token required to call the export endpoint.

Optional

- `AUDIO_CHUNK_MS`: size in milliseconds of the caller-audio chunks sent to ElevenLabs.
  Defaults to 20.

## Running locally

Install dependencies:

```bash
npm install
npm install --prefix frontend
```

There are two ways to run.

Single server, matching production:

```bash
npm run build   # builds the frontend into frontend/dist
npm start       # runs server.js, serving the API and the built frontend
```

This serves everything on http://localhost:3000, or on `PORT` if set.

Frontend with hot reload, backend separate:

```bash
PORT=8080 node server.js        # backend on port 8080
npm run dev --prefix frontend   # Vite dev server on http://localhost:5173
```

The Vite dev server proxies `/api` and the transcript WebSocket to the backend on port
8080.

Placing real calls needs Twilio, ElevenLabs, and Groq credentials, plus a public HTTPS
URL that Twilio can reach. Set `BASE_URL` and `WSS_URL` to that public address. The
`dev-run.sh` script starts a Cloudflare tunnel to the local server and sets those URLs
for you.

## Research context

ElderShield was built as part of the Santa Clara University Responsible AI Summer
Research Program, advised by Dr. Sharon Hsiao. It is currently in pilot usability
testing. Results are preliminary, and the tool is not claimed to improve fraud
resistance.

## Responsible use

ElderShield is for consented training simulations only. It must not be used to call,
deceive, or pressure real people. Everyone who receives a call must know in advance that
it is a simulation and must have agreed to take part.
