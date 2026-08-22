# ElderShield.AI

ElderShield.AI is a scam-call simulation and debrief app. This repo contains the monorepo (frontend + backend).

## Tech Stack

- **Frontend:** React + Vite + TypeScript
- **Backend:** Express + TypeScript
- **Live transcript:** WebSocket
- **Storage:** In-memory session store (no database yet)
- **Twilio:** Placeholder integration for voice webhooks
- **Config:** Environment variables via dotenv

## How to Install

```bash
# From repo root
npm run install:all
# or
npm install
```

This installs dependencies for the root workspace and for `frontend` and `backend`.

## How to Run Locally

1. Install all deps:
   ```bash
   npm run install:all
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
3. Start both frontend and backend:
   ```bash
   npm run dev
   ```
   - Frontend: http://localhost:5173
   - API: http://localhost:8080

   If Twilio creds are set in `.env`, starting a session places a real outbound call to the phone number.

3. **Optional:** Use the Home page to enter a phone number, pick a scenario, and click Start. You’ll be taken to the Live page (streaming transcript), then after 10 seconds to the Debrief page (score + transcript + risk label).

## How to Use ngrok for Twilio Webhooks

When you’re ready to receive real Twilio voice webhooks:

1. Install [ngrok](https://ngrok.com/).
2. Expose your local API:
   ```bash
   ngrok http 8080
   ```
3. Copy the HTTPS URL (e.g. `https://abc123.ngrok.io`) into `.env`:
   ```env
   PUBLIC_BASE_URL=https://abc123.ngrok.io
   ```
4. In the Twilio console, set your voice webhook URL to:
   `https://abc123.ngrok.io/api/twilio/voice`

(Actual ElevenLabs + Groq integration will plug in later; the code has comments marking where.)
