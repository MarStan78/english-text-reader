# TTS Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single static HTML page where a user pastes English text, picks British or American English, and hears it read aloud via the browser's built-in Web Speech API — free, no backend, no API keys, deployable on GitHub Pages.

**Architecture:** Everything lives in one file, `index.html` (HTML + CSS + JS inline), built up incrementally task by task. No build step, no external dependencies, no separate JS files. Each task adds working, manually-verified behavior directly to that one file.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript (ES2017+), Web Speech API (`speechSynthesis`, `SpeechSynthesisUtterance`).

## Global Constraints

- Must work for free with no signup, no API keys, no backend (per spec).
- Single static file (`index.html`) deployable to GitHub Pages — no build step, no external dependencies.
- Default accent on load: British (`en-GB`) per spec.
- Only these controls: text input, accent choice (British/American), Play, Pause, Stop. No speed control, no voice-gender picker, no word highlighting (explicitly out of scope per spec).
- Testing strategy per spec: manual verification in Chrome and Edge after each task — no automated test framework, no extra files.

---

### Task 1: Walking skeleton — page with working Play (British only)

**Files:**
- Create: `index.html`

**Interfaces:**
- Produces: a loadable page (`file://` or GitHub Pages) with a textarea and a Play button that speaks the pasted text in British English.

- [ ] **Step 1: Create index.html with markup, styling, and Play wiring**

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>English Text Reader</title>
<style>
  :root {
    --bg: #f7f7f5;
    --panel: #ffffff;
    --text: #1f1f1f;
    --muted: #6b6b6b;
    --accent: #2563eb;
    --border: #d9d9d6;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    padding: 32px 16px;
  }
  main {
    max-width: 720px;
    margin: 0 auto;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 28px;
  }
  h1 {
    font-size: 1.6rem;
    margin: 0 0 20px;
  }
  textarea {
    width: 100%;
    min-height: 200px;
    font-size: 1.05rem;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-family: inherit;
    resize: vertical;
  }
  .controls {
    display: flex;
    gap: 10px;
    margin-top: 16px;
  }
  button {
    font-size: 1rem;
    padding: 10px 20px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--accent);
    color: white;
    cursor: pointer;
  }
  #status {
    margin-top: 14px;
    color: var(--muted);
    min-height: 1.2em;
  }
</style>
</head>
<body>
<main>
  <h1>English Text Reader</h1>
  <textarea id="text" placeholder="Paste English text here..."></textarea>

  <div class="controls">
    <button id="playBtn">Play</button>
  </div>

  <div id="status"></div>
</main>

<script>
  var textEl = document.getElementById('text');
  var playBtn = document.getElementById('playBtn');
  var statusEl = document.getElementById('status');

  function pickVoice(voices, lang) {
    var exact = voices.find(function (v) { return v.lang === lang; });
    if (exact) return exact;
    var prefix = lang.split('-')[0];
    var partial = voices.find(function (v) { return v.lang.indexOf(prefix) === 0; });
    return partial || null;
  }

  playBtn.addEventListener('click', function () {
    var text = textEl.value.trim();
    if (!text) return;
    var lang = 'en-GB';
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    var voices = speechSynthesis.getVoices();
    var voice = pickVoice(voices, lang);
    if (voice) utterance.voice = voice;
    speechSynthesis.speak(utterance);
    statusEl.textContent = 'Reading...';
  });
</script>
</body>
</html>
```

- [ ] **Step 2: Manually verify in a browser**

Open `index.html` directly in Chrome or Edge (double-click the file, or `start index.html` on Windows).
- Paste a short English sentence into the textarea.
- Click **Play** — expect to hear speech in a British-sounding voice and see "Reading..." status.
- Check DevTools Console — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add walking-skeleton page with working British-English Play"
```

---

### Task 2: Accent selection (British / American)

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `pickVoice` (Task 1, unchanged)
- Produces: user-selectable accent that changes which voice is used

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

- [ ] **Step 3: Wire accent selection into the Play handler**

In the `<script>` block, replace:

```js
  playBtn.addEventListener('click', function () {
    var text = textEl.value.trim();
    if (!text) return;
    var lang = 'en-GB';
    var utterance = new SpeechSynthesisUtterance(text);
```

with:

```js
  function getSelectedAccent() {
    return document.querySelector('input[name="accent"]:checked').value;
  }

  function accentToLang(accent) {
    return accent === 'american' ? 'en-US' : 'en-GB';
  }

  playBtn.addEventListener('click', function () {
    var text = textEl.value.trim();
    if (!text) return;
    var lang = accentToLang(getSelectedAccent());
    var utterance = new SpeechSynthesisUtterance(text);
```

(The rest of the handler after that line stays exactly as it was in Task 1.)

- [ ] **Step 4: Manually verify in a browser**

Open `index.html` in Chrome or Edge.
- With "British English" selected (default), paste text and click Play — expect a British-sounding voice.
- Reload the page, select "American English", click Play — expect an American-sounding voice.
- Check DevTools Console — expect no errors.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add British/American accent selection"
```

---

### Task 3: Pause and Stop with button-state management

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `accentToLang`, `pickVoice`, `getSelectedAccent` (Task 2, unchanged)
- Produces: fully working Play/Pause/Stop cycle with correct button enable/disable state

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

In `index.html`, replace the entire `<script>...</script>` block with:

```html
<script>
  var textEl = document.getElementById('text');
  var playBtn = document.getElementById('playBtn');
  var pauseBtn = document.getElementById('pauseBtn');
  var stopBtn = document.getElementById('stopBtn');
  var statusEl = document.getElementById('status');

  var isSpeaking = false;
  var isPaused = false;

  function pickVoice(voices, lang) {
    var exact = voices.find(function (v) { return v.lang === lang; });
    if (exact) return exact;
    var prefix = lang.split('-')[0];
    var partial = voices.find(function (v) { return v.lang.indexOf(prefix) === 0; });
    return partial || null;
  }

  function getSelectedAccent() {
    return document.querySelector('input[name="accent"]:checked').value;
  }

  function accentToLang(accent) {
    return accent === 'american' ? 'en-US' : 'en-GB';
  }

  function hasText() {
    return textEl.value.trim().length > 0;
  }

  function refreshButtons() {
    if (isPaused) {
      playBtn.disabled = false;
      playBtn.textContent = 'Resume';
      pauseBtn.disabled = true;
      stopBtn.disabled = false;
    } else if (isSpeaking) {
      playBtn.disabled = true;
      playBtn.textContent = 'Play';
      pauseBtn.disabled = false;
      stopBtn.disabled = false;
    } else {
      playBtn.disabled = !hasText();
      playBtn.textContent = 'Play';
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
    }
  }

  textEl.addEventListener('input', refreshButtons);

  playBtn.addEventListener('click', function () {
    if (isPaused) {
      speechSynthesis.resume();
      isPaused = false;
      isSpeaking = true;
      statusEl.textContent = 'Reading...';
      refreshButtons();
      return;
    }

    var text = textEl.value.trim();
    if (!text) return;

    var lang = accentToLang(getSelectedAccent());
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    var voices = speechSynthesis.getVoices();
    var voice = pickVoice(voices, lang);
    if (voice) utterance.voice = voice;

    utterance.addEventListener('end', function () {
      isSpeaking = false;
      isPaused = false;
      statusEl.textContent = 'Finished.';
      refreshButtons();
    });

    speechSynthesis.speak(utterance);
    isSpeaking = true;
    isPaused = false;
    statusEl.textContent = 'Reading...';
    refreshButtons();
  });

  pauseBtn.addEventListener('click', function () {
    speechSynthesis.pause();
    isPaused = true;
    isSpeaking = false;
    statusEl.textContent = 'Paused.';
    refreshButtons();
  });

  stopBtn.addEventListener('click', function () {
    speechSynthesis.cancel();
    isSpeaking = false;
    isPaused = false;
    statusEl.textContent = '';
    refreshButtons();
  });

  refreshButtons();
</script>
```

- [ ] **Step 4: Manually verify in a browser**

Open `index.html` in Chrome or Edge.
- With empty textarea: confirm **Play** is disabled, **Pause**/**Stop** disabled.
- Paste text: confirm **Play** becomes enabled.
- Click **Play**: confirm **Play** disables, **Pause**/**Stop** enable, speech plays, status shows "Reading...".
- Click **Pause** mid-speech: confirm speech pauses, **Play** re-enables and shows "Resume", **Pause** disables.
- Click **Play** (now "Resume"): confirm speech resumes from where it paused.
- Click **Stop**: confirm speech stops immediately, buttons return to idle state, status clears.
- Let speech play to natural completion: confirm status shows "Finished." and buttons return to idle state.
- Check DevTools Console — expect no errors.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: wire Pause/Stop with full button-state management"
```

---

### Task 4: Unsupported-browser and no-matching-voice handling

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `pickVoice` return value of `null` as the no-match signal (Task 3, unchanged)
- Produces: visible warning messages for the two edge cases named in the spec

- [ ] **Step 1: Add a feature-detection check at the top of the script**

In `index.html`, add this block as the **first lines** inside the `<script>` block (before `var textEl = ...`):

```js
  if (!('speechSynthesis' in window)) {
    document.querySelector('main').innerHTML =
      '<h1>English Text Reader</h1>' +
      '<p>Your browser does not support text-to-speech. Please try Chrome or Edge.</p>';
    throw new Error('Web Speech API not supported');
  }
```

- [ ] **Step 2: Add a fallback-voice warning inside the Play handler**

In the same script, inside the `playBtn` click handler, find:

```js
    var voice = pickVoice(voices, lang);
    if (voice) utterance.voice = voice;
```

Replace it with:

```js
    var voice = pickVoice(voices, lang);
    if (voice) {
      utterance.voice = voice;
    } else {
      statusEl.textContent = 'No ' + (lang === 'en-GB' ? 'British' : 'American') +
        ' English voice found on this system — using the default voice instead.';
    }
```

- [ ] **Step 3: Manually verify in a browser**

Open `index.html` in Chrome or Edge:
- Confirm the page loads normally (feature-detection check does not block supported browsers).
- Paste text and click Play as in Task 3 — confirm the normal "Reading..." status still appears (the fallback message only shows when `pickVoice` returns `null`, which will not happen on Chrome/Edge with standard English voices installed).
- Open DevTools Console and manually confirm the fallback branch's logic by running:
  `pickVoice([{lang:'de-DE'}], 'en-GB')` — expect `null` to be returned, confirming the condition that triggers the fallback message is reachable.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: handle unsupported browsers and missing-voice fallback"
```

---

### Task 5: README and final polish pass

**Files:**
- Create: `README.md`
- Modify: `index.html` (only if the regression pass in Step 2 finds issues)

**Interfaces:**
- Consumes: nothing new
- Produces: a documented project ready to push to GitHub and enable Pages on

- [ ] **Step 1: Create README.md**

Create `README.md`:

```markdown
# English Text Reader

Paste English text, pick British or American English, click Play — the
browser reads it aloud. Free, no sign-up, no backend.

## How it works

Uses the browser's built-in Web Speech API (`speechSynthesis`). Works best
in Chrome or Edge, which ship with both British and American English
voices. Single HTML file, no build step, no dependencies.

## Run locally

Open `index.html` directly in a browser (double-click it, or `start
index.html` on Windows).

## Deploy

Push this repository to GitHub and enable GitHub Pages (Settings → Pages →
deploy from the `main` branch, root folder). `index.html` is the entry
point.
```

- [ ] **Step 2: Full manual regression pass in a browser**

Open `index.html` in Chrome or Edge and walk through the complete flow end-to-end:
1. Page loads with British selected by default, Play disabled (empty text).
2. Paste 2-3 sentences of English text.
3. Play (British) → hear speech, Pause → resume via Play → Stop.
4. Switch to American, Play → hear speech in the American voice.
5. Let it finish naturally → status shows "Finished.", buttons reset.

If any step behaves incorrectly, fix it in `index.html` before proceeding.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with usage and deployment instructions"
```

---

## Post-plan (not part of this plan, requires user action)

Pushing this repository to a GitHub remote and enabling GitHub Pages
requires creating/choosing a GitHub repository and pushing to it — a
user-visible, shared action. Confirm with the user before running `git
remote add` / `git push` for this project.
