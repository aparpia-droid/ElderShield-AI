require('dotenv').config();
console.log("SERVER BOOTED FROM:", process.cwd());
console.log("SERVER FILE:", __filename);
console.log("ELEVEN KEY PRESENT:", !!process.env.ELEVENLABS_API_KEY, "LEN:", (process.env.ELEVENLABS_API_KEY || "").length);
console.log("ELEVEN KEY PREFIX:", (process.env.ELEVENLABS_API_KEY || "").slice(0, 6));
console.log("GROQ KEY:", process.env.GROQ_API_KEY);

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});


const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const http = require("http");
const WebSocket = require("ws");
// child_process no longer needed - using pure JS audio transcoding
const prism = require("prism-media");

const app = express();
app.use((req, res, next) => {
  res.setHeader("X-BACKEND-ID", "fraudguard-backend-3000");
  next();
});
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  console.log(req.method, req.url);
  next();
});

const AUDIO_DIR = path.join(__dirname, 'audio_cache');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR);

app.use('/audio', express.static(AUDIO_DIR)); // Twilio will fetch MP3s here

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const sessions = {}; // sessionId -> { phoneNumber, stage, transcript }

app.get('/health', (req, res) => res.json({ ok: true }));

app.post("/twilio-stream-status", (req, res) => {
  console.log("📡 STREAM STATUS CALLBACK:", req.body);
  res.sendStatus(200);
});

async function getElevenSignedUrl(agentId) {
  const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`;
  const resp = await axios.get(url, {
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
    timeout: 15000, // 15s hard timeout so it never hangs silently
    validateStatus: () => true,
  });

  if (resp.status !== 200) {
    throw new Error(`Eleven signed-url failed: ${resp.status} ${JSON.stringify(resp.data)}`);
  }
  if (!resp.data?.signed_url) {
    throw new Error(`Eleven signed-url missing signed_url: ${JSON.stringify(resp.data)}`);
  }
  return resp.data.signed_url;
}

app.all("/voice", (req, res) => {
  const sessionId = req.query.sessionId || uuidv4();

  if (!sessions[sessionId]) {
    sessions[sessionId] = { stage: "GREETING", transcript: [], status: "in_progress" };
  }

  const twiml = new twilio.twiml.VoiceResponse();

  // Optional short audible line before streaming starts
  //twiml.say({ voice: "Polly.Joanna" }, "Welcome.");

  const connect = twiml.connect();

 const streamUrl = `${process.env.WSS_URL}/twilio/stream/${encodeURIComponent(sessionId)}`;
  console.log("STREAM URL SENT TO TWILIO:", streamUrl);

  connect.stream({
    url: streamUrl,
    statusCallback: `${process.env.BASE_URL}/twilio-stream-status`,
    statusCallbackMethod: "POST",
  });

  res.type("text/xml").send(twiml.toString());
});

// Very simple placeholder logic (replace later with ElevenLabs + LLM)
function generateNextScammerLine(userText, stage) {
  const t = (userText || "").toLowerCase();

  // If they resist, reveal simulation and end (per your rules)
  if (t.includes("scam") || t.includes("call back") || t.includes("official number")) {
    return "Understood. This was a simulated scam call for cybersecurity training. In real life, never share personal information and always call the official number from a trusted source. Goodbye.";
  }

  // Keep it short and pushy
  return "I understand. This will only take ninety seconds. For training purposes, use fake details only. What city and state should I put on the file?";
}

async function ttsToMp3Url(text) {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

  const fileName = `${Date.now()}-${Math.random().toString(16).slice(2)}.mp3`;
  const filePath = path.join(AUDIO_DIR, fileName);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`;

  const resp = await axios.post(
    url,
    {
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.35,
        similarity_boost: 0.85,
        style: 0.35,
        use_speaker_boost: true
      } 
    },
    {
      responseType: 'arraybuffer',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  );

  fs.writeFileSync(filePath, resp.data);

  return `${process.env.BASE_URL}/audio/${fileName}`;
}

app.get('/test-tts', async (req, res) => {
  try {
    const audioUrl = await ttsToMp3Url(
      "Testing ElevenLabs. This should sound realistic."
    );
    res.json({ audioUrl });
  } catch (err) {
  console.error("TTS ERROR status:", err.response?.status);
  console.error("TTS ERROR data:", err.response?.data?.toString?.() || err.response?.data || err.message);
  res.status(500).json({
    error: err.message,
    status: err.response?.status,
    data: err.response?.data?.toString?.() || err.response?.data
  });
}
});

// ---- Pure JS mulaw <-> PCM transcoding (no ffmpeg needed) ----

// G.711 mu-law decode table (256 entries: mulaw byte -> 16-bit linear)
const MULAW_DECODE = new Int16Array(256);
(function buildMulawDecode() {
  for (let i = 0; i < 256; i++) {
    let mu = ~i & 0xFF;
    let sign = mu & 0x80;
    let exponent = (mu >> 4) & 0x07;
    let mantissa = mu & 0x0F;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    sample -= 0x84;
    MULAW_DECODE[i] = sign ? -sample : sample;
  }
})();

// Encode 16-bit linear sample to mulaw byte
function linearToMulaw(sample) {
  const MULAW_MAX = 0x1FFF;
  const MULAW_BIAS = 33;
  let sign = 0;
  if (sample < 0) { sign = 0x80; sample = -sample; }
  if (sample > MULAW_MAX) sample = MULAW_MAX;
  sample += MULAW_BIAS;
  let exponent = 7;
  const expMask = 0x4000;
  for (; exponent > 0; exponent--) {
    if (sample & expMask) break;
    sample <<= 1;
  }
  const mantissa = (sample >> 10) & 0x0F;
  return ~(sign | (exponent << 4) | mantissa) & 0xFF;
}

// Decode mulaw buffer to PCM s16le buffer (same sample rate)
function decodeMulaw(mulawBuf) {
  const pcm = Buffer.alloc(mulawBuf.length * 2);
  for (let i = 0; i < mulawBuf.length; i++) {
    pcm.writeInt16LE(MULAW_DECODE[mulawBuf[i]], i * 2);
  }
  return pcm;
}

// Encode PCM s16le buffer to mulaw buffer (same sample rate)
function encodeMulaw(pcmBuf) {
  const mulaw = Buffer.alloc(pcmBuf.length / 2);
  for (let i = 0; i < mulaw.length; i++) {
    mulaw[i] = linearToMulaw(pcmBuf.readInt16LE(i * 2));
  }
  return mulaw;
}

// Resample PCM s16le: change sample rate by ratio (linear interpolation)
function resamplePcm(pcmBuf, fromRate, toRate) {
  const numSamplesIn = pcmBuf.length / 2;
  const ratio = toRate / fromRate;
  const numSamplesOut = Math.round(numSamplesIn * ratio);
  const out = Buffer.alloc(numSamplesOut * 2);
  for (let i = 0; i < numSamplesOut; i++) {
    const srcIdx = i / ratio;
    const idx0 = Math.floor(srcIdx);
    const idx1 = Math.min(idx0 + 1, numSamplesIn - 1);
    const frac = srcIdx - idx0;
    const s0 = pcmBuf.readInt16LE(idx0 * 2);
    const s1 = pcmBuf.readInt16LE(idx1 * 2);
    const sample = Math.round(s0 + frac * (s1 - s0));
    out.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }
  return out;
}

// Twilio -> Eleven (mulaw 8k -> PCM s16le at target rate)
function mulaw8kToPcm(mulawBuf, targetRate = 16000) {
  const pcm8k = decodeMulaw(mulawBuf);
  if (targetRate === 8000) return pcm8k;
  return resamplePcm(pcm8k, 8000, targetRate);
}

// Eleven -> Twilio (PCM s16le at source rate -> mulaw 8k)
function pcmToMulaw8k(pcmBuf, sourceRate = 16000) {
  let pcm8k = pcmBuf;
  if (sourceRate !== 8000) pcm8k = resamplePcm(pcmBuf, sourceRate, 8000);
  return encodeMulaw(pcm8k);
}

// Base64 convenience wrappers (for one-shot usage)
function mulaw8kB64_to_pcm16kB64(b64) {
  const input = Buffer.from(b64, "base64");
  return mulaw8kToPcm(input, 16000).toString("base64");
}

function pcm16kB64_to_mulaw8kB64(b64) {
  const input = Buffer.from(b64, "base64");
  return pcmToMulaw8k(input, 16000).toString("base64");
}

async function devCallHandler(req, res){
  console.log("=== HIT /dev-call ===", req.body);

  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: "phoneNumber required" });

  const sessionId = uuidv4();
  sessions[sessionId] = {
    phoneNumber,
    stage: "GREETING",
    transcript: [],
    status: "in_progress",
    scenarioId: "default",
    //agentId: process.env.ELEVEN_AGENT_ID_DEFAULT,
    score: null,
  };

  try {
    const call = await client.calls.create({
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${process.env.BASE_URL}/voice?sessionId=${sessionId}`,
      method: "POST",
    });

    console.log("✅ call created:", call.sid);
    return res.json({ ok: true, sessionId, callSid: call.sid });
  } catch (err) {
    // Twilio SDK puts useful stuff on err.status + err.moreInfo + err.code
    console.error("❌ Twilio call create failed");
    console.error("status:", err.status);
    console.error("code:", err.code);
    console.error("message:", err.message);
    console.error("moreInfo:", err.moreInfo);
    console.error("details:", err.details);

    return res.status(500).json({
      error: err.message,
      status: err.status,
      code: err.code,
      moreInfo: err.moreInfo,
      details: err.details,
    });
  }
}

async function sendCodeHandler(req, res) {
  const { phoneNumber } = req.body;

  if (!phoneNumber) return res.status(400).json({ error: "phoneNumber required" });

  try {
    await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications
      .create({ to: phoneNumber, channel: 'sms' });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function verifyCodeHandler(req, res) {
  const { phoneNumber, code } = req.body;

  if (!phoneNumber || !code) {
    return res.status(400).json({ error: "phoneNumber and code required" });
  }

  try {
    const result = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks
      .create({ to: phoneNumber, code });

    if (result.status === 'approved') {
      const sessionId = uuidv4();

      sessions[sessionId] = {
        phoneNumber,
        stage: "GREETING",
        transcript: [],
        status: "in_progress",
        scenarioId: "default",
        //agentId: process.env.ELEVEN_AGENT_ID_DEFAULT,
        score: null,
      };


      await client.calls.create({
        to: phoneNumber,
        from: process.env.TWILIO_PHONE_NUMBER,
        url: `${process.env.BASE_URL}/voice?sessionId=${sessionId}`,
        method: "POST",
      });

      return res.json({ verified: true, sessionId });
    }

    return res.json({ verified: false, status: result.status });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// existing routes
app.post('/dev-call', devCallHandler);
app.post('/send-code', sendCodeHandler);
app.post('/verify-code', verifyCodeHandler);

// new /api aliases (this is the fix)
app.post('/api/dev-call', devCallHandler);
app.post('/api/send-code', sendCodeHandler);
app.post('/api/verify-code', verifyCodeHandler);

// ✅ match frontend: POST /api/sessions/start
// scenario -> agent mapping
const SCENARIO_TO_AGENT = {
  social_security: process.env.AGENT_SOCIAL_SECURITY,
  tech_support: process.env.AGENT_APPLE_SUPPORT,
  lottery_giveaway: process.env.AGENT_LOTTERY,
};

const SCAM_LABELS = {
  social_security: 'Social Security Suspension',
  tech_support: 'Apple Tech Support',
  lottery_giveaway: 'Lottery / Giveaway',
};

app.post("/api/sessions/start", async (req, res) => {
  try {
    const phoneNumber = (req.body.phoneNumber || "").trim();
    const scenarioId = (req.body.scenarioId || "").trim();

    if (!phoneNumber) return res.status(400).json({ error: "phoneNumber required" });
    if (!scenarioId) return res.status(400).json({ error: "scenarioId required" });

    const sessionId = uuidv4();

    const agentId =
      SCENARIO_TO_AGENT[scenarioId] || process.env.ELEVEN_AGENT_ID_DEFAULT;

    if (!agentId) {
      return res.status(500).json({ error: "Missing agentId for scenario (check .env)" });
    }

    sessions[sessionId] = {
      phoneNumber,
      scenarioId,
      agentId,
      stage: "GREETING",
      transcript: [],
      status: "in_progress",
      score: null,
    };

    const call = await client.calls.create({
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${process.env.BASE_URL}/voice?sessionId=${sessionId}`,
      method: "POST",
    });

    console.log("✅ call created:", call.sid, "scenario:", scenarioId, "agent:", agentId);

    res.json({ sessionId, callPlaced: true });
  } catch (err) {
    console.error("❌ /api/sessions/start failed:", err?.message || err);
    res.status(500).json({ error: err?.message || "Failed to start session", callPlaced: false });
  }
});

// ✅ match frontend: GET /api/sessions/:sessionId
app.get('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params
  const s = sessions[sessionId]
  if (!s) return res.status(404).json({ error: 'Session not found' })

  const sr = s.score // null or { score, tier, explanation }
  res.json({
    sessionId,
    scenarioId: s.scenarioId || 'default',
    transcript: s.transcript || [],
    score: sr?.score ?? null,
    tier: sr?.tier ?? null,
    explanation: sr?.explanation ?? null,
    lineFindings: sr?.lineFindings ?? null,
    status: s.status ?? 'in_progress',
  })
})

/**
 * Line-level attribution for the debrief transcript.
 *
 * This is deliberately a SEPARATE Groq call. The scoring request below is left
 * byte-for-byte untouched — same system prompt, same user content, same model
 * and temperature — so scores stay reproducible while the rubric is under
 * review. This call only labels lines; it never produces or adjusts a score.
 *
 * Returns [] on any failure, so a missing annotation can never break scoring.
 */
const LINE_FINDING_SYSTEM_PROMPT = `You annotate a scam-simulation transcript for a training debrief. You do NOT score it.

Every line is prefixed with its index in square brackets, for example: [4] You: my date of birth is March 3rd.

Return findings ONLY for lines spoken by the test subject — the lines that begin with "You:" after the index. Ignore every "Caller:" line.

Mark a line "risk" when the subject revealed information a scammer could use, agreed to a scammer's request, or complied under pressure.
Mark a line "good" when the subject refused, questioned or challenged the caller, said they would verify independently, named the call as a scam, or ended the call.

Leave out lines that are neither. Never return an index that does not appear in the transcript.

For each finding write a "note" of at most 20 words, addressed to the subject as "You ...", saying plainly what was wrong or right and why it matters. For example: "You gave your date of birth — that can never be changed once a scammer has it."

Return ONLY valid JSON with no markdown:
{
  "lineFindings": [
    { "index": <number>, "type": "risk" | "good", "note": "<short plain-language note>" }
  ]
}`;

async function analyzeLineFindings(transcript, label) {
  const numbered = transcript.map((line, i) => `[${i}] ${line}`).join('\n');

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: LINE_FINDING_SYSTEM_PROMPT },
        { role: 'user', content: `Scenario: ${label}\n\nTranscript:\n${numbered}` },
      ],
      temperature: 0,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      timeout: 30000,
    }
  );

  let raw = response.data?.choices?.[0]?.message?.content || '';
  raw = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  const parsed = JSON.parse(raw);
  const findings = Array.isArray(parsed?.lineFindings) ? parsed.lineFindings : [];

  // Drop anything that does not point at a real subject line.
  return findings
    .filter((f) => Number.isInteger(f?.index) && f.index >= 0 && f.index < transcript.length)
    .filter((f) => f.type === 'risk' || f.type === 'good')
    .filter((f) => /^You:/i.test(transcript[f.index]))
    .filter((f) => typeof f.note === 'string' && f.note.trim().length > 0)
    .map((f) => ({ index: f.index, type: f.type, note: f.note.trim() }));
}

/** Never let annotation failures affect the scoring response. */
async function safeLineFindings(transcript, label) {
  try {
    return await analyzeLineFindings(transcript, label);
  } catch (err) {
    console.error('Line attribution failed:', err.response?.data || err.message);
    return [];
  }
}

app.post('/api/sessions/:sessionId/score', async (req, res) => {
  const { sessionId } = req.params;
  const session = sessions[sessionId];

  if (!session) return res.status(404).json({ error: 'Session not found' });

  if (!session.transcript || session.transcript.length === 0) {
    return res.status(400).json({ error: 'No transcript available yet' });
  }

  // If already scored, return cached result
  if (session.score) return res.json(session.score);

  const label = SCAM_LABELS[session.scenarioId] || 'Unknown';
  const transcriptText = session.transcript.join('\n');

  try {
    const groqResponse = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are the FraudGuard Risk Engine. Analyze ONLY the test subject's lines (labeled "You:").
Score starts at 100. This measures exploitability under real-world fraud conditions.

=== DYNAMIC SCAM-TYPE WEIGHTING ===
Apply these weight modifiers based on the scenario:
- Bank Fraud: +0 (baseline)
- IRS / Government Threat / Social Security: +3 on fear-based compliance penalties
- Tech Support / Apple Support: +4 on credential disclosure penalties
- Romance Scam: +4 on emotional compliance penalties
- Delivery / Phishing: +3 on link-click action penalties
- Medicare / Benefits: +3 on identity data penalties

=== INFORMATION DISCLOSURE DEDUCTIONS ===

LOW RISK (Recon Data):
- First name disclosed: -3
- Full name disclosed: -6
- Email disclosed: -7
- Phone confirmation: -5
- Employer disclosed: -8
- If ANY low-risk item given within first 30 seconds of call: additional -9
- If given confidently without pushback: additional -4

IDENTITY BUILDING DATA:
- Home address: -11
- Date of birth: -14
- Mother's maiden name: -15
- If 2 medium items disclosed: -7 stacking penalty
- If 3+ identity-related items total: -12 compounding penalty
- If scam context targets identity (Medicare, IRS, Social Security): +3 additional per item

AUTHENTICATION SIGNALS:
- Last 4 SSN: -18
- Last 4 bank/card: -19
- Security question answers: -22
- If 2+ authentication items: -14 compounding penalty
- If Tech Support scam: +4 additional per credential-type item

CRITICAL COMPROMISE:
- Full bank account number: -29
- Full credit card number: -28
- Login credentials: -30
- One-time passcode (2FA): -34
- Full SSN: -36

IRREVERSIBLE DAMAGE RULE: If ANY critical item is disclosed, final score is CAPPED at 39. Bonuses cannot override this.

=== BEHAVIORAL COMPLIANCE DEDUCTIONS ===
- Gave info within first 30 seconds: -9
- Never questioned caller identity: -8
- Stayed on call >3 minutes without challenge: -7
- Agreed to transfer money: -25
- Agreed to buy gift cards: -24
- Clicked suspicious link: -13
- Downloaded remote software: -21
- If 3+ behavioral mistakes: -9 escalation penalty
- If fear-based scam (IRS/Social Security): panic compliance penalty increases by +3

=== EMOTIONAL SUSCEPTIBILITY ===
- Expressed fear or panic: -7
- Apologized repeatedly while complying: -5
- Thanked caller before verifying identity: -4
- Followed instructions without clarifying: -8
- Expressed urgency to "fix this immediately": -6
- Emotional penalties scale by scam context (e.g., Romance +4 on emotional compliance)

=== DEFENSIVE BEHAVIOR BONUSES (capped at +15 total) ===
Diminishing returns: 1st action = full value, 2nd = minus 3, 3rd = minus 5
- Asked for employee ID: +5
- Said "I'll call back on official number": +12
- Refused to provide information: +8
- Asked "Is this a scam?": +4
- Hung up before sensitive disclosure: +13
- Called out a specific red flag: +6
- Asked for supervisor: +3
Bonuses CANNOT exceed +15. Bonuses CANNOT override Critical cap of 39.

=== FINAL SCORE TIERS ===
90-100: Scam-Proof (No leverage gained. Attacker moves on immediately.)
75-89: Cautious (Minor exposure, limited exploitation risk.)
60-74: Aware but Exposed (Enough data for fraud attempt.)
40-59: Vulnerable (Strong probability of account access attempt.)
20-39: High Risk (Serious compromise likely.)
0-19: Compromised (Immediate financial or identity damage expected.)

=== OUTPUT FORMAT ===
Return ONLY valid JSON with no markdown:
{
  "score": <number 0-100>,
  "tier": "<one of: Scam-Proof, Cautious, Aware but Exposed, Vulnerable, High Risk, Compromised>",
  "explanation": "<2-4 sentence explanation citing specific deductions and bonuses applied>"
}`,
          },
          {
            role: 'user',
            content: `Scenario: ${label}\n\nTranscript:\n${transcriptText}`,
          },
        ],
        temperature: 0.1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        },
        timeout: 30000,
      }
    );

    let raw = groqResponse.data?.choices?.[0]?.message?.content || '';
    raw = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let result;
    try {
      result = JSON.parse(raw);
      if (typeof result.score !== 'number' || !result.tier || !result.explanation) {
        console.error("Scorer JSON missing fields:", result);
        return res.status(502).json({ error: "Malformed JSON from scorer" });
      }
    } catch (e) {
      console.error("Groq returned invalid JSON:", raw);
      return res.status(502).json({ error: "Invalid JSON from scorer" });
    }

    // Additive only — attribution runs after scoring and cannot alter it.
    result.lineFindings = await safeLineFindings(session.transcript, label);

    session.score = result;

    broadcastToBrowsers(sessionId, { type: "score", score: result });

    return res.json(result);

  } catch (err) {
    console.error("Scoring error:", err.response?.data || err.message);
    return res.status(500).json({ error: err.message });
  }
});

const server = http.createServer(app);

// WebSocket servers (noServer so we can route upgrades ourselves)
const wssTwilio = new WebSocket.Server({ noServer: true, perMessageDeflate: false });
const wssBrowser = new WebSocket.Server({ noServer: true, perMessageDeflate: false });

// Route HTTP -> WS upgrades by path
server.on("upgrade", (req, socket, head) => {
  const pathname = (req.url || "").split("?")[0];

  if (pathname.startsWith("/twilio/stream")) {
    wssTwilio.handleUpgrade(req, socket, head, (ws) => {
      wssTwilio.emit("connection", ws, req);
    });
    return;
  }

  if (pathname === "/ws/transcript") {
    wssBrowser.handleUpgrade(req, socket, head, (ws) => {
      wssBrowser.emit("connection", ws, req);
    });
    return;
  }

  // Unknown WS route
  socket.destroy();
});

// sessionId -> Set of browser sockets
const browserClients = new Map();

function addBrowserClient(sessionId, ws) {
  if (!browserClients.has(sessionId)) browserClients.set(sessionId, new Set());
  browserClients.get(sessionId).add(ws);
}

function removeBrowserClient(sessionId, ws) {
  const set = browserClients.get(sessionId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) browserClients.delete(sessionId);
}

function broadcastToBrowsers(sessionId, payload) {
  const set = browserClients.get(sessionId);
  if (!set) return;
  const msg = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

wssBrowser.on("connection", (ws, req) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = u.searchParams.get("sessionId");

  if (!sessionId) {
    ws.close(1008, "missing sessionId");
    return;
  }

  console.log("✅ Browser WS connected:", sessionId);
  addBrowserClient(sessionId, ws);

  // optional: send existing transcript immediately
  const s = sessions[sessionId];
  if (s?.transcript?.length) {
    ws.send(JSON.stringify({ type: "bulk_transcript", lines: s.transcript }));
  }

  ws.on("close", () => {
    console.log("❌ Browser WS disconnected:", sessionId);
    removeBrowserClient(sessionId, ws);
  });
});

wssTwilio.on("connection", (twilioWs, req) => {
  console.log("RAW Twilio WS req.url:", req.url);

// accept only /twilio/stream/<sessionId>
const m = /^\/twilio\/stream\/([^/?#]+)/.exec(req.url || "");
const sessionId = m ? decodeURIComponent(m[1]) : null;

if (!sessionId) {
  console.log("❌ Missing sessionId in path; closing");
  twilioWs.close();
  return;
}

console.log("✅ Twilio stream sessionId:", sessionId);

  let streamSid = null;
  let elevenWs = null;

  console.log("ELEVEN_AGENT_ID present?", !!process.env.ELEVEN_AGENT_ID, "value:", process.env.ELEVEN_AGENT_ID);
  console.log("ELEVEN_API_KEY present?", !!process.env.ELEVENLABS_API_KEY, "len:", (process.env.ELEVENLABS_API_KEY || "").length);
  console.log("➡️ About to fetch Eleven signed URL...");

 // ---- helpers ----
function parsePcmRate(fmt) {
  // expected like "pcm_16000" or "pcm_44100"
  const m = /^pcm_(\d+)$/.exec(fmt || "");
  return m ? parseInt(m[1], 10) : null;
}

let transcoderReady = false;
let elevenInRate_g = 16000;
let elevenOutRate_g = 16000;

let pcmChunkBytes = 3200; // will update from metadata (100ms)

// Buffer Twilio audio until transcoders are ready
let twilioMulawQueue = Buffer.alloc(0);

// Accumulator for PCM chunks going to Eleven
let pcmAccum = Buffer.alloc(0);

function startTranscoders({ elevenInRate, elevenOutRate }) {
  elevenInRate_g = elevenInRate;
  elevenOutRate_g = elevenOutRate;

  // 100ms chunks -> bytes = rate * 0.1s * 2 bytes/sample
  pcmChunkBytes = Math.round(elevenInRate * 0.1 * 2);

  transcoderReady = true;
  console.log("✅ Pure JS transcoders ready:", { elevenInRate, elevenOutRate, pcmChunkBytes });

  // Flush any queued Twilio audio we got before init
  if (twilioMulawQueue.length) {
    processTwilioAudio(twilioMulawQueue);
    twilioMulawQueue = Buffer.alloc(0);
  }
}

// Process mulaw from Twilio -> PCM for Eleven
function processTwilioAudio(mulawBuf) {
  const pcm = mulaw8kToPcm(mulawBuf, elevenInRate_g);
  pcmAccum = Buffer.concat([pcmAccum, pcm]);

  while (pcmAccum.length >= pcmChunkBytes) {
    const piece = pcmAccum.subarray(0, pcmChunkBytes);
    pcmAccum = pcmAccum.subarray(pcmChunkBytes);

    if (elevenWs && elevenWs.readyState === WebSocket.OPEN) {
      elevenWs.send(JSON.stringify({ user_audio_chunk: piece.toString("base64") }));
    }
  }
}

// Process PCM from Eleven -> mulaw for Twilio
function processElevenAudio(pcmB64) {
  const pcmBuf = Buffer.from(pcmB64, "base64");
  const mulawBuf = pcmToMulaw8k(pcmBuf, elevenOutRate_g);

  // Twilio plays buffered mulaw; 20ms @ 8k = 160 bytes
  let offset = 0;
  while (offset + 160 <= mulawBuf.length) {
    const frame = mulawBuf.subarray(offset, offset + 160);
    offset += 160;

    if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
      twilioWs.send(
        JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: frame.toString("base64") }
        }),
        { compress: false }
      );
    }
  }
  // Send remainder if any
  if (offset < mulawBuf.length && streamSid && twilioWs.readyState === WebSocket.OPEN) {
    twilioWs.send(
      JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: mulawBuf.subarray(offset).toString("base64") }
      }),
      { compress: false }
    );
  }
}

  // --- Twilio message handler ---
  twilioWs.on("message", (data) => {
  let msg;
  try { msg = JSON.parse(data.toString()); } catch { return; }

  // DEBUG: log first few events so we know exactly what Twilio is sending
  if (!twilioWs._seen) twilioWs._seen = 0;
  if (twilioWs._seen < 15) {
    twilioWs._seen++;
    console.log("TWILIO EVENT:", msg.event, Object.keys(msg));
  }

  if (msg.event === "start") {
    streamSid = msg.start?.streamSid;
    const callSid = msg.start?.callSid; // ✅ use this as key
  }

  if (msg.event === "media") {
  const mulawBytes = Buffer.from(msg.media.payload, "base64");

  if (transcoderReady) {
    processTwilioAudio(mulawBytes);
  } else {
    // Eleven metadata not received yet; buffer a bit
    twilioMulawQueue = Buffer.concat([twilioMulawQueue, mulawBytes]);

    // optional safety cap (2 seconds of mulaw = 8000 bytes/sec)
    const cap = 16000;
    if (twilioMulawQueue.length > cap) {
      twilioMulawQueue = twilioMulawQueue.subarray(twilioMulawQueue.length - cap);
    }
  }
  return;
}

  if (msg.event === "stop") {
  console.log("🛑 stop payload:", msg.stop);
  console.log("⏹ Twilio stop");

  // Mark session ended + tell browser UIs
  if (sessionId) {
    if (!sessions[sessionId]) {
      sessions[sessionId] = { stage: "GREETING", transcript: [], status: "ended" };
    } else {
      sessions[sessionId].status = "ended";
    }
    broadcastToBrowsers(sessionId, { type: "ended" });
    // ✅ Auto-trigger scoring AFTER call ends (non-blocking)
setTimeout(() => {
  const s = sessions[sessionId];
  if (!s) return;
  if (s.score) return; // already scored
  if (!s.transcript || s.transcript.length === 0) return; // nothing to score yet

  axios
    .post(`${process.env.BASE_URL}/api/sessions/${sessionId}/score`)
    .catch((e) => console.log("auto-score failed:", e.message));
}, 1200);
  }

  // Reset transcoding state
  transcoderReady = false;
  pcmAccum = Buffer.alloc(0);
  twilioMulawQueue = Buffer.alloc(0);

  return;
}
});

  twilioWs.on("close", () => {
    console.log("❌ Twilio WS disconnected");
    try { elevenWs?.close(); } catch {}
    transcoderReady = false;
    pcmAccum = Buffer.alloc(0);
    twilioMulawQueue = Buffer.alloc(0);
  });

  // --- Connect to Eleven ---
  (async () => {
  try {

    const agentId = sessions[sessionId]?.agentId || process.env.ELEVEN_AGENT_ID_DEFAULT;
      console.log("🎭 Using agent for session:", sessionId, agentId);

      const signedUrl = await getElevenSignedUrl(agentId);
    console.log("✅ Got signed URL:", signedUrl.slice(0, 60), "...");

    elevenWs = new WebSocket(signedUrl);

    elevenWs.on("open", () => {
      console.log("✅ Eleven WS connected");
      elevenWs.send(JSON.stringify({
        type: "conversation_initiation_client_data",
        conversation_config_override: {
          agent: {
            language: "en"
          }
        }
      }));
      console.log("✅ Sent Eleven initiation payload");

    });

    elevenWs.on("message", (raw) => {
      let evt;
      try { evt = JSON.parse(raw.toString()); } catch { return; }

      console.log("ELEVEN EVENT:", evt.type);

      if (evt.type === "ping") {
        const id = evt.ping_event?.event_id;
        if (id != null) elevenWs.send(JSON.stringify({ type: "pong", event_id: id }));
        return;
      }

      if (evt.type === "conversation_initiation_metadata") {
        const meta = evt.conversation_initiation_metadata_event;
        const elevenInRate = parsePcmRate(meta?.user_input_audio_format) || 16000;
        const elevenOutRate = parsePcmRate(meta?.agent_output_audio_format) || 16000;

        console.log("Eleven formats:", {
          inFmt: meta?.user_input_audio_format,
          outFmt: meta?.agent_output_audio_format
          });

        // Start/replace transcoders now that we know real formats
        transcoderReady = false;
        startTranscoders({ elevenInRate, elevenOutRate });
        return;
      }

      if (evt.type === "user_transcript") {
        const text = evt.user_transcription_event?.user_transcript;
        if (text && sessionId) {
          const line = `You: ${text}`;
          sessions[sessionId].transcript.push(line);
          broadcastToBrowsers(sessionId, { type: "transcript", line });
        }
        return;
      }

      if (evt.type === "agent_response") {
        const text = evt.agent_response_event?.agent_response;
        if (text && sessionId) {
          const line = `Caller: ${text}`;
          sessions[sessionId].transcript.push(line);
          broadcastToBrowsers(sessionId, { type: "transcript", line });
        }
        return;
      }

      if (evt.type === "interruption") {
        if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
          twilioWs.send(
            JSON.stringify({ event: "clear", streamSid }),
            { compress: false }
          );
        }
        return;
      }

      if (evt.type === "audio") {
        const b64 = evt.audio_event?.audio_base_64;
        if (!b64) return;

        const pcm = Buffer.from(b64, "base64");

        if (transcoderReady) {
          processElevenAudio(b64);
        } else {
          console.log("⚠️ got Eleven audio before transcoder ready; dropping");
        }
        return;
      }
    });

    elevenWs.on("close", (code, reason) => {
      console.log("❌ Eleven WS disconnected", { code, reason: reason?.toString?.() });
    });

    elevenWs.on("error", (e) => {
      console.log("❌ Eleven WS error:", e.message);
    });
  } catch (err) {
    console.log("❌ Eleven connect failed:", err.response?.status, err.response?.data || err.message);
  }
})();
});

// Serve built frontend in production
const FRONTEND_DIST = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  // SPA fallback: serve index.html for any non-API route
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/audio') && !req.url.startsWith('/voice') && !req.url.startsWith('/twilio') && !req.url.startsWith('/ws')) {
      res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    } else {
      next();
    }
  });
  console.log("Serving frontend from", FRONTEND_DIST);
}

server.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});