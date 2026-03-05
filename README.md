# openmrs-ai-proxy-server

A lightweight Express proxy that sits between an OpenMRS frontend and LLM provider APIs. Its sole purpose is to keep API keys server-side rather than exposing them to the browser.

The server uses **tool-calling** (function calling) to fetch clinical data from OpenMRS on demand — the LLM decides which data it needs and calls the appropriate tools rather than receiving a pre-built payload.

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
# Edit .env and fill in the key(s) for the provider(s) you want to use,
# and your OpenMRS connection details
```

## Environment variables

| Variable               | Default                       | Description                                                |
| ---------------------- | ----------------------------- | ---------------------------------------------------------- |
| `OPENAI_API_KEY`       | —                             | OpenAI API key                                             |
| `ANTHROPIC_API_KEY`    | —                             | Anthropic API key                                          |
| `GEMINI_API_KEY`       | —                             | Google Gemini API key                                      |
| `LOCAL_MODEL_BASE_URL` | `http://localhost:11434/v1`   | Base URL of your local model server                        |
| `LOCAL_MODEL_API_KEY`  | `local`                       | API key for local server (most servers don't require one)  |
| `OPENMRS_BASE_URL`     | `http://localhost:8080/openmrs` | OpenMRS instance URL (include context path if applicable) |
| `OPENMRS_USERNAME`     | `admin`                       | OpenMRS credentials for REST/FHIR API access               |
| `OPENMRS_PASSWORD`     | `Admin123`                    | OpenMRS credentials for REST/FHIR API access               |
| `PORT`                 | `3001`                        | Port the proxy listens on                                  |
| `ALLOWED_ORIGINS`      | `http://localhost:8080`       | Comma-separated list of allowed CORS origins               |

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
  "visitUuid": "...",
  "patientUuid": "..."
}
```

- `provider` — one of `openai`, `anthropic`, `gemini`, `local`
- `model` — model identifier (e.g. `gpt-4o-mini`, `claude-haiku-4-5-20251001`, `gemini-2.0-flash`, `llama3.2`)
- `visitUuid` — UUID of the OpenMRS visit to summarise
- `patientUuid` — UUID of the patient

The server gives the LLM a set of clinical tools. The model calls whichever tools it needs to gather data from OpenMRS, then produces a structured visit summary.

**Response**

```json
{ "summary": "..." }
```

### `GET /health`

Returns `{ "status": "ok" }`.

## Clinical tools

The LLM has access to the following parameterless tools (visit and patient context are baked in server-side):

| Tool | Data returned |
| ---- | ------------- |
| `get_patient_demographics` | Name, date of birth, gender, MRN |
| `get_visit_context` | Visit type, start/end dates, location, providers |
| `get_vitals` | BP, pulse, temperature, SpO2, weight, height, RR |
| `get_diagnoses` | Diagnoses with primary/secondary rank and certainty |
| `get_presenting_complaints` | Chief complaint, history of presenting illness, symptom obs |
| `get_examination_findings` | Physical examination observations |
| `get_medications_ordered` | Drug orders with dose, route, frequency, duration |
| `get_investigations_ordered` | Lab/imaging orders with fulfilment status |
| `get_allergies` | Known allergies with reaction type and severity |
| `get_active_conditions` | Active problem list with onset dates |

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
server.js                      <- app setup, CORS, routing, startup
providers/
  utils.js                     <- shared throwIfNotOk helper and DEFAULT_TEMPERATURE
  openai.js                    <- OpenAI /v1/chat/completions (tool-calling)
  anthropic.js                 <- Anthropic /v1/messages (tool-calling)
  gemini.js                    <- Google Gemini generateContent API (tool-calling)
  local.js                     <- any OpenAI-compatible local server (tool-calling)
clinical-tools/
  definitions.js               <- CLINICAL_TOOLS array + toOpenAITools / toGeminiTools converters
  executor.js                  <- ToolExecutor — dispatches tool calls to visit-data fetchers
  visit-data.js                <- OpenMRS REST/FHIR fetch helpers for each tool
prompt-template.js             <- buildSystemPrompt helper
.env.example
```

To add a new provider, create `providers/<name>.js` exporting a `callWithTools(model, systemPrompt, tools, executor)` async function and add it to the `PROVIDERS_WITH_TOOLS` map in `server.js`.
