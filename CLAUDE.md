# CLAUDE.md — Stylish English (ستايلش إنقلش)

This file is the authoritative architecture reference for this project.
**Read this fully before making any change to `index.html` or `server.js`.**
It documents real constraints discovered through extensive iterative
development — several of them exist specifically *because* an earlier
version of this exact app broke in that exact way. Do not re-introduce
these bugs.

---

## 1. What this project is

An Arabic-medium (RTL, `lang="ar"`) English-learning platform for absolute
beginners in the Gulf region, built as **two files only**:

- `index.html` — the entire frontend: landing page, 36-lesson dashboard,
  quizzes, and the real-time AI voice-tutor widget. Single file, no build
  step, no bundler. Two `<script>` blocks: the voice engine is one large
  IIFE (`(function(){'use strict'; ... })()`), lesson/quiz/XP/badge logic
  is a second, non-IIFE global-scope script.
- `server.js` — a Node.js WebSocket relay between the browser and the
  Gemini Live API (`@google/genai`). No database, no auth, no ORM —
  Supabase (see below) is entirely a client-side (`index.html`)
  integration, `server.js` has no knowledge of it and doesn't need any.

**Supabase was added for optional cloud auth + progress sync — see §9.12
for the full architecture.** This directly reverses every earlier version
of this file, which stated (correctly, at the time) that no Supabase
integration existed and warned against adding one without being asked —
that warning is now obsolete; Supabase is real and active as of this
version. **`localStorage` remains the single synchronous source of truth
the app actually reads from for every instant UI update** —
`getXP()`/`getCompletedLessons()`/`getUnlockedBadges()` all still read
`localStorage` only, never Supabase directly. Supabase is purely an
additional, best-effort, non-blocking async sync layer on top of that,
active only for students who explicitly sign in.

Deployment: frontend is static hosting (`index.html`), backend is on
Render (`server.js`), currently at `wss://stylish-english.onrender.com/api/voice-session`.
The client has `<link rel="preconnect">` + a de-duplicated `window.seWarmupBackend()`
function that fires a fire-and-forget `/api/health` ping on page load,
specifically to counter Render free-tier cold starts. **This warm-up is
intentionally NOT attached to the hero "Start Learning Now" button** (see
§9.5) — that button is a pure, synchronous, offline-capable landing-page
section toggle and must stay that way; any hover/touch pre-warming happens
elsewhere (page load, or when the voice panel itself opens). **Important,
verified fact**: `enterPlatform()` (the hero button's click handler)
contains zero references to `WebSocket`, `fetch`, `AudioContext`, or
`await` — the dashboard renders synchronously in a single tick. If a real
multi-second delay is reported, it is happening *later*, inside the actual
voice-connection flow (`vfConnectSocket()`, when the student opens the
Alexa widget and starts a call) — not inside the landing-page entry
transition. Don't re-diagnose "entry is slow" as a landing-page problem
without first checking which button/flow the delay actually occurs in;
these are two separate code
paths. `vfConnectSocket()` shows a non-blocking, honest status-text hint
("جاري تجهيز الخادم...") if the handshake is still pending past 5 seconds
(a real possible Render cold-start symptom), without touching the
connection itself — separate from the hard 12s timeout that actually
gives up and shows an error.

---

## 2. The 36-lesson curriculum — structural rules (CRITICAL)

- Exactly **36** `<div class="lesson-card" id="lesson-01">` … `id="lesson-36"`
  elements. This number is load-bearing: zone boundaries, exam banks, and
  `LESSON_TOPICS` in `server.js` all assume exactly 36.
- Grouped into **3 month zones**, 12 lessons each, each its own
  `<div class="rm-zone" id="zone-1|2|3">` containing a clickable
  `.rm-zone-header` (`onclick="toggleZone('zone-N')"`) and a
  `.rm-zone-body > .rm-path` holding that month's 12 `.lesson-card`s, then
  a `.rm-gate-content` wrapper with that month's exam + capstone story.
  **Zone boundaries are physical DOM nesting, not just numbering** — lesson
  IDs 1-12 must be physically inside zone-1's div, 13-24 inside zone-2's,
  25-36 inside zone-3's. Editing lesson content by number is safe; editing
  the *span of raw HTML* that crosses a zone boundary is not (see §7).
- Each lesson card has: `.lesson-title-ar`, `.lesson-title-en`,
  `.lesson-goal` (the AI reads all three to build lesson-aware context —
  see §4), a vocabulary/example area (`.vc-verb` tiles and/or
  `.vocab-table`), and a `.quiz-block` with **globally-unique**
  `id="quiz-NN"` / `id="qa-NN"` (must match the lesson's own two-digit
  number — never duplicate across lessons).
- `server.js`'s `LESSON_TOPICS` object is a plain-text mirror of the 36
  titles (used as a fallback and for the AI's own reference) — **must be
  kept in sync** with `index.html`'s actual titles whenever a lesson's
  topic changes, or the AI will announce the wrong lesson name.
- Current topic order (after multiple approved rebalances — do not assume
  this matches any earlier description of the curriculum): alphabet/phonics
  (1-4) → sentence structure with "to be" (5-12) → action verbs/present
  simple/do-does (13-18) → **scenario lessons distributed periodically**
  (Coffee@15, Doctor@20, Hotel@22, Job Interview@26, Airport@34 — deliberately
  spread, not clustered) → past tense (24-28) → future tense (29-31) →
  Numbers/Time/Prices@32 → capstones/review (33-36).
- Always verify the current state with `grep` before assuming a lesson
  number's topic — it has changed multiple times.
- **CEFR level tagging**: every lesson card's header has a
  `.lesson-level-badge` (`lesson-level-a1` or `lesson-level-a2`, styled
  distinctly — green for A1, purple for A2) right next to its
  `.lesson-number-badge`. **Mapping is fixed by month, not by individual
  topic difficulty**: lessons 1-24 (Months 1-2) = A1, lessons 25-36
  (Month 3) = A2 — this was an explicit content decision (Month 1 & 2
  together = A1 Beginner, Month 3 = A2 Elementary/Pre-Intermediate), not
  a per-lesson linguistic judgment call. The three `.rm-zone-header`
  subtitles also state this in words ("المستوى: A1 (مبتدئ)" /
  "المستوى: A2 (أساسي متقدم)"). If the lesson count or the A1/A2 boundary
  ever changes, update both the per-lesson badges (currently inserted via
  a scripted `LESSON <= 24 → A1 else A2` rule, not hand-authored per
  lesson) and the three zone-header subtitles together — they must stay
  consistent with each other.
- **Known minor sequencing note (not fixed, deliberately)**: Lesson 22
  ("At the Hotel") uses "Room 302" in its dialogue — a 3-digit number —
  while numbers aren't formally taught until Lesson 32, ten lessons
  later. This is low-stakes exposure only (the number is never actively
  quizzed/produced by the student, just heard/read as incidental dialogue
  detail), and was left as-is rather than triggering a full curriculum
  reorder, since restructuring lesson positions has wide-reaching effects
  on the pedagogical bridge notes (§4), documented scenario distribution
  above, and every quiz/lesson ID. If asked to "fix the sequencing" again,
  a targeted content tweak (e.g. simplifying the room number) is lower-risk
  than reordering lessons.

---

## 3. AI voice architecture (Gemini Live API)

- Model: `gemini-3.1-flash-live-preview`, with a **verified-alive** fallback
  chain (`MODEL_FALLBACK_CHAIN` in `server.js`) — currently falls back to
  `gemini-2.5-flash-native-audio-preview-12-2025`.
  **Never** add `gemini-2.0-flash-exp` or `gemini-1.5-flash` as fallbacks —
  2.0 was discontinued by Google (June 2026) and 1.5 predates the Live API
  entirely; both were repeatedly requested and repeatedly confirmed dead.
  If a newer/different model is requested, verify it's real via web search
  before wiring it in — do not trust a model name at face value.
- `thinkingConfig: { thinkingLevel: "minimal" }` is set explicitly for
  lowest first-audio-byte latency.
- **`maxOutputTokens: 350`** on the Live connect config — a hard cap
  matching the "under 20 words / 2 sentences" response-length rule in the
  prompt (§4 below). This used to be enforced by prompt wording alone;
  now there's a real API-level backstop too, which also helps quota/cost
  since the prompt can't be "argued around" into a long response the way
  pure instruction-following sometimes can be. **Raised once already,
  from an initial 200 — the exact risk flagged when 200 was first set
  ("a low hard cap that would silently truncate the longer reply
  mid-sentence") actually happened in practice**: 200 was nominally
  generous for "20 words" alone, but real replies mix denser-tokenizing
  Arabic with the target English plus tone-mode flavor phrases (e.g.
  Angry mode's longer exclamations), so genuine mid-sentence cutoffs
  occurred. If response length is ever intentionally relaxed further
  (e.g. bringing back a Mode-2-style full-explanation override), raise
  this number too — and if truncation is ever reported again, treat this
  cap as a likely first suspect, not just prompt wording.
- **Rate-limit (429/RESOURCE_EXHAUSTED) handling**: `isRateLimitError(err)`
  (checks `err.code`/`err.status`/message text for 429, RESOURCE_EXHAUSTED,
  or "quota") is checked both in the mid-session `onerror` callback and
  after the model-fallback chain is fully exhausted in `initGeminiSession`.
  On a match, the client gets a distinct `{type:"rate_limited", message:
  "النظام تحت ضغط مؤقت، نرجع بعد لحظات.."}` event — deliberately a
  *different* message type from the generic `{type:"error"}`, so
  `index.html`'s `case 'rate_limited':` can show a calmer, expected-this-
  can-happen status line rather than the more alarming generic error
  styling, without ending the call or leaving the UI stuck. If a genuinely
  different error also needs its own distinct client-facing treatment in
  the future, follow this same pattern (a new `type` value + a new
  `case` in the client) rather than overloading the generic `error` type
  with a `code` field the client has to branch on.
- **The system instruction (`buildTutorPersonaIntro`/`buildSystemInstruction`,
  ~20,000 characters combined) is sent exactly once, at
  `ai.live.connect()` session setup — not re-sent per turn.** It therefore
  affects one-time session-start latency, not the per-response
  time-to-first-audio-byte of ongoing conversation (that's governed by
  `thinkingLevel` above and the immediate per-part forwarding in
  `onmessage`, both already latency-optimized). If asked to "streamline
  the system prompt to lower latency" again, verify which latency is
  actually meant before cutting behavioral rules (dialect strictness, the
  Strict Evaluation & Correction System, lesson isolation, the
  pedagogical bridge notes, etc.) that were built up deliberately across
  many iterations for real, observed quality reasons — a one-time
  session-start shave is a bad trade for losing any of those.
- Every `sendRealtimeInput`/`ai.live.connect` call site is wrapped in
  try/catch; a top-level `uncaughtException`/`unhandledRejection` handler
  logs and does a clean `process.exit(1)` restart (Node docs: continuing
  after a truly uncaught exception risks a silently-wedged process that
  *looks* alive but isn't — this happened once and was hard to diagnose).
- **WebSocket keep-alive**: server-side `setInterval` ping every 15s +
  `pong` listener (`server.js`), terminating the connection if a pong
  isn't received before the next tick — tuned specifically against
  Render's/intermediary proxies' idle-connection timeouts. This already
  existed and is correctly tuned; don't add a second heartbeat mechanism
  or a client-side JS ping/pong handler — native `ping`/`pong` WebSocket
  frames are handled automatically by the browser, no client JS needed.
- **Bounded single auto-reconnect** (`index.html`, `_vfSocket.onclose`):
  if the socket drops unexpectedly while a call is active
  (`window._vfRec`), one automatic `vfConnectSocket()` retry fires after
  1.5s, guarded by `_vfReconnectAttempted` (reset on successful
  `session_ready` and on `vfStop()`) so it can only ever fire once per
  drop — never an unbounded reconnect loop (that was a deliberate earlier
  decision, still respected). Honest limitation: this re-establishes the
  connection and starts a **fresh** Gemini session with the same
  scenario/lesson context — it cannot resume the exact dropped session's
  own short-term conversational memory, since that's tied to the
  connection itself.
- CORS/WS `verifyClient` accepts all origins unconditionally (this is a
  voice relay, not an endpoint serving sensitive per-user data — do not
  re-add an `ALLOWED_ORIGIN` env-var gate, it caused a real outage once).
- Backpressure: `sendToClient()` drops new **audio** frames (not
  text/control messages) once `clientWs.bufferedAmount > 262144` bytes —
  stale queued audio is worse than a brief gap. Same 256KB guard exists
  client-side for outgoing mic audio.
- A **startup self-test** (`testGeminiConnectionOnStartup`) runs on server
  boot and exposes its result via `GET /api/health` (`geminiSelfTest`
  field) — check this first when debugging "voice doesn't work" before
  assuming a client bug.

---

## 4. Alexa persona & system-prompt rules (`server.js`)

- Single fixed persona: **"Alexa"**, female. There is no gender/name
  selector in the UI (removed). `tutorName`/`tutorGender` params still
  exist in payloads for backward compatibility but are ignored server-side.
- **Pure Saudi Arabian dialect only** (اللهجة السعودية الطبيعية البيضاء —
  نجدية/حجازية) for all Arabic — Egyptian dialect, Levantine (Shami), and
  formal MSA/Fusha slang are all explicitly forbidden in the prompt via a
  concrete ban list. **This paragraph previously described an older,
  pre-full-rewrite ban list format that no longer matches the actual
  prompt (§24 above documents that full rewrite) — corrected here.**
  Current actual ban list (section 1, `buildTutorPersonaIntro()`): شو،
  يا بطل، عايز، منيح، يا زلمة، بدي، هيك، إزيك (or English equivalents like
  "hero"/"champ"), each paired with a note on why (Egyptian/Levantine/
  pan-Arab, not Saudi) — permitted-expression examples in the same line:
  وشو، إيش، يا بعدي، يا هلا، "تمام، وش رايك"، سم، أبد، ما قصرت، زين، يا
  ساتر، يلا نعيدها. Also explicit in the same identity block: English
  target words must be pronounced with clear standard American/native
  clarity (never simplified/foreign-accented), and no Spanish or other
  foreign-language vocabulary should ever be generated — there is no
  Spanish-practice mode in this app. When asked to
  "reinforce" or extend this constraint, **add** new banned words/approved
  phrases to these two lists in `buildTutorPersonaIntro` in `server.js`
  rather than rewriting the rule from scratch — keep it a single
  authoritative list, don't create a second parallel dialect rule
  elsewhere in the prompt.
- **Arabic-first opening, always**: every session's very first words are a
  brief Saudi Arabic welcome, before stepping into a scenario/lesson/free
  chat. This is a hard rule, not a suggestion — a past version skipped it.
- **The system prompt was completely rewritten/replaced at one point
  (not just incrementally edited) — `buildTutorPersonaIntro()` and
  `SYSTEM_INSTRUCTION_BODY` in `server.js` now follow a compact, explicitly
  numbered 5-section structure** (CORE IDENTITY & TONAL RULES → STRICT
  ACADEMIC EVALUATION → SMART 3-ATTEMPT PATIENCE SYSTEM → MASTERY
  RECOGNITION → CODE INTEGRITY REQUIREMENT), replacing a much longer,
  more elaborate earlier version (an "ultra-playful hype" tone framing,
  a granular word-by-word Mode 1/Mode 2 dual system, and a level-based
  Arabic→English praise-language progression were all dropped in this
  rewrite — **if a future request references that earlier tone/behavior,
  it no longer exists; the current tone is "friendly, encouraging, but
  HONEST," not high-energy/playful**). If asked to fully replace the
  prompt again, this numbered-section structure is the current baseline
  to work from, not the older elaborate one.
  - **Response length**: now stated as "strictly under 20 words / 2
    sentences" — replaced the earlier "1 to 2 sentences max" wording
    (itself a replacement of an even earlier "1-8 words, word-by-word
    phrase building" mechanic). Also now backed by a real API-level cap
    (`maxOutputTokens: 350`, see §3 above) rather than prompt wording
    alone. Don't reintroduce a third, competing way to describe response
    length — pick one description and keep it singular, and keep
    `maxOutputTokens` roughly matched to whatever the prompt currently
    says.
  - **"1B. MASTERY-BASED PHASE GATES" (بوابات الإتقان)** — a later
    addition, inserted right before section 2 (numbered "1B" rather than
    renumbering the whole 2-5 sequence), then refined once from an
    initial looser "4-step ladder" framing into this stricter
    gatekeeper model, then refined again to make syllable-breakdown its
    own explicit **Phase 0** (only for genuinely hard/multisyllabic
    words — skipped entirely for easy ones) rather than a sub-detail
    mentioned only inside Phase 1's text. Applies to *every* lesson,
    scenario, and tone mode with no exceptions. Four phases now, not
    auto-advanced: **Phase 0 (Syllables)** — isolate/model the hardest
    syllable(s) before blending the full word, targeted tool not a
    mandatory step for every word; **Phase 1 (Core Word)** — stay here
    until genuinely high fluency/low error rate *across the lesson's
    words*, not one lucky correct attempt; **Phase 2 (Short Phrases,
    2-3 words)** — only unlocked after real vocabulary mastery, and
    re-evaluated live at every phrase attempt (rising error rate or
    heavy hesitation mid-phrase-practice falls straight back to word
    drills, not just a one-time gate passed once and forgotten);
    **Phase 3 (Full Sentences)** — reserved for complete ease, precision,
    and confidence at the phrase phase, never pushed prematurely just to
    keep the lesson moving. Includes the same vocabulary-simplification
    guidance (prefer "Booking" over "Reservation" in a hotel scenario
    unless "Reservation" itself is the actual lesson target) — the
    "Reser..." → "...vation" → "Reservation" example now explicitly
    lives under Phase 0's description rather than being described twice
    in two places. **"Phase" (this gate model) and "Attempt" (the
    3-attempt patience system directly below it) are two different,
    complementary counters, not the same thing** — a student can be on
    Attempt 1 of a word within Phase 1, then once that phase's mastery
    bar is genuinely met, move into Phase 2 fresh at Attempt 1 of a new
    phrase; don't conflate the two if asked to adjust either system in
    the future. Falling back a phase is explicitly framed as normal —
    the gate working as intended, not failure — consistent with the
    max-attempts "friendly rollover" tone elsewhere in the prompt. If
    asked to tune this again, the underlying shape (4 gated phases +
    live re-evaluation, not a one-time check) is now the stricter
    baseline — don't accidentally loosen it back toward "advance every
    turn" phrasing while trying to word-smith something else.
  - **"1C. SHADOWING TECHNIQUE" and "1D. PIMSLEUR-STYLE RAPID RECALL
    DRILLS"** — two genuinely new sections (no prior overlap existed,
    unlike Phase Gates/Error Memory which already covered most of
    "chunking"/"spaced repetition" before these were added). Shadowing
    is a teaching move for *introducing* new material — model the
    target's stress/rhythm, explicit echo cue ("اسمعني زين ورددها وراي
    بنفس النبرة: [TargetPhrase]"), and evaluation checks natural
    cadence/flow *in addition to*, never instead of, the usual phonetic
    accuracy bar — it does not replace or soften the Smart 3-Attempt
    Patience System if the echoed attempt is wrong. Pimsleur-style
    drills are reinforcement/automaticity practice on *already-mastered*
    material only (post-Phase-2/3, never a fresh Phase 1 introduction) —
    a quick zero-visual-dependence recall prompt requiring an instant
    spoken answer from memory, evaluated with the same strict standards
    as everything else, kept occasional/natural rather than a rigid
    back-to-back quiz format.
  - **Personal Student Error Memory's spaced-repetition trigger was
    tightened from a vague "natural pause point" to a specific
    condition**: re-inject one struggle word after roughly 2-3
    subsequent correct turns in a row, or at the natural end of the
    current lesson/scenario, whichever comes first. The rest of the
    mechanism (one word at a time, same strict re-evaluation standard,
    only clears from the queue on a genuinely correct re-test, spoken
    "صارت متقنة" marker for the client's detection regex) is unchanged —
    see the Personal Student Error Memory entry elsewhere in this file
    for the full client-side detection mechanics.
  - **Three-outcome evaluation matrix in §2 (added — a real gap, not
    previously covered): CORRECT / INCORRECT / UNCLEAR AUDIO.** Before
    this, the prompt only ever described a binary correct-vs-incorrect
    judgment, which implicitly forced Alexa to guess when the audio was
    genuinely muffled/ambiguous — a real source of both false positives
    (guessing "صح" on unclear audio) and false negatives (guessing
    "خطأ"). UNCLEAR AUDIO is now a distinct third outcome: say something
    like "الصوت ما كان واضح، عيدها مرة ثانية؟" and wait for a clean
    repeat, **never** silently defaulting to either judgment.
    **Deliberately does not consume one of the 3 Smart Patience
    attempts below** — no real evaluation happened, so it would be
    unfair to spend the student's attempt budget on a mic
    glitch/ambiguous audio that wasn't a genuine wrong answer. Also
    made explicit that reasonable non-native-accent variation on an
    otherwise-correct word should be accepted as CORRECT at *any*
    attempt number, not just from Attempt 2 onward — previously the
    "more forgiving of accent" language only appeared under Attempt 2's
    description, which could be read as Attempt 1 being stricter about
    accent specifically; that's not the intent and is now stated
    directly in the CORRECT criteria itself.
  - **Smart Patience (3-attempt system)** — kept, same structure as
    before: Attempt 1 strict + phonetic tip, Attempt 2 more forgiving of
    minor accent variation, Attempt 3 the exact "friendly rollover"
    trigger phrase ("محاولة ممتازة! كلمة [TargetWord] بنرجعلها بعدين بكل
    سهولة، خلنا نكمل..") that the client's Personal Student Error Memory
    (§ below) depends on for its spoken-marker detection — **this exact
    phrase must never be reworded**, since `index.html`'s regex match on
    it would silently stop working.
  - **Mastery Recognition** — kept, same exact phrase ("[TargetWord]
    صارت متقنة! ما شاء الله") for the same reason (the client's mastery
    detection regex depends on it verbatim).
  - **Four sections were deliberately KEPT from the older prompt despite
    the "complete replace," because they're functional scaffolding other
    shipped features actually depend on, not tone/personality content**:
    Session Time & Pause Handling (the 20-minute soft-pause/resume flow
    would look broken without it), First-Turn Initiative (the proactive
    lesson-aware greeting and scenario roleplay scaffolding both need
    this to know how to use the dynamic Session Context appended after
    this block), Never End the Conversation Yourself, and a short Voice
    Output Readiness note. These aren't part of the new 5-section
    numbering — they're appended after section 4, clearly separated. If
    asked for another full prompt replacement, keep re-including these
    four unless the request explicitly also wants that functionality
    removed.
- **A past revision of the friendly-rollover example line accidentally
  used the banned "يا بطل" in the example text itself, one paragraph
  below the rule that explicitly forbids it** — caught and fixed. Lesson:
  when writing a new example for a rule that references a ban list
  elsewhere in the prompt, actually re-check the example against that
  ban list before considering the edit done, not just the surrounding
  prose.
- **CRITICAL architecture fact if ever asked to "fix the speech
  recognition/similarity-matching logic in `index.html`": no such thing
  exists there, and it never has.** There is no `SpeechRecognition`/
  `webkitSpeechRecognition` API, no string-similarity/Levenshtein
  function, and no attempt-counter anywhere in the client. The client's
  only job is capturing raw PCM audio and streaming it to `server.js`,
  which relays it unmodified to Gemini Live — **Gemini itself listens to
  the raw audio and judges correctness**, entirely through its own
  language understanding, governed by the Strict Evaluation & Correction
  System above (a `server.js` system-prompt instruction, not a JS
  function). A request to "review the JS speech-matching function" is
  based on a false premise; the actual fix for evaluation-accuracy
  requests belongs in this system prompt section, not in `index.html`.
- **Personal Student Error Memory (سجل الأخطاء) — a `localStorage` review
  list of struggled words, and the specific spoken-marker mechanism that
  makes it work despite the architecture fact above.** Because Gemini
  Live's "text" stream *is* the transcript of what Alexa is actually
  speaking (not a silent side-channel), there is no way for her to emit
  an invisible bookkeeping tag — anything she "sends as text" gets
  spoken out loud too. The solution: two natural-sounding **spoken**
  phrase patterns she's instructed to say as a normal part of her own
  sentences, which the client detects via regex on the *complete*
  accumulated turn text (checked once, in `case 'turn_complete':` —
  deliberately not in `case 'text':`, which fires many times per turn as
  text streams in and would otherwise re-match the same phrase
  repeatedly):
  - Struggle logging (attempt-3 friendly rollover, §4 above): Alexa says
    the target word immediately before "بنرجعلها بعدين" (e.g. "...Park
    بنرجعلها بعدين بكل سهولة...") → `addStruggleWord()`.
  - Mastery on a later revisit: she says the word immediately before
    "صارت متقنة" (e.g. "Park صارت متقنة! ما شاء الله") →
    `removeStruggleWord()` + `addXP(150)` (the one real XP system, see
    §7 — never a separate counter).
  **This is a best-effort mechanism, not a guaranteed one** — natural
  language phrasing varies, so an occasional miss is an accepted
  trade-off for not forcing Alexa into a rigid, robotic-sounding fixed
  script. `localStorage` key `se_struggle_words`, capped at 12 entries
  (oldest dropped first) so the prompt payload never grows unbounded —
  this is a short "living review pool," not a permanent transcript.
  Sent in every `start_session` as `struggleWords`, sanitized server-side
  by `sanitizeStruggleWords()` (same defensive posture as
  `sanitizeLessonText` — count-capped, length-capped, type-checked)
  before being embedded in the prompt as `buildSystemInstruction()`'s
  final parameter. Alexa is instructed to only bring one back at a
  natural pause point, never mid-lesson, never more than one at a time.
- **Level-based praise language (REMOVED in the prompt rewrite above —
  do not assume it still applies).** An earlier version had praise
  language genuinely shift from Arabic-only to English as the student
  showed improved fluency within a conversation. The current, simpler
  prompt just says "Tone: Friendly, encouraging, but HONEST" with no
  per-attempt language-switching mechanic — praise language is no longer
  explicitly staged. "يا بطل"/"يا شاطر" and their English equivalents
  ("hero"/"champ") remain banned regardless (dialect ban list, §
  above/below).
- **Never end the conversation unprompted** — Alexa must always keep the
  turn open with a follow-up unless the student explicitly says goodbye.
- **Global floating widget, verified**: `#voice-fab` is a direct child of
  `<body>` (checked via actual DOM-depth tracking, not just CSS) —
  `position:fixed;bottom:32px;right:32px;z-index:9997` — not nested inside
  any lesson card, zone, or dashboard-specific container. It's already
  visible everywhere the dashboard is shown, by construction; a request
  to "make the FAB global" almost certainly doesn't need any DOM move.
- **Lesson-aware context**: the client extracts the *real* title/goal/
  vocabulary straight from the currently-open lesson card's own DOM
  (`.lesson-title-ar/en`, `.lesson-goal`, `.vc-verb` tiles) via
  `window.vfSetLessonContext(lessonId)` and sends it in `start_session` —
  never hand-author a parallel copy of lesson content in `server.js`, it
  will drift. Server-side, this text is sanitized (`sanitizeLessonText`)
  before being embedded in the prompt. **`vfSetLessonContext(null)` must
  also be called whenever a lesson closes/the student returns to just
  browsing the list** (the toggle-close branch of the lesson-card click
  handler, and `exitPlatform()`) — for a long stretch of this project's
  history, the context only ever got *set* on open and was never cleared
  on close, so opening the voice widget from the plain dashboard after
  having previously viewed a lesson would incorrectly still send that
  stale lesson's context. Both clearing call sites now exist; if a new
  "leave this lesson" code path is ever added, clear the context there
  too.
- **Proactive lesson acknowledgment**: when lesson context is present,
  Alexa's first turn must explicitly state both the lesson's **number**
  (spoken as a natural Saudi Arabic ordinal, e.g. "الدرس الخامس" — the
  prompt gives Alexa the raw number and trusts her own language generation
  to phrase the ordinal correctly rather than a hand-built 36-entry
  lookup table, which would be more fragile) and its **title**, then ask
  if they're ready to begin (e.g. "أهلاً بك! أرى أنك فتحت الدرس 5 [العنوان].
  هل أنت جاهز لنبدأ سوياً؟") — this specific line is exempt from Mode 1's
  word-limit, same exemption as the general Arabic-first welcome it
  immediately follows (same opening turn). Only *after* the student
  responds does actual Mode 1 word-by-word teaching for that lesson begin.
- **No forced auto-start on lesson open (reverted from an earlier
  version — do not re-add without an explicit new request).** Opening any
  of the 36 lesson cards is silent by default: no mic prompt, no
  WebSocket, no billed session — students browse and read quietly.
  `vfSetLessonContext(card.id)` still runs via `saveProgress()` on every
  open (so context is ready the moment a session *does* start), but
  nothing voice-related is triggered automatically anymore. An earlier
  version of this auto-started a call on every lesson open and was
  reverted specifically because it meant a mic-permission prompt and a
  billed Gemini Live session on every single lesson open, including
  students who only wanted to read/quiz — don't reintroduce that pattern.
- **Active-session context switching** (`window.vfNotifyLessonSwitch`,
  called from the lesson-card `rm-open` branch): the *only* thing that
  happens automatically when a lesson opens is — **if and only if a call
  is already active** (`window._vfRec && _vfSessionReady`) — a system-note
  text turn tells Alexa the student switched to a new lesson and instructs
  her to acknowledge it naturally and ask if they want to review it (e.g.
  "أرى أنك انتقلت لدرس '...'، هل تود أن نراجعه سوياً؟"), explicitly *not*
  to start teaching it unprompted or abandon the prior topic if the
  student says no. If no call is active, this is a no-op beyond the
  context already being captured for whenever a session starts later.
- **Daily 15-minute voice budget — DISABLED per explicit request (do not
  assume it's still enforced without checking `vfDailyLimitReached()`'s
  actual body first).** `VF_DAILY_LIMIT_SECONDS = 900`, `localStorage` key
  `se_voice_daily` as `{date, seconds}` — this tracking infrastructure is
  all still intact and still quietly accumulating in the background
  (`vfAddDailyVoiceSeconds(5)` still runs on every 5s tick while a call
  is active and not soft-paused), but `vfDailyLimitReached()` now
  unconditionally `return false`s, so **neither of the two original
  enforcement points actually blocks anything anymore**: the pre-call
  check in `vfUnlockAndStart()` and the mid-call check in
  `vfCheckSessionLimits()` are both still physically present in the code
  (their `if(vfDailyLimitReached()){...}` blocks, including the toast and
  friendly "لقد استنفدت حدك اليومي..." message, are untouched) but are
  now dead code that never executes, since the one function they both
  depend on always says "not reached." **This was a deliberate one-line
  neutralization, not a deletion — to re-enable the cap, revert
  `vfDailyLimitReached()` back to
  `return vfGetDailyVoiceSeconds()>=VF_DAILY_LIMIT_SECONDS;`** and both
  call sites resume working exactly as before with zero other changes
  needed. **Real, stated trade-off**: this was originally built
  specifically as a budget/cost control against Gemini API usage: removing
  it means literally unlimited voice-call duration and API spend per
  student per day, with nothing else in this codebase limiting it. This is
  the product owner's call to make about their own API budget, not a
  correctness bug — but if cost complaints come up later, this is the
  first place to look, and re-enabling is the one-line revert above.
  This is entirely separate from the unrelated 20-minute soft-pause
  (`VF_MAX_SESSION_MS`) and 3-minute silence timeout
  (`VF_SILENCE_TIMEOUT_MS`) mechanisms in the same function, both of
  which are untouched and still fully active — don't confuse "daily
  quota" (now disabled) with "per-round pacing" (still on).
- **Strict lesson isolation**: focus only on the current lesson's own
  vocabulary/goal unless the student asks about something else.
- **Scenario roleplay** (6 options: free, coffee, hotel, doctor, interview,
  airport) also gets Arabic-first, gradual
  word-by-word scaffolding before stepping into full English character
  dialogue — scenarios are *not* exempt from Mode 1's pacing.
- **Mid-call scenario switching** works without ending the session: client
  sends `{type:'switch_scenario', scenario:'...'}`, server builds a fresh
  system-note text turn from the same whitelisted `SCENARIO_NOTES` (never
  trusts arbitrary client text) and sends it via `sendRealtimeInput`.
- **Pedagogical bridge notes**: lessons 13/14/17 (Action Verbs → Present
  Simple → Do/Does) get dynamically-injected instructions telling Alexa to
  explicitly forward-reference/connect these three lessons, since they're
  taught across separate sessions and a student could otherwise feel a
  logic gap. If lesson numbers shift again, update the `lessonNum === N`
  checks in `buildSystemInstruction` to match.

---

## 5. Audio pipeline (client-side, `index.html`)

- **Playback**: a single persistent `ScriptProcessorNode` (8192 samples)
  continuously pulls from a growing/shrinking queue — *not* one
  `AudioBufferSourceNode` per incoming chunk (that pattern caused audible
  stutter/clicks, especially on iOS Safari). Chain:
  `ScriptProcessorNode → DynamicsCompressorNode → GainNode(1.3) → destination`
  — the compressor evens out Gemini's turn-to-turn volume inconsistency;
  don't remove it or volume will feel "loud then quiet." Current settings
  are deliberately strict/near-limiting: threshold -30dB, ratio 12:1, knee
  10, attack 0.003s, release 0.25s — tuned for peak-normalized, consistently
  smooth output with no sudden loud spikes or whisper-quiet drops. If
  asked to make this "even stricter," raise the ratio further and/or lower
  the threshold rather than touching attack/release (which mainly control
  audible "pumping," not overall consistency).
- **Mic-driven visual intensity via `AnalyserNode` — REMOVED.** An earlier
  version read frequency-domain data (`getByteFrequencyData`,
  `smoothingTimeConstant=0.85`) into `window._vfMicIntensity` purely to
  drive the WebGL wave shader's brightness. Once the WebGL wave itself was
  removed (see §8), this had zero remaining consumers, so the
  `AnalyserNode` creation and per-callback `getByteFrequencyData` work
  were deleted too rather than left running for nothing. The **separate**,
  still-active `avgAmplitude` calculation (computed straight from
  `inputBuffer.getChannelData(0)`, unrelated to the removed AnalyserNode)
  remains deliberately raw and unsmoothed — it drives silence-detection
  and the barge-in amplitude gate, both of which need instant reads to
  correctly catch the exact moment speech starts/stops; don't add
  smoothing to it even if a future visual feature wants a smoothed value —
  compute that separately rather than reintroducing coupling between a
  functional gate and a cosmetic effect.
- **Mic capture**: `getUserMedia({channelCount:1, echoCancellation:true,
  noiseSuppression:true, autoGainControl:false})`. `autoGainControl` is
  deliberately `false` — it was found to clip/dip the student's voice
  dynamically. This has been requested to be `true` before; keep it
  `false` unless given a specific new technical reason, not just "for
  latency" (AGC doesn't affect latency). Mic recording buffer is 4096
  samples (~85ms at a typical 48kHz mic, reduced from an original 8192
  /~170ms for lower per-chunk latency) — **this is a genuine, honest
  trade-off, not a free win**: halving the buffer roughly doubles
  `onaudioprocess` callback frequency and outgoing WebSocket message
  frequency (more CPU/battery use). If mobile battery/overheating
  complaints come back, this is the first thing to reconsider raising
  again. Note this is a *separate* buffer from the **playback**
  `ScriptProcessorNode` below (still 8192) — don't conflate the two when
  asked to tune "the audio buffer," they serve opposite directions
  (mic-in vs. speaker-out) and don't need to match.
- **Client-side end-of-turn signal** (`onaudioprocess`, sends
  `{type:'audio_stream_end'}`): `server.js` has always had a fully
  working handler for this message (forwards
  `sendRealtimeInput({audioStreamEnd:true})` to Gemini, pre-empting its
  own internal silence-based turn detection) — for a long stretch of this
  project's history nothing on the client ever actually sent it, so
  Gemini's own (slower, generic) VAD was the only thing ending a
  student's turn. Now implemented as a deliberately conservative
  client-side VAD: fires once after genuine speech was detected
  (`avgAmplitude>0.007`) AND 700ms of continuous silence follows
  (`_vfHasSpokenSinceTurnEnd`/`_vfSilenceStartTime`) — long enough that an
  ordinary mid-sentence breath won't trigger a premature cutoff, short
  enough to meaningfully beat waiting on Gemini's own timeout. Resets the
  moment real speech is detected again, so each new utterance gets its
  own independent signal. If students start reporting being cut off
  mid-sentence, raise the 700ms threshold rather than removing the
  mechanism outright.
- **Full-duplex barge-in with amplitude gating**: the mic is *not*
  suppressed while Alexa talks (true barge-in), but while she's actively
  speaking, mic frames below a stricter amplitude threshold (0.04 vs 0.01
  for normal silence-detection) are filtered client-side before sending —
  this exists specifically because pure full-duplex let her own voice
  echo back through the speaker and get mistaken for a new turn,
  causing Alexa to "talk over herself." Removing this gate re-introduces
  that bug. **Verified (not just assumed) when investigating a "she cuts
  herself off" report**: there is no separate client→server "interrupt"/
  "cancel" message type anywhere — this amplitude gate on ordinary mic
  audio forwarding is the *only* barge-in mechanism, and `server.js`
  forwards every `content.modelTurn.parts` audio chunk to the client the
  moment it arrives, with no server-side buffering/batching that could
  drop or delay a chunk before a turn closes. If audio truncation is
  reported again, `maxOutputTokens` (§3 above) is a more likely first
  suspect than either of these two mechanisms.
- **Connection sequencing**: `vfConnectSocket()` fires in *parallel* with
  the `getUserMedia()` permission prompt (not after it resolves) —
  overlapping two multi-second delays instead of stacking them. If
  `getUserMedia` ultimately fails, the already-started socket/session is
  torn down cleanly via `vfStop()`.
- **AudioContext auto-resume on tab/screen return**: `vfResumeAudioContextsIfNeeded()`
  resumes both `_vfPlayCtx` and `_vfMicCtx` if either is in a `suspended`
  state — mobile browsers auto-suspend audio contexts when the screen
  locks or the tab is backgrounded mid-call, and without this the student
  would come back to a silently-dead call. It never *creates* a context,
  only resumes ones that already exist, so it's safe to call unconditionally.
  Wired to **three** separate triggers: `document.addEventListener('touchend', ...)`,
  `document.addEventListener('click', ...)` (both `{passive:true}`), and a
  dedicated `visibilitychange` listener that calls it specifically when
  `document.visibilityState==='visible'`. This is currently the **only**
  `visibilitychange` listener in the app — an earlier second one that
  paused/resumed the WebGL render loop on hide/show was removed along with
  the WebGL waveform itself (see §8); don't assume this one is "the WebGL
  listener" if asked to touch it again.
- **PCM↔base64**: `vfInt16ToBase64` uses `String.fromCharCode.apply` in
  8KB chunks — not a per-byte `binary+=String.fromCharCode(...)` loop
  (that's a real, measurable perf anti-pattern that ran on every outgoing
  audio chunk).
- Base64 audio encoding, connection warm-up, and all WebSocket/audio-buffer
  code paths are already reasonably optimized — profile before assuming
  something here needs changing again.

---

## 6. Session lifecycle

- **20-minute soft pause** (`VF_MAX_SESSION_MS = 1200000`, significantly
  extended from an original 7 minutes/420000 — see §9.10 for why it was
  extended rather than removed entirely), not a hard
  disconnect: mic gates off, WebSocket/Gemini session stay fully
  connected (zero context loss), Alexa is told via a system-note text turn
  to announce the pause verbally in Saudi Arabic. A luxury gold/cyan
  "✨ ▶️ إكمال الدرس" button appears at the **top** of the panel (separate
  element from the bottom mic button, which visually fades while it's
  shown) to resume. 3-minute total silence (`VF_SILENCE_TIMEOUT_MS =
  180000`, raised from an original 2 minutes) is a genuine hard-stop (real
  "walked away" signal, unlike the round-boundary above) — these are
  two independent mechanisms, don't conflate them when asked to adjust
  "silence"/"inactivity" behavior. Two separate knobs affect how
  trigger-happy the silence hard-stop feels: `VF_SILENCE_TIMEOUT_MS`
  itself (how long), and the mic-activity amplitude threshold in
  `vfStartMicStreaming`'s `onaudioprocess` (`avgAmplitude>0.007`, lowered
  from 0.01) that decides whether a given moment counts as "the student is
  speaking" at all — too strict a threshold there can make genuinely quiet
  (but real) speech get miscounted as silence, causing a premature
  hard-stop that looks like "it interrupted me while I was still talking"
  even when the duration itself is generous.
- **Voice Escape Quest (REMOVED — do not re-add without an explicit new
  request).** A `data-scenario="quest"` mini-game scenario existed for
  several iterations (Alexa narrating a gated mini-mystery, a
  `"🎉 QUEST COMPLETE"` marker string, a +10,000 XP reward, a `quest_master`
  badge, a victory chime, a flying-XP animation) and was deliberately
  removed in full — the scenario button, all its CSS
  (`.vf-scenario-quest`, `.vf-quest-toast*`, `.xp-counter-pill.vf-quest-active`,
  `.vf-xp-fly`), its JS state and functions (`vfQuestWin`,
  `vfPlayVictoryChime`, `vfShowQuestRewardToast`, `vfFlyXpToHud`,
  `getQuestWinCount`/`incrementQuestWinCount`), its badge entry, and its
  `server.js` `SCENARIO_NOTES.quest` prompt were all deleted, not just
  hidden. The scenario grid is back to the original clean 6 scenarios
  (free, coffee, interview, airport, hotel, doctor) with no leftover gap.
  If a mini-game/quest mode is requested again in the future, treat it as
  new scope — the removed implementation is a reasonable reference for
  the *pattern* (gated progression via a spoken marker phrase) but its
  specific reward numbers are now stale versus the rebalanced XP economy
  in §7.

---

## 7. Unified XP & Badge system (`index.html`, second script block)

**There is exactly one XP system.** It lives in `localStorage` under
**`totalXP`** (renamed from the earlier `se_xp` — this was requested
explicitly, twice, so treat it as the settled, intentional key name going
forward, not a mistake to resist), managed by `getXP()`/`saveXP()`/
`addXP(amount)`. **Never invent a second, parallel XP counter under a
different storage key** — this has happened more than once now (a quest
feature briefly used its own `vf_total_xp` key, and the key itself was
renamed once already from `se_xp`) and had to be reconciled back into the
one true key each time. If a request asks to "fix" XP by writing to yet
another differently-named key, stop and check `getXP()`/`saveXP()` first —
`totalXP` is the current, real, single source of truth.

Migration history (both steps are one-time-only, guarded by their own
flags, safe to leave in place): `se_xp_migrated_v2` scaled any balance
under the old `se_xp` key ×50 into the high-value economy;
`totalXP_migrated_v3` then copied whatever `se_xp` held into the new
`totalXP` key exactly once. Nothing writes to `se_xp` anymore after that.

`addXP()` always does three things, in this specific order and with this
specific error-isolation: (1) `saveXP(newVal)` — the actual persisted
value, unconditional, always runs first, cannot be skipped by anything
below it; (2) `vfAnimateXpCounter()` (HUD count-up), wrapped in its own
try/catch; (3) `checkBadgeUnlocks()`, also wrapped in its own try/catch.
This isolation is deliberate and load-bearing: before it existed, an
exception thrown inside step 2 or 3 (e.g. a missing DOM element) would
propagate all the way up through `addXP()` and abort whatever *calling*
code ran after it — `markLessonDone()`'s call site had no try/catch of its
own, so a badge-check failure there would silently skip the rest of
lesson-completion handling even though the XP value itself had already
saved correctly. This looked exactly like "XP isn't updating" from the
student's side. `addXP()` must never be allowed to throw, for exactly this
reason — keep both inner try/catches if editing this function.

**Current award values (rebalanced to a realistic/standardized scale —
the earlier "high-value" 500/2,500/10,000 economy above was replaced,
not layered on top of):**
- Correct quiz answer (first time only): **+250 XP**
- Lesson completion: **+500 XP**
- Mastering a previously-struggled word on review (Personal Student Error
  Memory, §4): **+150 XP** — same `addXP()` call as everything else,
  triggered by the "صارت متقنة" spoken-marker detection in
  `case 'turn_complete':`, never a separate counter.

**Important: `applyAnswer()` is shared between the 36 per-lesson quizzes
and the 3 month-end exams (45 questions, 15 each) — it's the single
answer-checking function both `buildQuiz()` and `buildExam()` call**, and
its one `addXP(250)` call site fires for a correct answer either way.
Total available XP is therefore: 36 lessons × 500 = 18,000, plus
(36 lesson-quiz questions + 45 exam questions) × 250 = 81 × 250 = 20,250 —
**38,250 XP theoretical maximum** across the full 36-lesson curriculum.
Recompute this number if the per-award values, lesson count, or exam
question counts ever change again.

Badges (`BADGE_DEFS` array, checked by `checkBadgeUnlocks()`, unlock
toast via `vfShowBadgeToast`): `first_step`, `week_streak`,
`voice_champion`, `month_king`, `graduate`. (`quest_master` was removed
along with the Voice Escape Quest feature — see §6.) Add new badges
to this array (with a `check()` predicate) rather than building a
separate ad-hoc unlock mechanism.

Related storage keys: `se_completed_lessons`, `se_streak`,
`se_voice_sessions`, `se_badges`.

The XP HUD pill (`#xp-counter-pill`) sits inside `#dashboard-header-bar`,
which carries `z-index:99999` — deliberately **above** the voice call
overlay (`z-index:99998`), so the whole header (XP, progress, back button)
stays visible during an active call instead of being hidden behind the
modal. Don't lower the wrapper's z-index without re-checking that overlap
(see §9.6 — this exact thing regressed once already).

---

## 8. Mobile performance (`index.html`)

- **The WebGL ambient voice waveform was removed entirely (do not re-add
  without an explicit new request).** For a long stretch of this
  project's history there was a single full-screen WebGL quad with a
  procedural fragment shader driving an animated wave, progressively
  optimized across several turns — frame-rate throttling (20fps mobile /
  30fps desktop / 10fps idle), fewer shader iterations on mobile (3 vs 5),
  a real `AnalyserNode` feeding its visual intensity, full
  `requestAnimationFrame` cancellation when hidden. All of that was
  deleted in one pass — `initShaderWave()`, the canvas element
  (`#shader-canvas-ANIMATION_17`), `window.vfStopAllVisuals`, all
  `.vf-shader-*`/`.vf-wave-active` CSS, and the now-orphaned
  `AnalyserNode`/`window._vfMicIntensity` computation in the mic's
  `onaudioprocess` callback (it had no other consumer once the shader was
  gone, so keeping it would have been pure wasted CPU on every audio
  callback for a value nobody read). **The lesson here: sometimes the
  right fix for "this is heavy" is removal, not another round of
  optimization** — don't assume a system that was heavily tuned in the
  past is therefore worth keeping.
- **Current replacement**: `#vf-status-display`, a small flex badge (dot +
  text) toggled by `setWaveActive(active)` at the exact same
  call-lifecycle points the WebGL version was (`vfStart()` on
  `session_ready`, `vfStop()`, `toggleVoiceFab()`'s close branch). The dot
  pulses via a single `@keyframes` rule animating `opacity` only — no
  `transform`, no `box-shadow`, no canvas, no GPU work of any kind, and
  nothing to throttle or cancel since there's no render loop to begin
  with. `setWaveActive()` kept its name/signature so none of its 3 call
  sites needed to change.
- Unrelated to the above, but still true: 36 lesson cards'
  `backdrop-filter` + a blanket `will-change:transform` rule (488
  elements) **crashed mobile Safari/Chrome outright** in an even earlier
  version (see §9.3) — that fix is separate from and unaffected by the
  WebGL removal above. If asked to add new always-on animations/blur
  effects anywhere in the app, default to *not* applying them on
  `max-width:1024px` unless proven safe.

---

## 9. Known recurring bug patterns — check these first

1. **`onclick="fnName()"` ReferenceError**: any function defined inside
   the voice-engine IIFE that's called from an inline `onclick` HTML
   attribute (which executes in *global* scope) must be explicitly
   exposed via `window.fnName = fnName;` near the end of the IIFE. This
   exact bug has recurred multiple times for different functions
   (`vfExpand`, `vfEndCallFromWidget`, `vfResumeFromSoftPause`, etc).
   **Before shipping any change that adds a new onclick handler**, run:
   ```
   python3 -c "
   import re
   c = open('index.html', encoding='utf-8').read()
   calls = set(re.findall(r'onclick=\"[^\"]*?\b(vf[A-Za-z]+)\(', c))
   exposed = set(re.findall(r'window\.(vf[A-Za-z]+)\s*=', c))
   print(calls - exposed)
   "
   ```
2. **Cross-boundary text-span replacements**: when editing HTML by
   extracting/replacing a range of lesson cards (e.g., a Python script
   reordering lessons 15-26), the span's start/end must not accidentally
   cross a `<div class="rm-zone">` open/close boundary — this silently
   deleted the entire "Month 3" zone wrapper once, merging 12 lessons into
   the wrong month with no visible error (tag-balance checks still passed,
   since the divs were still balanced overall, just mis-nested). Always
   verify zone header count (`grep -c "toggleZone('zone-"`) equals 3 and
   each zone wraps exactly 12 lessons after any bulk lesson-reordering.
3. **Blanket `will-change`/`backdrop-filter` on repeated elements**: never
   apply either to a selector matching more than a handful of elements
   without a `max-width:1024px` override disabling it — this is the
   documented root cause of a full mobile browser crash.
4. **A re-entry guard flag left `true` forever = "needs a refresh to work
   again"**: several buttons (`enterPlatform()`'s `_vfEnteringPlatform`,
   `vfStart()`'s `_vfStarting`, `vfSelectScenario`'s call-in-progress
   guards) use a simple `if (guard) return; guard = true;` pattern to
   block double-clicks while an async/animated sequence runs. If *anything*
   inside that sequence throws, returns early on a missing element, or
   never reaches the code path that resets the flag back to `false`, the
   guard stays stuck `true` — every future click on that button silently
   no-ops with **zero console error**, which looks exactly like "the click
   handler isn't bound" even though it fires and returns correctly every
   time. This is why a page refresh "fixes" it (a fresh load always starts
   the guard at `false`) while nothing about the actual binding was ever
   broken. Any new guarded handler must:
   - wrap its body in try/catch and reset the guard to `false` in the
     catch block, not just on the happy path;
   - have a `setTimeout`-based self-healing reset (a few seconds) as a
     last resort, checking whether the expected end-state (e.g.
     `#dashboard.classList.contains('active')`) actually happened;
   - never assume "the button doesn't work" means the binding is missing
     without first checking whether its own guard variable is stuck `true`.
   `enterPlatform()` in `index.html` is the reference implementation of
   this pattern — copy its structure for any new guarded click handler
   rather than re-deriving it.
5. **Synchronous work inside a `touchstart`/`mouseenter` handler delays the
   *next* event on mobile, not just itself**: JS is single-threaded — if a
   handler bound to an early gesture event (e.g. `ontouchstart`, which
   fires before `click` on the same tap) does real synchronous work
   (constructing a fresh `AudioContext` was the actual case here; it's
   genuinely non-trivial the first time on some mobile browsers), the
   browser can't get to processing the subsequent `click` handler until
   that work finishes. This showed up as "the Start button feels delayed
   on the very first tap" even though the click handler itself was fast
   and correctly bound — the *previous* event's handler was the bottleneck,
   not the click. General fix for this pattern elsewhere: defer any
   non-trivial work in an early-gesture handler with `setTimeout(fn, 0)`.
   **For `#hero-start-btn` specifically, the actual final fix was stronger:
   remove any `onmouseenter`/`ontouchstart` handlers from this button
   entirely.** `enterPlatform()` (its `onclick`) is now a deliberately pure,
   synchronous DOM class-toggle — `document.body.classList.add('in-platform')`
   + `#dashboard.classList.add('active')` + `history.pushState` (local,
   not network) — with **zero** other event handlers on the element and
   zero async/network/audio code inside the function itself, verified by
   stripping comments and grepping the function body for `WebSocket`,
   `fetch(`, `AudioContext`, `await`. This button must stay 100%
   offline-capable and execute in a single synchronous tick — do not
   re-attach any warm-up/pre-connect logic to it again, no matter how
   "harmless"/deferred it seems, without being asked to. Backend/audio
   warm-up still happens (page-load `window.seWarmupBackend()`,
   `vfPrewarmAudioContext()` when the voice panel actually opens) — just
   never tied to this specific element anymore. Only
   `checkSavedProgress()` (a `localStorage`-only read, not network/audio)
   runs after entry, and even that is deferred via `setTimeout(fn, 0)` so
   it can never be perceived as adding to the transition itself.
6. **Multiple independently-`position:fixed` header badges collide on
   narrow mobile screens**: the dashboard header used to be three separate
   `position:fixed` elements placed by hardcoded `top`/`left`/`right`
   coordinates with zero mutual awareness of each other's actual rendered
   width — `#smart-back-btn` (top-right), `#nav-progress-pill` (top-left),
   `#xp-counter-pill` (stacked directly under it). On a narrow viewport
   with long enough text in any of them, nothing prevented them from
   visually overlapping, since none of them know the others exist. **Fixed
   structure (current, do not revert to independent `position:fixed`
   badges)**: all three now live inside one real flex container,
   `#dashboard-header-bar` (`position:fixed;top:0;left:0;right:0;
   display:flex;justify-content:space-between;align-items:center;
   padding:20px`, `padding:10px 15px` under `max-width:1024px`) —
   `#nav-progress-pill` + `#xp-counter-pill` + `#se-auth-trigger` are
   grouped together inside a `#dashboard-status-row` flex child
   (`display:flex;flex-direction:row;flex-wrap:wrap;gap:8px;
   flex:0 1 auto;align-items:center`) on the **left** side,
   `#smart-back-btn` is the other flex child on the **right** side.
   **`flex-direction:row` (not `column`) is deliberate** — an earlier
   version stacked the three badges vertically, which read as "stacking/
   overlapping" once there were three of them instead of two; they now
   sit side-by-side in one horizontal line, with `flex-wrap:wrap` as a
   pure safety net (wraps the group as whole badges onto a second line
   on very narrow viewports if needed, never mid-badge) and `flex:0 1 auto`
   (not `1 1 auto`) so the group stays tightly clustered at the left edge
   rather than stretching to fill the row. **Which side each top-level
   flex child lands on is purely a function of DOM order in this RTL
   document** (`<html dir="rtl">`, no `direction` override on the wrapper
   needed beyond the explicit `direction:rtl` now set on
   `#dashboard-header-bar` itself for clarity) — the **first** child in
   source order renders on the right, the **second** on the left.
   Currently `#smart-back-btn` is written first in the HTML (right),
   `#dashboard-status-row` second (left). If asked to swap which side
   either group appears on again, reorder the two top-level children in
   the HTML — do not add `order:` CSS properties or fight the RTL default
   with `direction:ltr` on the wrapper.
   The three inner elements kept their exact same `id`s (so all existing
   `getElementById` calls throughout the codebase needed zero changes) but
   lost their own individual `position:fixed`/`top`/`left`/`right`/
   `z-index` — visibility is now controlled once, on the wrapper, via
   `body.in-platform`/`body.quiz-mode` (previously duplicated on each of
   the three elements separately). **`#dashboard-header-bar` itself must
   stay `z-index:99999`, not a lower value** — when this wrapper was first
   introduced, its z-index was accidentally set to the old
   `#smart-back-btn`/`#nav-progress-pill` value (9990) instead of the XP
   pill's (99999), which silently re-broke the exact "XP badge hidden
   behind the voice call overlay" bug (`.vf-overlay` is `z-index:99998`)
   that had already been fixed once before — caught and re-fixed on a
   later pass. If a new header-area badge is ever added, make it a flex
   child of `#dashboard-status-row` (or a new sibling flex child of
   `#dashboard-header-bar`) — never a fourth independently-`position:fixed`
   element floating on top of this structure with hardcoded coordinates,
   and never lower the wrapper's `z-index` below `99999`. **The wrapper
   also needs `flex-wrap:wrap` on itself** (not just on the inner
   `#dashboard-status-row`) — a mobile-specific `padding:10px 15px` rule
   for this wrapper was documented here at one point but had actually
   gone missing from the real CSS during a later edit to this same
   section (only the `env(safe-area-inset-top)` rule survived), and
   without `flex-wrap` on the *outer* two-child layout
   (`#smart-back-btn` + `#dashboard-status-row`), a narrow-enough screen
   had no fallback besides squeezing/overlapping the two groups — the
   inner row's own wrap only protected its own 3 badges from each other,
   not the outer pairing. **Lesson: when this doc says a CSS rule exists,
   re-verify it's still actually in `index.html` with `grep` before
   trusting the doc, especially for a section that's been edited many
   times** — documentation can silently drift from reality just like any
   other artifact. Current correct state: `flex-wrap:wrap` on
   `#dashboard-header-bar` itself, `padding:10px 15px` under
   `max-width:1024px`, `padding:8px 12px` under `max-width:600px`.
7. **A request to "fix mobile tap delay" doesn't always mean the classic
   300ms synthetic-click delay actually exists**: this project's `<meta
   name="viewport" content="width=device-width, initial-scale=1.0">` has
   already eliminated that delay in modern mobile browsers on its own —
   `touch-action:manipulation` and a same-guarded `ontouchstart` handler
   alongside `onclick` (as on `#hero-start-btn`) are legitimate
   belt-and-suspenders, not a fix for an actual measured delay. Any
   element getting both an `onclick` and an `ontouchstart` calling the
   same handler relies on that handler already being safely re-entrant
   (`enterPlatform()`'s `_vfEnteringPlatform` guard, `vfUnlockAndStart()`'s
   `window._vfRec` check) — never add a dual-event handler pattern to a
   function that isn't already guarded against being called twice in
   quick succession, or it will double-fire.
8. **Don't loosen the 15s WebSocket heartbeat to "fix" disconnects
   without checking the real cause first**: it's already deliberately
   *tighter* than an earlier 25s value specifically to beat proxy/mobile-
   network idle timeouts (see §3) — widening it to 30s+ would remove that
   safety margin, not add one. A "disconnects after N minutes" report is
   far more likely to be the *intentional* round-boundary soft-pause
   (`VF_MAX_SESSION_MS`, see §6) being mistaken for a real drop — Alexa
   goes quiet and the mic gates off, but the WebSocket/Gemini session
   never actually closes; the "✨ ▶️ إكمال الدرس" button resumes the same
   live session. Check which of these two is actually happening (a real
   `onclose` event vs. the soft-pause status text) before touching the
   heartbeat interval at all.
9. **Tapping the floating/header Alexa icon now launches the call
   directly** — `toggleVoiceFab()` calls `window.vfUnlockAndStart()`
   itself right after opening the panel (using whatever scenario/age is
   currently selected, defaulting to free/boy), instead of just opening
   the panel and waiting for a separate manual "ابدأ المحادثة" tap. This
   is safe specifically because `vfUnlockAndStart()`/`vfStart()` already
   own their own re-entry guards (`window._vfRec`, `_vfStarting`) — do
   not add a *second* guard here, and do not remove the manual "ابدأ
   المحادثة" button itself (still needed as a fallback if the auto-launch
   didn't fire for any reason, e.g. a browser blocking the implicit
   gesture chain).
10. **"Remove the session timeout" was deliberately implemented as
    "extend it a lot" instead** (`VF_MAX_SESSION_MS`, currently 20 minutes
    / 1200000, up from 7 minutes / 420000): fully removing the graceful
    soft-pause-and-resume mechanism entirely carries a real risk — if the
    underlying Gemini Live API session itself has any undocumented maximum
    duration (common for "Live"/streaming session APIs generally, though
    not something confirmed in writing for this specific preview model),
    removing our own graceful checkpoint could mean the *first* time a
    session ends is an abrupt hard drop with no resume button, which is
    worse than the current graceful behavior. If asked again to "fully
    remove" this, prefer extending it further over deleting the mechanism
    outright, unless a genuine confirmed reason rules out any server-side
    session cap.
11. **The "Resume Progress" modal (REMOVED — do not re-add without an
    explicit new request).** `#resume-modal` ("أهلاً بك مجدداً! حاب تكمل من
    المكان اللي وقّفت عنده؟", with "نعم"/"لا" buttons calling `acceptResume()`/
    `dismissResume()`) used to show on every dashboard entry when saved
    progress existed. It was deleted — HTML, its inline `<style>` block,
    both handler functions — and `checkSavedProgress()` was rewritten to
    silently call `resumeToLesson(saved.lesson, saved.zone)` directly, no
    confirmation prompt, no overlay. **`getSavedProgress()`,
    `resumeToLesson()`, and `continueCurrentLesson()` were deliberately
    left completely untouched** — `resumeToLesson()` is a shared helper
    also used by the landing page's explicit "متابعة الدرس الحالي" button
    (`continueCurrentLesson()`), which is a *separate*, still-active,
    user-initiated feature; don't remove or rename any of these three
    when touching auto-resume behavior again. `enterPlatform()` itself
    didn't need any changes — it already called `checkSavedProgress()` in
    a deferred, non-blocking `setTimeout(fn, 0)` (see §9.5), so making
    that function silent instead of modal-driven was a self-contained
    change.
12. **Supabase cloud sync + auth — added, active, optional.** SDK
    (`@supabase/supabase-js@2`) and the entire client-init/auth/sync
    module are loaded as **one unit, together, right before `</body>`**
    (not in `<head>`) — a synchronous `<script src="...">` in `<head>`
    blocks HTML parsing until it downloads, which was delaying the
    browser from reaching the main `<style>` block; moving both the CDN
    tag and the module that immediately depends on `window.supabase` to
    the very end keeps them working (script tags execute in document
    order, so the SDK is guaranteed loaded before the init code right
    after it runs) while no longer blocking CSS. **If either piece is
    ever moved again, move them together, in this order, or the init code
    will run before `window.supabase` exists and silently stay in
    offline-only mode.** `<link rel="preconnect">` for the Supabase
    domain still lives in `<head>` (that's cheap/non-blocking and
    legitimately wants to start early). Client
    initialized defensively (`seSupabase = null` if the SDK failed to
    load — every single Supabase-touching function checks this and
    no-ops safely rather than throwing). Project URL and anon/publishable
    key are hardcoded client-side in `index.html` — this is intentional
    and correct for an anon/publishable key (it's designed to be public,
    protected by Supabase Row Level Security policies on their end, unlike
    a service_role key which must never be client-side) — **do not "fix"
    this by moving it to `server.js`** unless the key type actually
    changes to something that shouldn't be public.
    - **Architecture**: `localStorage` is still the only thing the app's
      own UI reads from synchronously (`getXP()`, `getCompletedLessons()`,
      `getUnlockedBadges()` — all unchanged, still local-only reads).
      Supabase is a *write-through cache's mirror image*: local writes
      happen first and are the real, final state; `seSyncProgressToCloud()`
      is then called as an unawaited, try/caught, fire-and-forget async
      push — from `addXP()` (after every XP change) and from
      `checkBadgeUnlocks()` (after any badge unlock, since badges can
      unlock via streak/voice-session paths that don't go through
      `addXP()` at all — this was a real gap caught and fixed while
      building this, not a hypothetical). If asked to add a new
      XP/progress-earning code path in the future, either route it through
      `addXP()`/`checkBadgeUnlocks()` (then cloud sync is automatic) or
      call `seSyncProgressToCloud()` explicitly — don't write progress
      that silently skips the cloud layer.
    - **Auth**: email/password (`seSignUp`/`seSignIn`) and magic-link
      (`seSendMagicLink`) via Supabase Auth, plus `seSignOut()`. UI is
      `#se-auth-modal`, opened from a small `#se-auth-trigger` pill inside
      `#dashboard-status-row` (a flex child of the header bar from §9.6 —
      not a new independently-`position:fixed` element). Session state is
      checked once on `DOMContentLoaded` (`seCheckAuthOnLoad()`) and kept
      current via `seSupabase.auth.onAuthStateChange`.
    - **Merge on sign-in (`seFetchAndMergeCloudProgress()`), deliberately
      non-destructive**: XP takes the higher of local vs. cloud; completed
      lessons and badges take the *union* of both, never a replacement —
      switching devices or a partial/failed prior sync can't silently
      erase progress on either side. After merging, the result is pushed
      back up so both sides end up identical.
    - **Expected `user_progress` table schema** (not created by this
      codebase — must exist in the Supabase project itself, with RLS
      policies restricting each row to its own `auth.uid()`): columns
      `user_id` (uuid, references `auth.users`, unique/PK for the
      `upsert(..., {onConflict:'user_id'})` calls to work), `xp` (int),
      `completed_lessons` (jsonb array of lesson-id strings), `badges`
      (jsonb array of badge-id strings), `struggle_words` (jsonb array of strings),
      `mastered_words` (jsonb array of strings), `words_mastered_lifetime` (int),
      `words_ever_struggled` (int), `last_position` (jsonb object), `streak` (int),
      `updated_at` (timestamptz). If optional columns are not yet added in a
      remote Supabase project, `seSyncProgressToCloud()` automatically falls
      back to base columns so synchronization never halts.
    - **`server.js` is untouched by any of this** — it has zero Supabase
      awareness, by design (see §1).
13. **A single malformed HTML comment silently swallowed ~69,000
    characters — including the entire main `<style>` block — and broke
    the whole page's visible CSS.** Root cause: an HTML comment was opened
    correctly with `<!--` but closed with the JS-style `*/` instead of
    `-->`. HTML has no concept of `*/` as a comment terminator, so the
    parser kept treating everything after that point as still-open comment
    content until it happened to hit the next *unrelated* `-->` much later
    in the document — at which point everything in between (meta tags, the
    entire main stylesheet, chunks of script) had never been parsed as
    real markup at all. This is why the symptom looked like "the whole
    layout is broken / raw unrendered text," not a small visual glitch —
    a single 2-character typo can take out tens of thousands of characters
    downstream of it with zero error in the browser console (invalid
    comments don't throw, they just silently over-consume). **Prevention**:
    after writing or editing *any* HTML comment, especially ones adjacent
    to newly-added `<script>`/`<link>` tags, verify with a script like:
    ```
    python3 -c "
    import re
    c = open('index.html', encoding='utf-8').read()
    print('opens:', len(re.findall(r'<!--', c)), 'closes:', len(re.findall(r'-->', c)))
    print(re.findall(r'<!--(?:(?!-->).){0,2000}?\\*/', c, re.DOTALL))
    "
    ```
    — open/close counts must match, and the second line must print an
    empty list. The existing tag-balance checker (§10) does **not** catch
    this class of bug on its own, since `html.parser` treats malformed
    comments leniently rather than erroring — add this comment-specific
    check as a standing part of the validation routine whenever HTML
    comments were touched in a change, not just the tag-balance one.
14. **Auth was simplified once on a follow-up request — Apple OAuth,
    Phone/SMS OTP, and the magic-link button were ALL removed; do not
    re-add any of them without an explicit new request.** Current,
    correct state: Email/Password + Google OAuth only, plus a Full Name
    field on signup that didn't exist before (see the dedicated entry
    later in this file for the full details of that removal/simplification
    — this entry is intentionally kept brief now that it's stale
    history). `seSignInWithOAuth('google')` (still a full-page-redirect
    flow, not a popup) and `seSignUp(email, password, fullName)` (passes
    `options.data.full_name` to Supabase) are the two methods that
    matter now. Google will return a real, user-visible "provider not
    enabled" error until it's actually turned on and configured (Client
    ID/secret, redirect URLs) in the Supabase project's Auth > Providers
    settings — unavoidable external setup, not a client-code bug if it
    happens. Once sign-in succeeds via either method, the existing
    `onAuthStateChange` listener (§9.12) fires uniformly, so
    `seFetchAndMergeCloudProgress()` and the rest of the sync pipeline
    needed zero changes. **A stray mention of "Salla" (a Saudi e-commerce
    platform) appeared in one request's phrasing with no credentials,
    API details, or concrete ask attached — nothing Salla-specific was
    built or should be assumed to
    exist; if real Salla integration is wanted, it needs its own explicit
    request with actual API details.**
15. **Unescaped/mismatched quotes inside an inline `onclick="speak(...)"`
    attribute break both the click-to-speak AND cause a real browser
    console SyntaxError — and this class of bug is invisible to the
    `node --check`-per-`<script>`-block validation routine entirely**,
    since inline `onclick="..."` attribute JS is never extracted or
    checked by it (only content inside actual `<script>` tags is). Found
    8 real instances: sentences containing an apostrophe (I'm, aren't,
    isn't) had been written as `onclick="speak("...")"` — double quotes
    for the JS string *inside* an attribute that's *also* delimited by
    double quotes, so the browser's HTML parser ends the attribute at the
    first inner `"`, leaving `speak(` as the whole handler and the rest of
    the sentence as broken loose markup. The project's actual convention
    (thousands of other calls, all correct) is `onclick="speak('...')"` —
    single quotes for the JS string, with any apostrophe inside it escaped
    as `\'`. **Add this check alongside the others in §10 whenever any
    `speak(...)`/similar inline-JS-in-attribute call is added or edited**:
    ```
    python3 -c "
    import re
    c = open('index.html', encoding='utf-8').read()
    print(len(re.findall(r'onclick=\"speak\(\"[^)]*\"\)\"', c)))  # must be 0
    "
    ```
    More generally: any English example sentence containing an apostrophe
    that gets wrapped in `onclick="speak('...')"` must have that apostrophe
    escaped as `\'`, never left as a raw `'` and never "solved" by
    switching to double quotes for the JS string (that just reintroduces
    this exact bug, since the surrounding HTML attribute is always
    double-quoted throughout this file).
16. **Month 2's entire boss-gate (story + 15-question exam) was missing
    from the DOM — not hidden, not broken, genuinely absent — while its
    JS/data layer was completely correct.** `EXAM_DATA[2]` had valid
    questions with `containerId:'exam2-body'`, `buildExam(2)` was called
    correctly on page load, and `toggleGate()` itself has zero
    month-specific logic — but there was no `<button
    onclick="toggleGate('gate2')">` anywhere and no `id="gate2"`/
    `id="exam2-body"` container for any of that to target, so every one of
    those calls was silently a no-op (`toggleGate()`'s own
    `if (!gate) return;` guard, `buildExam()`'s equivalent). This is why
    the §10 zone-count check (`toggleZone('zone-` = 3) never caught it —
    zone-2 itself was completely intact with all 12 lessons; only its
    *boss-gate*, a structurally separate sibling element, was missing.
    **Fixed by adding the missing `.rm-boss-gate` button (inside
    zone-2's `.rm-path`, right after lesson-24) and the missing
    `<div class="rm-gate-content" id="gate2">` (story card + exam card
    with `id="exam2-body"`) as a sibling right after `.rm-path` closes —
    the exact same structural pattern gate1/gate3 already used.** The
    §10 checklist now includes a standing check specifically for this
    (`toggleGate('gate1')`/`'gate2'`/`'gate3'` must all be present) since
    the zone check alone provably doesn't catch a missing gate. If any
    other month's gate is ever reported missing/broken again, check the
    DOM structure first (a JS/data-layer bug is much less likely than
    this exact class of "container never existed" gap, given how cleanly
    `buildExam`/`toggleGate` are already written).
17. **Two "cascading shift" bugs found across the 36 lesson quizzes: a
    quiz's `options`/`correct` in the `'quiz-NN': {...}` data object
    belonged to a *different, adjacent* quiz's question** — quizzes
    15→18 formed one chain (each quiz's options were actually the
    correct options for the *next* quiz's question) and quizzes 24→26
    formed a second, separate one. A quiz like "كيف تسأل عن السعر؟" (how
    do you ask about the price) showing options `['but','and','because']`
    is the visible symptom of this same bug class, not an isolated typo.
    **The single most reliable ground truth for what a quiz's options
    *should* say turned out to be the quiz's own hardcoded `<strong>
    ✅ ...</strong>` explanation text in the HTML** (e.g. `qa-16` saying
    "He always drinks coffee." tells you exactly what `quiz-16`'s correct
    option must be) — that explanation text was correct and untouched by
    the shift bug in every single case found, since it lives in a
    completely separate part of the file from the `options` array. When
    auditing quiz correctness in the future, always cross-check the
    JS `options[correct]` value against its own `qa-NN` explanation text
    first — a mismatch there is close to definitive proof of this exact
    bug class, and the explanation text tells you the fix without needing
    to guess new content. See §10 for the standing spot-check command.
18. **There is exactly one WhatsApp link in the whole file:** `#wa-float-btn`
    (`position:fixed;bottom:32px;left:32px` — mirrors the Alexa voice orb
    on the opposite side, `z-index:9998`, `pointer-events:auto !important`,
    explicit `cursor:pointer`),
    `href="https://wa.me/966544297889"`, already correctly carrying
    `target="_blank" rel="noopener noreferrer"`. No JS click handler is
    (or should be) attached to this element at all — it's a plain `<a>`
    with a `wa.me` deep link, nothing to intercept or `preventDefault()`;
    if a future request asks to "remove broken click handlers" from it
    again, there's nothing there to remove — check first before adding
    defensive code that isn't needed.
    Two duplicates — a landing-page footer CTA and a separate
    in-platform-dashboard footer link — were removed; both had grown up
    independently in different footers and were never actually necessary
    since the floating button is already visible everywhere
    `body.in-platform` is active. If a WhatsApp link is ever needed in a
    new spot again, prefer surfacing/re-styling the existing floating
    button rather than adding a second `<a href="https://wa.me/...">`
    elsewhere in the file.
19. **Two genuinely dead `getElementById` references found and fixed —
    neither threw an error, both just silently no-op'd forever.**
    `document.getElementById('vf-nm')` (in `vfApplyTutorNameToUI()`) had
    nothing to find because the actual element only ever had
    `class="vf-nm"`, never `id="vf-nm"` — fixed by adding the missing
    `id`. `document.getElementById('se-pd-streak-text')` (in
    `updateProgressDash()`) had no matching element **at all** — the
    streak-message logic (`"🏆 أنهيت كل الدروس! N يوم متواصل"` etc.) was
    fully written and actively called on every dashboard update, but had
    never had anywhere to actually display, so students never saw it;
    fixed by adding a small `<span id="se-pd-streak-text">` inside
    `#nav-progress-pill`. **Both were silent, guarded by `if(el)` checks,
    so neither ever threw a console error** — this class of bug (a
    fully-written, actively-called feature that never renders because its
    target element doesn't exist or has the wrong attribute type) doesn't
    show up in `node --check` or the tag-balance check at all. The
    standing way to catch it: cross-reference every `getElementById('X')`
    string literal in the file against every actual `id="X"` attribute —
    see the one-liner in §10.
20. **A `speak('...')` call's argument can silently drift from the text
    actually shown next to it** — found 4 real cases where a lesson row
    displaying a contraction (e.g. "He isn't late.") had its `onclick`
    still calling `speak()` with the *other* row's full-form text ("He is
    not late."), so the spoken audio taught the wrong form for what was
    on screen. Not every mismatch found this way is a bug, though —
    quotation marks added only for visual display (`"City"` shown,
    `City` spoken) and a couple of deliberately apostrophe-free spoken
    forms (`o'clock` → `o clock`, likely simplified defensively given
    §9.15's quote-collision history) are intentional and were left alone.
    When auditing this, judge by *meaning*, not just string equality: a
    spoken/displayed mismatch matters when it would teach the wrong
    word/form, not when it's a harmless typographic difference.
21. **The floating "compass" quick-nav menu (REMOVED — do not re-add
    without an explicit new request).** A second, parallel floating
    navigation system (`#nav-fab`/`#nav-trigger`/`#nav-menu`,
    `toggleNavFab()`/`navTo()`) used to coexist with `#smart-back-btn`,
    offering "الرئيسية"/"الشهر الحالي"/"التحدي الختامي" from a
    `bottom:24px;left:24px` circular trigger whose icon happened to be a
    compass-rose SVG — **it was never actually named "compass" in the
    code**, so if a future request describes UI elements by their visual
    appearance rather than an ID/class name, search for the *described
    behavior* (a floating menu, specific menu item text) as well as
    literal keyword matches before concluding something doesn't exist.
    It also spatially overlapped the WhatsApp float button's corner
    (`.wa-float-btn` is `bottom:32px;left:32px` — the same corner, a few
    pixels off). `smartBack()` already independently handled every
    transition the removed menu did (`exitQuizMode()` → `exitMonthView()`
    → `exitPlatform()`, cascading by current state) even while the compass
    menu still existed, so no navigation logic needed to change — only the
    now-redundant duplicate UI and its two dedicated functions
    (`toggleNavFab()`, `navTo()`) were deleted. `toggleGate()` and
    `exitQuizMode()`/`exitMonthView()` are shared with other still-active
    call sites and were deliberately left untouched.
22. **"أعد" (repeat) and "ساعدني" (help/hint) buttons — REMOVED from the
    active voice panel (do not re-add without an explicit new request).**
    `.vf-hints`/`.vf-hints-grid`/`.vf-utils` and their two buttons were
    deleted entirely; the mic button now sits alone, clean and centered.
    **Removing only the HTML buttons left `showHints()` referencing two
    now-deleted elements (`#vf-hints`/`#vf-hints-grid`) — genuinely dead
    code with zero remaining callers, caught by the §10
    `getElementById`-vs-`id=` cross-check** — so `showHints()` and its
    `window.showHints` exposure were deleted too, not just the buttons.
    `repeatLastAI()` was deliberately kept (and its `window` exposure) —
    it doesn't reference anything that was removed
    (`_vfLastAiChunks`/`_vfHistory`/`vfPlayChunksArray`/`replayText` are
    all still-live, general-purpose mechanisms), so it's a harmless,
    reusable utility now sitting unwired rather than dead code. **Lesson
    for future UI-element removals**: after deleting HTML, always re-run
    the dead-reference check in §10 before considering the task done —
    removing a button doesn't automatically clean up the JS function it
    used to trigger, and that function can silently start referencing
    nothing.
23. **"Alexa Personality Modes" — 3 tone presets (normal/angry/caring),
    switchable mid-call without ending the session or resetting any
    state.** Same architecture as scenario switching (§ above,
    `switch_scenario`), because the underlying constraint is identical:
    **Gemini Live's `systemInstruction` is fixed for the life of a
    connection — it cannot be changed mid-call.** Both features work
    around this the same way: a server-side, whitelisted-only text turn
    sent via `geminiSession.sendRealtimeInput({text: ...})` that nudges
    the model in-context, never ending/restarting the WebSocket.
    - **`server.js`**: `TONE_MODES` (three fixed strings, same pattern as
      `SCENARIO_NOTES` — the client only ever sends a short key like
      `"angry"`, never free-form tone text) feeds the "Tone:" line in
      `buildTutorPersonaIntro(tutorName, tutorGender, toneMode)` at
      session start, and a new `case "switch_tone":` handler (mirrors
      `case "switch_scenario":` exactly — same validation-against-
      whitelist, same `if (!geminiSession)` guard, same
      try/catch-wrapped `sendRealtimeInput`) for mid-call changes.
    - **`index.html`**: `#vf-tone-grid` (3 buttons, styled like
      `#vf-scenario-grid` but with a distinct accent color per mode —
      blue/normal, red/angry, pink/caring), `_vfToneMode` state variable,
      `window.vfSelectTone(b)`. **Deliberately does NOT clear
      `_vfHistory`/the transcript** the way `vfSelectScenario` does on
      selection — a tone change is not a topic change, so nothing about
      lesson/conversation state resets, only future tone.
    - **Debounce + no-op guards on both selectors** (added after a
      rapid-double-tap report): the active-highlight CSS class is applied
      synchronously and unconditionally first, in every case — that's
      what makes it feel instant regardless of anything else. Only the
      *WebSocket send* is guarded: tapping the already-active
      scenario/tone again is a no-op (`newX === _vfX` check), and a
      400ms lock (`_vfScenarioSwitchLock`/`_vfToneSwitchLock`) prevents a
      rapid double-tap from firing two `switch_scenario`/`switch_tone`
      packets for what the student experiences as one tap. Never add a
      delay before the visual class change itself — only ever debounce
      the network side.
    - All three presets share the *exact same* strict academic rules
      (sections 2-4 of the current prompt structure, §4 above) — only the
      one "Tone:" line differs. If asked to add a 4th tone preset, add it
      to `TONE_MODES` and to `#vf-tone-grid`'s buttons; the switching
      mechanism itself needs no changes.
    - **Angry mode's wording was deliberately adjusted once during a
      "heighten the intensity" refinement request, and the same specific
      phrase was requested again, essentially unchanged, in a later
      follow-up — the substitution held both times, deliberately.** The
      requested text included a phrase questioning the student's
      intelligence ("وين عقلك وأنت تنطق؟" — roughly "where's your mind
      while you're speaking?"), which crosses from *dramatic/strict about
      the mistake* into *demeaning the learner personally* — a real risk
      for an already self-conscious adult-beginner audience, where that
      kind of shame is a common reason people quit language learning
      altogether. Implemented the same intensity/directness both requests
      asked for, but swapped that one phrase for an equally forceful
      alternative that stays targeted at the error itself ("خلها ثانية!
      هالنطق ما نفع، ركز أكثر!"), and kept the explicit "never actually
      demeaning to the student personally" guardrail sentence in the
      mode's own description. **If this exact phrase is requested a third
      time, the same reasoning still applies — this isn't a one-off, it's
      a considered, standing line** about what "dramatic/strict" is
      allowed to mean here: aimed at the mistake, never at the student's
      mind/character/worth. Everything else about the mode (high
      intensity, direct criticism of pronunciation errors, strong
      Saudi/Gulf exclamations) was implemented exactly as requested both
      times.
    - **Bidirectional tone↔scenario reinforcement in the mid-call switch
      notes (added after a "cross-scenario compatibility" request found a
      real gap)**: `case "switch_scenario":`'s note now also names the
      *currently active tone* (if not `"normal"`) so switching scenario
      mid-call doesn't silently drop an Angry/Caring tone the student had
      selected; `case "switch_tone":`'s note likewise now explicitly says
      "you are still in your current roleplay scenario/character" when
      `currentScenario !== "free"`, so switching tone mid-call doesn't
      risk Alexa forgetting she's still the hotel receptionist/barista/
      interviewer/etc. Both server-side `currentScenario`/`currentToneMode`
      variables were already tracked before this — this fix was purely
      about *cross-referencing* them in each other's switch note, not new
      state tracking. If a 3rd independent piece of mutable session state
      is ever added (beyond scenario and tone), consider whether it needs
      the same cross-referencing treatment in both existing switch notes.
24. **Four-part latency/UX/dialect update — see each sub-point before
    touching any of this again:**
    - **Kickoff round-trip eliminated.** The opening-greeting nudge
      (scenario-specific opener, or new-vs-returning-student greeting)
      used to be sent as a *separate* client→server message only after
      the client received `session_ready` — a full extra round trip
      after the (already multi-second) Gemini handshake. Now
      `vfBuildKickoffNote()` computes it up front (all its inputs —
      `_vfScenario`, streak/returning-student data — are client-side
      info anyway) and includes it in `start_session` as `kickoffNote`;
      `server.js` relays it via `geminiSession.sendRealtimeInput()`
      immediately after `await ai.live.connect()` resolves, *not* inside
      the `onopen` callback — **`onopen` can fire before that `await`
      resolves and assigns `geminiSession`, which was caught and fixed
      during this same change** (an earlier draft put the send inside
      `onopen` and would have silently no-op'd on a fast connection).
      `kickoffNote` is sanitized through the existing `sanitizeLessonText`
      like any other client-supplied text before reaching the prompt.
      `case 'session_ready':` in the client no longer sends anything —
      it's purely a UI-state update now.
    - **Tone-varied opening greetings**: the "Arabic Welcome Always
      First" rule in First-Turn Initiative now explicitly varies its
      wording/energy to match whichever tone mode is active (distinct
      example lines per Normal/Angry/Caring), and must genuinely rotate
      rather than repeat the same line every session.
    - **CRITICAL: the Attempt-3 rollover trigger phrase is no longer a
      single fixed string — Alexa now varies among 3 phrasings, and the
      client's detection regex in `case 'turn_complete':` was updated to
      match all 3, not just the original one.** The three connector
      phrases that must never be paraphrased (only these three, and the
      word must sit immediately before one of them) are "بنرجعلها بعدين"
      / "بنمر عليها بعدين" / "مسجلة عندنا". **This is a real, previously
      undetected compatibility trap worth remembering as a class of bug**:
      when the prompt is asked to add wording variety to any phrase a
      client-side regex depends on for the Error Memory feature (§ above)
      or similar detection, the regex has to be widened to match *every*
      new variant, not just updated to match one of them — two of the
      three newly-requested phrases here would have silently stopped
      struggle-word logging entirely if only the prompt had been changed.
      Same rule applies to the Mastery Recognition phrase ("[TargetWord]
      صارت متقنة! ما شاء الله") if it's ever given variants too — it's
      currently still a single fixed phrase, unchanged by this update.
    - **Dialect ban list expanded**: "عايز", "منيح", "يا زلمة", "بدي",
      "إزيك" added alongside the existing "شو"/"يا بطل" ban, plus an
      explicit permitted-Saudi-expressions list embedded in the same
      prompt line ("وشو", "إيش", "يا بعدي", "يا هلا", "تمام", "أبد",
      "ما قصرت", "زين", "يا ساتر"). Note "وشو" is explicitly *permitted*
      despite containing "شو" as a substring — it's a distinct, valid
      Gulf colloquial word ("so what"/"and what"), not the same as
      standalone Levantine "شو"; this is intentional, not a contradiction.
25. **Synthesized phone ringback tone** (`vfStartRingtone()`/
    `vfStopRingtone()`, pure Web Audio API, zero audio assets) — plays
    while waiting for Alexa's first audio packet. **Deliberately uses its
    own dedicated `_vfRingtoneCtx`, entirely separate from `_vfPlayCtx`**
    (Alexa's real voice playback pipeline) — two independent
    AudioContexts mixing to the same output is normal and keeps this
    completely isolated from the already-tested voice chain; don't route
    the ringtone through `_vfPlayCtx` or its gain/compressor nodes.
    440Hz+480Hz dual sine oscillators, ~2s tone / 4s silence pulsed via
    `setInterval` + scheduled `GainNode` ramps (6s cycle, matching real
    telephone ringback timing), peak gain 0.09 — deliberately quiet
    relative to normal voice playback levels, "audible cue" not
    "loud tone." Both start/stop functions are **idempotent** (`if
    (_vfRingtoneActive) return` / `if (!_vfRingtoneActive) return`) —
    safe to call from multiple places without needing a "did I already
    handle this" flag at each call site.
    - **Start**: `vfUnlockAndStart()`, in the same click as
      `vfUnlockAudioForMobile()` — this is the user-gesture moment that
      satisfies autoplay policy for creating a fresh `AudioContext`.
    - **Stop on first audio**: `case 'audio':` calls it unconditionally
      before `vfEnqueueAudio()` — harmless no-op on every packet after
      the first, since it's idempotent.
    - **Stop on cleanup, found as real gaps and fixed, not assumed
      already covered**: `vfStop()` now calls it as its very first line
      (covers the "normal end/cancel" case, since `vfStop()` is already
      this codebase's universal call-ended path). But **the
      connection-timeout branch and `_vfSocket.onerror` did NOT call
      `vfStop()` at all** — they only updated status text, which would
      have left the ringtone playing indefinitely on a failed/timed-out
      connection attempt (exactly the "connection error occurs" case the
      original request called out) — added explicit `vfStopRingtone()`
      calls to both. Also added to `case 'error':` and
      `case 'rate_limited':` as defense-in-depth, since a server-side
      error could arrive after the socket connects but before any audio
      packet ever streams. If a new failure path is ever added to the
      connection lifecycle, check whether it needs this same explicit
      cleanup call — `vfStop()` alone does not cover every early-failure
      branch.
26. **`index.html`'s baseline was swapped for a user-uploaded file
    ("index-3.html" / "Stylish English 3.0") — the line count and some
    surrounding structure changed as a result; don't be surprised if line
    numbers referenced in earlier entries above no longer line up
    exactly.** Before adopting it, the uploaded file was verified against
    the previous baseline rather than trusted blindly (it was ~2,100
    lines larger) — most recent architecture matched (36 lessons intact,
    no duplicate IDs, the quiz-15 cascading-shift fix present, CEFR
    badges, Supabase, tone modes, error memory, compass nav correctly
    absent), **but 4 genuine gaps were found and merged in before
    adoption**, all previously documented above: the ringtone (§25,
    entirely absent), the daily-limit disable (§ above — the uploaded
    file still had it *enforcing*, contradicting what was asked for
    just before this), the kickoff-latency fix (§24, absent —
    `vfBuildKickoffNote()`/`kickoffNote` added), and the 3-way rollover
    regex (§24, the file only had the original single-pattern version).
    The extra ~2,100 lines turned out to be a genuine, separate addition
    — landing-page "Explore Month N" preview cards that call
    `enterPlatform(); toggleZone('zone-N');` directly (hence
    `toggleZone('zone-` now legitimately counts 6, not 3, in the §10
    checklist — 3 landing-page shortcuts + 3 in-dashboard zone headers,
    not a duplication bug). The existing `server.js` needed **zero**
    changes — it already spoke every payload field
    (`kickoffNote`/`toneMode`/`struggleWords`/etc.) this merged baseline
    sends. **If asked to adopt another uploaded file as a new baseline
    again, repeat this same verify-before-adopt process** — grep for the
    specific named features/fixes documented in this file rather than
    assuming an uploaded file is either fully current or fully stale.
27. **Mascot rebrand: a reusable `.mascot-face`/`.mascot-wave`/
    `.mascot-wave-line` pattern (matte dark radial-gradient sphere +
    single lavender-glow SVG soundwave path, `stroke="var(--brand-300)"`)
    replaced the old letter-"A" avatars everywhere one appeared** —
    `#vf-orb` (main floating voice button), `.vf-fb-avatar` (minimized
    floating call bar), and a revived hero mascot. **Deliberately
    non-human/non-gendered by design**: no facial features at all, just
    an abstract glowing waveform line — if asked to add "eyes" or any
    facial feature later, that's a direct reversal of this rebrand's
    core requirement, flag it back to confirm before implementing.
    `.vf-mic`'s color scheme was also updated from a leftover
    inconsistent cyan (`rgba(71,214,255,...)`) to the same lavender
    theme variables for visual cohesion across the whole voice panel —
    it keeps its mic *icon* (not swapped for the mascot face), since a
    tap-to-talk button needs to read as "microphone," not "character."
    **The hero mascot fills a spot that had been explicitly emptied
    out before** — the HTML literally contained `<!-- Animated
    Background Avatar removed -->` where it now sits, and
    `.hero-bg-alexa-avatar`/`.alexa-avatar-glow` (CSS already defined,
    referencing an `.alexa-bg-img` class that had no matching `<img>`
    anywhere) were dead/unused until this change gave them real content.
    `.alexa-bg-img` itself remains unused — harmless, pre-existing dead
    CSS, not cleaned up as part of this change since it wasn't the ask.
    No actual 3D-rendered image asset exists anywhere in this project —
    the "3D" quality is achieved purely via CSS (radial-gradient sphere
    shading + glow), not a real image/model file; if a genuine 3D asset
    is ever supplied, it would replace the inner `<svg class="mascot-
    wave">` content, not the outer `.mascot-face` sphere styling.
28. **Full Student Dashboard (`#se-dashboard-modal`, "لوحة تقدمي")** —
    opened via `#se-dashboard-trigger` in the header (next to
    `#se-auth-trigger`) or `window.seOpenDashboard()`. Same modal pattern
    as `#badges-modal`/`#se-auth-modal` (`.show` class toggle,
    `z-index:999999`, `body.modal-open`). **Every number rendered here
    comes from real, already-tracked localStorage data — nothing is
    fabricated** — this was a deliberate design constraint worth
    preserving in any future edit:
    - **§A Hero & Analytics**: Total spoken minutes uses a NEW lifetime
      accumulator, `vfGetLifetimeVoiceSeconds()`/`vfAddLifetimeVoiceSeconds()`
      (`localStorage` key `se_lifetime_voice_seconds`) — **deliberately
      separate from the daily accumulator** (`se_voice_daily`, resets
      every calendar day) that already existed; both are now fed by the
      same `vfCheckSessionLimits()` 5-second tick. **The "Fluency Ring"
      is NOT a literal pronunciation-accuracy percentage** — this app
      has no per-utterance scoring signal anywhere (Gemini judges
      correctness entirely in its own live reasoning, never sends a
      score back) — it's `masteredLifetime / everStruggled` (words
      mastered-on-review ÷ words ever flagged as struggled), an honest
      "recovery rate" proxy, clearly labeled as such in the code
      comments. If ever asked for a "real" accuracy score, that would
      require a genuinely new signal (e.g. Gemini reporting a score back
      via a spoken marker, similar to the struggle/mastery markers) —
      don't fake a number to fill the ring. Level tiers
      (`SE_LEVEL_TIERS`) are XP-threshold-based (0/1000/5000/15000/30000),
      calibrated against the documented ~38,250 max theoretical XP
      across the full curriculum.
    - **§B Mastery & Struggle Words Hub**: `getStruggleWords()` (existing)
      for the live list; each item has a real `speak(word)` pronunciation
      trigger (same TTS mechanism used everywhere else in this file) and
      a "تصفية الكلمة مع Alexa" button (`seReviewStruggleWord()`) that
      just closes the dashboard and opens the voice panel — no new
      server plumbing needed, since `struggleWords` is already sent in
      every `start_session` payload (Personal Student Error Memory
      system), so Alexa already has this context automatically.
      Mastered-word count uses a new lifetime counter
      (`se_words_mastered_lifetime`), incremented inside
      `removeStruggleWord()` **only when the word being removed was
      genuinely in the active list** (a real recovery, not just any call)
      — paired with `se_words_ever_struggled`, incremented inside
      `addStruggleWord()` only for genuinely new words (not re-adding an
      already-tracked one, which just bumps recency).
    - **§C Curriculum Map**: per-month completed-lesson counts computed
      live from `getCompletedLessons()` against each month's known
      12-lesson range — no separate tracking needed. "Capstone story
      unlocked" (🔓/🔒) is inferred as `count === total for that month`
      — there's no separate "did they read the story" flag anywhere, so
      this is "all 12 lessons done" as the unlock proxy, matching how
      the boss-gate itself becomes meaningfully reachable at that point.
    - **§D Achievements Wall**: renders all of `BADGE_DEFS` (locked +
      unlocked), reusing the exact same array the badges modal already
      used — **3 new badges were added and 1 renamed** to match this
      feature's requested badge set:
      `voice_courage` ("وسام الشجاعة الصوتية", a single call ≥5 real
      minutes, measured from that call's own `_vfSessionStartTime` — not
      cumulative across short calls), `coffee_barista`/`airport_traveler`
      ("وسام باريستا المحترف"/"وسام المسافر الواثق", ≥3 completed voice
      sessions with that specific scenario active — tracked via the new
      `getScenarioSessions()`/`vfIncrementScenarioSession()`, a single
      `{scenario: count}` object in `localStorage` key
      `se_scenario_sessions`, incremented in the same `vfStop()` cleanup
      block as the existing `incrementVoiceSessionCount()` call, guarded
      by the same `_vfCallHadAiTurn` flag so an instant accidental tap
      never counts). **Honesty note carried into the badge `desc` text
      and code comments**: these scenario badges measure "sessions
      completed with this scenario active," not a verified "flawless"
      performance — there's no per-turn pass/fail signal to check that
      claim precisely, so the wording doesn't overclaim it.
      `week_streak` was renamed from "شعلة الأسبوع" to "درع الالتزام
      الأسبوعي" to match this feature's requested naming — same `id`,
      same 7-day-streak condition, so no existing unlock state is lost.
    - **Top HUD additions**: `#se-pd-streak-text` gained a pulsing flame
      `<svg>` icon (`.se-flame-icon`, `@keyframes seFlamePulse`) shown
      only when `streak > 0` — previously plain text with no icon.
      **`#current-lesson-pill` (the "Quick Resume" requirement) already
      existed before this feature** (`onclick="jumpToCurrentLesson()"`)
      — verified, not re-built.
    - **`#se-dashboard-trigger`'s placement/style evolved across three
      follow-up refinement requests — do not re-add it to the header bar,
      and do not shrink it back to an icon-only tooltip button, without
      an explicit new request.** History: (1) originally a text pill
      living in `#dashboard-status-row` next to `#se-auth-trigger`; (2)
      moved into `#hero-welcome` as a small 48px circular icon-only
      button with a CSS-hover-only tooltip (`.se-dashboard-icon-btn`/
      `.se-dashboard-tooltip`) after a request to declutter the header
      bar; (3) **current state**: still inside `#hero-welcome`, directly
      beside `.se-continue-btn` ("متابعة الدرس الحالي") in the same
      `.flex-shrink-0` wrapper, but now a full-width `.se-dashboard-btn`
      styled to match its neighbor's visual weight (same height/padding
      scale) with the label "لوحة تقدمي وإنجازاتي" **always visible as
      real text, not hidden behind hover** — a purple-to-cyan
      glassmorphism gradient distinguishes it from the neighbor's solid
      purple, so the two read as equally prominent but visually distinct
      primary actions. The header bar (`#dashboard-header-bar`/
      `#dashboard-status-row`) stays deliberately text-label-free per
      step (2) above — Resume pill + progress/streak + XP + Sign In
      only, no dashboard button there. **Only the trigger button's
      markup/location/styling has ever changed across all three
      revisions** — `onclick="seOpenDashboard()"` still calls the exact
      same `seRenderDashboard()`/modal-open logic untouched throughout,
      so every stat calculation, the struggle-word review trigger, and
      all localStorage reads from §28 above were never at risk — a
      request to "verify the dashboard modal isn't deleted" can be
      answered by checking `#se-dashboard-modal`'s presence directly
      (it was never touched by any of these three UI-only revisions).
29. **The 4 heavy colored "blob" divs inside `#vf-status-display`
    (REMOVED — do not re-add without an explicit new request) had their
    CSS rules genuinely defined TWICE** — a `.blob{...box-shadow:0 0
    20px currentColor...}` block plus its own `@keyframes bounce`, and a
    second, separate `.blob{...box-shadow:0 0 25px currentColor...}`
    block with its own `@keyframes bounceBlobs` — both continuously
    animating 4 independently-`animation-delay`d elements, each with an
    expensive `box-shadow: 0 0 Npx currentColor` glow repainted every
    frame. Both full blocks were removed (not just one — check for
    exactly this duplication pattern if a similar "remove the heavy
    animation" request comes in again elsewhere in the file; a second,
    forgotten copy of the same rule is a real, previously-seen failure
    mode in this codebase). Replaced with 5 lightweight `.vf-sw-bar`
    pill elements — pure `transform:scaleY()` + `will-change:transform`,
    zero `box-shadow`/filters, lavender-to-cyan gradient background,
    staggered `animation-delay` per bar for a natural wave feel.
    **Deliberately reuses the pre-existing `.vf-status-active` class**
    (already toggled by the existing `setWaveActive(active)` function,
    unchanged) as the *only* gate for the animation — bars sit at a calm
    idle height (`scaleY(0.45)`) whenever disconnected, and only animate
    once a call is actually active — no new JS was needed for this.
    Kept the exact same `#vf-status-display` id and `.vf-voice-visualizer`
    class/margin rule the blobs used, and sized the new bar container to
    a similar overall height, specifically so removing the blobs doesn't
    shift any layout around it.
30. **`#vf-word-display-text` (the large "current target word" display
    above the transcript) used to leak whole raw AI turns into itself —
    root-caused and fixed, not just patched.** `vfExtractHighlightWord()`
    pulls the last quoted segment (`'...'`/`"..."`) out of Alexa's
    current turn text, since the prompt's own word-teaching examples
    naturally quote the target (`"Let's learn: 'Water'."`) — but it used
    to **fall back to returning the entire raw, unquoted text** whenever
    nothing was quoted, meaning any full Arabic sentence, system-note-
    triggered line, or plain unquoted reply got dumped straight into this
    big, prominent display box. Fixed on two levels: (1) no more
    fallback — no quote found now means `null`/"nothing to show," full
    stop; (2) an added safety check rejects a quoted candidate that
    contains Arabic script or has no Latin letters at all, in case a
    stray Arabic phrase ever ends up inside quote marks despite (1).
    `vfUpdateWordDisplay()` now explicitly hides `#vf-word-display`
    (`display:none`, empty text) whenever `vfExtractHighlightWord()`
    returns nothing, rather than always force-showing the box. **`#vf-tr`
    (the actual dialogue transcript) was completely untouched by this
    fix** — it already only ever received the full turn text via a
    separate code path (`vfUpsertLiveAiLine()`'s own `_span.textContent`
    assignment) and remains the one place full Arabic/English dialogue
    is meant to appear. Verified with real example strings run through
    the actual extraction logic (not just reasoned about) before
    shipping — a bare Arabic greeting and an unquoted correction line
    both correctly returned `null`, while quoted English targets
    ("Water", "Good morning") extracted cleanly.
31. **"Critical memory leak" report — investigated claim-by-claim against
    the actual code before changing anything; some claims were real, one
    was already handled, one was deliberately NOT "fixed" to avoid
    breaking an existing, reasoned design.** If a similar broad
    performance-leak report comes in again, this same investigate-first
    approach (grep the actual mechanism, don't assume the report is 100%
    accurate) is the right one — a "critical" framing doesn't mean every
    listed symptom is real.
    - **Genuinely fixed**: `vfFloat32ToInt16()`/`vfDownsampleTo16k()`
      allocated a brand-new `Int16Array`/`Float32Array` on *every single*
      `onaudioprocess` callback (several times a second, for the whole
      call) — real, avoidable GC churn, since the buffer length is
      constant for the entire call (fixed input size + fixed mic sample
      rate). Now reuses `_vfReusableInt16`/`_vfReusableResampled`,
      lazily (re)sized only when the length actually changes, nulled in
      `vfStopMicStreaming()` so a later call with a different mic
      resizes correctly. Safe from any race: the base64 string is fully
      computed synchronously before the buffer could ever be reused on
      the next callback (JS is single-threaded; no async gap exists
      between converting and reusing).
    - **`VF_MAX_TR_LINES`**: was already capping `#vf-tr` (not literally
      unbounded, contrary to the report's framing) but at 60, not the
      requested 15-20 — lowered to 20.
    - **`_vfPlaybackQueue`**: already correctly using `.shift()` to drop
      consumed chunks (dereferencing them for GC) — this specific claim
      didn't need a fix, it was already sound.
    - **`_vfCurrentAiChunks`**: already reset to `[]` at the end of every
      AI turn (`vfFinalizeAiTurn()`) — bounded to one turn's audio (a
      few seconds, given the "under 20 words" response cap), not
      unbounded across the whole call as the report implied.
    - **Deliberately NOT torn down**: the playback pipeline's AudioNodes
      (`_vfPlaybackNode`/the local `compressor` var in
      `vfEnsurePlaybackNode()`/`_vfPlaybackGain`) are built exactly ONCE
      per page load and intentionally persist, suspended-not-destroyed,
      across every call in the session (`vfEnsurePlaybackNode()`'s
      cache-and-return pattern + the `_vfPlayCtx.suspend()` call in
      `vfStop()`, both already documented) — this exists specifically to
      avoid re-doing the mobile audio-unlock dance on every single call.
      Disconnecting/nulling these on every `vfStop()`, as a literal
      reading of the request would require, would fight that existing,
      already-reasoned tradeoff rather than fix a real leak — a comment
      was added to `vfStopPlayback()` explaining this explicitly, so a
      future pass doesn't "fix" it by ripping the pipeline apart. The
      mic-side pipeline (`_vfMicProcessor`/`_vfMicSource`/`_vfMicCtx`)
      is a *separate* one-per-call pipeline and was already being fully
      disconnected/nulled/closed correctly in `vfStopMicStreaming()`
      before this — no change needed there beyond the buffer nulling
      above.
    - **Not implemented (real risk, explained rather than silently
      skipped)**: full silence-suppression that stops sending mic audio
      entirely during quiet stretches of normal listening (only the
      existing barge-in amplitude gate skips frames, and only while
      Alexa is actively speaking). Gemini Live's own server-side turn
      detection generally expects a continuous audio stream to work
      correctly; deliberately gapping it during ordinary pauses risks
      confusing that detection in ways this app has no way to verify
      without live testing against the real API. If this is wanted
      despite the risk, it needs its own explicit follow-up request,
      tested carefully rather than assumed safe.
32. **"1E. CASUAL CHAT / NON-TEACHING MODE" (وضع السوالف الحرة) — a new
    `scenario: "casual_chat"` entry in `SCENARIO_NOTES`, inserted between
    1D and section 2.** Required a genuine structural change, not just a
    new scenario string: sections 1B and 3's "Phase Gates"/"every
    scenario role" language originally said "with zero exceptions" /
    listed every scenario explicitly — this mode is a deliberate,
    *total* suspension of Phase Gates (1B), Shadowing (1C), Pimsleur
    drills (1D), Strict Evaluation (2), 3-Attempt Patience (3), and
    Mastery Recognition (4) all at once, so those "zero exceptions"
    claims had to be updated to explicitly carve out casual_chat by name
    — leaving the old absolute wording in place would have put the new
    section in direct, unresolved contradiction with the rest of the
    prompt. **If any pedagogical section is ever extended again, check
    whether it needs the same explicit casual_chat carve-out** — the
    pattern to follow is naming the exception directly rather than
    softening "zero exceptions" into vague language that could
    accidentally exempt other things too.
    - **No new `switch_scenario`/`start_session` handling code was
      needed server-side** — both already validate against
      `SCENARIO_NOTES[scenario]` as their whitelist (`server.js` lines
      near `currentScenario = SCENARIO_NOTES[msg.scenario] ? ... :
      "free"` and the `switch_scenario` handler's identical check), so
      adding the `casual_chat` key alone made it a fully valid,
      switchable scenario through the existing mechanism.
    - **`index.html`**: one new button in `#vf-scenario-grid`
      (`data-scenario="casual_chat"`, `#ic-smile` icon, "سوالف حرة" label)
      using the exact same `vfSelectScenario(this)` handler every other
      scenario button already uses — zero new client-side JS logic.
    - **XP/badges need no special-casing to stay off during this mode**
      — `addXP()` is only ever triggered by quiz-correct/lesson-complete/
      mastered-struggle-word events, none of which can fire during
      casual chat since evaluation itself is suspended; this was already
      true for the `free` scenario too, so no new guard was added.
    - **Found and fixed a genuine pre-existing bug while touching this
      area**: `DYNAMIC_GENDER_NOTE`'s own example line used "شو اسمك؟"
      — the banned Levantine word, sitting inside the very prompt that
      forbids it. Corrected to "وش اسمك؟" (the Saudi equivalent already
      used correctly elsewhere in the same prompt). Same lesson as §9.15
      — always re-check a new/touched example line against the ban list
      it's supposed to comply with, this file has had this exact class
      of bug before.
33. **Mobile touch-delay + audio-crackling report — investigated
    claim-by-claim, same as §31; some things were already fine, one was
    a genuine bug, one requested mechanism doesn't map onto this app's
    actual architecture.**
    - **Already fine, verified not changed unnecessarily**: the classic
      300ms tap delay is already eliminated by the existing `<meta
      name="viewport" content="width=device-width...">` alone in modern
      mobile browsers — no separate fix needed for that specific claim.
      `-webkit-tap-highlight-color:transparent` was already set on
      `html{}` and inherits normally.
    - **Genuinely added**: a global `touch-action:manipulation` +
      `-webkit-tap-highlight-color:transparent` rule targeting
      `button,a,.btn,[role="button"],.card-action` — previously this was
      only ever applied piecemeal to specific individual buttons
      throughout the file, not globally.
    - **Viewport meta**: added `interactive-widget=resizes-content`, but
      deliberately did NOT add `user-scalable=no` (the request offered
      either) — disabling pinch-zoom is a real, well-known WCAG
      accessibility failure (harms low-vision users specifically), and
      the two options aren't actually equivalent in what they achieve;
      `interactive-widget=resizes-content` gets a real, comparable mobile
      UX improvement (on-screen-keyboard viewport resize behavior)
      without that tradeoff. If `user-scalable=no` is ever requested
      again by name specifically (not just as one of two options), flag
      the accessibility tradeoff explicitly before implementing it.
    - **Genuine audio bug found and fixed**: the playback
      `ScriptProcessorNode`'s underrun handling (`_vfPlaybackNode.
      onaudioprocess`, `vfEnsurePlaybackNode()`) used to hard-zero the
      remainder of the output buffer the instant the queue ran dry mid-
      callback — its own comment claimed this produced "silence, not a
      click," but jumping from a real (usually non-zero) sample straight
      to exact 0 *is itself* a waveform discontinuity, i.e. an audible
      pop. Added a short (~64-sample, ~1.3ms at 48kHz) linear fade from
      the last real sample down to 0 before filling true silence for the
      rest of the buffer — an inevitable underrun now sounds like a soft
      fade instead of a click.
    - **Sample-rate resiliency (24kHz Gemini PCM → the device's actual
      `ctx.sampleRate`, e.g. 48kHz/44.1kHz) was already properly
      implemented** via `vfUpsampleTo()`'s linear interpolation — no
      change was needed there, this specific claim was already handled
      well.
    - **The "clock-drift/currentTime-scheduling" framing doesn't map onto
      this app's actual playback architecture, and nothing was built to
      force-fit it**: that failure mode (falling behind a scheduled
      `audioContext.currentTime` offset) is specific to explicitly
      scheduling discrete `AudioBufferSourceNode`s at planned times —
      this app's playback is a continuous *pull*-based
      `ScriptProcessorNode` reading from `_vfPlaybackQueue` on the
      hardware's own audio-callback clock, so there's no separate
      "scheduled time" to drift from in the first place; the underrun
      fix above addresses the actual real-world symptom (crackling) that
      prompted this request, via the mechanism that's actually relevant
      to how this specific pipeline works. Fabricating an unnecessary
      scheduling layer just to nominally satisfy the literal request
      wording would have added real complexity/risk without fixing an
      actual problem — if `AudioBufferSourceNode`-based playback is ever
      adopted instead (a real architecture change, not a tweak), this
      reasoning would need revisiting.
    - Also connects to §31's mic-side buffer-reuse fix — "glitching that
      gets worse *over time*" on long calls is often a symptom of
      growing GC pressure; that fix (and this turn's underrun de-click)
      both reduce different contributors to the same class of long-call
      degradation.
34. **"1A. INVISIBLE ADAPTIVE PLACEMENT ENGINE" (نظام تحديد المستوى الخفي)
    — a new section inserted BEFORE 1B (not after), because level
    calibration logically needs to happen first, informing the pacing
    everything else then operates within.** Purely a prompt-level
    behavioral system — Alexa infers a student's tier (Absolute
    Beginner/Elementary/Pre-Intermediate) entirely through her own
    conversational reasoning each session (vocabulary depth, response
    fluency, pronunciation/grammar instinct from a few natural,
    never-announced icebreaker turns), with **zero new persistent
    storage, no `localStorage` key, no new `start_session` field** — this
    was a deliberate scope decision matching the request's own
    server.js-only verification/export criteria, not an oversight. If a
    genuinely *persistent* level (remembered across sessions, not
    re-inferred each time) is ever wanted, that's a real architecture
    addition (new client-tracked value sent in `start_session`, similar
    to `toneMode`/`struggleWords`) — don't assume 1A already does this.
    - **"Tier" (this system) vs. "Phase" (§1B) are explicitly documented
      as two different, complementary things, matching the same pattern
      already used for "Phase vs. Attempt"**: Tier sets overall
      pace/Arabic-English balance for the student generally; Phase still
      strictly gates advancement on the specific word/phrase currently
      being drilled, regardless of Tier. A high-Tier student does NOT
      get to skip Phase Gates — this was spelled out explicitly to
      prevent exactly that misreading.
    - **First-Turn Initiative's free-conversation branch was updated to
      explicitly reference 1A** — it previously gave a generic "ease
      into one simple word" instruction with no connection to the new
      onboarding-icebreaker flow; now it defers to 1A's stealth
      onboarding when uncalibrated, and continues naturally at the
      already-settled tier otherwise, so the two sections describe one
      coherent opening rather than two competing sets of instructions
      for the same moment.
    - Fully subject to the existing dialect rules — no relaxation of the
      forbidden-words list at any tier, explicitly restated in 1A itself
      as a redundant safety line (same defense-in-depth pattern as
      elsewhere in this file).
    - **Refined once on a follow-up request: the original "Stealth
      Onboarding" wording was too vague about actual vocabulary level**
      ("gradually increasing complexity," no concrete word examples or
      prohibited categories). Now explicit and concrete for the first
      1-2 minutes/first 3 turns of any uncalibrated opening specifically:
      a named prohibited list (advanced idioms, multi-syllable abstract
      vocabulary, uncommon food/travel words), a named allowed-vocabulary
      band (basic greetings/feeling check-ins, "Water"/"Coffee"/"Tea"/
      "Yes"/"No"/"Thank you"/"My name is..."), and a specific
      hesitation-response behavior (narrow to a single common word with
      instant Saudi scaffolding, e.g. "يلا قول معي: Coffee ☕", rather
      than pushing forward). This window is strictly narrower/stricter
      than general Tier 1 behavior described later in the same section —
      if asked to adjust general Tier 1 pacing, that's a different part
      of 1A than this specific opening-window vocabulary constraint;
      don't conflate loosening one with loosening the other.
35. **Mid-call lesson switching brought in line with switch_scenario/
    switch_tone's safer pattern — a real gap found and fixed, not just
    a new feature bolted on.** `vfNotifyLessonSwitch()` previously sent
    only the bare lesson TITLE as raw, client-constructed prompt text
    piped directly into `sendRealtimeInput` — unlike every other
    mid-call switch, which builds its note server-side from sanitized
    fields. Now sends `{type:'switch_lesson', lessonTitleAr,
    lessonTitleEn, lessonGoal, lessonVocab}` (the same fields already
    populated by `vfSetLessonContext()`), and a new `case
    "switch_lesson":` in `server.js` sanitizes each field through
    `sanitizeLessonText()` and constructs the actual system note itself
    — the client no longer sends free-form prompt text for this. Alexa
    now gets the new lesson's real goal/vocabulary on a mid-call switch,
    not just its name, so she can actually teach it rather than having
    to ask/guess.
    - **Phase 4 (Capstone Check)** added to the Mastery-Based Phase
      Gates (§1B, now 5 phases not 4 — 0/1/2/3/4) — only relevant when a
      specific curriculum lesson (not a roleplay scenario, not free/
      casual chat) is active: once every target word/phrase has
      genuinely passed Phases 1-3, run one short natural mini-dialogue
      weaving together as many of the lesson's target items as fits
      naturally, as the final practical-mastery check. A stumble during
      this combined check sends that specific item back to Phase 1-2
      drilling rather than trusting an earlier isolated pass. "Lesson
      Lock-in" (the warm, name-and-number lesson-opening greeting) was
      **already** thoroughly implemented before this request — verified,
      not rebuilt; see `lessonNote` in `buildSystemInstruction()`.
    - **`#vf-active-lesson-badge`**: a new, small visible indicator
      inside the voice panel itself (not just internal JS state) showing
      "الدرس N: [title]" whenever `_vfLessonId` is set, hidden otherwise
      (free conversation, roleplay scenarios, casual chat). Updated by
      `vfUpdateActiveLessonBadge()`, called from every exit point of
      `vfSetLessonContext()` (there are three — null-clear, number-only,
      and the full-card-lookup path — all three needed the call added,
      not just the main path).
    - **Casual Chat mode (§1E) needs no special-casing here** — lesson
      metadata/switching is simply irrelevant while §1E's total
      pedagogical suspension is active; nothing new was added to guard
      against it since 1E's own "suspend everything pedagogical" rule
      already covers this by construction.
36. **"Arabic instead of English" and "mumbling/gibberish" were already
    covered in §2's INCORRECT outcome before this request — refined into
    two named, exact-phrase sub-cases, not built from scratch.** The
    original wording was a terse list item ("...answered only in Arabic
    when English was asked for, or said a clearly different word") with
    no specific required response — now each is its own explicit
    sub-case with the exact Saudi phrasing to use: Arabic-instead-of-
    English gets "حلو، بس أبغاك تقولها بالإنجليزي مو بالعربي! يلا قول:
    [English Word]"; mumbling/gibberish/unrelated-English-word gets
    "سمعتك بس النطق مو واضح، ركز معي وعيدها كذا: [Word]". Both are
    explicitly genuine INCORRECT outcomes (consume a Smart-Patience
    attempt) — **not** the UNCLEAR AUDIO outcome (§2.3), which is
    reserved specifically for muffled/cut-off/too-quiet recording
    quality, not for audible-but-wrong content. Also made explicit:
    never advance past a step, **including into the Phase 4 Capstone
    Check (§1B)**, without genuine audible English — an Arabic answer or
    unrelated mumbling never unlocks progress regardless of overall
    fluency.
    - **§2's own heading now explicitly cross-references §1E** ("this
      entire section... does NOT apply during Casual Chat mode, §1E"),
      completing the bidirectional link — §1E already named §2 as one of
      the systems it suspends; §2 now names §1E right back. If any other
      pedagogical section is ever touched, check whether it already has
      this same two-way naming with 1E, not just a one-way mention.
37. **Dashboard edge-case fixes + a deliberately scoped-down version of
    "user-scoped storage."**
    - **Zero-state mastery fix**: a genuinely brand-new student (0
      lifetime spoken minutes AND 0 mastered words) used to see "100%"
      mastery — misleading, since the underlying `masteredLifetime/
      everStruggled` math defaults to 100 when `everStruggled` is 0.
      Now shows "--" specifically for that zero-activity case (both the
      text and the ring, which renders at 0% fill for "--" rather than a
      full ring). Any real activity at all falls through to the normal
      calculation as before.
    - **"🚀 تدرب الآن مع أليكسا"**: new button at the bottom of the
      dashboard body, `seDashboardStartPractice()` — same close-dashboard-
      then-open-voice-panel pattern as `seReviewStruggleWord()`, just
      without a specific target word.
    - **`syncDashboardData(userId, mode)` — deliberately NOT a retrofit
      of the ~37 existing flat `localStorage` call sites across this
      file (XP, streak, lessons, badges, struggle words, etc.).** This
      app already has a real, working cross-device sync mechanism via
      Supabase (`seSyncProgressToCloud()`/`seFetchAndMergeCloudProgress()`,
      wired to `onAuthStateChange`) — rewriting every call site to read/
      write a per-user-scoped key would be a large, high-risk change
      (existing users' un-scoped data would stop being found) that also
      risks creating a second, inconsistent source of truth alongside
      the cloud sync that already works. Implemented instead as an
      **additive, well-scoped snapshot layer**: `SE_DASHBOARD_METRIC_KEYS`
      lists the specific keys the Dashboard cares about;
      `syncDashboardData(userId, 'save')` snapshots their current values
      into `stylish_progress_<userId>`, `syncDashboardData(userId,
      'load')` restores them (calling `seRenderDashboard()`/
      `updateProgressDisplay()` after). Wired automatically at the two
      moments the request actually asked for: **save** happens inside
      `seFetchAndMergeCloudProgress()` right after a successful cloud
      merge (both its normal-merge path and its first-time-sync path)
      and inside `seSignOut()` before the session actually clears; no
      automatic **load** was wired into login, specifically to avoid
      racing/overriding the authoritative cloud merge that already runs
      there — `'load'` mode exists and is exposed for a genuinely
      offline/no-Supabase use case (e.g. multiple people sharing a
      browser without individual accounts), not for overriding the cloud
      path. **If asked to actually make every localStorage key
      per-user-scoped for real, that's a much larger, distinct piece of
      work** — flag the scope and the existing-user-data-loss risk
      explicitly before attempting it, don't assume this snapshot layer
      already amounts to that.
38. **"Micro-Meaning Scaffolding" (شرح المعنى أولاً) — a genuinely new
    requirement added to §1B, positioned right before Phase 0/1 as a
    meaning-first PREFACE to the phase gates (not an extra phase/gate of
    its own).** Required before drilling any genuinely NEW target word:
    exact 3-part formula **[Saudi Context/Meaning] + [English
    Pronunciation] + [Prompt to Repeat]**, capped at ~5-7 seconds of
    speech, no grammar lectures or etymology. Two named exceptions:
    retrieval (don't re-explain a word already introduced earlier the
    same session unless the student explicitly asks "وش معناها؟") and
    Casual Chat mode (§1E — fully exempt, never triggered there).
    - **Critical cross-reference added to §1C (Shadowing) to prevent a
      real double-monologue risk**: the formula's third part, "[Prompt
      to Repeat]," is the *exact same moment* as Shadowing's existing
      echo/shadowing cue ("اسمعني زين ورددها وراي بنفس النبرة:
      [TargetPhrase]") for a brand-new word — both independently
      described "when introducing a new word, say it and prompt them to
      repeat it." Left unreconciled, a literal reading could have had
      Alexa do the meaning explanation AND THEN a separate, fully
      independent shadowing-cue monologue back to back for the same
      word — directly violating the "ultra-snappy, never a monologue"
      constraint this section itself sets. §1C now explicitly says these
      are one continuous turn, not two. **If either section is edited
      again, keep this reconciliation in mind — a change to one that
      re-introduces a full independent "say the word + prompt to repeat"
      cue risks recreating the double-monologue problem.**
39. **`admin.html` — new owner analytics/control dashboard, plus 3 new
    `server.js` endpoints. Central, load-bearing decision: real metrics
    only, never fabricated ones, even though the request's own KPI list
    included several this app's architecture genuinely cannot produce.**
    - **Why so many metrics show "غير متاح" (not available) instead of a
      number**: this server has ZERO persistent database and never has —
      it's a stateless per-connection audio relay. ALL student progress
      (XP, lessons, streaks, struggle words, badges, scenario sessions,
      etc.) lives entirely in each student's own browser `localStorage`,
      optionally synced to *their own* Supabase row — the server never
      receives or aggregates any of it. So "total registered students,"
      "top practiced lessons," "top struggle words across everyone,"
      "course completion rate," "average session duration per student,"
      "Gemini token usage," and a real cross-student data export are ALL
      genuinely impossible to produce honestly today — each `admin.html`
      card for these explicitly explains why, in Arabic, rather than
      showing a plausible-looking fake number. **If asked to "finish"
      or "fill in" these cards later, that requires a real, new backend:
      a database plus a client-side telemetry-reporting mechanism (each
      student's browser periodically POSTing anonymized/keyed metrics to
      a new endpoint) — a genuine architecture addition, not a UI tweak.
      Do not paper over the gap with mock/random numbers if asked to
      make the dashboard "look complete."**
    - **What IS genuinely real, and how**: `wss.clients.size` (active
      live sessions) already existed via `/api/health` before this —
      reused, not rebuilt. New in-memory-only counters (reset on every
      server restart, single-process, no persistence):
      `adminTotalSessionsSinceStart` (incremented in the `wss.on(
      "connection", ...)` handler), `adminTotalVoiceSecondsSinceStart`
      (accumulated in the existing `clientWs.on("close", ...)` handler
      from each connection's actual open→close duration).
    - **3 new admin endpoints, all requiring a matching `x-admin-secret`
      header checked via `adminSecretMatches()` (constant-time-ish
      comparison) against `process.env.ADMIN_SECRET` — fails CLOSED if
      that env var isn't set, never open**: `GET /api/admin/metrics`
      (the KPI data above), `POST /api/admin/maintenance` (toggles
      `adminMaintenanceMode`, which the connection handler checks first
      and rejects NEW connections with a friendly Arabic message while
      true — already-open sessions are never cut off by this alone),
      `POST /api/admin/disconnect-all` (closes every currently-open
      connection — honestly named for what it does; this server doesn't
      track per-connection idle time precisely enough to safely target
      "idle-only" connections, so the button/endpoint doesn't claim to).
    - **Two real bugs caught and fixed while building this, before
      shipping**: (1) `corsHeaders()`'s `Access-Control-Allow-Headers`
      only listed `Content-Type` — the new admin endpoints require
      `x-admin-secret`, which the browser's CORS preflight would have
      silently blocked entirely; added `x-admin-secret` to the allowed
      list. (2) `admin.html`'s initial draft defaulted its API base URL
      to `location.origin`, which is wrong for this app's actual
      deployment split (`index.html` frontend on Vercel, `server.js`
      backend on Render, documented in §1 of this file) — defaulted to
      the real known Render URL instead, overridable via
      `window.ADMIN_API_BASE` if that ever changes.
    - **Security**: the entered PIN/secret is stored in
      `sessionStorage` only (cleared when the tab closes), never
      `localStorage` — deliberately minimizing how long it persists on
      disk. `admin.html` is a static file with no server-side gating of
      its own; the actual protection is entirely the secret-header check
      on every admin API call — anyone can load the HTML page itself,
      but it's useless without the correct `ADMIN_SECRET`.
40. **Auth modal simplified: Phone/SMS OTP entirely removed, plus Apple
    OAuth and the magic-link button (a deliberately broader reading of
    the request than its literal "remove phone" framing — see the note
    below) — do not re-add any of the three without an explicit new
    request.** Current, correct auth surface: Google OAuth + Email/
    Password (now including a Full Name field on signup that didn't
    exist before this change).
    - **Everything removed, completely**: HTML —
      `#se-phone-step-1`/`#se-phone-step-2` (the two-step SMS UI),
      `#se-auth-phone`/`#se-auth-otp` inputs, the "أو برقم الجوال"
      divider, the Apple OAuth button, the magic-link button. JS —
      `seNormalizeSaudiPhone()`, `window.seHandleSendPhoneOtp`,
      `window.seHandleVerifyPhoneOtp`, `window.seResetPhoneStep`,
      `seSendPhoneOtp()`, `seVerifyPhoneOtp()` (this one called
      `supabase.auth.verifyOtp(...)`), `window.seHandleMagicLink`,
      `seSendMagicLink()`, and the `_sePendingPhoneE164` variable. CSS —
      `.se-phone-input-row`/`.se-phone-prefix`/`.se-phone-input`,
      `.se-auth-btn-apple`, `.se-auth-btn-magic`, `.se-auth-btn-link`.
      **`seSignInWithOAuth(provider)` itself was left untouched** — it's
      generic (accepts any provider string), so removing the Apple
      *button* was sufficient; no call site still passes `'apple'`.
    - **Scope note — the request literally said "remove phone number
      registration/login," but also stated the desired end state as
      "strictly Email and Password (and Google OAuth if present)."**
      Read literally-minimally, only phone needed to go; Apple and
      magic-link weren't named for removal. But since neither fits
      inside "Email + Password + Google" and neither was named as
      something to *keep* either, they were removed too, under the more
      literal reading of "strictly." **This was flagged explicitly to
      the user as an interpretive choice, not hidden** — if that reading
      was wrong, restoring Apple/magic-link would mean re-adding the
      `.se-auth-btn-apple` button + `seHandleOAuth('apple')` (already-
      generic, no changes needed there) for Apple, and the
      `.se-auth-btn-magic` button + `seHandleMagicLink()` +
      `seSendMagicLink()` (calls `supabase.auth.signInWithOtp({email})`)
      for magic link — neither is a large rebuild since the underlying
      Supabase mechanisms/generic OAuth handler were never deleted.
    - **New: Full Name field on signup**, which genuinely didn't exist
      anywhere before this change (`seHandleSignUp()` used to only ever
      collect email/password). `#se-auth-fullname` input →
      `seHandleSignUp()` validates it's non-empty → `seSignUp(email,
      password, fullName)` → passes `options: { data: { full_name:
      fullName } }` to `supabase.auth.signUp(...)`, matching Supabase's
      standard pattern for storing arbitrary profile metadata on the
      auth user record.
41. **Response length tightened again: "under 20 words / 2 sentences" →
    "3 to 6 words per turn."** Same single line in §2, both comment
    references near `maxOutputTokens` updated to match for consistency.
    **`maxOutputTokens` itself was deliberately left at 350, not lowered**
    — the reasons it was raised from 200 in the first place (Arabic runs
    denser per-token than English, and tone-mode flavor phrases like
    Angry mode's exclamations add length) don't shrink just because the
    English target word count did, so lowering it now would risk
    reintroducing the exact mid-sentence-truncation bug documented
    earlier. If asked to tighten response length yet again, remember
    this same reasoning — don't reflexively lower the token cap in lockstep
    with a shorter word-count rule without re-checking whether the actual
    truncation risk (Arabic + tone-flavor overhead) has also gone away,
    which it hasn't.
    - **Technical stability ask investigated claim-by-claim (same
      approach as §31/§33) — most of it was already solidly built from
      earlier work, not new**: the 15s heartbeat (already documented as
      a deliberate choice, "never loosen to 30s"), the single-retry
      reconnection logic (`_vfReconnectAttempted`, no unbounded loop,
      honest about not resuming the exact same Gemini session's
      short-term memory on reconnect), the 12s connection-handshake
      timeout (already accounts for Render free-tier cold-start delays
      via a separate non-blocking "still warming up" status hint, not a
      hard cutoff), and immediate per-chunk audio streaming with no
      server-side batching (verified in §33) were all already in place
      and were re-verified working, not rebuilt. No new stability
      mechanism was added because none of the specific investigated
      claims (mid-session freezing, missing keep-alive, no reconnection
      logic) held up against the actual code — if a *specific*,
      reproducible disconnect scenario is reported later, investigate
      that concrete case rather than assuming the general infrastructure
      needs more work.
41. **Dynamic Student Personalization — built from already-locally-cached
    data (localStorage, synced with Supabase on login), NOT a fresh
    Supabase query at every session start.** A blocking cloud fetch at
    call-start would have reintroduced exactly the latency the
    kickoff-note optimization (§24) was built to eliminate — so
    `vfBuildStudentPersonalization()` reads from what's already synced
    locally instead. Two real, pre-existing gaps found and fixed to make
    this possible at all:
    - **`_seCurrentUser` never captured `full_name`** — even though
      signup has stored it in Supabase's `user_metadata` since the auth
      simplification (§40), the client-side user object only ever kept
      `id`/`email`. Both places that build `_seCurrentUser` (initial
      session check, `onAuthStateChange`) now also read
      `user.user_metadata.full_name`.
    - **Struggle words ("weak points") were never part of the Supabase
      `user_progress` schema** — tracked locally and used in every
      `start_session`, but a device switch would have silently lost
      them, unlike XP/lessons/badges which already round-tripped through
      the cloud. `seSyncProgressToCloud()` now also upserts
      `struggle_words`; `seFetchAndMergeCloudProgress()` now also
      selects it and merges it with the same non-destructive union
      pattern (case-insensitive dedup) as lessons/badges — **if the
      actual Supabase table doesn't yet have a `struggle_words` column,
      this upsert will fail server-side until one is added** (a real
      external setup step, same category as the Google OAuth
      "provider not enabled" caveat already documented in §40 — not a
      client-code bug if it happens).
    - **New `start_session` field**: `studentPersonalization` —
      `{fullName, levelName, lastCompletedLessonNum}`, sanitized
      server-side by `sanitizeStudentPersonalization()` (same defensive
      posture as every other client-supplied field: length-capped
      strings, an actual-integer check with a 1-36 range on the lesson
      number). `levelName` is computed client-side via the existing
      `seGetLevelInfo(xp)` (§37's dashboard level tiers) — no new level
      storage was added, it's derived fresh from XP every time.
      `lastCompletedLessonNum` is the highest lesson number in
      `getCompletedLessons()`, not the array's last element (order-
      dependent and fragile if lessons are ever completed out of
      sequence).
    - **Priority rule, spelled out explicitly in the injected prompt
      note**: if a specific lesson is already open this session
      (`lessonNote` is set), that takes priority over mentioning past
      progress — the "last completed lesson" note only actively suggests
      "continue from Lesson N+1" during free/casual conversation with no
      specific lesson selected, to avoid contradicting or talking over
      whatever the student actually opened.
    - Also explicitly reconciled with the Adaptive Placement Engine
      (§1A): `levelName` is described as "a known starting signal" for
      1A's own tier system, not a replacement for its continuous
      in-conversation calibration — 1A still keeps reading and adjusting
      throughout the call.
42. **Few-shot dialogue examples added directly after the "3 to 6 words"
    rule (§2)** — six concrete example turns (new word, correct,
    mistake, hesitation, phrase combination, full sentence success),
    each explicitly word-counted in its own description, reinforcing the
    existing rule with concrete register/shape rather than just
    reiterating the abstract word-count constraint. Framed as the *only*
    register Alexa ever speaks in, not illustrative samples — even a
    "quick" grammar note must compress into this shape or split across
    two short turns.
43. **Two real logging gaps found and fixed while investigating "audio
    freezing/disconnections" (§ above) — the general infrastructure
    itself checked out as sound, but its OBSERVABILITY had genuine
    holes:**
    - **`index.html`'s `_vfSocket.onerror`/`.onclose` handlers had
      functioning cleanup logic but ZERO `console.log`/`console.error`
      calls** — a silent black box from the browser console's
      perspective. Now log the actual error object, and
      `CloseEvent.code`/`.reason`/`.wasClean` (all previously available
      on the event parameter but never read) — e.g. distinguishing code
      1006 (abnormal/no close frame — a real network-level drop) from a
      clean 1000, which matters for diagnosing "did the network die or
      did something close it on purpose." `server.js`'s equivalent
      `clientWs.on("close", ...)` already logged `code` but not
      `reason` — added.
    - **Playback buffer underrun (the same code fixed for de-clicking a
      few turns ago) had no logging at all** — the fade-instead-of-click
      fix was silent about *how often* it was actually happening.
      Added rate-limited logging (`_vfUnderrunCount`/
      `_vfLastUnderrunLogTime`, capped to once per 2 seconds) — this
      callback fires many times a second during playback, so logging
      every single occurrence would flood the console and add its own
      overhead; a persistent stream of these warnings is the actual
      diagnosable signal (network/CPU struggling to keep the queue fed),
      not a per-event curiosity.
    - **`AudioContext.resume()` on `state==='suspended'` was already
      checked in multiple places** (mic context, playback context, SFX
      context, plus a periodic safety-net mentioned in an existing
      comment) — verified thorough, not rebuilt.
44. **Audio latency/noise/session-drop follow-up — one request repeated
    from before was declined again with the same reasoning; two genuine
    fixes were made; one requested mechanism doesn't map onto this app's
    architecture and wasn't force-fit.**
    - **`autoGainControl:true` was requested again — declined again,
      same as documented in §9's mic-capture entry.** `echoCancellation`/
      `noiseSuppression` were already `true` (nothing to change there);
      `autoGainControl` stays `false` per the standing note: it was
      found to clip/dip the student's voice dynamically, and "for
      latency" isn't a valid reason to revisit it since AGC doesn't
      affect latency. If this is requested a third time, the same
      reasoning still applies — this needs a genuinely new, specific
      technical justification to reopen, not another general framing.
    - **VAD silence threshold raised, but only modestly, and framed
      honestly as a trade-off, not a free tune**: `avgAmplitude>0.007` →
      `0.009` (not back to the original `0.01`) in the amplitude-based
      speech proxy. This value was previously LOWERED specifically to
      stop quiet-but-real speech from being miscounted as silence and
      cut off prematurely — raising it now to help with background-noise
      false-positives pulls in the opposite direction. There is no
      single value that fully solves both directions; if quiet-speech
      cutoff complaints resurface, that's this same knob, and retuning
      should be based on whichever specific complaint is actually
      reported next, not both preemptively.
    - **Genuine architectural gap found and fixed: the 20-minute
      "soft-pause" never actually renewed the underlying Gemini session
      — it only ever paused the mic while keeping the SAME live
      connection open indefinitely, no matter how many rounds got
      chained together.** The pre-existing comment on
      `vfResumeFromSoftPause()` said so explicitly ("same live session
      ... no WebSocket reconnect"), confirming this wasn't a
      misunderstanding — it was the deliberate original design, which
      this request's "prevent hard API/WebSocket timeout limits during
      extended learning sessions" concern directly exposed as a real gap
      for genuinely long combined sessions (Gemini Live sessions
      plausibly have their own hard server-side duration limit that
      indefinite mic-pausing does nothing to avoid). Added a NEW,
      separate cumulative-time check in `vfEnterSoftPause()`
      (`_vfConnectionEstablishedTime`, set once in `onopen` — distinct
      from `_vfSessionStartTime`, which resets every round): once total
      connection time crosses `VF_MAX_SESSION_MS*2` (~40 cumulative
      minutes), instead of the normal soft-pause note, cleanly close the
      old socket (`onclose` nulled first, deliberately skipping the
      accidental-drop reconnect path — this is a planned renewal, not a
      failure) and call `vfConnectSocket()` again immediately, which
      sends a fresh `start_session` with the exact same scenario/lesson/
      tone/struggleWords/personalization context. Most sessions never
      reach this threshold and behave exactly as before — only a
      genuinely long combined study session triggers it. **Not
      live-tested against real extended-session traffic** — a reasoned,
      defensive addition for a confirmed real architectural gap, not a
      verified fix for a specific reproduced timeout; if actual timeout
      reports come in, check whether they happen before or after this
      ~40-minute threshold to gauge whether it needs to be lower.
    - **"Sliding-window context trimming (6-8 turns) to stop the payload
      bloating" doesn't map onto this app's real architecture, and
      nothing was force-fit to nominally satisfy the literal wording.**
      Gemini Live is a stateful WebSocket session managed server-side by
      Google — there is no client-managed, growing text payload get
      re-sent each turn the way there would be with a stateless chat-
      completion API, so there was no such payload to trim. What
      genuinely IS client-managed and was tightened instead:
      `VF_MAX_TR_LINES` 20→16 (≈6-8 turns' worth of transcript DOM
      nodes, a student+AI pair per turn) — this bounds the *displayed*
      transcript, not anything sent to Gemini. Also added a defensive
      (not expected-path) cap on `_vfPlaybackQueue` in
      `vfEnqueueAudio()` — drops the oldest buffered audio once total
      queued duration exceeds ~30s, guarding against unbounded growth in
      a genuinely pathological case (e.g. a network hiccup causing
      chunks to arrive faster than they play) during a long session,
      which under normal conditions (queue drains continuously, each
      turn is short per the "3-6 words" rule) should essentially never
      trigger.
45. **Three high-impact enhancements implemented directly from the
    pedagogical audit report (`/mnt/user-data/outputs/stylish-english-
    pedagogical-audit.md`, produced in the prior turn) — each addresses
    a specific, cited finding from that report, not a generic feature
    add.**
    - **Survival Phrases chips (`#vf-survival-chips`) — a genuine
      revival of `_hintSets`, not new hardcoded strings ignoring it.**
      The audit found `_hintSets` fully dead (unreferenced anywhere
      since `showHints()`/the old "ساعدني" button were removed, §22).
      `vfRenderSurvivalChips()` now curates 5 specific items FROM
      `_hintSets.confused`/`.practice` (not a fresh array) and renders
      them once into `#vf-survival-grid`. Tapping a chip calls the
      existing `vfSendText()` — sends it to Alexa exactly as if the
      student said it (the actually useful action for a survival
      phrase), with a separate `.vf-survival-play` icon per chip for
      hearing pronunciation first via `speak()`. Shown/hidden alongside
      the mic — `case 'session_ready':` shows it, `vfStop()` hides it
      (same universal-cleanup pattern used for the ringtone/dashboard
      elsewhere). `repeatLastAI()` (kept dormant since §22) and the rest
      of `_hintSets` (`greeting`/`agree`/`answer`/`thanks`) remain
      unused/available for a future contextual feature — only
      `confused`/`practice` were curated for this specific "survival"
      framing, deliberately not exposing all 18 phrases across 6
      categories as always-visible chips (that would be clutter for a
      small always-on utility, unlike the old removed contextual
      `showHints()` system).
    - **Phonetic Contrast Drills (`#phonetic-drills-modal`)** — addresses
      the audit's top-cited gap: zero systematic minimal-pair content
      existed anywhere before this (P/B appeared exactly once, as an
      incidental example inside Alexa's own instructions, never as
      student-facing content; V/F and TH were completely absent).
      `PHONETIC_PAIRS` (P/B, V/F, TH — 4 real minimal pairs each,
      e.g. Park/Bark, Van/Fan, Think/Sink) renders via
      `vfRenderPhoneticPairs()` into `.phonetic-pairs-grid` per
      category, each word independently clickable via `speak()`. "🎙️
      تدرب مع أليكسا" per category
      (`vfPracticePhonetic(category)`) closes the modal, opens/starts
      the voice panel (same pattern as `seReviewStruggleWord()`), then
      **polls up to 10 times over ~8s** (`trySend()`) waiting for
      `_vfSessionReady` before sending `PHONETIC_PRACTICE_NOTE[category]`
      via the existing raw `type:'text'` WebSocket message — reuses
      established mechanisms end-to-end, no new WebSocket message type
      was added for this. Triggered from a new button in `#hero-welcome`
      next to the Dashboard trigger (`#se-dashboard-trigger`), same
      `.se-dashboard-btn` visual treatment for consistency.
      **Server-side**: a new paragraph was added INSIDE §1C (Shadowing)
      — "L1-Specific Error Pattern Recognition" — rather than a new
      lettered section requiring renumbering, since it directly extends
      1C's existing "give a phonetic tip" mechanic. Classifies 4 specific
      Arabic-L1 interference patterns (P/B, V/F, TH substitution,
      consonant-cluster epenthesis e.g. "Street"→"Isstreet") as
      diagnostic knowledge for sharper tips — explicitly framed as
      "never lecture the student about Arabic phonology," just informs
      which tip to reach for.
    - **4 new roleplay scenarios in `SCENARIO_NOTES`** (`food`,
      `directions`, `routine`, `past_experiences`) — addresses the
      audit's finding that only 5 of 36 lesson topics had a matching
      performance scenario. Each follows the exact same established
      pattern as the original 5 (Arabic scene-set → gradual word→phrase→
      sentence scaffolding → character/exchange), plus an explicit
      "Student's speaking goal" line tying it to specific curriculum
      lessons (e.g. `routine` ties to present-simple/daily-routine
      lessons, `past_experiences` to past-simple lessons) — a
      requirement pattern the original 5 scenarios didn't have, added
      here per the audit's "clear, short student speaking goals matched
      to beginner levels" ask. 4 new buttons added to
      `#vf-scenario-grid` (11 scenario buttons total now, including
      `casual_chat`) — reused existing icons where a good fit existed
      (`ic-compass` for directions, `ic-sun` for routine, `ic-book-open`
      for past experiences as a storytelling metaphor), an emoji for
      `food` specifically to avoid visually duplicating `ic-coffee`
      (already used for the `coffee` scenario). No new server-side
      handler code was needed — `switch_scenario`/`start_session` both
      already validate against `SCENARIO_NOTES[scenario]` generically.
46. **"High CPU/freezing" diagnosis — investigated claim-by-claim before
    changing anything, same approach as §31/§33. Found the single
    highest-impact real bug in the whole request in a place the request
    itself didn't point to (continuous CSS `box-shadow`/`filter`
    animation), and made a deliberate scoping decision NOT to attempt a
    full `AudioWorkletNode` migration.**
    - **Genuinely the most impactful fix: `.vf-orb`'s `orbBreathe`
      animation was animating `box-shadow` directly, in an infinite
      4s loop, on the floating voice button — which is visible for
      essentially the ENTIRE TIME a student is anywhere on the
      dashboard, not just during an active call.** Animating
      `box-shadow`/`filter` forces a full repaint every animation frame
      (unlike `transform`/`opacity`, which the GPU compositor can handle
      without repainting) — a well-documented, high-confidence
      performance anti-pattern, and because this element is almost
      always on-screen, it plausibly explains a meaningful share of
      "freezing during use" on its own. Fixed by moving the animated
      glow to a **separate sibling `<span class="vf-orb-glow">`**
      (positioned `absolute` to overlap the orb, `top:0;left:0`,
      matching dimensions) — a sibling, not a child, specifically
      because `.vf-orb` has `overflow:hidden` (for its circular avatar
      mask) which would clip a `::before`/child glow element. The glow
      layer has a STATIC box-shadow and only animates `opacity`
      (`orbGlowPulse`); `.vf-orb` itself lost its `animation:
      orbBreathe...` reference entirely and now has a fixed, un-animated
      `box-shadow`. Two more, lower-impact instances of the exact same
      anti-pattern were found and fixed the same way: `.vf-continue-top`
      (`vfContinueGlow` — shown only during the post-20-min soft-pause
      prompt, far less "always on" than the orb, fixed via a `::after`
      pseudo-element since this button has no `overflow:hidden` to worry
      about) and `.se-flame-icon` (`seFlamePulse` — animated
      `filter:drop-shadow`, small element so lower repaint cost, but
      shown whenever `streak > 0`; simplified to opacity-only, dropped
      the drop-shadow-blur animation, kept a static drop-shadow).
    - **Verified, not rebuilt**: mic pipeline cleanup
      (`vfStopMicStreaming()` already disconnects
      `_vfMicProcessor`/`_vfMicSource`, closes `_vfMicCtx`, nulls the
      reusable Int16/Float32 buffers from §31 — thorough already).
      `setInterval` call sites (`_vfIdleCheckTimer`, 3 separate creation
      points) all already `clearInterval` the previous timer first —
      no duplication-on-restart bug found. No `AnalyserNode` exists
      anywhere in the codebase. No continuous visualizer
      `requestAnimationFrame` loop exists — the 5-bar soundwave (§29)
      is pure CSS animation gated by a class toggle, not JS-driven; the
      other `requestAnimationFrame` call sites found (XP counter
      count-up, toast fade-in, badge unlock animation) are all
      short-lived, self-terminating (`if (progress < 1)
      requestAnimationFrame(step)`), not infinite loops.
    - **Deliberately did NOT migrate `onaudioprocess`/`ScriptProcessorNode`
      to `AudioWorkletNode`, and this needs to stay a deliberate,
      separate decision if raised again — not something to attempt as
      part of a general "fix performance" pass.** This would be a major
      architecture change (a separate worklet module/blob, message-
      passing instead of direct synchronous array access, on both the
      mic-capture AND playback pipelines) touching code that's been
      carefully tuned across dozens of prior turns (buffer sizes,
      reusable typed arrays, resampling, the barge-in amplitude gate,
      underrun de-clicking) — real risk of reintroducing bugs in an
      already-debugged system, with no way to live-test the rewrite
      against real browser audio hardware/Gemini traffic in this
      environment to verify it. `ScriptProcessorNode` being deprecated
      doesn't by itself mean it's the actual cause of a specific
      reported freeze — the box-shadow/filter fix above is a much
      better-evidenced explanation for "freezing during use" specifically
      (a continuous, always-on repaint source) than API deprecation
      status. If AudioWorkletNode migration is genuinely wanted, it
      deserves its own dedicated, carefully-tested effort with a clear
      rollback path — not a bundled rewrite here.
47. **Voice latency/turn-around follow-up — verified each claim before
    changing anything; one was already satisfied, one was a genuine
    small win, one was a real tightening within an already-stated safe
    range.**
    - **First-chunk playback (§29/§43's `vfEnqueueAudio()` call inside
      `case 'audio':`) was already fully real-time** — each streamed
      audio chunk is queued and starts playing via the continuously-
      draining `ScriptProcessorNode` callback the moment it arrives, not
      after any "complete response" wait. Verified directly in the code,
      not assumed; no change was needed here.
    - **Genuinely removed unnecessary metadata from every audio
      message**: `sampleRate: 24000`/`encoding: "pcm16"` were sent on
      *every single* `type:"audio"` message from `server.js` — verified
      the client never actually reads either field (it hardcodes `24000`
      directly in `vfUpsampleTo(float32, 24000, ctx.sampleRate)`, §
      above), confirming these were pure recurring overhead, not
      dead-but-harmless. Removed both — the message is now just
      `{type:"audio", data:...}`. Small per-message savings, but this
      fires once per audio chunk, many times per turn, for an entire
      session, so it adds up more than a one-off payload would.
    - **End-of-speech silence timeout tightened 700ms → 550ms** (§ above
      already had it at 700ms — the upper bound of this request's
      500-700ms ask — genuinely tightened further to roughly the
      midpoint, not left unchanged). Framed explicitly as a *different*,
      safer knob than the amplitude threshold (§44's 0.007→0.009):
      reducing HOW LONG we wait after silence starts doesn't carry the
      same "cuts off quiet speech" risk that changing WHAT COUNTS as
      speech does — natural mid-sentence pauses/breaths typically run
      200-400ms, so 550ms retains real margin. If this specific value
      is ever revisited again, that reasoning (a different, safer knob
      than the amplitude threshold) still applies — don't conflate the
      two the way §44 already warned against for the amplitude side.
48. **Student's raw live speech transcript hidden from the UI — with two
    real side-effects found and fixed along the way, not a one-line
    `display:none` slapped on blindly.** `vfUpsertLiveUserLine()` (fed
    by `case 'user_text':`, Gemini's raw `inputAudioTranscription`) still
    creates/updates its DOM element exactly as before — `l.style.display
    ='none'` was added, the element itself was NOT removed from creation
    — specifically because `vfFinalizeAiTurn()` reads
    `_vfLiveUserEl._span.textContent` to populate `_vfHistory` (session
    replay/internal tracking), and `_vfLastUserSpeechTime` (the 2-minute
    silence auto-end timer) is set in the same `case 'user_text':` block
    regardless of display — neither backend processing nor AI evaluation
    (which happens entirely in Gemini's own reasoning) depend on this
    being visible. **Deliberately scoped to ONLY the voice-STT path** —
    `vfAddTr(text,'user')` (used by `vfSendText()` for survival-chip taps
    and typed text input, §45) was left fully visible, since that's
    intentional, clean text the student explicitly chose, not "imperfect
    real-time STT artifacts."
    - **Real side-effect #1, found and fixed**: `vfTrimTranscript()`
      used to count `e.children.length` (ALL DOM children) against
      `VF_MAX_TR_LINES` — hidden STT lines would have silently eaten
      into the budget meant for *visible* Alexa lines. Now counts only
      children where `style.display!=='none'`.
    - **Real side-effect #2, found and fixed**: hidden lines are now
      excluded from that visible-line cap, which means nothing would
      ever trim them — left unaddressed, they'd accumulate in the DOM
      without limit across a long session (directly undoing §31/§44's
      memory-leak-prevention work). Fixed by removing the hidden element
      from the DOM immediately once its text has been read into
      `_vfHistory` (in `vfFinalizeAiTurn()`), plus a second defensive
      removal in `vfStop()` for the abrupt-call-end case (call ends
      mid-utterance, before a turn ever finalizes) — both paths now
      guarantee no orphaned hidden nodes linger.
49. **Text overlap/overflow hardening around `#vf-word-display`/`.vf-tr`
    — implemented as a defensive, evidence-based CSS pass, not a
    single confirmed pixel-level bug fix.** The described symptom
    ("title/prompt overlaps the message bubble") couldn't be reproduced
    with certainty from code alone (no `position:absolute/fixed`,
    negative margins, or fixed-height+overflow:hidden container was
    found anywhere in this specific area — normal document flow
    throughout), so this addresses the most plausible contributing
    causes rather than one pinpointed bug: `#vf-word-display` gained an
    explicit `margin-bottom` (previously relied solely on its own
    padding for separation from `.vf-tr` below it); `.vf-tr` gained a
    matching `margin-top`, a taller `max-height` (180px→240px, more
    breathing room per the "dynamic height" ask while keeping the same
    `overflow-y:auto` scroll behavior), and `word-wrap`/`overflow-wrap`;
    `#vf-word-display-text` and `.vf-tr-l` both gained
    `word-wrap`/`overflow-wrap` (plus `min-width:0` on the flex line
    item) so a long wrapped phrase/sentence (e.g. a Phase 3/4 full
    sentence) can't overflow its container width on a narrow screen. **If
    the overlap is still visible after this, it needs a screenshot or a
    more specific description to pin down exactly which two elements are
    colliding** — this pass covers the most likely causes given what the
    code actually shows, not a verified root-cause fix.
50. **Third pass on audio stability/CPU/layout — investigated each claim
    before changing anything, same approach as §31/§33/§46; most of the
    core infrastructure was already verified sound in those prior
    passes, but found and fixed two real, previously-missed queue-reset
    gaps and one genuine UI-clarity gap.**
    - **Real gap #1: `case 'error':`/`case 'rate_limited':` never called
      `vfStopPlayback()`** — only `vfStopRingtone()` was cleared on
      those paths. If an error arrived mid-playback, the queue was left
      in a stale, inconsistent state — audio for a session that's
      effectively dead could keep trying to play. Both handlers now also
      call `vfStopPlayback()`, reset `_vfAiIsSpeaking=false`, and
      `setWaveActive(false)` — matching the same cleanup `case
      'interrupted':` already did for barge-in.
    - **Real gap #2: `vfStart()` never defensively cleared
      `_vfPlaybackQueue` at the start of a new session** — only
      `_vfCurrentAiText`/`_vfCurrentAiChunks` were reset. Added a
      `vfStopPlayback()` call at the end of `vfStart()`'s setup block —
      guarantees a clean queue at session start regardless of whether a
      previous session's cleanup fully completed (e.g. an abrupt
      disconnect). Not an expected-path bug (normal `vfStop()` already
      clears this correctly) — a genuinely defensive addition for the
      abnormal case.
    - **Real gap #3, addressing the "separate Alexa's card from internal
      logs" / "distinct state indicators" ask**: `.vf-sts` (the single
      status line used for both normal turn-state — listening/speaking/
      thinking — AND actual errors/warnings) had **zero visual
      distinction for error states** — `vfSetStatus(msg, '')` (empty
      class) rendered every error/rate-limit/timeout message in the same
      plain grey as idle status, making them feel like part of the
      normal conversational log rather than a distinct alert. Added
      `.st-error` (red, bold, subtle red background pill) and `.st-warn`
      (amber, same treatment) classes; **7 error-message call sites**
      updated to pass `'error'` instead of `''`, plus the rate-limited
      message to `'warn'`. **Listening (🎤, cyan, "st-l") vs Speaking
      (🔊, purple, "st-s") were verified already well-differentiated**
      (distinct icon + color + wording at every call site) — not
      rebuilt, just confirmed sufficient.
    - **Verified again, not rebuilt** (already covered by §43/§46/§47):
      `AudioContext.resume()` on suspended state at multiple points;
      pull-based `ScriptProcessorNode` queue architecture (not
      `AudioBufferSourceNode` scheduling — see §43's explanation of why
      that framing doesn't map onto this app); underrun de-click +
      rate-limited logging; no continuous visualizer `requestAnimationFrame`
      loop exists; `setInterval` sites already guard against duplication
      on restart; mic pipeline (`_vfMicProcessor`/`_vfMicSource`/
      `_vfMicCtx`) already fully torn down on stop; the `.vf-orb`/
      `.vf-continue-top`/`.se-flame-icon` box-shadow/filter CPU fix from
      §46.
51. **Comprehensive pedagogical-consistency audit — verified against
    actual code, no functional changes made because everything checked
    out. Full report: `/mnt/user-data/outputs/consistency-audit-
    report.md`.** Preserve this architecture in any future edit — it's
    what structurally guarantees the consistency this audit verified,
    not incidental:
    - **`buildSystemInstruction()`'s composition is additive, not
      substitutive, by construction**: `SYSTEM_INSTRUCTION_BODY` (3-6
      word rule, Phase Gates, Shadowing/L1 error patterns, Strict
      Evaluation, Smart Patience) is always included first,
      unconditionally, for every session — `scenarioNote`/`toneLine`/
      `personalizationNote`/`struggleNote` are all appended AFTER, never
      substituted in its place. **If a future edit ever restructures
      this function, keep the core body unconditional and first** —
      that's the actual mechanism preventing any scenario/tone override
      from weakening core rules, not a coincidence of current content.
    - **Casual Chat (§1E) is the one deliberate, explicitly-named
      exception** — confirmed still correctly scoped (names itself in
      §1B's exception clause, §1E names all 5 systems it suspends, §2
      names §1E back). Any NEW mode/scenario that's meant to bypass core
      rules needs this same explicit, bidirectional naming pattern — not
      an implicit/silent exception.
    - **Fallback model chain has a single source of truth, verified
      directly**: every iteration of the `MODEL_FALLBACK_CHAIN` loop
      calls the identical `buildLiveConnectOptions(modelName, config)`
      with the identical `config` object — there is no reduced/alternate
      instruction path for a fallback model. If this loop is ever
      refactored, preserve that single call site — a per-model branch
      that builds instructions differently would be the actual
      regression to watch for.
    - **11 total scenario keys verified** (`free`, `coffee`, `interview`,
      `airport`, `hotel`, `doctor`, `food`, `directions`, `routine`,
      `past_experiences`, `casual_chat`) — all 9 roleplay scenarios
      follow the identical template (Arabic scene-set → word→phrase→
      sentence scaffolding → character), confirmed by reading each one,
      not sampling.
    - **`studentPersonalization` injection has zero scenario-conditional
      logic** — verified no `if (scenario === ...)` gate exists anywhere
      near `personalizationNote`'s construction.
52. **Jitter buffer / pre-buffering + reactive interruption recovery —
    implemented the genuine VALUE of the request within the existing
    pull-based architecture, explicitly declined the literal
    `AudioBufferSourceNode`-scheduling ask again, this time backed by
    concrete project history, not just general reasoning.**
    - **Critical historical evidence found while implementing this,
      strengthening §43's earlier (more general) reasoning**: the
      comment directly above `_vfPlaybackQueue`'s declaration
      (`"===== Continuous streaming playback (iOS Safari fix) ====="`)
      documents that this app ALREADY used
      `AudioBufferSourceNode`-per-chunk scheduling with precise
      timestamps at some earlier point in this project's history, and it
      was deliberately replaced with the current single persistent
      `ScriptProcessorNode` pull-model specifically because **iOS
      Safari's audio pipeline audibly clicked/gapped stitching many
      small separately-scheduled buffer nodes together** — described in
      that comment as sounding like "choppy, low quality" audio on
      iPhone. **This means the exact architecture this request asked for
      was already tried in this codebase and reverted for a documented,
      real reason** — not a hypothetical risk. Migrating back to it
      would plausibly reintroduce a previously-fixed bug on a major
      browser. This confirms §43's decision was correct and gives any
      future revisiting of this topic much stronger grounds to also
      decline a literal `AudioBufferSourceNode` migration — cite this
      history, not just general risk-aversion.
    - **What was actually implemented — pre-buffering within the pull
      architecture**: `VF_PREBUFFER_MS=150` (target cushion),
      `_vfPrebufferDeadline` (400ms wall-clock cap, deliberately set
      comfortably above ~2 `onaudioprocess` callback cycles at this
      node's 8192-sample buffer size — an earlier draft used 130/150ms,
      which would have raced a single callback's timing coincidence and
      barely functioned; caught and corrected before shipping). Re-armed
      per-turn in `vfEnqueueAudio()` only when the queue was genuinely
      empty before the new chunk (not on every chunk mid-turn, which
      would reintroduce a stutter every chunk instead of only at turn
      start). While pre-buffering, the callback outputs silence and
      `return`s without draining — once the cushion target or deadline
      is hit (whichever first), draining begins normally and never
      re-triggers mid-turn. **Real, accepted trade-off**: this adds up
      to ~150-400ms before the student hears the FIRST sound of a new
      AI turn, working somewhat against the earlier kickoff-latency
      optimization (§24) — deliberate and requested, but worth knowing
      if turn-start latency is revisited again, since these two goals
      now pull in opposite directions on this specific window.
    - **`onstatechange` reactively hooked on both AudioContexts**
      (`_vfPlayCtx` in `vfEnsurePlayCtx()`, `_vfMicCtx` in
      `vfStartMicStreaming()`) — genuinely new, catches involuntary
      interruptions (OS audio-focus loss, incoming call, etc.) the
      instant they happen, on top of the existing explicit
      `state==='suspended'` checks at specific trigger points (which
      only catch it AT that moment, not reactively whenever it occurs).
      Both auto-`resume()` on `'suspended'`/`'interrupted'`.
    - **Verified already satisfied, not rebuilt**: "don't reset/drop
      active gain nodes while chunks are queued" — `vfStopPlayback()`
      already deliberately never disconnects `_vfPlaybackNode`/gain/
      compressor (§43's documented reasoning, re-confirmed here).
    - **New diagnostics**: chunk-arrival gap logging in
      `vfEnqueueAudio()` (warns when >300ms passes between chunks —
      direct visibility into network jitter, not inferred from audible
      symptoms), and a console log when the pre-buffer cushion releases
      (showing actual buffered ms and whether it hit the target or the
      deadline) — both additive to the existing rate-limited underrun
      logging from §43.
    - `vfStopPlayback()` now also resets `_vfPrebuffering`/
      `_vfPrebufferDeadline`/`_vfLastChunkArrivalTime`, so a new
      session/turn never inherits stale jitter-buffer state from before.
53. **Beginner pacing/review-frequency adjustment — one genuine conflict
    with an existing system found and reconciled explicitly, not
    silently overridden.**
    - **Real conflict: "one retry per session" vs. the existing Spaced
      Repetition system (§ Personal Student Error Memory).** The
      existing spaced trigger could re-surface the SAME still-unmastered
      struggle word multiple times within one session (its 2-3-correct-
      turns-or-end-of-lesson condition could fire more than once per
      session, and an uncorrected word "simply stays in the review pool"
      with no session-level cap before this change) — this directly
      contradicted the new "exactly one retry per session" ask. Added an
      explicit **Single-Pass Review Limit** clause to the struggle-word
      prompt text, clearly labeled as a DIFFERENT rule from the Smart
      3-Attempt Patience System (which governs one live encounter's
      in-the-moment patience, not session-wide re-surfacing — don't
      conflate the two if either is edited again): once a specific
      struggle word has been re-surfaced and attempted once this
      session, it doesn't come back again this session regardless of
      whether it was corrected — right or wrong, it carries over to a
      future session's review pool instead of being retried today. The
      cap is per-word, not per-feature — a DIFFERENT struggle word may
      still surface later in the same session via the normal trigger.
    - **Phase 3 (Full Sentences Gate, §1B) tightened from "usually
      avoided for hesitant students" to an absolute rule for Tier 1
      (§1A)**: previously only said never to push a *hesitant* student
      into full sentences; now explicitly states Phase 3 is fully LOCKED
      for a Tier 1 (Absolute Beginner) student regardless of any single
      strong attempt — access is tied to the student's overall Tier via
      §1A's continuous re-calibration, never decided turn-by-turn in
      isolation. Reinforces (doesn't contradict) §1A's existing "Tier
      affects pacing, not whether mastery is required" cross-reference.
      Added the exact micro-step example from the request ("Tea" → "A
      cup of tea" → "Tea, please" — note the last step is deliberately
      the simplest *natural* phrasing, not the grammatically "complete"
      form, matching the "prioritize ultra-simple everyday structures"
      ask).
    - **UI label consistency, genuinely fixed**: `#vf-word-display`'s
      sub-label was a static "Say this word out loud" regardless of
      whether the actual extracted target (`vfExtractHighlightWord()`,
      §30) was a single word or a multi-word phrase from Phase 2+. Added
      `id="vf-word-display-sublabel"`; `vfUpdateWordDisplay()` now splits
      the extracted text on whitespace and picks "Say this word"
      (1 word) vs. "Say this phrase" (2+ words) dynamically. Verified
      with real strings run through the actual logic, not just reasoned
      about: "Tea"→word, "Tea, please"→phrase, "A cup of tea"→phrase —
      matches the request's own example progression exactly.
54. **Fixed a real `ReferenceError: _vfSessionReady is not defined` —
    root cause: cross-`<script>`-block scope, not a typo or missing
    declaration.** `_vfSocket`/`_vfSessionReady` are `var`-declared
    inside `(function(){'use strict'; ... })();` (the main voice-engine
    IIFE, opens ~line 4397, closes ~line 6374) — function-scoped
    variables never leak to `window`/global scope, IIFE or not, strict
    mode or not. `window.vfPracticePhonetic()` (§45, phonetic drills)
    is defined in later code AFTER that IIFE closes, and referenced
    `_vfSessionReady`/`_vfSocket` as bare identifiers instead of through
    `window.` — the same function correctly used `window._vfRec` right
    next to the broken references, which is exactly why this specific
    bug was easy to miss (looked consistent at a glance, wasn't).
    - **Fix, applied once at the declaration site, not at every call
      site**: added `Object.defineProperty(window, '_vfSessionReady',
      {get:...})` and the same for `_vfSocket`, right after their `var`
      declarations. **A getter, not a one-time `window.x = x`
      snapshot, was essential** — both variables get reassigned in
      dozens of places throughout that IIFE (mic connect/disconnect,
      session start/stop, error handlers), so a plain snapshot taken
      once at declaration time would go stale immediately; the getter
      always re-reads the live closure variable on every access.
      Internal code inside the IIFE is completely unaffected — it still
      uses the bare identifiers exactly as before; this only adds a
      read-only external view.
    - **Searched the entire file for the same bug pattern before
      considering this done** — grepped every line after the IIFE's
      closing brace for bare (non-`window.`-prefixed) uses of either
      variable; found exactly the one reported instance
      (`vfPracticePhonetic`), no others. Updated it to use `window.`
      explicitly (matching how it already correctly accessed
      `window._vfRec`) plus an added `typeof !== 'undefined'` guard as
      defense-in-depth on top of the getter fix.
    - **If any FUTURE code is ever added outside this IIFE (a new
      `<script>` block, or code appended after its closing brace) and
      needs to read live voice-session state, use `window._vfSessionReady`/
      `window._vfSocket` (now safe) — never the bare identifiers, which
      will always throw a ReferenceError from outside this specific
      IIFE's scope.** This is the actual lesson for next time, not
      specific to phonetic drills — any future cross-script-block
      feature needs the same `window.`-prefixed access pattern already
      established for `window._vfRec`/`window._vfOpen`.
55. **Mobile UI/UX pass — investigated the "modal stays silent on tap"
    claim thoroughly before changing anything; the core trigger/
    permission flow was already well-built, but found real,
    plausible contributing gaps elsewhere, not the claimed root itself.**
    - **`toggleVoiceFab()`/`vfStart()` were verified already correct**:
      the overlay's `vf-modal-open` class is added synchronously on tap
      (before any async work), `vfSetState('connecting',...)`/
      `vfSetStatus('🔄 جاري الاتصال...')` fire synchronously at the very
      start of `vfStart()` (before `getUserMedia`), and `getUserMedia`
      itself is called synchronously within the same tap's call stack,
      in parallel with the WebSocket handshake — no missing modal-open
      step, no async gap before the permission prompt. Did not
      "fix" something already correctly built.
    - **Real, plausible contributor found instead: `.vf-orb` had a
      `:hover` state but no `:active` state** — `:hover` doesn't fire
      reliably on touch devices, so a tap could genuinely feel like it
      registered nothing for the ~350ms until the modal's fade-in
      transition completes. Added `.vf-orb:active{transform:scale(0.92)}`
      for instant, unmistakable tap feedback — addresses the *perception*
      of "silence" directly, which is the more likely real explanation
      than a missing code path.
    - **Real gap #2 (Task 2): `.wa-float-btn` had zero
      `safe-area-inset-bottom` handling** — unlike `.vf-wrap` right next
      to it, which already had it. Added the matching `@supports`
      block. **Caught and fixed my own mistake while doing this**: an
      already-existing `@media(max-width:480px){.wa-float-btn{...}}`
      rule existed further down the file (52px sizing) that a first
      draft of this edit didn't check for — briefly created a
      duplicate/conflicting 480px media query (56px) before catching it;
      removed the duplicate and merged the safe-area fix into the
      pre-existing rule instead. **Always grep for existing
      `@media(max-width:...)` blocks for a selector before adding a new
      one — this file has multiple mobile breakpoints for the same
      selectors scattered at different points, easy to accidentally
      duplicate.**
    - **Real gap #3 (Task 2): `.site-footer` (the actual last element on
      the page) only had 32px bottom padding — less than the floating
      buttons' footprint (64px button + 32px offset ≈ 96px)**, so
      scrolling all the way down could let the fixed FABs overlap the
      last line(s) of footer text. Increased footer bottom padding to
      `calc(32px + 96px)`.
    - **Task 3 (hero banner)**: `.flex.items-center.gap-5` (avatar+text
      row) had no responsive column-stacking override — it stayed a
      side-by-side row even on the narrowest phones, and the H2 used a
      2-step `text-xl`/`sm:text-2xl` jump instead of smooth scaling.
      Added `min-width:0` to both the row and the text column (lets text
      wrap inside its own box instead of pushing outward against the
      avatar) and switched the heading to
      `font-size:clamp(17px, 4.5vw, 24px)` for continuous scaling
      instead of a hard breakpoint jump.
    - **Task 4 (lesson cards/scrolling)**: mobile-specific
      `.lesson-card` margin (20px, in an existing `@media(max-width:...)`
      block) was verified already reasonable, not rebuilt.
      `-webkit-overflow-scrolling:touch` (the standard iOS momentum-
      scroll enhancement, already present on `.table-wrap` and 2 modal
      containers) was missing specifically on `.vf-tr` (the transcript
      container, `overflow-y:auto`) — added for consistency.
56. **Floating mic/voice button GPU/mobile redesign — verified the ring/
    recording-pulse animations were already `transform`/`opacity`-only
    (no `box-shadow`/filter animation to remove there), found the
    genuinely real gaps instead: an animation that kept running while
    fully invisible, and a text label the request specifically asked to
    remove.**
    - **Most impactful real find: `.vf-wrap.vf-hidden` (the FAB's hidden
      state while the voice modal is open) only used `opacity:0;
      visibility:hidden` — NOT `display:none`.** `visibility:hidden`
      hides paint, but does not stop a CSS animation's keyframe
      computation from continuing to tick — meaning `.vf-orb-glow`'s
      `orbGlowPulse` (and the two `.vf-orb-ring`s' `orbRing`) were
      plausibly still computing every frame for the ENTIRE duration of
      every voice call, not just when idle on the dashboard. Added an
      explicit, guaranteed fix rather than relying on browser paint-skip
      heuristics: `.vf-wrap.vf-hidden *{animation-play-state:paused
      !important;}` — a single universal-descendant rule, so any current
      or future animated child inside the FAB is automatically covered,
      not just the two specifically named here.
    - **Text label removal, done via accessible visual hiding, not
      deletion**: `.vf-mic-label` (renders text like "🎤 أسمعك الآن..."
      directly below the mic button, `margin-top:8px` — close enough to
      read as visually crowding the button even though not literally
      CSS-overlapping it) switched to the standard `sr-only` clip
      technique instead of `display:none` — screen readers can still
      announce state changes, sighted users see only the ring's color/
      pulse now (red=recording, green=waiting — already existed,
      unchanged). **Caught a real follow-on waste while doing this**:
      `.vf-mic-label.lbl-paused` still had `animation:vfDotPulse...}` —
      now animating an element nobody can see at all; removed the
      animation reference from that rule (kept `vfDotPulse` itself,
      still used elsewhere by `.vf-st-dot.st-connecting`).
    - **`will-change:transform` added, deliberately scoped to only the
      actively-animating states, not applied permanently**:
      `.vf-mic-ring` (present but harmless since this whole element only
      exists while the modal's open) and `.vf-mic.vf-rec` (compound
      selector — only matches during actual recording, so the GPU-layer
      hint naturally never applies while idle, avoiding the well-known
      anti-pattern of leaving `will-change` on indefinitely).
      `.vf-orb-glow` got `will-change:opacity` to match (it animates
      opacity, not transform, so the property name follows the actual
      animated property, not just a copy-paste of `transform`).
    - **Touch target sizing verified, not changed**: `.vf-mic` is 68px,
      `.vf-orb` is 72px — both already comfortably within/above the
      requested 56-64px range. **Safe-area-inset**: already correctly
      scoped to `.vf-wrap` (the actual viewport-edge-pinned FAB, §55);
      `.vf-mic-w` lives inside the modal itself, not pinned to the
      viewport edge, so safe-area-inset doesn't meaningfully apply to it
      — didn't add unnecessary CSS there just to nominally touch every
      request bullet.
57. **Fixed a real, reproducible `TypeError: Cannot read properties of
    null (reading 'state')` — a genuine race condition self-introduced
    by the `onstatechange` interruption-recovery feature added earlier
    (§52), not a pre-existing bug.** Root cause: `vfStopMicStreaming()`
    calls `_vfMicCtx.close()` then sets `_vfMicCtx=null` on the very
    next statement — but `AudioContext.close()` fires its own
    `'statechange'` event (transitioning to `'closed'`) *asynchronously*,
    so by the time that event actually arrives, the outer `_vfMicCtx`
    variable has already become `null`, even though the AudioContext
    object itself (still alive, still dispatching its own event) has
    not. The handler was reading `_vfMicCtx.state` — the mutable outer
    variable, not the object that fired the event — so it crashed.
    - **Fix**: both `_vfMicCtx.onstatechange` and (defensively,
      preemptively, even though it isn't currently exposed to the exact
      same race) `_vfPlayCtx.onstatechange` now read `event.target`
      first (the actual AudioContext that dispatched the event,
      independent of whatever the outer variable currently holds),
      falling back to the outer variable only if `event.target` is
      somehow unavailable, with a `null`-guard (`if(!ctxThatChanged)
      return;`) before touching `.state` either way.
    - **Verified with an actual simulation, not just reasoned about**:
      ran a Node script reproducing the exact sequence (attach handler →
      close + null the outer variable → fire the event late with the
      real object as `event.target`) — confirmed the old pattern would
      crash and the new one safely returns the correct `'closed'` state.
    - **Lesson for any future `onstatechange`/similar event-handler
      addition on an object that a *different* code path might null out
      later**: always read from the event's own `target`/`currentTarget`
      inside the handler, never solely from an outer mutable variable of
      the same name — the object dispatching the event and "whatever the
      outer variable points to right now" can diverge the instant any
      cleanup path nulls that variable before the event fires. This
      exact bug class can recur anywhere a long-lived event listener is
      attached to an object that gets nulled elsewhere.
58. **Follow-up on §57's `_vfMicCtx.state` TypeError report — verified
    the `event.target` fix from §57 was actually present first (it was),
    then found one more genuinely real gap the first pass missed.**
    - `_vfMicProcessor.onaudioprocess` checked `window._vfRec`/
      `_vfMicSuppressed`/`_vfPaused` before doing any work, but never
      checked `_vfMicCtx` itself — and this SAME callback reads
      `_vfMicCtx.sampleRate` further down (`vfDownsampleTo16k(input,
      _vfMicCtx.sampleRate)`). `window._vfRec` being still `true` does
      NOT guarantee `_vfMicCtx` is still non-null by the time a specific
      queued/in-flight `onaudioprocess` invocation actually runs — a
      `ScriptProcessorNode` callback can still fire once more in the
      narrow window right as a call ends, even after `disconnect()`/
      context-close begins. Added `if(!_vfMicCtx)return;` right after
      the existing three guards, before touching `input` or anything
      else.
    - **Every remaining `_vfMicCtx.xxx` reference in the file was
      individually checked via a small Python scan (not just grepped
      and assumed), each confirmed one of: (a) already guarded with
      `_vfMicCtx&&`, (b) inside the `onstatechange` handler which reads
      `event.target` per §57's fix, (c) part of the same unbroken
      synchronous setup block starting at `_vfMicCtx=new(...)` with no
      `await`/async gap before it (mic-context creation → source →
      processor → connect, all synchronous), or (d) the new guard added
      here.** No further changes were needed beyond the one gap above —
      if a *third* report of this same error class comes in, the next
      place to look is whether some new code path introduces an
      `await`/async gap into that previously-all-synchronous mic setup
      block, since that's the one structural assumption this whole
      analysis rests on.
59. **Comprehensive Student Progress Savings & Next Session Continuity
    System — mastered vocabulary persistence, session-end cloud sync
    guarantees, and smart lesson progression.**
    - **Mastered Vocabulary Architecture (`se_mastered_words`)**:
      Added persistent list of graduated vocabulary (`getMasteredWords()`,
      `saveMasteredWords()`, `addMasteredWord()`). When a struggle word is
      mastered (via Alexa's "صارت متقنة" recognition or review drill), it
      is removed from `se_struggle_words`, added to `se_mastered_words`,
      and increments `se_words_mastered_lifetime`.
    - **Cloud Persistence & Non-Destructive Merge (`Supabase`)**:
      `seSyncProgressToCloud()` now syncs `mastered_words`,
      `words_mastered_lifetime`, `words_ever_struggled`, `last_position`,
      and `streak` alongside `xp`, `completed_lessons`, `badges`, and
      `struggle_words`. Includes an automatic fallback to base fields
      if remote schema lacks optional columns. `seFetchAndMergeCloudProgress()`
      performs a non-destructive union and max-reconciliation across all
      vocabulary and lesson progress fields.
    - **Session-End Cloud Sync Guarantee**:
      `vfStop()` now unconditionally triggers `seSyncProgressToCloud()`
      and `syncDashboardData(userId, 'save')` at call termination, ensuring
      that all accumulated voice seconds, scenario counts, mastered words,
      and lesson completions are immediately saved to the database.
    - **Smart Next-Session Continuity**:
      `continueCurrentLesson()` now checks whether the last saved lesson
      is already completed — if so, it automatically advances to the next
      uncompleted lesson (`getNextLesson()`, Lesson $N+1$), opening the
      proper zone, updating breadcrumbs, and pre-loading Alexa with the
      new lesson's target vocabulary and learning objective.
60. **Client-side barge-in audit — hard-cut instead of fade, and a
    pre-roll buffer too small for its own debounce window
    (`js/app.js`, live in the mic's `onaudioprocess` callback).**
    - **Note on numbering**: `js/app.js`'s own comments already refer to
      "§60's duration-debounced barge-in gate" and later §64/§66 for the
      mode-aware policy that was subsequently reversed back to universal
      — none of that history was ever actually written into this file
      (a pre-existing doc/code sync gap, not something introduced here).
      This entry reuses the next free number in *this list*; it does not
      claim to be the original §60 the code comments point to. Worth a
      dedicated pass later to backfill §60/§64/§66 properly from
      that history if it's ever needed — out of scope for this fix.
    - **Bug 1 — wrong stop function on the local detection path**: when
      the amplitude-gated barge-in fires (the immediate, client-side
      "the student is talking over Alexa" detection, not the later
      server-confirmed `case 'interrupted'` message), it called
      `vfStopPlayback()` — an instant hard cut of the playback queue,
      audible as a click/pop. `vfFadeOutAndStopPlayback()` already
      existed, already documented in its own comment as being *written
      specifically for natural barge-in*, and was already correctly
      wired into the server-confirmed `case 'interrupted'` path a few
      hundred lines below — just never connected to this, the actual
      first-reaction path a genuine local interruption takes. Fixed by
      calling the fade function at that call site instead.
    - **Bug 2 — pre-roll buffer capacity smaller than the onset window
      it exists to cover**: on detecting sustained loud audio while
      Alexa is speaking, the onset must hold for a debounced ~300ms
      before barge-in actually fires (deliberate — rejects filler-word
      false positives, value not touched here). The buffer meant to
      recover that pre-onset audio for the server capped at 3 chunks of
      4096 samples each — at a common 48kHz mic sample rate that's
      ~85ms/chunk, so ~3.4 chunks span the 300ms window by the time
      onset fires, one more than a cap of 3 could ever hold. The oldest
      slice of the student's own interrupting speech (roughly the first
      45-100ms of it) was being silently evicted before ever reaching
      the flush, heard as their interruption getting clipped at the
      start. Raised the cap to 5 for margin across sample-rate/buffer-
      timing variance; the 300ms debounce and 0.08 amplitude threshold
      are both left exactly as tuned.
    - Neither fix touches the debounce duration, the amplitude
      threshold, the full-duplex mic-always-streaming design, or the
      mode-universal barge-in policy — all four were confirmed correct
      by inspection and left alone.

---

## 10. Mandatory validation before considering any change complete

Run **all** of these, every time, on both files:
```bash
node --check server.js
# For index.html: extract every <script> block and node --check each one
# Tag-balance check (Python html.parser depth-tracking — regex alone is unreliable)
grep -c '<div class="lesson-card"' index.html        # must be 36
grep -o 'id="lesson-[0-9]*"' index.html | sort | uniq -d   # must be empty
grep -o 'id="quiz-[0-9]*"' index.html | sort | uniq -d     # must be empty
grep -c "toggleZone('zone-" index.html                # must be 6 as of the index-3.html baseline (§26) — 3 landing-page "Explore Month N" shortcuts + 3 in-dashboard zone headers; was 3 before that merge, don't assume the old number without checking
grep -c "toggleGate('gate1')\|toggleGate('gate2')\|toggleGate('gate3')" index.html  # must be 3 — zone count alone does NOT catch a missing gate
python3 -c "
import re
c = open('index.html', encoding='utf-8').read()
ref = set(re.findall(r\"getElementById\(['\\\"]([a-zA-Z0-9_-]+)['\\\"]\)\", c))
act = set(re.findall(r'id=[\"\\']([a-zA-Z0-9_-]+)[\"\\']', c))
print(ref - act)  # must print set() — a non-empty result is a dead reference (see §9.19)
"
```
Plus the onclick-exposure check in §9.1 whenever a new inline handler is
added. **Plus the quiz-options/explanation cross-check in §9.16 whenever
any lesson quiz's `options`/`correct` in the `QUIZ_DATA`-style object
(search `'quiz-NN':`) is added or edited** — the hardcoded `<strong>✅...`
explanation text in that quiz's HTML is the ground truth for what the
correct answer should actually say; the `options` array's `correct`-index
entry must match it. A quick spot check:
```
python3 -c "
import re
c = open('index.html', encoding='utf-8').read()
m = re.search(r\"'quiz-16':\s*\{\s*options:\s*(\[.*?\]),\s*correct:\s*(\d+)\", c)
opts = eval(m.group(1)); print(opts[int(m.group(2))])
# then compare by eye against the qa-16 <strong>✅...</strong> text
"
```
(swap the quiz id to whichever was touched). **Plus the
HTML-comment-balance check in §9.13 whenever any HTML
comment was added or edited** — tag-balance checking alone does not catch
a `<!--` closed with `*/` instead of `-->`, and that exact mistake once
silently swallowed ~69,000 characters (including the entire `<style>`
block) with zero console error. **Plus the quote-collision check in
§9.15 whenever any `speak(...)`/inline-`onclick`-with-a-JS-string call is
added or edited** — this class of bug is invisible to the `<script>`-block
`node --check` step entirely, since inline attribute JS is never
extracted or checked by it; it once broke 8 real lesson cards' audio
(and threw a real browser SyntaxError) silently. Never mark a task done
on "it looks right" alone — every entry in this checklist has caught a
real regression in this codebase's history.
