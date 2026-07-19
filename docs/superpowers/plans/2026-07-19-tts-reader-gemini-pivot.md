# TTS Reader — Gemini TTS Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Supersedes:** `docs/superpowers/plans/2026-07-19-tts-reader.md`. That plan's
> Task 1 (British-only Play via `speechSynthesis`) was implemented and
> committed, then rejected by the user after listening — browser TTS voices
> sounded too mechanical. This plan replaces the Web Speech API approach with
> Gemini TTS behind a Cloudflare Worker proxy, per the revised spec at
> `docs/superpowers/specs/2026-07-19-tts-reader-design.md`. Tasks 2-5 of the
> old plan are not executed; this plan's tasks replace them.

**Goal:** Replace the Web Speech API prototype with Gemini TTS (natural-sounding voices) called through a Cloudflare Worker proxy that holds the API key, so the static frontend never exposes a secret.

**Architecture:** Two components. (1) `index.html` — unchanged single-file frontend approach (HTML+CSS+JS inline), but the Play handler now calls the proxy instead of `speechSynthesis`, and audio plays through an `<audio>` element built from a WAV blob. (2) `worker/worker.js` — a Cloudflare Worker that receives `{text, accent}`, builds an accent-flavored prompt, calls the Gemini API, and returns base64 PCM audio. The worker's prompt-building logic is a pure, exported function covered by Node's built-in test runner; the Gemini network call itself and the frontend's audio playback are verified manually (per spec) since they require a real API key / real browser audio.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript (frontend); Cloudflare Workers (proxy, ES modules); Gemini API (`gemini-2.5-flash-preview-tts` model, REST `generateContent` endpoint); Node's built-in `node:test` for the worker's pure-logic unit tests only.

## Global Constraints

- Must work for free: Gemini API free tier + Cloudflare Workers free tier. No paid services.
- The Gemini API key is a secret. It must never appear in `index.html`, in any committed file, or in git history. It is set as a Cloudflare Worker secret (`wrangler secret put`) by the user outside of this plan's automated steps.
- Frontend stays a single static file (`index.html`, HTML+CSS+JS inline) deployable to GitHub Pages — per spec, this constraint applies to the frontend component specifically, not the worker.
- Default accent on load: British, mapped to the prompt instruction `"Read the following text aloud in a natural British English accent:"`; American maps to `"Read the following text aloud in a natural American English accent:"`.
- Fixed voice for both accents: Gemini prebuilt voice `Kore`.
- Model: `gemini-2.5-flash-preview-tts`. Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent`, API key sent via the `x-goog-api-key` header (never as a URL query parameter, to avoid it appearing in logs).
- Audio returned by Gemini is raw 16-bit PCM, mono, 24000 Hz sample rate — the frontend must wrap it in a WAV header before handing it to an `<audio>` element.
- Only these controls: text input, accent choice (British/American), Play, Pause, Stop. No speed control, no voice picker beyond the fixed `Kore` voice, no word highlighting, no audio caching (all per spec's YAGNI section).
- Testing strategy: the worker's pure `buildPrompt` function is unit tested with `node:test` (no dependencies, no build step). Everything else (the live Gemini call, the frontend, audio playback) is verified manually in Chrome/Edge per spec — no browser test framework, no mocking of `fetch`.

---

### Task 1: Worker — pure prompt-building logic with unit tests

**Files:**
- Create: `worker/worker.js` (only the `buildPrompt` export in this task — the fetch handler is added in Task 2)
- Create: `worker/worker.test.js`
- Create: `worker/package.json`

**Interfaces:**
- Produces: `buildPrompt(text: string, accent: 'british'|'american') -> string` — the exact string sent to Gemini as the prompt.
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

Create `worker/worker.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from './worker.js';

test('buildPrompt uses the British instruction by default accent value', () => {
  const result = buildPrompt('Hello there.', 'british');
  assert.match(result, /Read the following text aloud in a natural British English accent:/);
});

test('buildPrompt uses the American instruction for american accent', () => {
  const result = buildPrompt('Hello there.', 'american');
  assert.match(result, /Read the following text aloud in a natural American English accent:/);
});

test('buildPrompt treats any non-"american" value as British', () => {
  const result = buildPrompt('Hello there.', 'nonsense');
  assert.match(result, /British English accent/);
});

test('buildPrompt includes the original text unmodified after the instruction', () => {
  const result = buildPrompt('Line one.\nLine two.', 'british');
  assert.match(result, /Line one\.\nLine two\.$/);
});
```

- [ ] **Step 2: Create package.json so Node treats worker/*.js as ES modules**

Create `worker/package.json`:

```json
{
  "name": "tts-reader-worker",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test worker/worker.test.js`
Expected: FAIL — `Cannot find module './worker.js'` or similar (file doesn't exist yet)

- [ ] **Step 4: Write the minimal implementation**

Create `worker/worker.js`:

```js
export function buildPrompt(text, accent) {
  const instruction = accent === 'american'
    ? 'Read the following text aloud in a natural American English accent:'
    : 'Read the following text aloud in a natural British English accent:';
  return instruction + '\n\n' + text;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test worker/worker.test.js`
Expected: PASS — all 4 tests green

- [ ] **Step 6: Commit**

```bash
git add worker/worker.js worker/worker.test.js worker/package.json
git commit -m "feat(worker): add pure prompt-building logic with unit tests"
```

---

### Task 2: Worker — Cloudflare Worker fetch handler calling Gemini API

**Files:**
- Modify: `worker/worker.js` (add the default export fetch handler; `buildPrompt` from Task 1 stays unchanged)
- Create: `worker/wrangler.toml`

**Interfaces:**
- Consumes: `buildPrompt(text, accent)` from Task 1 (unchanged signature)
- Consumes: `env.GEMINI_API_KEY` — a Cloudflare Worker secret, not present in any file in this repo. It is set manually by the user via `wrangler secret put GEMINI_API_KEY` after deployment (documented in Task 7's README).
- Produces: an HTTP endpoint. `POST /` with body `{"text": string, "accent": "british"|"american"}` returns `200 {"audioBase64": string, "mimeType": string}` on success, or a JSON `{"error": string}` with a 4xx/5xx status on failure.

- [ ] **Step 1: Add the fetch handler to worker.js**

Append to `worker/worker.js` (after the existing `buildPrompt` function — do not modify `buildPrompt`):

```js
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders()),
  });
}

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const accent = body.accent === 'american' ? 'american' : 'british';

    if (!text) {
      return jsonResponse({ error: 'text is required' }, 400);
    }

    const prompt = buildPrompt(text, accent);

    let geminiResponse;
    try {
      geminiResponse = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
          },
        }),
      });
    } catch (e) {
      return jsonResponse({ error: 'Failed to reach Gemini API' }, 502);
    }

    if (!geminiResponse.ok) {
      return jsonResponse({ error: 'Gemini API error', status: geminiResponse.status }, 502);
    }

    const geminiData = await geminiResponse.json();
    const candidate = geminiData && geminiData.candidates && geminiData.candidates[0];
    const part = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];
    const inlineData = part && part.inlineData;

    if (!inlineData || !inlineData.data) {
      return jsonResponse({ error: 'Gemini API returned no audio' }, 502);
    }

    return jsonResponse({
      audioBase64: inlineData.data,
      mimeType: inlineData.mimeType || 'audio/L16;codec=pcm;rate=24000',
    }, 200);
  },
};
```

- [ ] **Step 2: Create the Wrangler config**

Create `worker/wrangler.toml`:

```toml
name = "tts-reader-proxy"
main = "worker.js"
compatibility_date = "2026-07-19"
```

- [ ] **Step 3: Re-run the Task 1 unit tests to confirm buildPrompt still passes unchanged**

Run: `node --test worker/worker.test.js`
Expected: PASS — all 4 tests still green (this task only appended code after `buildPrompt`, it did not modify it)

- [ ] **Step 4: Static verification (no live API key available in this environment)**

This task cannot be verified end-to-end without a real `GEMINI_API_KEY`, which is a user secret never available to the implementer. Instead:
- Re-read the fetch handler and confirm the request JSON exactly matches the Global Constraints section (endpoint URL, `x-goog-api-key` header, `contents`/`generationConfig`/`responseModalities`/`speechConfig`/`voiceConfig`/`prebuiltVoiceConfig`/`voiceName` field names and nesting).
- Confirm every code path returns a `Response` (no unhandled promise rejection, no missing return).
- Confirm CORS headers are present on every response, including error responses and the `OPTIONS` preflight response.
- Note in your report that live deployment and a real end-to-end call are deferred to Task 7 (README) as a manual user step, since they require the user's own Cloudflare account and API key.

- [ ] **Step 5: Commit**

```bash
git add worker/worker.js worker/wrangler.toml
git commit -m "feat(worker): add Gemini TTS fetch handler with CORS and error handling"
```

---

### Task 3: Frontend — replace Web Speech API Play with Gemini-backed Play (British only)

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: the worker's HTTP contract from Task 2: `POST {PROXY_URL}` with `{"text": string, "accent": "british"|"american"}`, response `{"audioBase64": string, "mimeType": string}`.
- Produces: a page where clicking Play sends British-accented text to the proxy and plays the returned audio through an `<audio>` element.

This task **replaces** the existing `speechSynthesis`-based script in `index.html` (from the superseded plan's Task 1) with the Gemini-backed pipeline. The `<textarea>`, `Play` button, and `#status` div markup stay as they are; only the `<script>` block changes.

- [ ] **Step 1: Replace the script block in index.html**

Replace the entire existing `<script>...</script>` block in `index.html` with:

```html
<script>
  var PROXY_URL = 'https://REPLACE-WITH-YOUR-WORKER-URL.workers.dev';

  var textEl = document.getElementById('text');
  var playBtn = document.getElementById('playBtn');
  var statusEl = document.getElementById('status');
  var audioEl = new Audio();

  function base64ToBytes(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function parseSampleRate(mimeType) {
    var match = /rate=(\d+)/.exec(mimeType || '');
    return match ? parseInt(match[1], 10) : 24000;
  }

  function pcmBytesToWavBytes(pcmBytes, sampleRate) {
    var numChannels = 1;
    var bitsPerSample = 16;
    var byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    var blockAlign = numChannels * (bitsPerSample / 8);
    var dataSize = pcmBytes.length;
    var buffer = new ArrayBuffer(44 + dataSize);
    var view = new DataView(buffer);

    function writeString(offset, str) {
      for (var i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    var wavBytes = new Uint8Array(buffer);
    wavBytes.set(pcmBytes, 44);
    return wavBytes;
  }

  playBtn.addEventListener('click', function () {
    var text = textEl.value.trim();
    if (!text) return;

    statusEl.textContent = 'Generowanie głosu...';
    playBtn.disabled = true;

    fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, accent: 'british' }),
    })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        var pcmBytes = base64ToBytes(data.audioBase64);
        var sampleRate = parseSampleRate(data.mimeType);
        var wavBytes = pcmBytesToWavBytes(pcmBytes, sampleRate);
        var blob = new Blob([wavBytes], { type: 'audio/wav' });
        audioEl.src = URL.createObjectURL(blob);
        statusEl.textContent = 'Czytanie...';
        playBtn.disabled = false;
        audioEl.play();
      });
  });
</script>
```

- [ ] **Step 2: Manually verify the WAV-building logic in DevTools before wiring to a real deployment**

Open `index.html` in Chrome or Edge. Open DevTools Console and run:

```js
var testBytes = new Uint8Array([1, 2, 3, 4]);
var wav = pcmBytesToWavBytes(testBytes, 24000);
console.log(wav.length); // expect 48 (44-byte header + 4 data bytes)
console.log(String.fromCharCode(wav[0], wav[1], wav[2], wav[3])); // expect "RIFF"
console.log(String.fromCharCode(wav[8], wav[9], wav[10], wav[11])); // expect "WAVE"
```

Expected: `48`, `"RIFF"`, `"WAVE"` printed with no errors.

- [ ] **Step 3: Note the deployment dependency**

This task's Play button will not produce audio yet because `PROXY_URL` is a placeholder and no worker is deployed. That is expected — full end-to-end audio playback is verified in Task 7 after the user deploys the worker (Task 2's output) and replaces `PROXY_URL`. Confirm in your report that clicking Play with the placeholder URL fails gracefully (browser shows a network error in the console; the page does not crash) rather than throwing an uncaught exception that breaks the page.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(frontend): replace speechSynthesis Play with Gemini-proxy-backed Play"
```

---

### Task 4: Frontend — accent selection wired to the proxy request

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: the script block from Task 3 (unchanged except where noted below)
- Produces: user-selectable accent (British/American) that changes the `accent` field sent to the proxy

- [ ] **Step 1: Add the accent radio buttons to the markup**

In `index.html`, insert this block between the `<textarea>` and the `<div class="controls">`:

```html
  <div class="accent-choice">
    <label><input type="radio" name="accent" value="british" checked> British English</label>
    <label><input type="radio" name="accent" value="american"> American English</label>
  </div>
```

- [ ] **Step 2: Add matching CSS**

In the `<style>` block, add this rule after the `textarea` rule:

```css
  .accent-choice {
    display: flex;
    gap: 20px;
    margin: 16px 0;
  }
  .accent-choice label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
```

- [ ] **Step 3: Wire the selected accent into the fetch call**

In the `<script>` block, add this function right before `playBtn.addEventListener('click', ...)`:

```js
  function getSelectedAccent() {
    return document.querySelector('input[name="accent"]:checked').value;
  }
```

Then, inside the `playBtn` click handler, replace:

```js
      body: JSON.stringify({ text: text, accent: 'british' }),
```

with:

```js
      body: JSON.stringify({ text: text, accent: getSelectedAccent() }),
```

- [ ] **Step 4: Manually verify in a browser**

Open `index.html` in Chrome or Edge.
- Confirm "British English" is selected by default.
- Select "American English", open DevTools → Network tab, click Play, inspect the outgoing request body — confirm it contains `"accent":"american"`.
- Switch back to British, click Play, confirm the request body contains `"accent":"british"`.

(The request will still fail to return audio at this point, since `PROXY_URL` remains a placeholder until Task 7 — that failure is expected and unrelated to this task.)

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(frontend): add British/American accent selection"
```

---

### Task 5: Frontend — Pause/Stop/Resume via the audio element with button-state management

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `audioEl` (the shared `Audio` instance from Task 3), `getSelectedAccent()` (Task 4)
- Produces: fully working Play/Pause/Stop/Resume cycle with correct button enable/disable state and status text

- [ ] **Step 1: Add Pause and Stop buttons to the markup**

In `index.html`, replace:

```html
  <div class="controls">
    <button id="playBtn">Play</button>
  </div>
```

with:

```html
  <div class="controls">
    <button id="playBtn" disabled>Play</button>
    <button id="pauseBtn" disabled>Pause</button>
    <button id="stopBtn" disabled>Stop</button>
  </div>
```

- [ ] **Step 2: Add disabled-button CSS**

In the `<style>` block, add this rule after the `button` rule:

```css
  button:disabled {
    background: #b9c6e6;
    cursor: not-allowed;
  }
```

- [ ] **Step 3: Replace the script block with full state management**

Replace the entire `<script>...</script>` block (the one built up across Tasks 3-4) with:

```html
<script>
  var PROXY_URL = 'https://REPLACE-WITH-YOUR-WORKER-URL.workers.dev';

  var textEl = document.getElementById('text');
  var playBtn = document.getElementById('playBtn');
  var pauseBtn = document.getElementById('pauseBtn');
  var stopBtn = document.getElementById('stopBtn');
  var statusEl = document.getElementById('status');
  var audioEl = new Audio();

  var appState = 'idle'; // 'idle' | 'loading' | 'playing' | 'paused'

  function base64ToBytes(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function parseSampleRate(mimeType) {
    var match = /rate=(\d+)/.exec(mimeType || '');
    return match ? parseInt(match[1], 10) : 24000;
  }

  function pcmBytesToWavBytes(pcmBytes, sampleRate) {
    var numChannels = 1;
    var bitsPerSample = 16;
    var byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    var blockAlign = numChannels * (bitsPerSample / 8);
    var dataSize = pcmBytes.length;
    var buffer = new ArrayBuffer(44 + dataSize);
    var view = new DataView(buffer);

    function writeString(offset, str) {
      for (var i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    var wavBytes = new Uint8Array(buffer);
    wavBytes.set(pcmBytes, 44);
    return wavBytes;
  }

  function getSelectedAccent() {
    return document.querySelector('input[name="accent"]:checked').value;
  }

  function hasText() {
    return textEl.value.trim().length > 0;
  }

  function refreshButtons() {
    if (appState === 'loading') {
      playBtn.disabled = true;
      playBtn.textContent = 'Play';
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
    } else if (appState === 'playing') {
      playBtn.disabled = true;
      playBtn.textContent = 'Play';
      pauseBtn.disabled = false;
      stopBtn.disabled = false;
    } else if (appState === 'paused') {
      playBtn.disabled = false;
      playBtn.textContent = 'Resume';
      pauseBtn.disabled = true;
      stopBtn.disabled = false;
    } else {
      playBtn.disabled = !hasText();
      playBtn.textContent = 'Play';
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
    }
  }

  textEl.addEventListener('input', refreshButtons);

  audioEl.addEventListener('ended', function () {
    appState = 'idle';
    statusEl.textContent = 'Zakończono.';
    refreshButtons();
  });

  playBtn.addEventListener('click', function () {
    if (appState === 'paused') {
      audioEl.play();
      appState = 'playing';
      statusEl.textContent = 'Czytanie...';
      refreshButtons();
      return;
    }

    var text = textEl.value.trim();
    if (!text) return;

    appState = 'loading';
    statusEl.textContent = 'Generowanie głosu...';
    refreshButtons();

    fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, accent: getSelectedAccent() }),
    })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        var pcmBytes = base64ToBytes(data.audioBase64);
        var sampleRate = parseSampleRate(data.mimeType);
        var wavBytes = pcmBytesToWavBytes(pcmBytes, sampleRate);
        var blob = new Blob([wavBytes], { type: 'audio/wav' });
        audioEl.src = URL.createObjectURL(blob);
        appState = 'playing';
        statusEl.textContent = 'Czytanie...';
        refreshButtons();
        audioEl.play();
      });
  });

  pauseBtn.addEventListener('click', function () {
    audioEl.pause();
    appState = 'paused';
    statusEl.textContent = 'Wstrzymano.';
    refreshButtons();
  });

  stopBtn.addEventListener('click', function () {
    audioEl.pause();
    audioEl.currentTime = 0;
    appState = 'idle';
    statusEl.textContent = '';
    refreshButtons();
  });

  refreshButtons();
</script>
```

- [ ] **Step 4: Manually verify state transitions in a browser**

Open `index.html` in Chrome or Edge (`PROXY_URL` is still a placeholder, so audio won't actually load — this step only verifies button *state*, not audio):
- Empty textarea: **Play** disabled, **Pause**/**Stop** disabled.
- Paste text: **Play** enables.
- Click **Play**: status shows "Generowanie głosu...", all three buttons disabled while `appState === 'loading'` (confirm via DevTools by inspecting `appState` in the console, since the fetch to the placeholder URL will reject/hang rather than complete).
- Manually run `pauseBtn.click()` — not meaningful yet without real audio, but confirm no console errors are thrown by any handler.

Full behavioral verification (real audio pausing/resuming/stopping) happens in Task 7 once `PROXY_URL` points at a real deployment.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(frontend): wire Pause/Stop/Resume with full button-state management"
```

---

### Task 6: Frontend — error handling for proxy/API failures

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: the `fetch(...).then(...)` chain from Task 5
- Produces: visible error messages instead of silent failure or an uncaught promise rejection when the proxy is unreachable or returns an error

- [ ] **Step 1: Add a `.catch` and error-status handling to the fetch chain**

In the `<script>` block, replace the `playBtn` click handler's fetch chain:

```js
    fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, accent: getSelectedAccent() }),
    })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        var pcmBytes = base64ToBytes(data.audioBase64);
        var sampleRate = parseSampleRate(data.mimeType);
        var wavBytes = pcmBytesToWavBytes(pcmBytes, sampleRate);
        var blob = new Blob([wavBytes], { type: 'audio/wav' });
        audioEl.src = URL.createObjectURL(blob);
        appState = 'playing';
        statusEl.textContent = 'Czytanie...';
        refreshButtons();
        audioEl.play();
      });
```

with:

```js
    fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, accent: getSelectedAccent() }),
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.data.audioBase64) {
          appState = 'idle';
          statusEl.textContent = 'Usługa czytania tekstu jest chwilowo niedostępna. Spróbuj ponownie.';
          refreshButtons();
          return;
        }
        var pcmBytes = base64ToBytes(result.data.audioBase64);
        var sampleRate = parseSampleRate(result.data.mimeType);
        var wavBytes = pcmBytesToWavBytes(pcmBytes, sampleRate);
        var blob = new Blob([wavBytes], { type: 'audio/wav' });
        audioEl.src = URL.createObjectURL(blob);
        appState = 'playing';
        statusEl.textContent = 'Czytanie...';
        refreshButtons();
        audioEl.play();
      })
      .catch(function () {
        appState = 'idle';
        statusEl.textContent = 'Nie udało się połączyć z usługą czytania tekstu. Sprawdź połączenie i spróbuj ponownie.';
        refreshButtons();
      });
```

- [ ] **Step 2: Manually verify in a browser**

Open `index.html` in Chrome or Edge (`PROXY_URL` still points at the placeholder, unreachable host — this is exactly the failure case this task handles):
- Paste text, click Play.
- Confirm the status text changes to the "Nie udało się połączyć..." message within a few seconds (network failure against the placeholder host), buttons return to the idle state (**Play** enabled, **Pause**/**Stop** disabled), and no uncaught exception appears in the DevTools Console.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(frontend): handle proxy/API failures with visible error messages"
```

---

### Task 7: Deploy worker, wire PROXY_URL, README, and final end-to-end verification

**Files:**
- Modify: `index.html` (only the `PROXY_URL` value — a human/user step, see Step 1)
- Create: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-6
- Produces: a fully working, deployed system and documentation for reproducing the deployment

- [ ] **Step 1: Deploy the Cloudflare Worker and set the secret (manual user step — requires the user's own Cloudflare and Google AI Studio accounts)**

This step cannot be performed by an implementer subagent — it requires the user's own Cloudflare login and their Gemini API key, neither of which is available in this repo or session. Report this task's implementer dispatch as **NEEDS_CONTEXT** if reached before the human has done the following, and stop:

1. The user installs the Cloudflare CLI (`npm install -g wrangler` or `npx wrangler`) and runs `wrangler login`.
2. From `worker/`, the user runs `wrangler deploy`, which prints the deployed URL (e.g. `https://tts-reader-proxy.<subdomain>.workers.dev`).
3. The user runs `wrangler secret put GEMINI_API_KEY` and pastes their key when prompted (never committed to the repo).
4. The user gives the controller the deployed URL.

- [ ] **Step 2: Update PROXY_URL in index.html with the real deployed URL**

Once the human provides the real Worker URL, replace the placeholder in `index.html`:

```js
  var PROXY_URL = 'https://REPLACE-WITH-YOUR-WORKER-URL.workers.dev';
```

with the actual URL, e.g.:

```js
  var PROXY_URL = 'https://tts-reader-proxy.example.workers.dev';
```

(Use the literal URL the human provided — do not guess or leave a placeholder.)

- [ ] **Step 3: Create README.md**

Create `README.md`:

```markdown
# English Text Reader (Gemini TTS)

Paste English text, pick British or American English, click Play — the
page reads it aloud using Gemini's natural-sounding text-to-speech.

## How it works

Two parts:
- `index.html` — static frontend (GitHub Pages). No secrets inside.
- `worker/` — a Cloudflare Worker that holds the Gemini API key as a
  secret and proxies text-to-speech requests, so the key is never exposed
  to visitors.

## Deploy the worker

1. Install the Cloudflare CLI: `npm install -g wrangler`
2. `wrangler login`
3. From the `worker/` directory: `wrangler deploy`
4. Set your Gemini API key as a secret (get one free at
   [aistudio.google.com](https://aistudio.google.com)):
   `wrangler secret put GEMINI_API_KEY`
5. Copy the deployed URL Wrangler prints and paste it into `index.html` as
   the `PROXY_URL` value.

## Run the frontend locally

Open `index.html` directly in a browser (double-click it, or `start
index.html` on Windows) once `PROXY_URL` points at your deployed worker.

## Deploy the frontend

Push this repository to GitHub and enable GitHub Pages (Settings → Pages →
deploy from the `main` branch, root folder). `index.html` is the entry
point.

## Run the worker's tests

```
node --test worker/worker.test.js
```
```

- [ ] **Step 4: Full manual end-to-end regression pass in a browser**

With the worker deployed and `PROXY_URL` set to the real URL, open `index.html` in Chrome or Edge and walk through the complete flow:
1. Page loads with British selected by default, Play disabled (empty text).
2. Paste 2-3 sentences of English text.
3. Click Play (British) → status shows "Generowanie głosu...", then "Czytanie...", then audible natural-sounding British-accented speech plays.
4. Click Pause mid-playback → audio pauses, status shows "Wstrzymano.", Play button shows "Resume".
5. Click Play (now "Resume") → audio resumes from the paused position.
6. Click Stop → audio stops immediately, status clears, buttons return to idle.
7. Switch to American English, click Play → audible American-accented speech plays.
8. Let audio finish naturally → status shows "Zakończono.", buttons return to idle.
9. Temporarily break `PROXY_URL` (e.g. add a typo) and click Play → confirm the "Nie udało się połączyć..." error message appears; restore the correct URL afterward.

If any step fails, fix it before considering the task complete.

- [ ] **Step 5: Commit**

```bash
git add index.html README.md
git commit -m "feat: wire deployed proxy URL and add README with deployment instructions"
```

---

## Post-plan (not part of this plan, requires user action)

Pushing this repository to a GitHub remote and enabling GitHub Pages
requires creating/choosing a GitHub repository and pushing to it — a
user-visible, shared action. Confirm with the user before running `git
remote add` / `git push` for this project.
