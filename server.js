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

/**
 * POST /api/generate-visit-summary
 *
 * Body: { provider, model, visitUuid, patientUuid, openmrsBaseUrl }
 * Response: { summary }
 *
 * The LLM calls clinical tools on demand to fetch visit data from OpenMRS.
 * OpenMRS credentials are read from OPENMRS_USERNAME / OPENMRS_PASSWORD env vars.
 */
app.post('/api/generate-visit-summary', async (req, res) => {
  const { provider, model, visitUuid, patientUuid } = req.body ?? {};

  const missingFields = ['provider', 'model', 'visitUuid', 'patientUuid'].filter(
    (f) => !req.body?.[f],
  );
  if (missingFields.length) {
    return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
  }

  const callWithTools = PROVIDERS_WITH_TOOLS[provider];
  if (!callWithTools) {
    return res.status(400).json({ error: `Unknown provider: ${provider}` });
  }

  console.log(`[POST /api/generate-visit-summary] provider=${provider} model=${model} visit=${visitUuid}`);
  const start = Date.now();

  try {
    const executor = new ToolExecutor({ visitUuid, patientUuid });
    const systemPrompt = buildSystemPrompt();

    // Select tool format based on provider
    const tools = provider === 'gemini' ? toGeminiTools() : provider === 'anthropic' ? CLINICAL_TOOLS : toOpenAITools();

    const { content: summary, usage } = await callWithTools(model, systemPrompt, tools, executor);
    const tokens =
      usage?.total != null
        ? `${usage.input} in / ${usage.output} out / ${usage.total} total tokens`
        : 'token usage unavailable';
    console.log(
      `[POST /api/generate-visit-summary] ${provider}/${model} responded in ${Date.now() - start}ms — ${tokens}`,
    );
    return res.json({ summary });
  } catch (err) {
    console.error(
      `[POST /api/generate-visit-summary] ${provider}/${model} failed in ${Date.now() - start}ms: ${err.message}`,
    );
    return res.status(502).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

async function checkProviders() {
  const checks = [];

  if (process.env.OPENAI_API_KEY) {
    checks.push(
      fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      })
        .then((r) => console.log('[openai]    ', r.ok ? 'ready' : `error (${r.status})`))
        .catch((e) => console.log('[openai]     unreachable:', e.message)),
    );
  } else {
    console.log('[openai]     no API key set');
  }

  if (process.env.ANTHROPIC_API_KEY) {
    checks.push(
      fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      })
        .then((r) => console.log('[anthropic] ', r.ok ? 'ready' : `error (${r.status})`))
        .catch((e) => console.log('[anthropic]  unreachable:', e.message)),
    );
  } else {
    console.log('[anthropic]  no API key set');
  }

  if (process.env.GEMINI_API_KEY) {
    checks.push(
      fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`)
        .then((r) => console.log('[gemini]    ', r.ok ? 'ready' : `error (${r.status})`))
        .catch((e) => console.log('[gemini]     unreachable:', e.message)),
    );
  } else {
    console.log('[gemini]     no API key set');
  }

  const localBase = (process.env.LOCAL_MODEL_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
  checks.push(
    fetch(`${localBase}/models`, {
      headers: { Authorization: `Bearer ${process.env.LOCAL_MODEL_API_KEY || 'local'}` },
    })
      .then((r) => console.log('[local]     ', r.ok ? `ready (${localBase})` : `error (${r.status}) — ${localBase}`))
      .catch((e) => console.log(`[local]      unreachable (${localBase}):`, e.message)),
  );

  await Promise.all(checks);
}

app.listen(PORT, () => {
  console.log(`openmrs-ai-proxy-server listening on http://localhost:${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
  checkProviders();
});
