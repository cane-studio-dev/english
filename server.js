/**
 * Stylish English — WebSocket Relay Server
 *
 * Bidirectional audio streaming between browser microphone and Gemini Live API.
 * Runs locally via `npm start` or deploys to any Node.js host.
 *
 * Architecture:
 *   Browser (PCM16 16kHz) <-> This Server (WebSocket) <-> Gemini Live API - BidiGenerateContent (PCM16 24kHz out)
 */

import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, Modality } from "@google/genai";
import "dotenv/config";
import { TONE_MODES, buildTutorPersonaIntro, SYSTEM_INSTRUCTION_BODY, SCENARIO_NOTES } from "./alexaPrompt.js";

const PORT = parseInt(process.env.PORT || "10000", 10);
const API_KEY = process.env.GEMINI_API_KEY;

// Sanity cap for a single incoming base64-encoded PCM16 audio chunk (~150KB
// raw / ~200k base64 chars — far more than a normal ~170ms mic buffer needs,
// just enough headroom to never legitimately trip while still refusing a
// malformed or oversized payload instead of holding/forwarding it as-is.
const MAX_AUDIO_CHUNK_BASE64_CHARS = 200000;

// gemini-2.0-flash-live-001 was shut down (Dec 9, 2025). Use the current Live model.
// Native-audio Live models only accept a single response modality (AUDIO OR TEXT, never both) -
// so we ask for AUDIO and enable outputAudioTranscription to also get a text transcript.
// Primary Live model + a real, currently-alive fallback. NOTE: we deliberately
// do NOT fall back to gemini-2.0-flash-exp or gemini-1.5-flash — Google
// discontinued the entire Gemini 2.0 generation (including flash-exp) on
// June 1, 2026, and 1.5 predates the Live/BidiGenerateContent API entirely,
// so neither would ever actually connect; falling back to a dead model
// would just add a second guaranteed failure before the real error surfaces.
// gemini-2.5-flash-native-audio-preview-12-2025 is confirmed current and
// available on the Gemini Developer API (the same API surface this server
// uses via an API key), so it's a genuinely useful fallback.
const MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview";
const MODEL_FALLBACK_CHAIN = [
  MODEL,
  ...(process.env.GEMINI_LIVE_FALLBACK_MODEL
    ? [process.env.GEMINI_LIVE_FALLBACK_MODEL]
    : MODEL !== "gemini-2.5-flash-native-audio-preview-12-2025"
      ? ["gemini-2.5-flash-native-audio-preview-12-2025"]
      : []),
];

if (!API_KEY) {
  console.error("GEMINI_API_KEY not set. Copy .env.example -> .env and add your key.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Updated by testGeminiConnectionOnStartup(); exposed via /api/health so the
// result of "can this server actually reach Gemini" is checkable with a
// plain curl/browser hit, no log-digging required.
let geminiSelfTestResult = { status: "pending", detail: "Self-test has not run yet." };

// Single fixed voice now that there's only one persona ("Alexa", female) —
// no more gender selection from the client.
const DEFAULT_VOICE_BY_GENDER = { female: "Aoede", male: "Aoede" };

// Whitelisted, server-side-only tone presets for the "Alexa Personality
// Modes" feature (now defined in config/alexaPrompt.js, imported at the
// top of this file). Same pattern as SCENARIO_NOTES: the client only ever
// sends a short mode *key* ("normal"/"angry"/"caring"), never free-form
// tone text — the actual wording embedded in the prompt always comes from
// that fixed, server-side object, so a modified client can't inject
// arbitrary instructions through this channel.

const DYNAMIC_GENDER_NOTE = "The student's name and gender are NOT provided ahead of time — infer them naturally and dynamically from their voice and what they say during the conversation (their name if they introduce themselves, and grammatical gender from context/voice). Once you've inferred it (or asked naturally, e.g. \"وش اسمك؟\"), consistently use the matching Arabic grammatical forms and pronouns when addressing them directly — masculine (\"جاهز؟\", \"أهلاً بك\") or feminine (\"جاهزة؟\", \"أهلاً بكِ\") as appropriate. If genuinely unsure early in the conversation, default to a neutral, friendly phrasing until you have enough signal, rather than guessing confidently and being wrong.";

// Mirrors the same 36-lesson curriculum titles used in index.html's offline
// fallback (ltopics), so both files stay consistent about what each lesson
// number covers.
const LESSON_TOPICS = {
  1: "the Alphabet", 2: "Vowels and Consonants", 3: "CVC Words like cat and dog",
  4: "PH and WH sounds", 5: "Articles: A, An, and The", 6: "Singular and Plural nouns",
  7: "Subject Pronouns", 8: "Verb To Be: am, is, are", 9: "making Affirmative sentences",
  10: "Negation with not", 11: "Yes and No Questions", 12: "Wh-Questions",
  13: "Action Verbs", 14: "Present Simple tense", 15: "ordering at a Coffee Shop",
  16: "Frequency Adverbs", 17: "Do and Does", 18: "Possessives",
  19: "Essential Connectors: and, but, because", 20: "At the Doctor and Medical Care",
  21: "Quantities: some, any, much, many", 22: "At the Hotel and Booking",
  23: "Polite Requests", 24: "Past Simple with -ed", 25: "Irregular Past Verbs",
  26: "Job Interview and Self Introduction", 27: "Past Negation with Did", 28: "Storytelling",
  29: "Future with Going To", 30: "Future with Will", 31: "Future Negation",
  32: "Numbers, Time and Prices", 33: "describing your Day", 34: "Airport vocabulary",
  35: "Free Speech", 36: "Grand Review",
};

// Basic hygiene for lesson title/goal text coming over the wire: even
// though this text is meant to be lifted straight from our own lesson
// cards' DOM, the WebSocket message itself is still client-controlled data
// (a modified client could send anything), so we never trust it blindly —
// strip control/newline characters and hard-cap the length before it ever
// reaches the prompt.
// Detects a quota/rate-limit error (HTTP 429, or Google's
// RESOURCE_EXHAUSTED status) from a thrown/onerror error object whose
// exact shape isn't fully predictable across SDK versions — checks
// several plausible fields rather than assuming one specific one.
function isRateLimitError(err) {
  if (!err) return false;
  const code = err.code || (err.error && err.error.code);
  const status = err.status || (err.error && err.error.status);
  const message = String(err.message || (err.error && err.error.message) || err);
  return (
    code === 429 ||
    status === "RESOURCE_EXHAUSTED" ||
    /RESOURCE_EXHAUSTED/i.test(message) ||
    /\b429\b/.test(message) ||
    /quota/i.test(message)
  );
}

function sanitizeLessonText(value, maxLen) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\r\n\t\u0000-\u001F]+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLen);
}

// Personal Student Error Memory: the client sends up to a handful of
// words/phrases the student has previously struggled with (localStorage-
// backed, client-owned — see index.html). Same defensive posture as
// sanitizeLessonText above: never trust client input at face value before
// it gets embedded in a prompt. Caps both the count (avoid an unbounded
// list bloating the prompt) and each individual word's length.
function sanitizeStruggleWords(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((w) => typeof w === "string" && w.trim())
    .map((w) => w.replace(/[\r\n\t\u0000-\u001F]+/g, " ").trim().slice(0, 40))
    .slice(0, 8);
}

// Personalization data (full name, computed level tier, last completed
// lesson number) — same defensive posture as everything else the client
// sends: never trust it blindly. Only meaningful when a student is
// actually signed in; the client sends null otherwise, which this
// passes through unchanged (buildSystemInstruction() below treats a
// null/empty result as "no personalization available").
function sanitizeStudentPersonalization(value) {
  if (!value || typeof value !== "object") return null;
  const fullName = sanitizeLessonText(value.fullName, 80);
  const levelName = sanitizeLessonText(value.levelName, 60);
  const lastLessonNum = Number.isInteger(value.lastCompletedLessonNum) && value.lastCompletedLessonNum >= 1 && value.lastCompletedLessonNum <= 36
    ? value.lastCompletedLessonNum
    : null;
  if (!fullName && !levelName && !lastLessonNum) return null;
  return { fullName, levelName, lastLessonNum };
}

// Builds the final system instruction sent to Gemini: the dynamic tutor
// persona intro ("Alexa", the single fixed identity, per buildTutorPersonaIntro)
// plus the fixed instruction body, plus a small whitelisted "Session Context"
// block built from the scenario/age chips the student picked in the UI, plus
// an optional lesson-review note when a specific lesson (1-36) is open —
// using the REAL title/objective pulled from that lesson's own card in
// index.html (falls back to the short LESSON_TOPICS name if not provided,
// e.g. for older clients that haven't sent the richer fields yet).
function buildSystemInstruction(scenario, userAge, lessonId, tutorName, tutorGender, lessonTitleAr, lessonTitleEn, lessonGoal, lessonVocab, struggleWords, toneMode, studentPersonalization) {
  const scenarioNote = SCENARIO_NOTES[scenario] || SCENARIO_NOTES.free;
  const ageNote = DYNAMIC_GENDER_NOTE;
  const lessonNum = Number(lessonId);
  const fallbackTopic = Number.isInteger(lessonNum) ? LESSON_TOPICS[lessonNum] : null;
  const safeTitleAr = sanitizeLessonText(lessonTitleAr, 200);
  const safeTitleEn = sanitizeLessonText(lessonTitleEn, 200);
  const safeGoal = sanitizeLessonText(lessonGoal, 400);
  const safeVocab = sanitizeLessonText(lessonVocab, 300);
  const displayTitle = safeTitleAr || safeTitleEn || fallbackTopic;

  let lessonNote = "";
  if (displayTitle) {
    const bothTitles = safeTitleAr && safeTitleEn ? ` (English name: "${safeTitleEn}")` : "";
    const goalLine = safeGoal ? ` Today's specific objective: ${safeGoal}` : "";
    const vocabLine = safeVocab ? ` Target vocabulary for this lesson: ${safeVocab}.` : "";
    // Pedagogical bridge (approved curriculum update): lessons 13 (Action
    // Verbs), 14 (Present Simple), and 16 (Do/Does negation & questions)
    // are taught across 3 separate sessions with lesson 15 (Frequency
    // Adverbs) in between — without an explicit bridge, a student could
    // reasonably wonder how to negate or ask about the action-verb
    // sentences they just learned in 13/14, since "Do/Does" doesn't arrive
    // until 16. These notes make the transition explicit for whichever of
    // the three lessons is currently open.
    let bridgeNote = "";
    if (lessonNum === 13) {
      bridgeNote = " **Bridge note:** The student already knows how to make sentences with \"to be\" (am/is/are) and how to negate/question them. Today they're learning brand-new action verbs (eat, go, work...) — mention naturally that in a couple of lessons they'll learn exactly how to say \"I don't eat...\" and \"Does he eat...?\" with these same verbs, so they know more is coming and this isn't the whole picture yet.";
    } else if (lessonNum === 14) {
      bridgeNote = " **Bridge note:** The student can now form present-simple affirmative sentences with action verbs (he works, she eats...). Remind them gently that negating these sentences or asking questions with them needs a special helper word (\"do\"/\"does\"), which is coming very soon (Lesson 17) — for today, focus only on simple affirmative routine sentences, don't attempt to teach negation/questions with action verbs yet even if they ask, just reassure them it's coming.";
    } else if (lessonNum === 17) {
      bridgeNote = " **Bridge note:** Explicitly connect this to what they already know: they can already say affirmative action-verb sentences (Lessons 13-14) and they already know how to negate/question with \"to be\" (Lessons 9-12) — today's \"do/does\" is simply the same negation/question idea, just for action verbs instead of \"to be\". Say this connection out loud early in the lesson so the jump feels like a small final piece, not brand-new information.";
    }
    lessonNote = `- The student is currently on Lesson ${Number.isInteger(lessonNum) ? lessonNum : ""}: "${displayTitle}"${bothTitles}.${goalLine}${vocabLine} **Proactively acknowledge this context by name AND number in your very first turn** — right after your brief Arabic welcome (same opening turn, this specific line is exempt from Mode 1's word-limit just like the Arabic welcome itself), explicitly say the lesson's number (spoken naturally as a Saudi Arabic ordinal, e.g. "الدرس الخامس" for lesson 5) and its title, then ask if they're ready to start/review it together, e.g. in spirit: "أهلاً بك! أرى أنك فتحت الدرس ${Number.isInteger(lessonNum) ? lessonNum : ""} ${safeTitleAr || displayTitle}. هل أنت جاهز لنبدأ سوياً؟" — adapt the exact wording naturally, but always state both the lesson's number and its name, and always ask to begin. Only after the student responds do you drop into Mode 1's actual word-by-word teaching for this lesson (a simple opening word/phrase from the target vocabulary above, asking them to repeat it). Act as their private tutor for this specific topic from there: explain the concept, give examples, ask practice questions, evaluate their answers, and stay focused on this one lesson until they've genuinely mastered it before considering moving on. **Strict lesson isolation:** focus ONLY on this specific lesson's vocabulary/goal — do NOT mention, teach, or blend in content from any other lesson unless the student explicitly asks about something else first.${bridgeNote}`;
  }

  const persona = buildTutorPersonaIntro(tutorName, tutorGender, toneMode);
  const safePersonalization = sanitizeStudentPersonalization(studentPersonalization);
  let personalizationNote = "";
  if (safePersonalization) {
    const nameLine = safePersonalization.fullName
      ? ` Address the student by their first name naturally when greeting them and occasionally through the conversation (e.g. "يا ${safePersonalization.fullName}") — warm and personal, not repeated every single turn.`
      : "";
    const levelLine = safePersonalization.levelName
      ? ` Their current overall level is "${safePersonalization.levelName}" — let this inform your baseline pacing/complexity (consistent with the Invisible Adaptive Placement Engine, §1A — this is a known starting signal for that system, not a replacement for its own continuous in-conversation calibration).`
      : "";
    const lastLessonLine = safePersonalization.lastLessonNum
      ? ` Their last completed lesson was Lesson ${safePersonalization.lastLessonNum}${lessonNote ? " — since a different specific lesson is already open this session (see below), that takes priority; only mention this past progress if it comes up naturally or the student asks what's next." : " — if this session opens in free/casual conversation with no specific lesson selected, you may naturally reference this and suggest continuing from around Lesson " + (safePersonalization.lastLessonNum + 1) + " if it fits the conversation, without being pushy about it."}`
      : "";
    if (nameLine || levelLine || lastLessonLine) {
      personalizationNote = `- **Student Personalization (this specific signed-in student):**${nameLine}${levelLine}${lastLessonLine}`;
    }
  }
  const safeStruggleWords = sanitizeStruggleWords(struggleWords);
  const struggleNote = safeStruggleWords.length
    ? `- **Personal Student Error Memory (passive awareness only — NOT a live-session trigger):** this specific student has previously struggled with these words/phrases in past sessions: ${safeStruggleWords.join(", ")}. This is context for you to be aware of, nothing more. **Do NOT proactively bring any of these up, do NOT interrupt the current lesson flow to re-test them, and do NOT wait for 2-3 correct turns or the end of the lesson to re-inject one — there is no scheduled re-surfacing anymore.** Once you give a student a normal on-the-spot correction for whatever they're currently working on (the usual Strict Evaluation & Smart 3-Attempt Patience System above), simply continue forward with the main lesson path — never backtrack to a past struggle word or force a dedicated review moment inside a regular lesson/scenario session. The ONLY time it's appropriate to actually engage with reviewing one of these specific words is if the student explicitly brings it up themselves in conversation, OR if this particular session was started specifically as a review session for that purpose (you'll be able to tell from how the conversation opens) — in either of those cases, evaluate their attempt with the normal Strict Evaluation System (no special leniency for being a review), and if they now say it correctly, say clearly, as a natural part of your sentence, the phrase "صارت متقنة" right after the English word itself (e.g. "Park صارت متقنة! ما شاء الله") so the app can recognize it graduated out of the review list. Tracking which words a student struggles with happens silently in the background on the app's own side regardless of anything you do here — you don't need to manage that list yourself.`
    : "";
  return `${persona}
${SYSTEM_INSTRUCTION_BODY}
### Session Context (dynamic, set by the student in the app):
- ${ageNote}
- ${scenarioNote}${lessonNote ? "\n" + lessonNote : ""}${personalizationNote ? "\n" + personalizationNote : ""}${struggleNote ? "\n" + struggleNote : ""}`;
}

function corsHeaders(req) {
  // Explicitly permissive for every origin — this is a voice relay, not an
  // endpoint serving sensitive per-user data over HTTP, so there's no
  // security reason to gate it by origin. Not depending on an env var here
  // also removes an entire class of "forgot to set ALLOWED_ORIGIN on Render
  // to match the actual frontend domain" outages like the one that caused
  // Vercel to get stuck on "غير متصل".
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-secret",
  };
}

// ===== Admin/Owner Analytics — in-memory only, no database =====
// IMPORTANT ARCHITECTURAL REALITY, read before adding metrics here:
// this server has ZERO persistent storage of its own and has never had
// any — it's a stateless per-connection audio relay. ALL student
// progress (XP, completed lessons, streaks, struggle words, badges) is
// tracked entirely client-side in each student's own browser
// localStorage, with optional per-student Supabase sync to THEIR OWN
// account row. The server never receives or stores any of that data
// in aggregate form. This means genuinely real, honest admin metrics
// are limited to what this process can observe about its OWN
// connections since it last started — NOT a cross-student database
// query. Resets to zero on every server restart/redeploy. Anything
// requiring real cross-student aggregation (total registered students,
// top struggle words across everyone, course completion rate, top
// practiced lessons) would need a genuine backend database plus
// client-side telemetry reporting that doesn't exist in this app —
// admin.html labels those as "requires a database — not yet built"
// rather than fabricating numbers for them. Do not invent fake data to
// fill those in if asked to "finish" this dashboard later.
let adminTotalSessionsSinceStart = 0;
let adminTotalVoiceSecondsSinceStart = 0;
let adminMaintenanceMode = false;
const adminServerStartTime = Date.now();

// Simple constant-time-ish secret comparison (avoids trivial timing
// attacks on the admin secret via early-exit string comparison).
function adminSecretMatches(provided) {
  const expected = process.env.ADMIN_SECRET;
  if (!expected || !provided) return false;
  if (provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

const httpServer = createServer((req, res) => {
  const headers = corsHeaders(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    return res.end();
  }

  // ===== Admin endpoints — both require a matching x-admin-secret header
  // checked against process.env.ADMIN_SECRET. If that env var isn't set
  // at all, these endpoints refuse ALL access (fail closed, not open) —
  // an unset secret must never mean "no auth required."
  if (req.url === "/api/admin/metrics" && req.method === "GET") {
    const provided = req.headers["x-admin-secret"];
    if (!adminSecretMatches(provided)) {
      res.writeHead(401, { ...headers, "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }
    res.writeHead(200, { ...headers, "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      // Genuinely real, observed by this process — see the big comment
      // above adminTotalSessionsSinceStart for what this can and can't
      // reflect (resets on restart, this-process-only, no cross-student
      // database).
      activeLiveSessions: wss.clients.size,
      totalSessionsSinceStart: adminTotalSessionsSinceStart,
      totalVoiceMinutesSinceStart: Math.round(adminTotalVoiceSecondsSinceStart / 60),
      serverUptimeSeconds: Math.round(process.uptime()),
      serverStartedAt: new Date(adminServerStartTime).toISOString(),
      maintenanceMode: adminMaintenanceMode,
      geminiSelfTest: geminiSelfTestResult,
      model: MODEL,
      // Explicitly NOT fabricated — these require a real database plus
      // client-side telemetry reporting that doesn't exist in this app.
      // admin.html shows these as "requires a database" rather than a
      // number.
      unavailableMetrics: [
        "totalRegisteredStudents", "topPracticedLessons",
        "topStruggleWordsAcrossAllStudents", "courseCompletionRate",
        "averageSessionDurationPerStudent", "estimatedGeminiTokenUsage",
      ],
    }));
  }

  if (req.url === "/api/admin/maintenance" && req.method === "POST") {
    const provided = req.headers["x-admin-secret"];
    if (!adminSecretMatches(provided)) {
      res.writeHead(401, { ...headers, "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        adminMaintenanceMode = !!parsed.enabled;
        console.log(`[Admin] Maintenance mode set to: ${adminMaintenanceMode}`);
        res.writeHead(200, { ...headers, "Content-Type": "application/json" });
        res.end(JSON.stringify({ maintenanceMode: adminMaintenanceMode }));
      } catch (e) {
        res.writeHead(400, { ...headers, "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
      }
    });
    return;
  }

  if (req.url === "/api/admin/disconnect-all" && req.method === "POST") {
    const provided = req.headers["x-admin-secret"];
    if (!adminSecretMatches(provided)) {
      res.writeHead(401, { ...headers, "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }
    // Honestly named: this closes every currently-open connection, not
    // a targeted "idle-only" set — this server doesn't track per-
    // connection idle time precisely enough to safely single those out,
    // so admin.html labels the button for what it actually does.
    const count = wss.clients.size;
    wss.clients.forEach((ws) => {
      try { ws.close(1012, "Disconnected by admin"); } catch (e) {}
    });
    console.log(`[Admin] Disconnected ${count} active connection(s)`);
    res.writeHead(200, { ...headers, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ disconnectedCount: count }));
  }

  if (req.url === "/api/health" || req.url === "/health") {
    res.writeHead(200, { ...headers, "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      status: "ok",
      service: "Stylish English Voice Relay",
      model: MODEL,
      hasApiKey: true,
      // Real signal, not just "the HTTP server responded": if this stays
      // at 0 while students report voice not working, the process itself
      // is fine but something upstream (client bug, DNS, CORS) never even
      // reaches the WebSocket. If it's non-zero but voice still doesn't
      // work, look at the server logs for Gemini errors instead.
      activeConnections: wss.clients.size,
      // Result of the Gemini Live connectivity self-test run at boot — the
      // fastest way to check "is Google even reachable with this API key"
      // without needing a live browser client at all.
      geminiSelfTest: geminiSelfTestResult,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    }));
  }

  res.writeHead(200, { ...headers, "Content-Type": "text/plain" });
  res.end("Stylish English Voice Relay - connect via WebSocket at /api/voice-session");
});

// Real, documented fix for the reported 409 Conflict / 500 / 503 spikes and
// the ~61.5% success rate: Gemini Live API enforces a hard cap on
// CONCURRENT sessions per API key (documented at 3 concurrent sessions on
// standard developer-tier keys — confirmed via Google's own Live API forum
// and current rate-limit guidance as of August 2026). This server had NO
// server-wide cap at all — every new WebSocket connection opened its own
// Gemini session unconditionally, so once more than ~3 students were
// actively talking at the same time, every session beyond that limit would
// get exactly the errors reported (409/503 from Google's side, not a bug
// in this code). Configurable via env var so it can be raised immediately
// after upgrading the API key's usage tier, without a code change.
const MAX_CONCURRENT_GEMINI_SESSIONS = parseInt(process.env.MAX_CONCURRENT_GEMINI_SESSIONS || "3", 10);
let activeGeminiSessionCount = 0;

const wss = new WebSocketServer({
  server: httpServer,
  path: "/api/voice-session",
  // Accept every WebSocket upgrade request regardless of Origin header —
  // same reasoning as corsHeaders() above. We still log the origin of every
  // attempt (accepted or not) so connection issues are visible in the
  // Render logs instead of being a silent black box.
  verifyClient: (info, callback) => {
    const origin = info.origin || info.req.headers.origin || "(no origin header)";
    console.log(`[WS] Upgrade request from origin: ${origin} — accepted`);
    callback(true);
  },
});

console.log(`Voice relay starting on port ${PORT}...`);

wss.on("connection", (clientWs, req) => {
  const clientId = Math.random().toString(36).slice(2, 8);
  console.log(`[${clientId}] Client connected from ${req.headers.origin || "unknown"}`);

  // Disable Nagle's algorithm on the underlying TCP socket — without this,
  // small outgoing packets (like our frequent, small audio-chunk messages)
  // can get buffered/batched by the OS for up to ~40ms before actually
  // being sent, adding real, avoidable latency to every single chunk.
  // ws exposes the raw net.Socket via clientWs._socket; wrapped in try/catch
  // since this is a pure optimization — a failure here should never break
  // the connection itself, just silently miss this specific speedup.
  try {
    if (clientWs._socket && typeof clientWs._socket.setNoDelay === "function") {
      clientWs._socket.setNoDelay(true);
    }
  } catch (e) {
    console.warn(`[${clientId}] Could not set TCP_NODELAY (non-fatal):`, e && e.message ? e.message : e);
  }

  // Reject new sessions while maintenance mode is on — existing,
  // already-open sessions are left alone (this only gates NEW
  // connections), so a maintenance toggle mid-day doesn't cut off
  // students already mid-call.
  if (adminMaintenanceMode) {
    console.log(`[${clientId}] Rejected — maintenance mode is active`);
    try {
      clientWs.send(JSON.stringify({ type: "error", message: "المنصة تحت الصيانة حالياً، جرب بعد قليل 🛠️" }));
      clientWs.close(1013, "Maintenance mode");
    } catch (e) {}
    return;
  }

  adminTotalSessionsSinceStart++;
  const adminConnectionStartTime = Date.now();

  let geminiSession = null;
  // Tracks whether THIS connection currently holds a slot in the
  // server-wide activeGeminiSessionCount — paired with releaseSessionSlot()
  // below so the counter is decremented exactly once per session that
  // actually incremented it, no matter which of the several close paths
  // (clean close, error, heartbeat failure, reconnect) triggers it.
  let thisConnectionOccupiesSlot = false;
  function releaseSessionSlot() {
    if (thisConnectionOccupiesSlot) {
      thisConnectionOccupiesSlot = false;
      activeGeminiSessionCount = Math.max(0, activeGeminiSessionCount - 1);
    }
  }
  let lastLoggedMimeType = null;
  let currentScenario = "free";
  let currentToneMode = "normal";
  let isAlive = true;
  let clientSpeaking = false;
  let clientRequestedInterrupt = false;
  let lastAudioChunkTime = 0;
  // Real fix for transient Gemini-side 1011 "Internal error encountered"
  // disconnects (a known, documented, server-side transient failure on
  // Google's end — not something a model-name change fixes): remember the
  // last successful session config so a genuinely UNEXPECTED close (not one
  // this server or the client intentionally triggered) can transparently
  // reconnect with the exact same scenario/lesson/tone context, instead of
  // just dropping the student's call. Capped (see the onclose handler
  // below) so a truly persistent failure still surfaces to the student
  // rather than retrying forever.
  let lastSessionConfig = null;
  let intentionalSessionClose = false;
  let reconnectAttemptsThisSession = 0;
  const MAX_TRANSIENT_RECONNECT_ATTEMPTS = 2;

  // 15s (down from 25s): a tighter keep-alive margin against any
  // intermediary (Render's own proxy/load balancer, or a stricter
  // corporate/mobile network) that might time out an idle connection
  // faster than expected — pings now go out well before most default
  // proxy idle-timeouts (typically 30-60s+) would ever be reached.
  // Tightened from 15s to 10s per an explicit request — this is a
  // TIGHTENING, not the loosening the earlier warning below was against.
  // The original note specifically argued against widening to 30s
  // (which would remove safety margin against proxy/mobile-network idle
  // timeouts); moving to 10s instead increases that margin — catches a
  // genuinely hung connection faster, at the cost of a slightly more
  // frequent ping frame (negligible). If 7-minute disconnects are still
  // happening despite this heartbeat, the actual cause is elsewhere
  // (e.g. a client-side issue, or Gemini's own session lifetime) — don't
  // "fix" it by loosening this specific interval.
  const heartbeat = setInterval(() => {
    if (!isAlive) {
      console.log(`[${clientId}] Heartbeat failed, closing`);
      if (geminiSession) {
        try { geminiSession.close(); } catch (e) {}
        geminiSession = null;
        releaseSessionSlot();
      }
      return clientWs.terminate();
    }
    isAlive = false;
    clientWs.ping();
    // Stalled-client silence guard: if clientSpeaking has been stuck true
    // for 5+ seconds with no new audio chunk arriving (a client-side glitch,
    // a dropped connection that never sent audio_stream_end explicitly),
    // proactively signal end-of-turn to Gemini anyway rather than leaving
    // the session silently stuck waiting for a signal that may never come.
    // Piggybacks on this existing 10s heartbeat interval instead of adding
    // a separate timer — checked against the real elapsed time via
    // lastAudioChunkTime, not just this interval's own 10s cadence.
    if (geminiSession && clientSpeaking && lastAudioChunkTime && (Date.now() - lastAudioChunkTime > 5000)) {
      console.warn(`[${clientId}] No audio chunk for 5s+ while clientSpeaking was still true — sending audioStreamEnd defensively.`);
      clientSpeaking = false;
      try {
        geminiSession.sendRealtimeInput({ audioStreamEnd: true });
      } catch (err) {
        console.error(`[${clientId}] Defensive audioStreamEnd failed:`, err && err.message ? err.message : err);
      }
    }
  }, 10000);

  clientWs.on("pong", () => { isAlive = true; });

  // A slow/congested client connection can make outgoing messages queue up
  // faster than the OS socket can actually flush them — clientWs.bufferedAmount
  // grows unboundedly in that case. For AUDIO specifically, a backlog is
  // actively harmful (stale audio the student would hear late is worse than
  // hearing nothing for a moment), so we drop new audio frames once the
  // buffer is clearly congested rather than piling on more delay. Non-audio
  // messages (transcripts, control messages) are small/infrequent and
  // important to deliver, so they're never dropped.
  const MAX_BUFFERED_BYTES_FOR_AUDIO = 262144; // 256KB
  function sendToClient(msg) {
    if (clientWs.readyState !== WebSocket.OPEN) return;
    if (msg.type === "audio" && clientWs.bufferedAmount > MAX_BUFFERED_BYTES_FOR_AUDIO) {
      return; // congested — skip this stale audio frame instead of adding to the backlog
    }
    clientWs.send(JSON.stringify(msg));
  }

  // Builds the callbacks/config object for a single connection attempt
  // against a specific model name — shared by every attempt in the
  // fallback chain so the actual session logic is defined exactly once.
  function buildLiveConnectOptions(modelName, config) {
    return {
      model: modelName,
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        // Explicit lowest-latency setting: this native-audio Live model's
        // own default is already "minimal", but we set it explicitly so a
        // future API/default change can't silently add "thinking" delay
        // before the first audio byte streams back to the student.
        thinkingConfig: { thinkingLevel: "minimal" },
        // Hard cap on generated tokens per turn — keeps voice turns fast
        // and quota-efficient, matching the response-length rules in the
        // system prompt below (§Response Length: 4-7 words as the normal
        // teaching-turn target, 10 words as an absolute safety
        // ceiling for the rare cases that genuinely need more).
        // RAISED AGAIN, 350→500, following through on this comment's own
        // earlier note ("if genuinely long explanations are ever needed
        // again, raise this further") — a real report of mid-sentence
        // audio truncation came in. Audio tokens are considerably denser
        // than the same content's text-token equivalent, so even a
        // nominally short reply can consume more of this budget than
        // word-counting alone would suggest, especially once Arabic
        // wrapper phrases and tone-mode flavor are mixed in — 500 gives
        // real additional headroom against that, not just a nominal bump.
        maxOutputTokens: 500,
        // Lower-than-default temperature: this is a strict, curriculum-
        // grounded tutor, not an open-ended creative chat partner — a
        // lower value reduces the model's tendency to drift from the
        // tight constraints already enforced in the prompt (the 4-7 word
        // limit, the exact rollover/mastery marker phrases the client's
        // regex-based struggle-word detection depends on, staying on-
        // topic for the active lesson/scenario instead of wandering).
        // Deliberately not set all the way to 0 — some models show
        // repetition-loop artifacts at the extreme low end, and Casual
        // Chat mode (§1E) still needs enough natural variation to not
        // feel robotic/scripted during genuine free conversation.
        temperature: 0.4,
        systemInstruction: {
          parts: [{ text: buildSystemInstruction(config.scenario, config.userAge, config.lessonId, config.tutorName, config.tutorGender, config.lessonTitleAr, config.lessonTitleEn, config.lessonGoal, config.lessonVocab, config.struggleWords, config.toneMode, config.studentPersonalization) }],
        },
        speechConfig: {
          languageCode: "en-US",
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: config.voiceName || DEFAULT_VOICE_BY_GENDER[config.tutorGender === "male" ? "male" : "female"],
            },
          },
        },
      },
      callbacks: {
        onopen: () => {
          console.log(`[${clientId}] Gemini Live session established (model=${modelName})`);
          sendToClient({ type: "session_ready", model: modelName });
        },

        onmessage: (message) => {
          try {
            // Official pre-disconnect warning from Gemini Live's own session
            // limits (connection length ~10min, audio-only sessions ~15min) —
            // arrives as a TOP-LEVEL field (message.goAway), separate from
            // serverContent, so it must be checked before the
            // "if (!content) return" below, which would otherwise silently
            // drop it since a goAway message typically carries no
            // serverContent at all. Previously unhandled entirely — the
            // student's session would just end abruptly with no warning.
            if (message.goAway) {
              const timeLeftMs = message.goAway.timeLeft ? Number(message.goAway.timeLeft.replace(/s$/, "")) * 1000 : null;
              console.log(`[${clientId}] Gemini sent goAway — session ending soon (timeLeft=${message.goAway.timeLeft || "unknown"}).`);
              sendToClient({ type: "session_ending_soon", timeLeftMs });
            }
            const content = message.serverContent;
            if (!content) return;

            if (content.interrupted) {
              console.log(`[${clientId}] Gemini reported interruption (barge-in)`);
              // If the browser already sent a manual interrupt, keep suppressing
              // stale model output until the student's replacement utterance ends.
              sendToClient({ type: "interrupted" });
            }

            // Client explicitly signaled a barge-in (case "interrupt" below)
            // — silently drop any further audio/text chunks for THIS turn
            // rather than let stale content for the just-interrupted
            // response keep reaching a client that already moved on.
            // Deliberately only guards generated audio/text forwarding below,
            // not the whole message: turnComplete/input-transcription fields can
            // arrive in the same message as modelTurn content, and those
            // must keep flowing normally regardless — skipping the entire
            // message here would risk the client never receiving
            // turn_complete for an interrupted turn, leaving its own
            // turn-state tracking stuck. Does not close the Gemini session
            // or the socket; reset in case "audio_stream_end" below once a
            // genuinely new turn begins.
            if (content.modelTurn && content.modelTurn.parts && !clientRequestedInterrupt) {
              for (const part of content.modelTurn.parts) {
                if (part.inlineData && part.inlineData.data) {
                  // Fail-fast guard: a genuinely empty/near-empty base64
                  // string (this threshold is deliberately generous —
                  // real PCM16 audio chunks are always far longer than
                  // this) represents silence/no real audio, not a normal
                  // short reply — skip forwarding it rather than sending
                  // effectively nothing and letting the client wait on
                  // it. Deliberately a cheap string-length heuristic, not
                  // full PCM decode + amplitude analysis — this runs on
                  // every single audio chunk for the entire session, so
                  // decoding each one just to check loudness would be
                  // real, recurring CPU cost for a check this simple
                  // approximation already covers for the actual failure
                  // mode (Gemini sending back essentially nothing).
                  if (part.inlineData.data.length < 32) {
                    console.warn(`[${clientId}] Skipping near-empty audio chunk (len=${part.inlineData.data.length}) — likely silence, not a real response.`);
                  } else {
                  // Deliberately no sampleRate/encoding fields here — the
                  // client hardcodes 24000/pcm16 directly (Gemini always
                  // sends this format, it never varies mid-session), and
                  // was confirmed to never read these fields from the
                  // message before removing them. This is real, if small,
                  // recurring payload overhead: this message fires once
                  // per audio chunk, many times per turn, for the entire
                  // session — trimming two always-constant fields from
                  // every single one of them adds up.
                  sendToClient({
                    type: "audio",
                    data: part.inlineData.data,
                  });
                  }
                }
                if (part.text) {
                  sendToClient({ type: "text", content: part.text });
                }
              }
            }

            if (!clientRequestedInterrupt && content.outputTranscription && content.outputTranscription.text) {
              sendToClient({ type: "text", content: content.outputTranscription.text });
            }

            if (content.inputTranscription && content.inputTranscription.text) {
              sendToClient({ type: "user_text", content: content.inputTranscription.text });
            }

            if (content.turnComplete) {
              console.log(`[${clientId}] Gemini turn complete`);
              sendToClient({ type: "turn_complete" });
            }
          } catch (err) {
            // A single unexpectedly-shaped message (e.g. an edge case only
            // triggered by a specific client/browser) must NEVER be allowed
            // to throw here — the SDK invokes this callback internally, and
            // an uncaught exception inside it can bring the whole Gemini
            // Live session down as a side effect, which looked exactly like
            // "connects fine, then drops a moment later" for no visible
            // reason. Log it and keep the session alive instead.
            console.error(`[${clientId}] Error handling Gemini message (session kept alive):`, err && err.stack ? err.stack : err);
          }
        },

        // Full error detail logged (message, code, name, stack) — the
        // previous version only logged err.message, which was often just
        // "" or a generic string for auth/model-not-found failures from
        // Google, making it impossible to tell WHY the session dropped.
        onerror: (err) => {
          console.error(`[${clientId}] Gemini error on model ${modelName}:`, {
            message: err && err.message,
            code: err && err.code,
            name: err && err.name,
            stack: err && err.stack,
            raw: err,
          });
          if (isRateLimitError(err)) {
            console.warn(`[${clientId}] Gemini rate-limit/quota error (429/RESOURCE_EXHAUSTED) on model ${modelName} — notifying client cleanly instead of a generic error.`);
            sendToClient({ type: "rate_limited", message: "النظام تحت ضغط مؤقت، نرجع بعد لحظات.." });
            return;
          }
          sendToClient({ type: "error", message: "AI session error: " + (err && err.message ? err.message : String(err)) });
        },

        onclose: (event) => {
          const reason = event && event.reason ? event.reason : "(no reason given by Gemini)";
          const code = (event && event.code) || 1000;
          const wasClean = event && typeof event.wasClean === "boolean" ? event.wasClean : null;
          // Log every field Gemini's close event actually carries — this is
          // the exact payload requested for diagnosing why the stream was
          // terminated, instead of a generic "disconnected".
          console.log(`[${clientId}] Gemini session closed (model=${modelName}): code=${code}, reason="${reason}", wasClean=${wasClean}`);
          geminiSession = null;
          releaseSessionSlot();

          // Auto-reconnect on a genuinely UNEXPECTED close — this is the
          // actual, documented fix for Gemini's own transient 1011
          // "Internal error encountered" disconnects (a known server-side
          // issue on Google's end, confirmed via current Gemini API forum
          // reports — not something a model name change fixes). Never
          // retries on: a clean/normal close (code 1000), an intentional
          // close this server or the client itself triggered
          // (end_session, WebSocket disconnect), or once the attempt cap
          // is hit — a truly persistent failure still surfaces to the
          // student as a real error rather than retrying forever.
          const looksTransient = code !== 1000 && !intentionalSessionClose;
          if (looksTransient && lastSessionConfig && reconnectAttemptsThisSession < MAX_TRANSIENT_RECONNECT_ATTEMPTS) {
            reconnectAttemptsThisSession++;
            console.log(`[${clientId}] Unexpected close (code=${code}) — attempting transparent reconnect ${reconnectAttemptsThisSession}/${MAX_TRANSIENT_RECONNECT_ATTEMPTS} with the same session context...`);
            sendToClient({ type: "reconnecting", attempt: reconnectAttemptsThisSession, maxAttempts: MAX_TRANSIENT_RECONNECT_ATTEMPTS });
            // Deliberately strip kickoffNote for this reconnect specifically
            // — lastSessionConfig still has it (needed if the student
            // starts a genuinely fresh session later), but re-sending it
            // here would make Alexa "re-greet" the student mid-conversation,
            // which is exactly the jarring restart this transparent
            // reconnect is meant to avoid.
            initGeminiSession({ ...lastSessionConfig, kickoffNote: null }).catch((err) => {
              console.error(`[${clientId}] Transparent reconnect attempt ${reconnectAttemptsThisSession} failed:`, err && err.message ? err.message : err);
              sendToClient({ type: "session_closed", code, reason, model: modelName, wasClean });
            });
          } else {
            sendToClient({ type: "session_closed", code, reason, model: modelName, wasClean });
          }
        },
      },
    };
  }

  async function initGeminiSession(config = {}) {
    // Real fix for the reported 409/503 spikes — reject proactively, with a
    // clear message, instead of attempting a connection that would very
    // likely fail on Google's side anyway once the per-key concurrent
    // session cap is already reached.
    if (activeGeminiSessionCount >= MAX_CONCURRENT_GEMINI_SESSIONS) {
      console.warn(`[${clientId}] Rejecting session start — server-wide concurrent Gemini session cap reached (${activeGeminiSessionCount}/${MAX_CONCURRENT_GEMINI_SESSIONS}).`);
      sendToClient({ type: "rate_limited", message: "النظام مشغول حاليًا بعدد كبير من الطلاب، حاول بعد لحظات..." });
      return;
    }
    // Guard against a leaked/orphaned Gemini Live connection: if the client
    // sends start_session again while a previous session on this same
    // WebSocket is still open (reconnect, double-tap, retry logic on the
    // client, etc.), close the old one first instead of just overwriting
    // the reference and leaving it running forever in the background.
    if (geminiSession) {
      try { geminiSession.close(); } catch (e) {}
      geminiSession = null;
      releaseSessionSlot();
    }

    // Try each model in the fallback chain in order. We do NOT retry the
    // SAME model repeatedly (no flood of reconnect attempts) — each model
    // gets exactly one attempt, and we move to the next only on an
    // immediate connection failure, not on a later mid-call error.
    let lastError = null;
    for (let i = 0; i < MODEL_FALLBACK_CHAIN.length; i++) {
      const modelName = MODEL_FALLBACK_CHAIN[i];
      try {
        console.log(`[${clientId}] Connecting to Gemini Live (attempt ${i + 1}/${MODEL_FALLBACK_CHAIN.length}, model=${modelName})...`);
        geminiSession = await ai.live.connect(buildLiveConnectOptions(modelName, config));
        thisConnectionOccupiesSlot = true;
        activeGeminiSessionCount++;
        console.log(`[${clientId}] Successfully connected using model=${modelName} (active sessions: ${activeGeminiSessionCount}/${MAX_CONCURRENT_GEMINI_SESSIONS})`);
        // Latency fix: nudge Gemini to start generating the opening
        // greeting right here — the moment the connection is actually
        // established and geminiSession is guaranteed assigned (safe from
        // the race condition of trying this inside the onopen callback,
        // which can fire before this await resolves) — instead of waiting
        // for a full extra round trip to the client first (client
        // receives session_ready → client sends a separate kickoff text
        // message → server relays it). The client computes this kickoff
        // text up front (scenario/returning-student logic is all
        // client-side info anyway) and sends it as part of start_session
        // itself, so we already have everything needed right here.
        if (config.kickoffNote) {
          try {
            geminiSession.sendRealtimeInput({ text: config.kickoffNote });
          } catch (err) {
            console.error(`[${clientId}] sendRealtimeInput (kickoff) failed:`, err && err.message ? err.message : err);
          }
        }
        return; // success — stop trying further fallbacks
      } catch (err) {
        lastError = err;
        console.error(`[${clientId}] Failed to connect with model=${modelName}:`, {
          message: err && err.message,
          code: err && err.code,
          name: err && err.name,
          stack: err && err.stack,
        });
        // fall through to try the next model in the chain, if any
      }
    }

    // Every model in the chain failed — surface one clear, final error to
    // the client instead of leaving it hanging or silently retrying forever.
    console.error(`[${clientId}] All Gemini Live models failed. Giving up. Last error:`, lastError && lastError.message);
    if (isRateLimitError(lastError)) {
      sendToClient({ type: "rate_limited", message: "النظام تحت ضغط مؤقت، نرجع بعد لحظات.." });
      return;
    }
    sendToClient({
      type: "error",
      message: "Failed to start AI session (all models unavailable): " + (lastError && lastError.message ? lastError.message : String(lastError)),
    });
  }

  clientWs.on("message", async (raw) => {
    let msg;
    try {
      if (typeof raw === "string" || (raw instanceof Buffer && raw[0] === 0x7b)) {
        msg = JSON.parse(raw.toString());
      } else {
        if (raw.length > MAX_AUDIO_CHUNK_BASE64_CHARS) {
          console.warn(`[${clientId}] Dropping oversized binary audio chunk (${raw.length} bytes)`);
          return;
        }
        if (geminiSession) {
          clientSpeaking = true;
          lastAudioChunkTime = Date.now();
          try {
            geminiSession.sendRealtimeInput({
              audio: {
                data: raw.toString("base64"),
                mimeType: "audio/pcm;rate=16000",
              },
            });
          } catch (err) {
            console.error(`[${clientId}] sendRealtimeInput (binary audio) failed:`, err && err.message ? err.message : err);
          }
        }
        return;
      }
    } catch (e) {
      console.warn(`[${clientId}] Malformed message:`, e.message);
      return;
    }

    switch (msg.type) {
      case "start_session":
        currentScenario = SCENARIO_NOTES[msg.scenario] ? msg.scenario : "free";
        console.log(`[${clientId}] start_session received — scenario=${msg.scenario}, userAge=${msg.userAge}, lessonId=${msg.lessonId}, lessonTitleAr=${msg.lessonTitleAr}, lessonVocab=${msg.lessonVocab}, tutor=${msg.tutorName}(${msg.tutorGender}), voice=${msg.voiceName}`);
        lastSessionConfig = {
          scenario: msg.scenario,
          userAge: msg.userAge,
          lessonId: msg.lessonId,
          lessonTitleAr: msg.lessonTitleAr,
          lessonTitleEn: msg.lessonTitleEn,
          lessonGoal: msg.lessonGoal,
          lessonVocab: msg.lessonVocab,
          tutorName: msg.tutorName,
          tutorGender: msg.tutorGender,
          voiceName: msg.voiceName,
          struggleWords: msg.struggleWords,
          toneMode: msg.toneMode,
          kickoffNote: sanitizeLessonText(msg.kickoffNote, 2000),
          studentPersonalization: sanitizeStudentPersonalization(msg.studentPersonalization),
        };
        intentionalSessionClose = false;
        reconnectAttemptsThisSession = 0;
        await initGeminiSession(lastSessionConfig);
        break;

      case "switch_scenario": {
        // Lets the student change roleplay scenario (coffee shop, airport,
        // hotel, interview, doctor, free chat) MID-CALL, without ending the
        // WebSocket/Gemini session or losing the live audio connection.
        // Gemini Live's systemInstruction is fixed for the life of a
        // connection, so we can't literally change it — instead we nudge
        // the model in-context with a text turn describing the new scene,
        // built entirely server-side from the same whitelisted
        // SCENARIO_NOTES used at session start (never trusting raw text
        // from the client), so this can't be used to inject arbitrary
        // instructions.
        const requestedScenario = SCENARIO_NOTES[msg.scenario] ? msg.scenario : null;
        if (!requestedScenario) {
          console.warn(`[${clientId}] switch_scenario: unknown scenario "${msg.scenario}", ignoring`);
          break;
        }
        if (!geminiSession) {
          console.warn(`[${clientId}] switch_scenario received but no active Gemini session`);
          break;
        }
        currentScenario = requestedScenario;
        const activeToneReminder = currentToneMode !== "normal"
          ? ` Keep your current tone/personality mode active while doing this — ${TONE_MODES[currentToneMode]}`
          : "";
        const switchNote = requestedScenario === "free"
          ? `[system note: the student just switched to free conversation. Smoothly drop any previous roleplay character, acknowledge the change in one short line, and continue naturally as yourself — ${SCENARIO_NOTES.free}${activeToneReminder}]`
          : `[system note: the student just switched the scenario. Smoothly transition — in one short line, acknowledge the change and step into this new roleplay character right away: ${SCENARIO_NOTES[requestedScenario]}${activeToneReminder}]`;
        console.log(`[${clientId}] Switching active scenario to "${requestedScenario}" mid-call`);
        try {
          geminiSession.sendRealtimeInput({ text: switchNote });
        } catch (err) {
          console.error(`[${clientId}] sendRealtimeInput (switch_scenario) failed:`, err && err.message ? err.message : err);
        }
        break;
      }

      case "switch_tone": {
        // Lets the student change Alexa's personality/tone preset
        // (normal/angry/caring) MID-CALL, without ending the WebSocket/
        // Gemini session, losing the live audio connection, or resetting
        // any lesson/scenario progress. Same technique as switch_scenario
        // above: Gemini Live's systemInstruction is fixed for the life of
        // a connection, so we nudge the model in-context with a text turn
        // instead, built entirely server-side from the whitelisted
        // TONE_MODES object (never raw text from the client).
        const requestedTone = TONE_MODES[msg.toneMode] ? msg.toneMode : null;
        if (!requestedTone) {
          console.warn(`[${clientId}] switch_tone: unknown tone "${msg.toneMode}", ignoring`);
          break;
        }
        if (!geminiSession) {
          console.warn(`[${clientId}] switch_tone received but no active Gemini session`);
          break;
        }
        currentToneMode = requestedTone;
        const activeScenarioReminder = currentScenario !== "free"
          ? ` You are still in your current roleplay scenario/character — keep that exact role and context going, just with this new tone layered on top.`
          : "";
        const toneSwitchNote = `[system note: the student just switched your personality/tone mode. From your very next reply, smoothly adopt this new tone — ${TONE_MODES[requestedTone]} Keep the exact same strict academic rules (no false praise, the 3-attempt patience system, Saudi/Gulf dialect, no "شو"/"يا بطل") — only the tone changes, nothing else. Pick up exactly where you left off in the current lesson/scenario — do NOT restart, re-introduce yourself, or repeat earlier content just because the tone changed.${activeScenarioReminder}]`;
        console.log(`[${clientId}] Switching active tone mode to "${requestedTone}" mid-call`);
        try {
          geminiSession.sendRealtimeInput({ text: toneSwitchNote });
        } catch (err) {
          console.error(`[${clientId}] sendRealtimeInput (switch_tone) failed:`, err && err.message ? err.message : err);
        }
        break;
      }

      case "switch_lesson": {
        // Lets the student open a DIFFERENT specific lesson MID-CALL and
        // gives Alexa its full metadata (title/goal/vocab), not just a
        // bare title — the client's old vfNotifyLessonSwitch() only ever
        // sent the title as raw, client-constructed text piped straight
        // into sendRealtimeInput, unlike every other mid-call switch
        // (scenario/tone) which builds its note server-side from
        // sanitized fields. This handler brings lesson-switching in line
        // with that same safer pattern.
        if (!geminiSession) {
          console.warn(`[${clientId}] switch_lesson received but no active Gemini session`);
          break;
        }
        const newLessonTitleAr = sanitizeLessonText(msg.lessonTitleAr, 200);
        const newLessonTitleEn = sanitizeLessonText(msg.lessonTitleEn, 200);
        const newLessonGoal = sanitizeLessonText(msg.lessonGoal, 400);
        const newLessonVocab = sanitizeLessonText(msg.lessonVocab, 300);
        if (!newLessonTitleAr && !newLessonTitleEn) {
          console.warn(`[${clientId}] switch_lesson: no usable lesson title provided, ignoring`);
          break;
        }
        const lessonLabel = newLessonTitleAr || newLessonTitleEn;
        const goalPart = newLessonGoal ? ` Lesson goal: ${newLessonGoal}.` : "";
        const vocabPart = newLessonVocab ? ` Target vocabulary/phrases for this lesson: ${newLessonVocab}.` : "";
        const lessonSwitchNote = `[system note: the student just opened a different specific lesson while your call with them is still active — "${lessonLabel}".${goalPart}${vocabPart} Naturally acknowledge the switch in Saudi Arabic and ask if they'd like to review this new lesson together now, e.g. in spirit: "أرى أنك انتقلت لدرس '${lessonLabel}'، هل تود أن نراجعه سوياً؟" — do not start teaching it yet, wait for their answer, and do not abruptly abandon the earlier topic if they say no, just continue naturally. If they do want to switch, use the Mastery-Based Phase Gates (1B) and this lesson's actual goal/vocabulary above exactly as you would if this lesson had been active from the start of the call.]`;
        console.log(`[${clientId}] Switching active lesson mid-call to "${lessonLabel}"`);
        try {
          geminiSession.sendRealtimeInput({ text: lessonSwitchNote });
        } catch (err) {
          console.error(`[${clientId}] sendRealtimeInput (switch_lesson) failed:`, err && err.message ? err.message : err);
        }
        break;
      }

      case "audio":
        if (geminiSession && msg.data) {
          // Basic sanity cap: a legitimate 16kHz PCM16 mono chunk from the
          // client is only a few KB; refuse anything wildly larger instead
          // of blindly forwarding/holding it, so a malformed or malicious
          // payload can't balloon memory or get relayed as-is to Gemini.
          if (msg.data.length > MAX_AUDIO_CHUNK_BASE64_CHARS) {
            console.warn(`[${clientId}] Dropping oversized audio chunk (${msg.data.length} chars)`);
            break;
          }
          const declaredMime = msg.mimeType || "audio/pcm;rate=16000";
          // Log the ACTUAL format the browser declared, once per session —
          // this is the honest way to check the "Safari sends a different
          // rate/format" theory: our client always downsamples to 16kHz
          // PCM16 mono in the browser itself before ever sending a chunk
          // (there is no raw WebM/Opus path in this app), so this line will
          // reveal immediately if Safari is somehow declaring something
          // other than audio/pcm;rate=16000.
          if (declaredMime !== lastLoggedMimeType) {
            lastLoggedMimeType = declaredMime;
            console.log(`[${clientId}] Client audio format: ${declaredMime}`);
          }
          clientSpeaking = true;
          lastAudioChunkTime = Date.now();
          try {
            geminiSession.sendRealtimeInput({
              audio: {
                data: msg.data,
                mimeType: declaredMime,
              },
            });
          } catch (err) {
            console.error(`[${clientId}] sendRealtimeInput (audio) failed:`, err && err.message ? err.message : err);
          }
        }
        break;

      case "text":
        if (geminiSession && msg.content) {
          try {
            geminiSession.sendRealtimeInput({ text: msg.content });
          } catch (err) {
            console.error(`[${clientId}] sendRealtimeInput (text) failed:`, err && err.message ? err.message : err);
          }
        }
        break;

      case "audio_stream_end":
        clientRequestedInterrupt = false;
        if (geminiSession && clientSpeaking) {
          clientSpeaking = false;
          try {
            geminiSession.sendRealtimeInput({ audioStreamEnd: true });
          } catch (err) {
            console.error(`[${clientId}] sendRealtimeInput (audioStreamEnd) failed:`, err && err.message ? err.message : err);
          }
        }
        break;

      case "interrupt":
        console.log(`[${clientId}] Client requested manual interrupt (barge-in)`);
        clientRequestedInterrupt = true;
        sendToClient({ type: "interrupt_ack" });
        break;

      case "end_session":
        console.log(`[${clientId}] Client ending session`);
        intentionalSessionClose = true;
        if (geminiSession) {
          try { geminiSession.close(); } catch (e) {}
          geminiSession = null;
          releaseSessionSlot();
        }
        sendToClient({ type: "session_closed", code: 1000, reason: "client_requested" });
        break;

      default:
        console.warn(`[${clientId}] Unknown message type: ${msg.type}`);
    }
  });

  clientWs.on("close", (code, reason) => {
    console.log(`[${clientId}] Client disconnected: code=${code}, reason=${reason && reason.length ? reason.toString() : "(none)"}`);
    adminTotalVoiceSecondsSinceStart += Math.round((Date.now() - adminConnectionStartTime) / 1000);
    clearInterval(heartbeat);
    intentionalSessionClose = true;
    if (geminiSession) {
      try { geminiSession.close(); } catch (e) {}
      geminiSession = null;
      releaseSessionSlot();
    }
  });

  clientWs.on("error", (err) => {
    console.error(`[${clientId}] Client WebSocket error:`, err.message);
    clearInterval(heartbeat);
    // Same reasoning as the "close" handler just above: an errored client
    // connection is just as gone as a cleanly-closed one. Without this
    // flag, Gemini's own onclose (which fires asynchronously, shortly
    // after this) could misread its own close as an unexpected/transient
    // one and kick off a needless auto-reconnect — opening a brand-new
    // Gemini Live session (real API cost) for a client that's already
    // disconnected and will never receive any of it.
    intentionalSessionClose = true;
    if (geminiSession) {
      try { geminiSession.close(); } catch (e) {}
      geminiSession = null;
      releaseSessionSlot();
    }
  });
});

// ===== Process-level safety net =====
// IMPORTANT: this does NOT try to keep a broken process alive forever.
// After a genuinely uncaught exception, Node's own internal state (open
// sockets, timers, the Gemini client, the WebSocketServer itself) is no
// longer something we can trust — Node's own docs explicitly warn against
// "resuming normal operation" after uncaughtException. Silently swallowing
// it and continuing is what causes the worst possible symptom: the process
// stays up and *looks* healthy, but is actually wedged, so voice quietly
// stops working entirely with no crash and no visible error. The correct,
// safe pattern is: log everything we can, then exit so the host (Render,
// PM2, Docker, etc.) restarts us into a clean state within seconds. Every
// individual Gemini/WebSocket call site already has its own try/catch (see
// above), so in normal operation these two handlers should basically never
// fire — they're a last-resort net, not the primary error handling.
function crashSafely(label, err) {
  console.error(`${label} — restarting for a clean state:`, err && err.stack ? err.stack : err);
  setTimeout(() => process.exit(1), 100);
}
process.on("uncaughtException", (err) => crashSafely("Uncaught exception", err));
process.on("unhandledRejection", (reason) => crashSafely("Unhandled promise rejection", reason));

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`\nStylish English Voice Relay running`);
  console.log(`   HTTP:      http://localhost:${PORT}`);
  console.log(`   Health:    http://localhost:${PORT}/api/health`);
  console.log(`   WebSocket: ws://localhost:${PORT}/api/voice-session`);
  console.log(`   Model:     ${MODEL} (fallback chain: ${MODEL_FALLBACK_CHAIN.join(" -> ")})`);
  console.log(`   CORS:      * (all origins accepted)\n`);
  testGeminiConnectionOnStartup();
});

// ===== Startup self-test =====
// Connects to Gemini Live directly on server boot, with NO browser client
// involved at all. This exists specifically to break the "I can't see your
// browser's network tab / Render logs" loop: the exact real error from
// Google (auth, model access, billing, quota, protocol) now shows up in the
// Render deploy log automatically, every single time the server starts —
// no need to reproduce anything from a phone or browser first.
async function testGeminiConnectionOnStartup() {
  console.log("\n[Startup self-test] Verifying Gemini Live connectivity (API key + model access)...");
  for (const modelName of MODEL_FALLBACK_CHAIN) {
    try {
      const testSession = await ai.live.connect({
        model: modelName,
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onopen: () => {
            console.log(`[Startup self-test] ✅ SUCCESS — ${modelName} connected and opened cleanly.`);
            geminiSelfTestResult = { status: "ok", model: modelName, checkedAt: new Date().toISOString() };
          },
          // Required by the SDK even though the self-test never needs to
          // process a real reply — @google/genai's Live.connect() validates
          // that all four callbacks are functions before it will even
          // attempt to open the socket. Leaving this one out entirely (our
          // actual bug last time) throws "callbacks.onmessage is not a
          // function" immediately, which looked like a connection failure
          // but was really just an incomplete callbacks object in OUR code.
          onmessage: () => {},
          onerror: (err) => {
            console.error(`[Startup self-test] ❌ ${modelName} — onerror fired:`, {
              message: err && err.message,
              code: err && err.code,
              status: err && err.status,
              name: err && err.name,
            });
          },
          onclose: (event) => {
            console.log(`[Startup self-test] ${modelName} closed: code=${event && event.code}, reason="${event && event.reason}"`);
          },
        },
      });
      console.log(`[Startup self-test] ${modelName} is reachable with the current API key — closing the test session now.`);
      setTimeout(() => { try { testSession.close(); } catch (e) {} }, 3000);
      return; // first reachable model is enough to prove the pipeline works
    } catch (err) {
      // THIS is the block most likely to fire if Google is rejecting the
      // handshake outright — log every field an error from the SDK/HTTP
      // layer could carry, not just .message.
      console.error(`[Startup self-test] ❌ ${modelName} — connect() THREW before even opening:`, {
        message: err && err.message,
        code: err && err.code,
        status: err && err.status,
        statusText: err && err.statusText,
        name: err && err.name,
        stack: err && err.stack,
      });
      geminiSelfTestResult = {
        status: "failed",
        model: modelName,
        error: err && err.message ? err.message : String(err),
        errorCode: err && (err.code || err.status) || null,
        checkedAt: new Date().toISOString(),
      };
    }
  }
  console.error("[Startup self-test] ALL models in the fallback chain failed at startup. This points to GEMINI_API_KEY, billing/access for the Live API on this key, or a quota issue — not a per-browser problem.\n");
}
