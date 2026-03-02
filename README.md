# openmrs-ai-proxy-server

A lightweight Express proxy that sits between an OpenMRS frontend and LLM provider APIs. Its sole purpose is to keep API keys server-side rather than exposing them to the browser.

## Supported providers

| `provider` value | Upstream                                                              |
| ---------------- | --------------------------------------------------------------------- |
| `openai`         | OpenAI `/v1/chat/completions`                                         |
| `anthropic`      | Anthropic `/v1/messages`                                              |
| `gemini`         | Google Gemini `generateContent` API                                   |
| `local`          | Any OpenAI-compatible local server (Ollama, LM Studio, LocalAI, etc.) |

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and fill in the key(s) for the provider(s) you want to use
```

## Environment variables

| Variable               | Default                     | Description                                               |
| ---------------------- | --------------------------- | --------------------------------------------------------- |
| `OPENAI_API_KEY`       | —                           | OpenAI API key                                            |
| `ANTHROPIC_API_KEY`    | —                           | Anthropic API key                                         |
| `GEMINI_API_KEY`       | —                           | Google Gemini API key                                     |
| `LOCAL_MODEL_BASE_URL` | `http://localhost:11434/v1` | Base URL of your local model server                       |
| `LOCAL_MODEL_API_KEY`  | `local`                     | API key for local server (most servers don't require one) |
| `PORT`                 | `3001`                      | Port the proxy listens on                                 |
| `ALLOWED_ORIGINS`      | `http://localhost:8080`     | Comma-separated list of allowed CORS origins              |

Only the key(s) for the provider(s) you actually use need to be set.

## Running

```bash
# Production
npm start

# Development (auto-restarts on file changes)
npm run dev
```

## API

### `POST /api/generate-visit-summary`

**Request body**

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "visitData": {}
}
```

- `provider` — one of `openai`, `anthropic`, `gemini`, `local`
- `model` — model identifier (e.g. `gpt-4o-mini`, `claude-haiku-4-5-20251001`, `gemini-2.0-flash`, `llama3.2`)
- `visitData` — OpenMRS visit data object; serialised and passed through the prompt template before being sent to the provider

**Response**

```json
{ "summary": "..." }
```

### `GET /health`

Returns `{ "status": "ok" }`.

## Using a local model (Ollama example)

1. [Install Ollama](https://ollama.com) and pull a model:
   ```bash
   ollama pull llama3.2
   ```
2. In `.env`, set (or leave as default):
   ```
   LOCAL_MODEL_BASE_URL=http://localhost:11434/v1
   ```
3. Send a request with `"provider": "local"` and `"model": "llama3.2"`.

LM Studio works the same way — point `LOCAL_MODEL_BASE_URL` at its server URL (default `http://localhost:1234/v1`).

## Project structure

```
server.js               ← app setup, CORS, routing, startup
providers/
  utils.js              ← shared error helper and temperature constant
  openai.js
  anthropic.js
  gemini.js
  local.js
prompt-template.js      ← visit summary prompt builder
.env.example
```

To add a new provider, create `providers/<name>.js` exporting `async function(model, prompt)` and add it to the `PROVIDERS` map in `server.js`.
