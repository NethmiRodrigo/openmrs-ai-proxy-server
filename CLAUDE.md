# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Run in production
npm start

# Run in development (auto-restarts on file changes via nodemon)
npm run dev
```

There are no tests configured. There is no lint script.

## Environment Setup

Copy `.env.example` to `.env` and populate the relevant API key(s). Only the key for the chosen provider needs to be set.

## Architecture

An Express proxy server that sits between an OpenMRS frontend and LLM provider APIs. Its sole purpose is to keep API keys server-side rather than exposing them to the browser.

**Entry point:** `server.js` — app setup, CORS, routing, and startup. Provider logic lives in `providers/`.

```
server.js               ← app setup, CORS, routing, startup
providers/
  utils.js              ← shared throwIfNotOk helper and DEFAULT_TEMPERATURE
  openai.js             ← OpenAI /v1/chat/completions
  anthropic.js          ← Anthropic /v1/messages
  gemini.js             ← Google Gemini generateContent API
  local.js              ← any OpenAI-compatible local server (Ollama, LM Studio, etc.)
prompt-template.js      ← buildVisitSummaryPrompt helper
```

**Single endpoint:** `POST /api/generate-visit-summary`

- Request body: `{ provider: 'openai' | 'anthropic' | 'gemini' | 'local', model: string, visitData: object }`
- Response: `{ summary: string }`
- `visitData` is serialised and passed through `buildVisitSummaryPrompt` before being sent to the provider
- The `provider` field is looked up in the `PROVIDERS` map in `server.js`

**Adding a new provider:** create `providers/<name>.js` exporting a single `async function(model, prompt)`, then add it to the `PROVIDERS` map in `server.js`.

**CORS** is enforced via the `ALLOWED_ORIGINS` env var (comma-separated). Requests with no `Origin` header (curl, server-to-server) are always allowed.

**Health check:** `GET /health` returns `{ status: 'ok' }`.

All upstream API calls use Node's native `fetch` (no SDK).

- OpenAI: `/v1/chat/completions`
- Anthropic: `/v1/messages`
- Gemini: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Local: `${LOCAL_MODEL_BASE_URL}/chat/completions` (OpenAI-compatible format)
