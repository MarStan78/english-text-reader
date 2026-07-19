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

1. Install the Cloudflare CLI: `npm install -g wrangler` (on Windows
   PowerShell, use `npx.cmd wrangler ...` if `npx wrangler` is blocked by
   the script execution policy)
2. `wrangler login`
3. From the `worker/` directory: `wrangler deploy`
4. Set your Gemini API key as a secret (get one free at
   [aistudio.google.com](https://aistudio.google.com)):
   `wrangler secret put GEMINI_API_KEY`
5. After deploying the frontend to GitHub Pages (see below), edit
   `worker/worker.js`'s `ALLOWED_ORIGINS` array to replace the placeholder
   with your real GitHub Pages origin (e.g. `https://username.github.io`),
   then run `wrangler deploy` again from `worker/` to apply it.
6. Copy the deployed URL Wrangler prints and paste it into `index.html` as
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
