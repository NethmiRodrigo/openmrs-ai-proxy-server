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

Copy `.env.example` to `.env` and populate the relevant API key(s) and OpenMRS credentials (`OPENMRS_BASE_URL`, `OPENMRS_USERNAME`, `OPENMRS_PASSWORD`). Only the LLM key for the chosen provider needs to be set.

## Architecture

An Express proxy server that sits between an OpenMRS frontend and LLM provider APIs. Its sole purpose is to keep API keys server-side rather than exposing them to the browser.

The server uses **tool-calling** (function calling): the LLM is given a set of clinical tools and decides which ones to call to fetch the data it needs from OpenMRS, then produces a structured visit summary.

**Entry point:** `server.js` — app setup, CORS, routing, and startup. Provider logic lives in `providers/`.

```
server.js                      ← app setup, CORS, routing, startup
providers/
  utils.js                     ← shared throwIfNotOk helper and DEFAULT_TEMPERATURE
  openai.js                    ← OpenAI /v1/chat/completions (tool-calling)
  anthropic.js                 ← Anthropic /v1/messages (tool-calling)
  gemini.js                    ← Google Gemini generateContent API (tool-calling)
  local.js                     ← any OpenAI-compatible local server (tool-calling)
clinical-tools/
  definitions.js               ← CLINICAL_TOOLS array + toOpenAITools / toGeminiTools converters
  executor.js                  ← ToolExecutor — dispatches tool calls to visit-data fetchers
  visit-data.js                ← OpenMRS REST/FHIR fetch helpers for each tool
prompt-template.js             ← buildSystemPrompt helper
```

**Single endpoint:** `POST /api/generate-visit-summary`

- Request body: `{ provider: 'openai' | 'anthropic' | 'gemini' | 'local', model: string, visitUuid: string, patientUuid: string }`
- Response: `{ summary: string }`
- `visitUuid` and `patientUuid` are baked into the `ToolExecutor` context; the LLM calls tools to fetch data on demand
- The `provider` field is looked up in the `PROVIDERS_WITH_TOOLS` map in `server.js`

**Adding a new provider:** create `providers/<name>.js` exporting an async `callWithTools(model, systemPrompt, tools, executor)` function, then add it to the `PROVIDERS_WITH_TOOLS` map in `server.js`.

**CORS** is enforced via the `ALLOWED_ORIGINS` env var (comma-separated). Requests with no `Origin` header (curl, server-to-server) are always allowed.

**Health check:** `GET /health` returns `{ status: 'ok' }`.

All upstream API calls use Node's native `fetch` (no SDK).

- OpenAI: `/v1/chat/completions`
- Anthropic: `/v1/messages`
- Gemini: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Local: `${LOCAL_MODEL_BASE_URL}/chat/completions` (OpenAI-compatible format)

**OpenMRS credentials** (`OPENMRS_BASE_URL`, `OPENMRS_USERNAME`, `OPENMRS_PASSWORD`) are read from env vars and used by `clinical-tools/visit-data.js` to call the OpenMRS REST/FHIR APIs.
