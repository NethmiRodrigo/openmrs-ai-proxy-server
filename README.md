# openmrs-ai-proxy-server

A lightweight Express proxy that sits between an OpenMRS frontend and LLM provider APIs.

The companion frontend module is [`esm-patient-ai-summary-app`](https://github.com/NethmiRodrigo/openmrs-esm-patient-chart/tree/main/packages/esm-patient-ai-summary-app), an OpenMRS frontend extension that renders the generated summary inside the patient chart.

## Architecture

```
OpenMRS Frontend
      |
      | POST /api/generate-visit-summary
      | { visitUuid, patientUuid }
      v
┌─────────────────────────────────────────────────────────┐
│                 openmrs-ai-proxy-server                 │
│                                                         │
│  server.js                                              │
│    - Validates request                                  │
│    - Builds system prompt (prompt-template.js)          │
│    - Creates ToolExecutor with visit/patient context    │
│    - Calls active provider (LLM_PROVIDER / LLM_MODEL)   │
│                                                         │
│  providers/<name>.js                                    │
│    - Sends initial message to LLM with tools attached   │
│    - Receives tool_use calls from LLM                   │
│    - Dispatches each call to ToolExecutor               │
│    - Feeds results back to LLM                          │
│    - Repeats until LLM produces a final text response   │
│                                                         │
│  clinical-tools/                                        │
│    definitions.js  — tool schemas (OpenAI/Gemini/       │
│                       Anthropic formats)                │
│    executor.js     — routes tool names to fetchers      │
│    visit-data.js   — OpenMRS REST/FHIR fetch helpers    │
│                             |                           │
└─────────────────────────────|───────────────────────────┘
                              |
              ┌───────────────┴───────────────┐
              v                               v
     OpenMRS REST/FHIR API          LLM Provider API
     (credentialed server-side)     (key kept server-side)
```

**Key design decisions:**

- **API keys never reach the browser.** The proxy holds all credentials; the frontend only needs the proxy URL.
- **Single active provider.** `LLM_PROVIDER` and `LLM_MODEL` are set once in the environment. The frontend sends only `visitUuid` and `patientUuid`.
- **Tool-calling loop.** The LLM is given a fixed set of parameterless clinical tools. It calls whichever ones it needs, the proxy fetches the data from OpenMRS, and the loop continues until the LLM produces a final summary.
- **No pre-built payload.** Clinical data is fetched lazily on demand — only the data the LLM asks for is fetched.
- **Saved visit and patient context.** All clinical tools are declared with no parameters — the LLM calls them like `get_vitals()` with no arguments and has no way to specify a different visit or patient.

When a request arrives, the server captures `visitUuid` and `patientUuid` in a `ToolExecutor` instance:

```js
// server.js
const executor = new ToolExecutor({ visitUuid, patientUuid });
```

`ToolExecutor` passes them down to `VisitDataFetcher`, which stores them and uses them in every OpenMRS API call it makes. When the LLM returns a tool call, the provider passes only the tool name to `executor.execute('get_vitals')` — the executor already knows which visit and patient to fetch for.

The LLM can only decide _which_ tools to call. It never sees or influences the UUIDs.

## Supported providers

| `LLM_PROVIDER` value | Upstream                                                              |
| -------------------- | --------------------------------------------------------------------- |
| `openai`             | OpenAI `/v1/chat/completions`                                         |
| `anthropic`          | Anthropic `/v1/messages`                                              |
| `gemini`             | Google Gemini `generateContent` API                                   |
| `local`              | Any OpenAI-compatible local server (Ollama, LM Studio, LocalAI, etc.) |

## Setup

### Prerequisites

- Node.js 18 or later
- A running OpenMRS instance (local or remote)
- An API key for your chosen LLM provider (or a local model server for `local`)

### 1. Install dependencies

```bash
npm install
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

### 3. Configure your LLM provider

Set `LLM_PROVIDER` and `LLM_MODEL`, then provide the matching API key.

**Anthropic**

```env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=sk-ant-...
```

**OpenAI**

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o
OPENAI_API_KEY=sk-...
```

**Google Gemini**

```env
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.0-flash
GEMINI_API_KEY=...
```

**Local model (Ollama / LM Studio / LocalAI)**

```env
LLM_PROVIDER=local
LLM_MODEL=llama3.2
LOCAL_MODEL_BASE_URL=http://localhost:11434/v1   # Ollama default
# LOCAL_MODEL_BASE_URL=http://localhost:1234/v1  # LM Studio default
```

### 4. Configure OpenMRS

Point the server at your OpenMRS instance:

```env
OPENMRS_BASE_URL=http://localhost:8080/openmrs
OPENMRS_USERNAME=admin
OPENMRS_PASSWORD=Admin123
```

Include the context path in the URL if your instance uses one (e.g. `/openmrs`).

### 5. Start the server

```bash
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
```

On startup you should see:

```
openmrs-ai-proxy-server listening on http://localhost:3001
Active LLM: anthropic / claude-sonnet-4-6
[anthropic]  ready
```

If `LLM_PROVIDER` or `LLM_MODEL` is missing, the server exits immediately with a clear error rather than starting in a broken state.

## Environment variables

| Variable               | Required           | Default                         | Description                                               |
| ---------------------- | ------------------ | ------------------------------- | --------------------------------------------------------- |
| `LLM_PROVIDER`         | yes                | —                               | Active provider: `openai`, `anthropic`, `gemini`, `local` |
| `LLM_MODEL`            | yes                | —                               | Model identifier (e.g. `claude-sonnet-4-6`, `gpt-4o`)     |
| `OPENAI_API_KEY`       | if using openai    | —                               | OpenAI API key                                            |
| `ANTHROPIC_API_KEY`    | if using anthropic | —                               | Anthropic API key                                         |
| `GEMINI_API_KEY`       | if using gemini    | —                               | Google Gemini API key                                     |
| `LOCAL_MODEL_BASE_URL` | if using local     | `http://localhost:11434/v1`     | Base URL of your local model server                       |
| `LOCAL_MODEL_API_KEY`  | —                  | `local`                         | API key for local server (most servers don't require one) |
| `OPENMRS_BASE_URL`     | yes                | `http://localhost:8080/openmrs` | OpenMRS instance URL (include context path if applicable) |
| `OPENMRS_USERNAME`     | yes                | `admin`                         | OpenMRS credentials for REST/FHIR API access              |
| `OPENMRS_PASSWORD`     | yes                | `Admin123`                      | OpenMRS credentials for REST/FHIR API access              |
| `PORT`                 | —                  | `3001`                          | Port the proxy listens on                                 |
| `ALLOWED_ORIGINS`      | —                  | `http://localhost:8080`         | Comma-separated list of allowed CORS origins              |

The server exits at startup with a clear error message if `LLM_PROVIDER` or `LLM_MODEL` is missing, or if the provider name is not recognised.

## API

### `POST /api/generate-visit-summary`

**Request body**

```json
{
  "visitUuid": "...",
  "patientUuid": "..."
}
```

**Response**

```json
{ "summary": "..." }
```

The server uses `LLM_PROVIDER` and `LLM_MODEL` from the environment. The LLM is given a set of clinical tools, calls whichever it needs to gather data from OpenMRS, then produces a structured visit summary.

### `GET /health`

Returns `{ "status": "ok" }`.

## Clinical tools

The LLM has access to the following parameterless tools (visit and patient context are baked in server-side):

| Tool                         | Data returned                                               |
| ---------------------------- | ----------------------------------------------------------- |
| `get_patient_demographics`   | Name, date of birth, gender, MRN                            |
| `get_visit_context`          | Visit type, start/end dates, location, providers            |
| `get_vitals`                 | BP, pulse, temperature, SpO2, weight, height, RR            |
| `get_diagnoses`              | Diagnoses with primary/secondary rank and certainty         |
| `get_presenting_complaints`  | Chief complaint, history of presenting illness, symptom obs |
| `get_examination_findings`   | Physical examination observations                           |
| `get_medications_ordered`    | Drug orders with dose, route, frequency, duration           |
| `get_investigations_ordered` | Lab/imaging orders with fulfilment status                   |
| `get_allergies`              | Known allergies with reaction type and severity             |
| `get_active_conditions`      | Active problem list with onset dates                        |

## Using a local model (Ollama example)

1. [Install Ollama](https://ollama.com) and pull a model:
   ```bash
   ollama pull llama3.2
   ```
2. In `.env`, set:
   ```
   LLM_PROVIDER=local
   LLM_MODEL=llama3.2
   LOCAL_MODEL_BASE_URL=http://localhost:11434/v1
   ```

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
