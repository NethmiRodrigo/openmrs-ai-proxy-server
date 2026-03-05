require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { buildSystemPrompt } = require('./prompt-template');
const callOpenAI = require('./providers/openai');
const callAnthropic = require('./providers/anthropic');
const callGemini = require('./providers/gemini');
const callLocal = require('./providers/local');
const { CLINICAL_TOOLS, toOpenAITools, toGeminiTools } = require('./clinical-tools/definitions');
const { ToolExecutor } = require('./clinical-tools/executor');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:8080')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const allowedOriginSet = new Set(allowedOrigins);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOriginSet.has(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
  }),
);

app.use(express.json({ limit: '1mb' }));

const PROVIDERS_WITH_TOOLS = {
  ...(process.env.OPENAI_API_KEY    && { openai:    callOpenAI.callOpenAIWithTools }),
  ...(process.env.ANTHROPIC_API_KEY && { anthropic: callAnthropic.callAnthropicWithTools }),
  ...(process.env.GEMINI_API_KEY    && { gemini:    callGemini.callGeminiWithTools }),
  local: callLocal.callLocalWithTools,
};

const LLM_PROVIDER = process.env.LLM_PROVIDER;
const LLM_MODEL    = process.env.LLM_MODEL;

if (!LLM_PROVIDER || !LLM_MODEL) {
  console.error('LLM_PROVIDER and LLM_MODEL must be set in .env');
  process.exit(1);
}

const activeCallWithTools = PROVIDERS_WITH_TOOLS[LLM_PROVIDER];
if (!activeCallWithTools) {
  console.error(`Unknown or unconfigured LLM_PROVIDER: "${LLM_PROVIDER}". Available: ${Object.keys(PROVIDERS_WITH_TOOLS).join(', ')}`);
  process.exit(1);
}

const activeTools =
  LLM_PROVIDER === 'gemini'    ? toGeminiTools() :
  LLM_PROVIDER === 'anthropic' ? CLINICAL_TOOLS  :
  toOpenAITools();

/**
 * POST /api/generate-visit-summary
 *
 * Body: { visitUuid, patientUuid }
 * Response: { summary }
 *
 * The LLM calls clinical tools on demand to fetch visit data from OpenMRS.
 * Provider and model are configured via LLM_PROVIDER and LLM_MODEL env vars.
 * OpenMRS credentials are read from OPENMRS_USERNAME / OPENMRS_PASSWORD env vars.
 */
app.post('/api/generate-visit-summary', async (req, res) => {
  const { visitUuid, patientUuid } = req.body ?? {};

  const missingFields = ['visitUuid', 'patientUuid'].filter(
    (f) => !req.body?.[f],
  );
  if (missingFields.length) {
    return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
  }

  console.log(`[POST /api/generate-visit-summary] provider=${LLM_PROVIDER} model=${LLM_MODEL} visit=${visitUuid}`);
  const start = Date.now();

  try {
    const executor = new ToolExecutor({ visitUuid, patientUuid });
    const systemPrompt = buildSystemPrompt();

    const { content: summary, usage } = await activeCallWithTools(LLM_MODEL, systemPrompt, activeTools, executor);
    const tokens =
      usage?.total != null
        ? `${usage.input} in / ${usage.output} out / ${usage.total} total tokens`
        : 'token usage unavailable';
    console.log(
      `[POST /api/generate-visit-summary] ${LLM_PROVIDER}/${LLM_MODEL} responded in ${Date.now() - start}ms — ${tokens}`,
    );
    return res.json({ summary });
  } catch (err) {
    console.error(
      `[POST /api/generate-visit-summary] ${LLM_PROVIDER}/${LLM_MODEL} failed in ${Date.now() - start}ms: ${err.message}`,
    );
    return res.status(502).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

async function checkActiveProvider() {
  if (LLM_PROVIDER === 'openai') {
    await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    })
      .then((r) => console.log('[openai]    ', r.ok ? 'ready' : `error (${r.status})`))
      .catch((e) => console.log('[openai]     unreachable:', e.message));
  } else if (LLM_PROVIDER === 'anthropic') {
    await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    })
      .then((r) => console.log('[anthropic] ', r.ok ? 'ready' : `error (${r.status})`))
      .catch((e) => console.log('[anthropic]  unreachable:', e.message));
  } else if (LLM_PROVIDER === 'gemini') {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`)
      .then((r) => console.log('[gemini]    ', r.ok ? 'ready' : `error (${r.status})`))
      .catch((e) => console.log('[gemini]     unreachable:', e.message));
  } else if (LLM_PROVIDER === 'local') {
    const localBase = (process.env.LOCAL_MODEL_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
    await fetch(`${localBase}/models`, {
      headers: { Authorization: `Bearer ${process.env.LOCAL_MODEL_API_KEY || 'local'}` },
    })
      .then((r) => console.log('[local]     ', r.ok ? `ready (${localBase})` : `error (${r.status}) — ${localBase}`))
      .catch((e) => console.log(`[local]      unreachable (${localBase}):`, e.message));
  }
}

app.listen(PORT, () => {
  console.log(`openmrs-ai-proxy-server listening on http://localhost:${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
  console.log(`Active LLM: ${LLM_PROVIDER} / ${LLM_MODEL}`);
  checkActiveProvider();
});
